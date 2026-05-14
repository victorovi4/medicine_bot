# КР-валидатор: проверка документов по клиническим рекомендациям

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Кнопка «Проверить по КР» на странице документа, которая запускает AI-валидацию по клиническим рекомендациям Минздрава и показывает результат с цветовой индикацией.

**Architecture:** Текст КР хранится как `.txt` в `src/data/clinical-guidelines/`, загружается по `PATIENT.mainDiagnosisCode`. API endpoint `/api/kr-check` принимает documentId, отправляет streaming SSE. Клиентский компонент `KrCheckCard` вызывается со страницы документа.

**Tech Stack:** Next.js 16 (App Router), Anthropic SDK (Haiku), React 19, Tailwind CSS 4, streaming SSE.

**Spec:** `docs/superpowers/specs/2026-04-07-kr-validator-design.md`

---

### Task 1: Текстовые файлы клинических рекомендаций

**Files:**
- Create: `src/data/clinical-guidelines/KR12-C61.txt`
- Create: `src/data/clinical-guidelines/KR144-C90.txt`
- Create: `src/lib/clinical-guidelines.ts`

- [ ] **Step 1: Скопировать извлечённые тексты КР**

```bash
mkdir -p medical-card/src/data/clinical-guidelines
cp /tmp/KR12-C61.txt medical-card/src/data/clinical-guidelines/KR12-C61.txt
cp /tmp/KR144-C90.txt medical-card/src/data/clinical-guidelines/KR144-C90.txt
```

- [ ] **Step 2: Создать модуль загрузки КР**

```typescript
// src/lib/clinical-guidelines.ts
import { readFileSync } from 'fs'
import { join } from 'path'
import { PATIENT } from './patient'

const GUIDELINES_MAP: Record<string, { file: string; name: string; id: string }> = {
  'C61': { file: 'KR12-C61.txt', name: 'Рак предстательной железы', id: 'КР12' },
  'C90': { file: 'KR144-C90.txt', name: 'Множественная миелома', id: 'КР144' },
  'C90.0': { file: 'KR144-C90.txt', name: 'Множественная миелома', id: 'КР144' },
}

export function getGuidelineForPatient(): { text: string; name: string; id: string } | null {
  const code = PATIENT.mainDiagnosisCode
  if (!code) return null

  // Попробовать точный код, потом базовый (C90.0 → C90)
  const entry = GUIDELINES_MAP[code] || GUIDELINES_MAP[code.split('.')[0]]
  if (!entry) return null

  const filePath = join(process.cwd(), 'src', 'data', 'clinical-guidelines', entry.file)
  try {
    const text = readFileSync(filePath, 'utf-8')
    return { text, name: entry.name, id: entry.id }
  } catch {
    console.error(`Clinical guideline file not found: ${filePath}`)
    return null
  }
}

export function hasGuidelineForPatient(): boolean {
  const code = PATIENT.mainDiagnosisCode
  if (!code) return false
  return !!(GUIDELINES_MAP[code] || GUIDELINES_MAP[code.split('.')[0]])
}
```

- [ ] **Step 3: Проверить что файлы читаются**

```bash
cd medical-card && node -e "
const { getGuidelineForPatient } = require('./src/lib/clinical-guidelines');
const g = getGuidelineForPatient();
console.log(g ? g.id + ': ' + g.text.length + ' chars' : 'NOT FOUND');
"
```

Expected: `КР12: 277518 chars` (или близко)

- [ ] **Step 4: Commit**

```bash
git add src/data/clinical-guidelines/ src/lib/clinical-guidelines.ts
git commit -m "feat: add clinical guidelines text files and loader (KR12 C61, KR144 C90)"
```

---

### Task 2: API endpoint `/api/kr-check`

**Files:**
- Create: `src/app/api/kr-check/route.ts`
- Modify: `vercel.json` (добавить maxDuration)

- [ ] **Step 1: Создать API route**

```typescript
// src/app/api/kr-check/route.ts
import { NextRequest } from 'next/server'
import { getPrismaClient } from '@/lib/db'
import { isTestModeRequest } from '@/lib/test-mode'
import { getClient, ANALYSIS_MODEL } from '@/lib/claude'
import { PATIENT, getFullName, getAge } from '@/lib/patient'
import { getGuidelineForPatient } from '@/lib/clinical-guidelines'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const prisma = getPrismaClient({ testMode: isTestModeRequest(request) })
    const { documentId } = await request.json()

    if (!documentId) {
      return new Response(JSON.stringify({ error: 'documentId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const guideline = getGuidelineForPatient()
    if (!guideline) {
      return new Response(JSON.stringify({ error: 'Нет клинических рекомендаций для данного диагноза' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { measurements: true },
    })

    if (!document) {
      return new Response(JSON.stringify({ error: 'Документ не найден' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Краткий контекст пациента (без полной истории — экономим токены)
    const recentMeds = await prisma.medication.findMany({
      where: { isActive: true },
      take: 10,
    })

    const patientContext = [
      `Пациент: ${getFullName()}, ${getAge()} лет, ${PATIENT.gender}`,
      `Основной диагноз: ${PATIENT.mainDiagnosis} (${PATIENT.mainDiagnosisCode})`,
      PATIENT.comorbidities.length > 0 ? `Сопутствующие: ${PATIENT.comorbidities.join(', ')}` : '',
      recentMeds.length > 0 ? `Текущие препараты: ${recentMeds.map(m => `${m.name}${m.dosage ? ' ' + m.dosage : ''}`).join(', ')}` : '',
    ].filter(Boolean).join('\n')

    const documentContext = [
      `Документ: ${document.title}`,
      `Дата: ${new Date(document.date).toLocaleDateString('ru-RU')}`,
      `Категория: ${document.category}/${document.subtype}`,
      document.doctor ? `Врач: ${document.doctor}` : '',
      document.specialty ? `Специальность: ${document.specialty}` : '',
      document.conclusion ? `\nЗаключение:\n${document.conclusion}` : '',
      document.recommendations && document.recommendations.length > 0
        ? `\nРекомендации:\n${document.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
        : '',
      document.keyValues ? `\nПоказатели:\n${Object.entries(document.keyValues as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join('\n')}` : '',
      document.content ? `\nПолный текст документа:\n${document.content}` : '',
    ].filter(Boolean).join('\n')

    const systemPrompt = `Ты — эксперт по проверке медицинских документов на соответствие клиническим рекомендациям Минздрава РФ.

Ниже приведён полный текст клинической рекомендации ${guideline.id} «${guideline.name}».
Используй его как единственный источник истины для проверки.

## Клиническая рекомендация ${guideline.id}

${guideline.text}

## Правила проверки

1. Сопоставь содержимое документа с рекомендациями КР.
2. Проверь:
   - Соответствие обследований (проведены ли рекомендованные КР исследования)
   - Соответствие назначений (препараты и дозировки vs КР)
   - Сроки контроля (рекомендованные интервалы наблюдения)
   - Пропущенные исследования (что по КР должно быть назначено)
3. Для каждого пункта укажи конкретную ссылку на раздел КР.
4. Не выдумывай — если в документе недостаточно данных для проверки пункта, пропусти его.

## Формат ответа

Верни ТОЛЬКО JSON (без markdown-обёртки):
{
  "items": [
    {
      "status": "ok" | "warning" | "error",
      "title": "Краткое название проверки",
      "description": "Что обнаружено и почему такой статус",
      "krReference": "${guideline.id} п.X.X: «цитата из КР»"
    }
  ],
  "summary": { "ok": N, "warning": N, "error": N }
}

Статусы:
- "ok" — соответствует КР
- "warning" — частично соответствует или требует внимания
- "error" — не соответствует КР или критически важное исследование/назначение пропущено`

    const userMessage = `## Пациент\n${patientContext}\n\n## Документ для проверки\n${documentContext}`

    // Streaming response
    const client = getClient()
    const stream = client.messages.stream({
      model: ANALYSIS_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    let fullResponse = ''
    const encoder = new TextEncoder()
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          stream.on('text', (text) => {
            fullResponse += text
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'text', text })}\n\n`)
            )
          })

          await stream.finalMessage()

          // Парсим JSON из ответа
          let result = null
          try {
            const jsonMatch = fullResponse.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
              result = JSON.parse(jsonMatch[0])
            }
          } catch (e) {
            console.error('Failed to parse KR check result:', e)
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'done', result, guidelineId: guideline.id, guidelineName: guideline.name })}\n\n`)
          )
          controller.close()
        } catch (error) {
          console.error('KR check streaming error:', error)
          const errorMsg = error instanceof Error ? error.message : 'Ошибка при проверке'
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`)
          )
          controller.close()
        }
      },
    })

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('KR check API error:', error)
    const msg = error instanceof Error ? error.message : 'Ошибка'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
```

- [ ] **Step 2: Добавить maxDuration в vercel.json**

В `vercel.json` добавить:
```json
"src/app/api/kr-check/route.ts": {
  "maxDuration": 60
}
```

- [ ] **Step 3: Экспортировать getClient из claude.ts**

Проверить что `getClient` экспортируется из `src/lib/claude.ts`. Если нет — добавить `export` к функции.

- [ ] **Step 4: Проверить билд**

```bash
cd medical-card && npx next build 2>&1 | tail -10
```

Expected: Build succeeds, route `/api/kr-check` listed.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/kr-check/route.ts vercel.json src/lib/claude.ts
git commit -m "feat: add /api/kr-check endpoint for clinical guidelines validation"
```

---

### Task 3: Клиентский компонент `KrCheckCard`

**Files:**
- Create: `src/components/KrCheckCard.tsx`

- [ ] **Step 1: Создать компонент**

```tsx
// src/components/KrCheckCard.tsx
'use client'

import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ClipboardCheck, Loader2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'

interface KrCheckItem {
  status: 'ok' | 'warning' | 'error'
  title: string
  description: string
  krReference: string
}

interface KrCheckResult {
  items: KrCheckItem[]
  summary: { ok: number; warning: number; error: number }
}

interface KrCheckCardProps {
  documentId: string
  hasGuideline: boolean
}

export function KrCheckCard({ documentId, hasGuideline }: KrCheckCardProps) {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<KrCheckResult | null>(null)
  const [guidelineInfo, setGuidelineInfo] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const streamRef = useRef('')

  const runCheck = useCallback(async () => {
    setChecking(true)
    setResult(null)
    setError(null)
    streamRef.current = ''

    try {
      const res = await fetch('/api/kr-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка запроса')
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('Stream not available')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))

            if (event.type === 'text') {
              streamRef.current += event.text
            } else if (event.type === 'done') {
              if (event.result) {
                setResult(event.result)
              }
              if (event.guidelineId) {
                setGuidelineInfo({ id: event.guidelineId, name: event.guidelineName })
              }
            } else if (event.type === 'error') {
              setError(event.error)
            }
          } catch {
            // skip malformed events
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка')
    } finally {
      setChecking(false)
    }
  }, [documentId])

  if (!hasGuideline) return null

  const statusIcon = {
    ok: <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />,
    warning: <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />,
    error: <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />,
  }

  const statusBg = {
    ok: 'bg-green-950/50 border-l-green-500',
    warning: 'bg-yellow-950/50 border-l-yellow-500',
    error: 'bg-red-950/50 border-l-red-500',
  }

  return (
    <div className="space-y-4">
      {/* Button */}
      {!result && !checking && (
        <Button
          onClick={runCheck}
          className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white"
        >
          <ClipboardCheck className="h-4 w-4 mr-2" />
          Проверить по КР
        </Button>
      )}

      {/* Loading */}
      {checking && (
        <Card className="border-emerald-800/50">
          <CardContent className="py-6 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
            <span className="text-muted-foreground">Проверяю по клиническим рекомендациям...</span>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card className="border-red-800/50">
          <CardContent className="py-4">
            <p className="text-red-400">❌ {error}</p>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {result && (
        <Card className="border-emerald-800/50">
          <CardContent className="py-5 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-emerald-500" />
                <span className="font-semibold">
                  Проверка по {guidelineInfo?.id} «{guidelineInfo?.name}»
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={runCheck}>
                Повторить
              </Button>
            </div>

            {/* Items */}
            <div className="space-y-2">
              {result.items.map((item, i) => (
                <div
                  key={i}
                  className={`rounded-lg p-3 border-l-3 ${statusBg[item.status]}`}
                >
                  <div className="flex gap-2">
                    {statusIcon[item.status]}
                    <div className="space-y-1">
                      <div className="font-medium text-sm">{item.title}</div>
                      <div className="text-sm text-muted-foreground">{item.description}</div>
                      {item.krReference && (
                        <div className="text-xs text-muted-foreground italic">{item.krReference}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="flex gap-4 pt-2 border-t border-border text-sm">
              {result.summary.ok > 0 && (
                <span className="flex items-center gap-1 text-green-500">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {result.summary.ok} соответствует
                </span>
              )}
              {result.summary.warning > 0 && (
                <span className="flex items-center gap-1 text-yellow-500">
                  <AlertTriangle className="h-3.5 w-3.5" /> {result.summary.warning} внимание
                </span>
              )}
              {result.summary.error > 0 && (
                <span className="flex items-center gap-1 text-red-500">
                  <XCircle className="h-3.5 w-3.5" /> {result.summary.error} расхождений
                </span>
              )}
            </div>

            {/* Disclaimer */}
            <p className="text-xs text-muted-foreground italic pt-1">
              Проверка выполнена ИИ и не является медицинским заключением.
              Обсудите результаты с лечащим врачом.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Проверить билд**

```bash
cd medical-card && npx next build 2>&1 | tail -5
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/KrCheckCard.tsx
git commit -m "feat: add KrCheckCard component for clinical guidelines validation UI"
```

---

### Task 4: Интеграция в страницу документа

**Files:**
- Modify: `src/app/documents/[id]/page.tsx`

- [ ] **Step 1: Добавить KrCheckCard на страницу документа**

В `src/app/documents/[id]/page.tsx`:

1. Добавить импорты:
```typescript
import { KrCheckCard } from '@/components/KrCheckCard'
import { hasGuidelineForPatient } from '@/lib/clinical-guidelines'
```

2. В теле компонента (перед return) добавить:
```typescript
const showKrCheck = hasGuidelineForPatient()
```

3. Вставить компонент после блока summary/conclusion (после первого `CardContent` с заключением), перед рекомендациями:
```tsx
{showKrCheck && (
  <div className="px-6 pb-4">
    <KrCheckCard documentId={document.id} hasGuideline={showKrCheck} />
  </div>
)}
```

- [ ] **Step 2: Проверить билд**

```bash
cd medical-card && npx next build 2>&1 | tail -5
```

Expected: Build succeeds.

- [ ] **Step 3: Протестировать локально**

```bash
cd medical-card && npm run dev
```

Открыть любой документ, проверить что кнопка «Проверить по КР» отображается.

- [ ] **Step 4: Commit**

```bash
git add src/app/documents/[id]/page.tsx
git commit -m "feat: integrate KrCheckCard into document detail page"
```

---

### Task 5: Деплой и проверка на production

**Files:** нет новых файлов

- [ ] **Step 1: Деплой на Vercel (инстанс Иоффе)**

```bash
cd medical-card && npx vercel --prod
```

Expected: Build succeeds, deployed.

- [ ] **Step 2: Проверить на production**

Открыть https://medicine-bot-4xqt.vercel.app/documents/2cfe7218-2733-4967-b407-2b889edb736f (выписной эпикриз Мариинская).

Проверить:
- Кнопка «Проверить по КР» видна
- При нажатии — индикатор загрузки
- Через ~30 сек — результат с пунктами и цветами
- Disclaimer присутствует

- [ ] **Step 3: Деплой на Vercel (инстанс Попова)**

```bash
cd medical-card && npx vercel --prod  # с project.json для popov
```

Проверить на https://medicine-bot-popov.vercel.app — кнопка видна, работает с КР144.

- [ ] **Step 4: Commit финальный (если были правки)**

```bash
git add -A && git commit -m "fix: production adjustments for KR validator"
```
