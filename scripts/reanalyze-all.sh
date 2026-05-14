#!/usr/bin/env bash
# Массовый реанализ документов медкарты через новый Gemini Flash пайплайн.
#
# Usage:
#   scripts/reanalyze-all.sh [--base URL] [--mime MIME[,MIME]] [--limit N] [--from-log FILE] [--dry-run] [--sleep SECONDS]
#
# Примеры:
#   scripts/reanalyze-all.sh --dry-run                  # просто перечислить кандидатов
#   scripts/reanalyze-all.sh --limit 10                 # pilot на 10 документах
#   scripts/reanalyze-all.sh --mime application/pdf     # только PDF
#   scripts/reanalyze-all.sh                            # все поддерживаемые
#   scripts/reanalyze-all.sh --from-log scripts/reanalyze-log-XXX.jsonl  # ретрай только провалов
#
# Состояние пишется в scripts/reanalyze-log-{timestamp}.jsonl (по строке на документ).

set -euo pipefail

BASE_URL="https://medicine-bot-4xqt.vercel.app"
MIME_FILTER="application/pdf,image/jpeg,image/png,image/webp"
LIMIT=0
DRY_RUN=0
SLEEP_SECONDS=30
FROM_LOG=""
SKIP_FROM_LOG=""
PRIORITY_SORT=0
WIPE_FIRST=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)            BASE_URL="$2"; shift 2 ;;
    --mime)            MIME_FILTER="$2"; shift 2 ;;
    --limit)           LIMIT="$2"; shift 2 ;;
    --sleep)           SLEEP_SECONDS="$2"; shift 2 ;;
    --from-log)        FROM_LOG="$2"; shift 2 ;;
    --skip-from-log)   SKIP_FROM_LOG="$2"; shift 2 ;;
    --priority-sort)   PRIORITY_SORT=1; shift ;;
    --wipe-first)      WIPE_FIRST=1; shift ;;
    --dry-run)         DRY_RUN=1; shift ;;
    -h|--help)         sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="${SCRIPT_DIR}/reanalyze-log-${TIMESTAMP}.jsonl"

# Источник списка ID
if [[ -n "$FROM_LOG" ]]; then
  if [[ ! -f "$FROM_LOG" ]]; then
    echo "Log file not found: $FROM_LOG" >&2; exit 1
  fi
  IDS=$(jq -r 'select(.status != "ok") | .id' "$FROM_LOG")
  echo "Retrying failed IDs from $FROM_LOG"
else
  echo "Fetching document list from ${BASE_URL}/api/documents..."
  ALL_DOCS=$(curl -fsS "${BASE_URL}/api/documents")
  if [[ "$PRIORITY_SORT" -eq 1 ]]; then
    # Сортируем: сначала первичные источники measurements (анализы → выписки),
    # потом исследования, потом консультации/другое. Внутри группы — по возрастанию даты,
    # чтобы более ранние первичные точки попадали в БД раньше своих цитат.
    SORTED=$(echo "$ALL_DOCS" | jq '
      def priority:
        if .category == "анализы" then 1
        elif (.category == "заключения" and .subtype == "выписка") then 2
        elif .category == "исследования" then 3
        else 4 end;
      sort_by([priority, .date])
    ')
  else
    SORTED="$ALL_DOCS"
  fi
  IDS=$(echo "$SORTED" | jq -r --arg mimes "$MIME_FILTER" '
    ($mimes | split(",")) as $allowed
    | .[]
    | select(.fileUrl != null)
    | select(.fileType as $t | $allowed | index($t))
    | "\(.id)\t\(.fileType)\t\(.category)/\(.subtype)\t\(.date)\t\(.title)"
  ')
fi

if [[ -n "$SKIP_FROM_LOG" ]]; then
  if [[ ! -f "$SKIP_FROM_LOG" ]]; then
    echo "Skip log not found: $SKIP_FROM_LOG" >&2; exit 1
  fi
  SKIP_IDS=$(jq -r 'select(.status == "ok") | .id' "$SKIP_FROM_LOG" | sort -u)
  SKIP_COUNT=$(echo "$SKIP_IDS" | grep -c . || true)
  echo "Skipping $SKIP_COUNT already-ok IDs from $SKIP_FROM_LOG"
  IDS=$(echo "$IDS" | grep -vFf <(echo "$SKIP_IDS"))
fi

TOTAL=$(echo "$IDS" | grep -c . || true)
if [[ "$TOTAL" -eq 0 ]]; then
  echo "No documents matched."; exit 0
fi

if [[ "$LIMIT" -gt 0 && "$TOTAL" -gt "$LIMIT" ]]; then
  IDS=$(echo "$IDS" | head -n "$LIMIT")
  TOTAL="$LIMIT"
fi

echo "Will reanalyze $TOTAL documents."
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "$IDS" | nl
  echo "(dry-run, exiting)"; exit 0
fi

echo "Logging to: $LOG_FILE"
echo "Sleep between requests: ${SLEEP_SECONDS}s"

if [[ "$WIPE_FIRST" -eq 1 ]]; then
  echo "Wiping all measurements first (POST /api/admin/wipe-measurements)..."
  WIPE_RESULT=$(curl -fsS -X POST "${BASE_URL}/api/admin/wipe-measurements")
  echo "  → $WIPE_RESULT"
fi
echo

n=0
ok=0
fail=0
echo "$IDS" | while IFS=$'\t' read -r id mime category date title; do
  n=$((n+1))
  printf "[%3d/%d] %s  %-18s  %-12s  %s  " "$n" "$TOTAL" "$id" "$mime" "$category" "$date"

  start=$(date +%s)
  http_code=$(curl -o /tmp/reanalyze-resp.json -w "%{http_code}" -s -X POST "${BASE_URL}/api/documents/${id}/reanalyze" || echo "000")
  end=$(date +%s)
  elapsed=$((end - start))
  body=$(cat /tmp/reanalyze-resp.json 2>/dev/null || echo "")

  if [[ "$http_code" == "202" ]]; then
    status="ok"
    ok=$((ok+1))
    printf "✓ accepted (%ds)\n" "$elapsed"
  else
    status="failed"
    fail=$((fail+1))
    printf "✗ HTTP %s — %s\n" "$http_code" "$(echo "$body" | head -c 200)"
  fi

  jq -nc \
    --arg id "$id" --arg mime "$mime" --arg cat "$category" --arg date "$date" \
    --arg title "$title" --arg status "$status" --arg http "$http_code" \
    --arg body "$body" --argjson elapsed "$elapsed" \
    '{id:$id, mime:$mime, category:$cat, date:$date, title:$title, status:$status, http:$http, elapsedSeconds:$elapsed, body:$body}' \
    >> "$LOG_FILE"

  if [[ "$n" -lt "$TOTAL" ]]; then
    sleep "$SLEEP_SECONDS"
  fi
done

echo
echo "Summary: $ok ok, $fail failed (see $LOG_FILE)"
