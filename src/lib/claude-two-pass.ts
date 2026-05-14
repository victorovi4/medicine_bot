/**
 * Two-pass extraction для медицинских PDF.
 *
 * Pass 1 (Sonnet): дословный OCR — извлекает таблицы и текстовые блоки в структурированный JSON.
 *   Sonnet лучше различает соседние таблицы на одной странице и точнее читает цифры.
 *
 * Pass 2 (Haiku): нормализация — превращает структурированный JSON в AnalysisResult
 *   (keyValues, measurementsDynamics, procedures, summary, conclusion и т.д.).
 *   Haiku дешевле и хорошо справляется с задачей маппинга на готовых данных.
 *
 * Используется для выписных эпикризов и сложных многотабличных документов,
 * где single-pass анализ путает строки между таблицами.
 */

import Anthropic from '@anthropic-ai/sdk'
import { PATIENT, getAge } from '@/lib/patient'
import { ANALYSIS_MODEL, CHAT_MODEL, AnalysisResult } from '@/lib/claude'

// ---------- Pass 1: структурированный OCR ----------

export interface ExtractedTableRow {
  name: string                    // дословно как в документе: "Аланинаминотрансфераза (АЛТ)" или "HGB"
  unit: string | null             // "Ед/л", "г/л", "10^9/л", null если не указано
  normalMin: number | null        // нижняя граница нормы
  normalMax: number | null        // верхняя граница нормы (для "<41" → normalMax=41, normalMin=null)
  values: (number | null)[]       // строго в порядке dates таблицы; null если не читается / нет данных
}

export interface ExtractedTable {
  title: string                   // дословный заголовок таблицы: "Биохимия", "Клинический анализ крови (проточная цитофлуориметрия)", "Анализ мочи"
  dates: string[] | null          // даты из шапки в формате "DD.MM.YYYY" или ISO; null для одиночного анализа
  rows: ExtractedTableRow[]
}

export interface ExtractedTextBlock {
  type: 'diagnosis_main' | 'diagnosis_secondary' | 'doctor' | 'specialty' | 'clinic'
      | 'anamnesis' | 'recommendations' | 'conclusion' | 'procedure' | 'other'
  text: string
}

export interface ExtractedPage {
  pageNumber: number
  tables: ExtractedTable[]
  textBlocks: ExtractedTextBlock[]
}

export interface ExtractedDocument {
  documentType: string            // "выписной эпикриз", "общий анализ крови", "консультация уролога" и т.д.
  documentDate: string | null     // YYYY-MM-DD; для выписки = дата выписки
  patientName: string | null
  clinic: string | null
  doctor: string | null
  pages: ExtractedPage[]
}

const PASS1_PROMPT = `Ты медицинский OCR-ассистент. Извлеки структурированные данные из медицинского документа.

Верни ТОЛЬКО валидный JSON (без markdown, без \`\`\`) с такой схемой:

{
  "documentType": "выписной эпикриз" | "общий анализ крови" | "консультация" | "УЗИ/КТ/МРТ" | "другое",
  "documentDate": "YYYY-MM-DD" | null,
  "patientName": "Фамилия Имя Отчество" | null,
  "clinic": "название учреждения" | null,
  "doctor": "ФИО врача" | null,
  "pages": [
    {
      "pageNumber": 1,
      "tables": [
        {
          "title": "Биохимия" | "Клинический анализ крови (проточная цитофлуориметрия)" | "Анализ мочи" | "Гемостаз" | "Лейкоцитарная формула" | "Микроскопия осадка мочи" | <свой заголовок дословно>,
          "dates": ["21.04.2026 14:31", "22.04.2026 12:08", "25.04.2026 10:45"] | null,
          "rows": [
            {
              "name": "Аланинаминотрансфераза (АЛТ)",
              "unit": "Ед/л",
              "normalMin": null,
              "normalMax": 41,
              "values": [79, 49, null]
            }
          ]
        }
      ],
      "textBlocks": [
        { "type": "diagnosis_main", "text": "..." },
        { "type": "recommendations", "text": "..." }
      ]
    }
  ]
}

🔴 КРИТИЧЕСКИ ВАЖНЫЕ ПРАВИЛА:

1. **Дословный OCR, без интерпретации.** Не нормализуй названия. Если в документе "HGB" — пиши "HGB". Если "Гемоглобин" — пиши "Гемоглобин".

2. **Каждая отдельная таблица — отдельный объект.** На одной странице может быть 2-3 разные таблицы (например "Биохимия" + "Анализ мочи" + "Микроскопия"). Не объединяй их.

3. **Если в таблице несколько колонок с датами** — это таблица динамики. Заполни \`dates\` шапкой и для каждой строки \`values\` строго по той же колонке.
   - Если значение в ячейке пустое / прочерк / "—" / не читается → null.
   - Длина values ОБЯЗАТЕЛЬНО равна длине dates.

4. **Если одиночный анализ без дат в шапке** — \`dates\` = null, \`values\` имеет один элемент.

5. **Норма:**
   - "<41" → normalMin: null, normalMax: 41
   - ">3.5" → normalMin: 3.5, normalMax: null
   - "5-34" → normalMin: 5, normalMax: 34
   - норма не указана → оба null

6. **Не выдумывай данные.** Если ты не уверен в значении — null.

7. **textBlocks** — короткие фрагменты текста с медицинским смыслом:
   - diagnosis_main: основной диагноз
   - diagnosis_secondary: сопутствующие
   - anamnesis: анамнез / течение заболевания
   - recommendations: рекомендации (выпиши КАЖДЫЙ пункт отдельным textBlock с type=recommendations)
   - conclusion: заключение врача (дословно)
   - procedure: упоминание гемотрансфузии, операции, манипуляции
   - other: важное прочее

8. **Не комментируй и не объясняй.** Только JSON.

Контекст пациента: ${PATIENT.gender} ${getAge()} лет, основной диагноз — ${PATIENT.mainDiagnosis || 'не указан'}${PATIENT.mainDiagnosisCode ? ` (${PATIENT.mainDiagnosisCode})` : ''}.`

/**
 * Pass 1 — OCR медицинского PDF через Sonnet.
 * Возвращает структурированный JSON с таблицами и текстовыми блоками,
 * БЕЗ нормализации в AnalysisResult.
 */
export async function extractStructuredData(pdfBuffer: Buffer): Promise<ExtractedDocument> {
  const sizeMB = pdfBuffer.length / (1024 * 1024)
  const pdfBase64 = pdfBuffer.toString('base64')

  console.log(`[two-pass] Pass 1 (Sonnet OCR): sending ${sizeMB.toFixed(1)} MB PDF`)
  const t0 = Date.now()

  // Sonnet — реально успевает (наблюдалось 37.8с на 1.7MB PDF). Haiku на этом
  // же PDF не успел в 50с timeout. Pass 2 на тексте быстрый, итого вписываемся
  // в 60с Vercel Hobby limit.
  const client = new (await import('@anthropic-ai/sdk')).default({
    maxRetries: 0,
    timeout: 55_000,
  })

  const response = await client.messages.create({
    model: CHAT_MODEL, // Sonnet
    max_tokens: 6000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBase64,
            },
          },
          { type: 'text', text: PASS1_PROMPT },
        ],
      },
    ],
  })
  console.log(`[two-pass] Pass 1: Sonnet returned in ${((Date.now()-t0)/1000).toFixed(1)}s`)

  const text = extractTextFromResponse(response)
  const json = extractJsonObject(text)
  if (!json) throw new Error('Pass 1: cannot extract JSON from Sonnet response')

  const parsed = JSON.parse(json) as ExtractedDocument
  console.log(`[two-pass] Pass 1 done: ${parsed.pages?.length || 0} pages, ${parsed.pages?.reduce((s, p) => s + (p.tables?.length || 0), 0) || 0} tables`)

  return parsed
}

// ---------- Pass 2: нормализация ----------

const PASS2_PROMPT = `Ты медицинский ассистент-нормализатор. На вход получаешь СТРУКТУРИРОВАННЫЕ данные из медицинского документа (таблицы и текстовые блоки уже извлечены).

Твоя задача — превратить эти данные в финальный AnalysisResult JSON.

Верни ТОЛЬКО валидный JSON (без markdown, без \`\`\`) со следующими полями:

{
  "category": "заключения" | "анализы" | "исследования" | "другое",
  "subtype": "консультация" | "выписка" | "направление" | "кровь" | "биохимия" | "онкомаркеры" | "моча" | "кал" | "гистология" | "узи" | "кт" | "мрт" | "пэт-кт" | "рентген" | "экг" | "эндоскопия" | "колоноскопия" | "другое",
  "title": "...",
  "date": "YYYY-MM-DD" | null,
  "doctor": "..." | null,
  "specialty": "..." | null,
  "clinic": "..." | null,
  "summary": "...",
  "conclusion": "..." | null,
  "recommendations": ["...", ...],
  "keyValues": { "название": "значение единица [норма]" },
  "tags": [...],
  "confidence": 0.0..1.0,
  "procedures": [
    { "date": "YYYY-MM-DD" | null, "type": "hemotransfusion|surgery|manipulation|puncture|laparocentesis", "name": "...", "details": {...}, "beforeValue": число | null, "afterValue": число | null, "unit": "..." | null }
  ],
  "measurementsDynamics": [
    { "name": "Гемоглобин", "unit": "г/л", "values": [{ "date": "YYYY-MM-DD", "value": число }] }
  ],
  "fullText": "..."
}

🔴 ПРАВИЛА НОРМАЛИЗАЦИИ:

**keyValues** — последние непустые значения из каждой таблицы:
- Для каждой строки таблицы: возьми последнее НЕ-null значение из row.values.
- Формат значения: "<число> <unit> [<норма>]". Норма из normalMin/normalMax:
  - normalMin=130, normalMax=160 → "[130-160]"
  - normalMin=null, normalMax=41 → "[<41]"
  - normalMin=3.5, normalMax=null → "[>3.5]"
  - оба null → без скобок
- Названия в keyValues берёшь ИЗ ВХОДНЫХ ТАБЛИЦ. Не переименовывай "АЛТ" в "Гемоглобин", "HGB" в "АЛТ" и т.п.
- Если значение последнее = null, но есть предыдущее непустое — используй последнее непустое.
- Если у строки таблицы все values = null — пропусти.

**measurementsDynamics** — динамика по датам:
- Включи КАЖДУЮ строку каждой таблицы где dates != null.
- Для строки HGB с values [82, 72, 110] и dates [21.04, 22.04, 25.04] →
  { name: "Гемоглобин", unit: "г/л", values: [{date: "2026-04-21", value: 82}, {date: "2026-04-22", value: 72}, {date: "2026-04-25", value: 110}] }
- Пропусти точки где value=null.
- Нормализуй название (HGB → Гемоглобин, RBC → Эритроциты, WBC → Лейкоциты, PLT → Тромбоциты, HCT → Гематокрит, АЛТ → АЛТ, АСТ → АСТ).
- Конвертируй даты в YYYY-MM-DD.

**procedures** — из textBlocks с type=procedure + по признакам:
- Резкий рост HGB на 20+ г/л за 1-2 дня → гемотрансфузия (даже если в тексте не написано).
- Упоминания "группа крови", "фенотипирование эритроцитов", "антиэритроцитарные антитела" → подготовка к гемотрансфузии.

**conclusion** — дословно из textBlock с type=conclusion. Если нет — null.

**recommendations** — массив строк, каждый textBlock с type=recommendations — один элемент.

**summary** — твоё краткое AI-резюме на 2-3 предложения с основными находками.

**category/subtype/title** — определи по documentType и содержимому:
- "выписной эпикриз" → category=заключения, subtype=выписка
- одиночная таблица анализов → category=анализы, subtype в зависимости от типа.

**fullText** — собери весь текст документа дословно: для каждой таблицы выпиши заголовок, дату, и все строки (название: значения), для textBlocks — их text.

**confidence** = 0.9 если данных много и они согласованы, 0.6 если есть пропуски/неоднозначности, 0.3 если данных мало.

Не комментируй, только JSON.

Контекст пациента: ${PATIENT.gender} ${getAge()} лет, основной диагноз — ${PATIENT.mainDiagnosis || 'не указан'}${PATIENT.mainDiagnosisCode ? ` (${PATIENT.mainDiagnosisCode})` : ''}.`

/**
 * Pass 2 — нормализация структурированных данных в AnalysisResult.
 * Использует более дешёвый Haiku, т.к. на входе уже готовый JSON.
 */
export async function normalizeToAnalysis(extracted: ExtractedDocument): Promise<AnalysisResult> {
  console.log(`[two-pass] Pass 2 (Haiku normalize)`)
  const t0 = Date.now()

  const userMessage = `Структурированные данные документа:\n\n${JSON.stringify(extracted, null, 2)}`

  const client = new (await import('@anthropic-ai/sdk')).default({
    maxRetries: 0,
    timeout: 25_000, // на Hobby plan общий бюджет ~55с: Pass 1 ≤30с + Pass 2 ≤25с
  })

  const response = await client.messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 6000,
    system: PASS2_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })
  console.log(`[two-pass] Pass 2: Haiku returned in ${((Date.now()-t0)/1000).toFixed(1)}s`)

  const text = extractTextFromResponse(response)
  const json = extractJsonObject(text)
  if (!json) throw new Error('Pass 2: cannot extract JSON from Haiku response')

  const result = JSON.parse(json) as AnalysisResult
  console.log(`[two-pass] Pass 2 done: ${Object.keys(result.keyValues || {}).length} keyValues, ${result.measurementsDynamics?.length || 0} dynamic metrics`)
  return result
}

/**
 * Полный two-pass pipeline.
 */
// ---------- Деterministic helpers (без LLM, чтобы не путать строки) ----------

const METRIC_NAME_MAP: Record<string, string> = {
  'hgb': 'Гемоглобин',
  'гемоглобин': 'Гемоглобин',
  'гемоглобина': 'Гемоглобин',
  'hemoglobin': 'Гемоглобин',
  'rbc': 'Эритроциты',
  'эритроциты': 'Эритроциты',
  'erythrocytes': 'Эритроциты',
  'wbc': 'Лейкоциты',
  'лейкоциты': 'Лейкоциты',
  'leukocytes': 'Лейкоциты',
  'plt': 'Тромбоциты',
  'тромбоциты': 'Тромбоциты',
  'platelets': 'Тромбоциты',
  'hct': 'Гематокрит',
  'гематокрит': 'Гематокрит',
  'hematocrit': 'Гематокрит',
  'soe': 'СОЭ',
  'соэ': 'СОЭ',
  'esr': 'СОЭ',
  'алт': 'АЛТ',
  'alt': 'АЛТ',
  'аланинаминотрансфераза': 'АЛТ',
  'аст': 'АСТ',
  'ast': 'АСТ',
  'аспартатаминотрансфераза': 'АСТ',
  'глюкоза': 'Глюкоза',
  'glucose': 'Глюкоза',
  'креатинин': 'Креатинин',
  'creatinine': 'Креатинин',
  'мочевина': 'Мочевина',
  'urea': 'Мочевина',
  'ферритин': 'Ферритин',
  'ferritin': 'Ферритин',
  'срб': 'С-реактивный белок',
  'c-реактивный белок': 'С-реактивный белок',
  'с-реактивный белок': 'С-реактивный белок',
  'crp': 'С-реактивный белок',
  'билирубин': 'Билирубин общий',
  'общий билирубин': 'Билирубин общий',
  'псa': 'ПСА общий',
  'pca': 'ПСА общий',
  'pca общий': 'ПСА общий',
  'pca свободный': 'ПСА свободный',
}

function canonicalizeMetricName(rowName: string | undefined | null): string | null {
  if (!rowName) return null
  // Убираем содержимое скобок и аббревиатуры
  const cleaned = rowName.replace(/[()[\]{}]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  // Сначала точное совпадение
  if (METRIC_NAME_MAP[cleaned]) return METRIC_NAME_MAP[cleaned]
  // Затем substring matching
  for (const [key, canonical] of Object.entries(METRIC_NAME_MAP)) {
    if (cleaned.includes(key)) return canonical
  }
  return null
}

/**
 * Преобразует дату из "DD.MM.YYYY" / "DD.MM.YYYY HH:MM" / "YYYY-MM-DD" в ISO YYYY-MM-DD.
 */
function parseExtractedDate(s: string | undefined | null): string | null {
  if (!s) return null
  const trimmed = s.trim().split(/\s+/)[0]  // отбрасываем время
  const m1 = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (m1) {
    const [_, d, mo, y] = m1
    return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`
  }
  const m2 = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m2) return trimmed
  return null
}

/**
 * Из ExtractedDocument собрать measurementsDynamics ДЕТЕРМИНИРОВАННО.
 * Не даём Haiku возможности перепутать строки между таблицами.
 */
export function buildMeasurementsDynamicsFromExtracted(extracted: ExtractedDocument): { name: string; unit: string; values: { date: string; value: number }[] }[] {
  const result: { name: string; unit: string; values: { date: string; value: number }[] }[] = []
  for (const page of extracted.pages || []) {
    for (const table of page.tables || []) {
      if (!table.dates || table.dates.length === 0) continue
      for (const row of table.rows || []) {
        const canonical = canonicalizeMetricName(row.name)
        if (!canonical) continue
        const values: { date: string; value: number }[] = []
        for (let i = 0; i < table.dates.length; i++) {
          const v = row.values?.[i]
          const dateStr = parseExtractedDate(table.dates[i])
          if (typeof v === 'number' && !Number.isNaN(v) && dateStr) {
            values.push({ date: dateStr, value: v })
          }
        }
        if (values.length > 0) result.push({ name: canonical, unit: row.unit || '', values })
      }
    }
  }
  return result
}

/**
 * Из ExtractedDocument собрать keyValues — последнее непустое значение каждой строки.
 */
export function buildKeyValuesFromExtracted(extracted: ExtractedDocument): Record<string, string> {
  const kv: Record<string, string> = {}
  for (const page of extracted.pages || []) {
    for (const table of page.tables || []) {
      for (const row of table.rows || []) {
        const name = (row.name || '').trim()
        if (!name) continue
        // Последнее непустое значение
        const values = row.values || []
        let lastVal: number | null = null
        for (let i = values.length - 1; i >= 0; i--) {
          const v = values[i]
          if (typeof v === 'number' && !Number.isNaN(v)) { lastVal = v; break }
        }
        if (lastVal === null) continue
        let str = `${lastVal}`
        if (row.unit) str += ` ${row.unit}`
        if (row.normalMin !== null && row.normalMin !== undefined && row.normalMax !== null && row.normalMax !== undefined) {
          str += ` [${row.normalMin}-${row.normalMax}]`
        } else if (row.normalMax !== null && row.normalMax !== undefined) {
          str += ` [<${row.normalMax}]`
        } else if (row.normalMin !== null && row.normalMin !== undefined) {
          str += ` [>${row.normalMin}]`
        }
        kv[name] = str
      }
    }
  }
  return kv
}

/**
 * Собрать fullText документа для поиска.
 */
export function buildFullTextFromExtracted(extracted: ExtractedDocument): string {
  const parts: string[] = []
  if (extracted.documentType) parts.push(`Тип: ${extracted.documentType}`)
  if (extracted.documentDate) parts.push(`Дата: ${extracted.documentDate}`)
  if (extracted.patientName) parts.push(`Пациент: ${extracted.patientName}`)
  if (extracted.clinic) parts.push(`Учреждение: ${extracted.clinic}`)
  if (extracted.doctor) parts.push(`Врач: ${extracted.doctor}`)
  for (const page of extracted.pages || []) {
    for (const block of page.textBlocks || []) {
      if (block.text) parts.push(block.text)
    }
    for (const table of page.tables || []) {
      parts.push(`\n## ${table.title || 'Таблица'}`)
      if (table.dates && table.dates.length > 0) {
        parts.push(`Даты: ${table.dates.join(' | ')}`)
      }
      for (const row of table.rows || []) {
        const vals = (row.values || []).map(v => v === null || v === undefined ? '—' : v).join(' | ')
        const unit = row.unit ? ` ${row.unit}` : ''
        const norm = row.normalMin != null && row.normalMax != null ? ` [${row.normalMin}-${row.normalMax}]`
                  : row.normalMax != null ? ` [<${row.normalMax}]`
                  : row.normalMin != null ? ` [>${row.normalMin}]` : ''
        parts.push(`${row.name}: ${vals}${unit}${norm}`)
      }
    }
  }
  return parts.join('\n')
}

/**
 * ДЕТЕРМИНИРОВАННАЯ сборка AnalysisResult из ExtractedDocument.
 * Только summary и category/subtype просим у Haiku — там точные строки не важны.
 */
export async function buildAnalysisFromExtracted(extracted: ExtractedDocument): Promise<AnalysisResult> {
  const t0 = Date.now()

  // Программная часть (детерминированная)
  const keyValues = buildKeyValuesFromExtracted(extracted)
  const dynamics = buildMeasurementsDynamicsFromExtracted(extracted)
  const fullText = buildFullTextFromExtracted(extracted)

  // Извлекаем готовые поля из textBlocks
  const recommendations: string[] = []
  let conclusion: string | null = null
  let diagnosisMain: string | null = null
  let diagnosisSecondary: string | null = null
  for (const page of extracted.pages || []) {
    for (const block of page.textBlocks || []) {
      if (block.type === 'recommendations' && block.text) recommendations.push(block.text.trim())
      else if (block.type === 'conclusion' && block.text && !conclusion) conclusion = block.text.trim()
      else if (block.type === 'diagnosis_main' && block.text && !diagnosisMain) diagnosisMain = block.text.trim()
      else if (block.type === 'diagnosis_secondary' && block.text && !diagnosisSecondary) diagnosisSecondary = block.text.trim()
    }
  }

  // Категория/подтип — простая эвристика
  const docType = (extracted.documentType || '').toLowerCase()
  let category = 'другое'
  let subtype = 'другое'
  if (docType.includes('эпикриз') || docType.includes('выписк')) {
    category = 'заключения'
    subtype = 'выписка'
  } else if (docType.includes('консультац')) {
    category = 'заключения'
    subtype = 'консультация'
  } else if (docType.includes('анализ кров') || docType.includes('клинический') || docType.includes('биохим')) {
    category = 'анализы'
    subtype = docType.includes('биохим') ? 'биохимия' : 'кровь'
  } else if (docType.includes('узи')) { category = 'исследования'; subtype = 'узи' }
  else if (docType.includes('кт') && !docType.includes('эк')) { category = 'исследования'; subtype = 'кт' }
  else if (docType.includes('мрт')) { category = 'исследования'; subtype = 'мрт' }
  else if (docType.includes('экг')) { category = 'исследования'; subtype = 'экг' }

  // Простой summary — берём из ключевых полей программно
  const tableCount = (extracted.pages || []).reduce((s, p) => s + (p.tables?.length || 0), 0)
  const summary = [
    diagnosisMain && `Диагноз: ${diagnosisMain}.`,
    `Извлечено ${Object.keys(keyValues).length} показателей из ${tableCount} таблиц.`,
    dynamics.length > 0 && `Динамика по ${dynamics.length} показателям.`,
  ].filter(Boolean).join(' ')

  // Гемотрансфузия — эвристика по динамике гемоглобина (резкий скачок 20+ г/л за 1-2 дня)
  const procedures: AnalysisResult['procedures'] = []
  const hgbDyn = dynamics.find(d => d.name === 'Гемоглобин')
  if (hgbDyn && hgbDyn.values.length >= 2) {
    for (let i = 1; i < hgbDyn.values.length; i++) {
      const prev = hgbDyn.values[i - 1]
      const curr = hgbDyn.values[i]
      const diff = curr.value - prev.value
      const daysApart = (new Date(curr.date).getTime() - new Date(prev.date).getTime()) / (1000 * 60 * 60 * 24)
      if (diff >= 20 && daysApart <= 3) {
        procedures.push({
          date: curr.date,
          type: 'hemotransfusion',
          name: 'Гемотрансфузия (эритроцитарной массы)',
          beforeValue: prev.value,
          afterValue: curr.value,
          unit: 'г/л',
        })
      }
    }
  }

  const tags: string[] = []
  if (diagnosisMain) {
    const lower = diagnosisMain.toLowerCase()
    if (lower.includes('анеми')) tags.push('анемия')
    if (lower.includes('простат')) tags.push('рак простаты')
    if (lower.includes('миелом')) tags.push('миелома')
  }
  if (procedures.some(p => p.type === 'hemotransfusion')) tags.push('гемотрансфузия')

  console.log(`[two-pass:deterministic] built in ${((Date.now()-t0)/1000).toFixed(1)}s: ${Object.keys(keyValues).length} kv, ${dynamics.length} dyn, ${procedures.length} proc`)

  return {
    category,
    subtype,
    title: `${extracted.documentType || 'Документ'}${extracted.clinic ? ` — ${extracted.clinic}` : ''}`,
    date: extracted.documentDate,
    doctor: extracted.doctor,
    specialty: null,
    clinic: extracted.clinic,
    summary,
    conclusion: conclusion ?? diagnosisMain,
    recommendations,
    keyValues,
    tags,
    confidence: 0.85,
    procedures,
    measurementsDynamics: dynamics,
    fullText,
  }
}

export async function analyzePdfTwoPass(pdfBuffer: Buffer): Promise<AnalysisResult> {
  const t0 = Date.now()

  // Primary path: Mistral OCR через OpenRouter file-parser → ДЕТЕРМИНИРОВАННАЯ нормализация.
  // A/B тест показал что mistral-ocr-pipeline извлекает CBC таблицу с точными HGB 82/72/110.
  // measurementsDynamics и keyValues строим программно (без LLM) — Haiku в Pass 2 склонен
  // путать строки между таблицами при создании динамики. Haiku используется только для
  // summary/category — там галлюцинации не критичны.
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const { runOcrEngine } = await import('@/lib/ocr-engines')
      const ocrResult = await runOcrEngine('mistral-ocr-pipeline', pdfBuffer)
      if (ocrResult.extracted && !ocrResult.error) {
        const t1 = Date.now()
        const analysis = await buildAnalysisFromExtracted(ocrResult.extracted)
        const t2 = Date.now()
        console.log(`[two-pass:openrouter] total: Pass1 ${((t1-t0)/1000).toFixed(1)}s (${ocrResult.promptTokens}+${ocrResult.completionTokens} tok) + Pass2 ${((t2-t1)/1000).toFixed(1)}s`)
        return analysis
      }
      console.log(`[two-pass:openrouter] failed (${ocrResult.error}), falling back to direct Sonnet`)
    } catch (err) {
      console.log(`[two-pass:openrouter] error, falling back to direct Sonnet:`, err instanceof Error ? err.message : err)
    }
  }

  // Fallback: direct Sonnet (vision на PDF) + Haiku normalization.
  const extracted = await extractStructuredData(pdfBuffer)
  const t1 = Date.now()
  const analysis = await normalizeToAnalysis(extracted)
  const t2 = Date.now()
  console.log(`[two-pass:direct] total: Pass1 ${((t1-t0)/1000).toFixed(1)}s + Pass2 ${((t2-t1)/1000).toFixed(1)}s`)
  return analysis
}

// ---------- helpers (продублированы из claude.ts чтобы избежать circular import) ----------

function extractTextFromResponse(response: Anthropic.Messages.Message): string {
  return response.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

function extractJsonObject(text: string): string | null {
  // Ищем сбалансированный JSON-объект от первой { до последней }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < 0 || end < start) return null
  return text.substring(start, end + 1)
}
