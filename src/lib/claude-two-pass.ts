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
import { getClient, CHAT_MODEL, ANALYSIS_MODEL, AnalysisResult } from '@/lib/claude'

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

  const response = await getClient().messages.create({
    model: CHAT_MODEL, // Sonnet — точнее различает таблицы и читает цифры
    max_tokens: 16000,
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

  const userMessage = `Структурированные данные документа:\n\n${JSON.stringify(extracted, null, 2)}`

  const response = await getClient().messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 8000,
    system: PASS2_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

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
export async function analyzePdfTwoPass(pdfBuffer: Buffer): Promise<AnalysisResult> {
  const t0 = Date.now()
  const extracted = await extractStructuredData(pdfBuffer)
  const t1 = Date.now()
  const analysis = await normalizeToAnalysis(extracted)
  const t2 = Date.now()
  console.log(`[two-pass] total: Pass1 ${((t1-t0)/1000).toFixed(1)}s + Pass2 ${((t2-t1)/1000).toFixed(1)}s`)
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
