import Anthropic from '@anthropic-ai/sdk'
import { PATIENT, getAge } from '@/lib/patient'

// Модели
const ANALYSIS_MODEL = 'claude-sonnet-4-6-20250514'    // для анализа документов
export const CHAT_MODEL = 'claude-sonnet-4-6-20250514'  // для чата (Этап 2)

// Ленивая инициализация клиента
let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not configured')
    }
    _client = new Anthropic()  // читает ANTHROPIC_API_KEY из env
  }
  return _client
}

export interface ProcedureInfo {
  date: string | null     // Дата процедуры в формате YYYY-MM-DD
  type: string            // "hemotransfusion", "surgery", "manipulation", "puncture"
  name: string            // "Гемотрансфузия эритроцитарной массы", "Лапароцентез"
  details?: {
    volume?: string       // "300 мл"
    bloodType?: string    // "A(II) Rh-"
    component?: string    // "эритроцитарная масса"
  }
  beforeValue?: number    // Показатель до (например гемоглобин: 75)
  afterValue?: number     // Показатель после (например: 108)
  unit?: string           // "г/л"
}

export interface MeasurementDynamics {
  name: string            // "Гемоглобин", "Лейкоциты"
  unit: string            // "г/л", "х10⁹/л"
  values: {
    date: string          // YYYY-MM-DD
    value: number
  }[]
}

export interface AnalysisResult {
  category: string  // "заключения", "анализы", "исследования", "другое"
  subtype: string   // "консультация", "кровь", "кт" и т.д.
  title: string
  date: string | null
  doctor: string | null
  specialty: string | null
  clinic: string | null
  summary: string
  conclusion: string | null
  recommendations: string[]
  keyValues: Record<string, string>
  tags: string[]
  confidence: number
  // Новые поля
  procedures?: ProcedureInfo[]           // Проведённые процедуры
  measurementsDynamics?: MeasurementDynamics[]  // Динамика показателей
  fullText?: string  // Полная расшифровка документа
}

const ANALYSIS_PROMPT = `Ты — медицинский ассистент, анализирующий медицинские документы на русском языке.

Проанализируй предоставленный медицинский документ и извлеки следующую информацию:

1. **category** — КАТЕГОРИЯ документа. Возможные значения:
   - "заключения" — консультации врачей, выписки, эпикризы, направления
   - "анализы" — анализы крови, мочи, кала, онкомаркеры, гистология
   - "исследования" — УЗИ, КТ, МРТ, ПЭТ-КТ, рентген, ЭКГ, эндоскопия
   - "другое" — если не подходит ни одна категория

2. **subtype** — ПОДТИП документа. Возможные значения:
   Для категории "заключения":
   - "консультация" — заключение врача, осмотр
   - "выписка" — выписной эпикриз
   - "направление" — направление на обследование/госпитализацию

   Для категории "анализы":
   - "кровь" — общий анализ крови, клинический анализ
   - "биохимия" — биохимический анализ крови
   - "онкомаркеры" — ПСА, АФП, РЭА и другие онкомаркеры
   - "моча" — общий анализ мочи
   - "кал" — анализ кала
   - "гистология" — гистология, биопсия

   Для категории "исследования":
   - "узи" — ультразвуковое исследование
   - "кт" — компьютерная томография
   - "мрт" — магнитно-резонансная томография
   - "пэт-кт" — позитронно-эмиссионная томография
   - "рентген" — рентгенография
   - "экг" — электрокардиограмма
   - "эндоскопия" — ФГДС, бронхоскопия и т.д.
   - "колоноскопия" — колоноскопия

   - "другое" — если не подходит ничего

3. **title** — название документа (например: "Общий анализ крови", "КТ брюшной полости", "Консультация уролога")

4. **date** — дата документа в формате YYYY-MM-DD. Ищи дату взятия анализа, дату исследования или дату приёма. Если не найдена — null.

5. **doctor** — ФИО врача, если указано. Иначе null.

6. **specialty** — специальность врача (уролог, онколог, терапевт и т.д.). Если не указана явно, попробуй определить по контексту. Иначе null.

7. **clinic** — название медицинского учреждения, если указано. Иначе null.

8. **summary** — AI-резюме: краткий пересказ документа на 2-3 предложения своими словами. Укажи основные находки, отклонения от нормы.

9. **conclusion** — ЗАКЛЮЧЕНИЕ ВРАЧА: если в документе есть официальное заключение врача (обычно в конце документа после слова "Заключение:" или "Заключение врача:"), скопируй его ДОСЛОВНО, слово в слово. Это важно! Если заключения нет — null.

10. **recommendations** — РЕКОМЕНДАЦИИ: массив строк с рекомендациями врача. Каждая рекомендация — отдельный элемент массива. Извлекай дословно из документа. Примеры:
    - ["Контроль ПСА через 3 месяца", "Консультация онколога", "УЗИ почек"]
    - ["Приём препарата X по 1 таб. 2 раза в день", "Диета №5", "Повторный приём через 2 недели"]
    Если рекомендаций нет — пустой массив [].

11. **keyValues** — ВСЕ числовые показатели, не только ключевые.
    Для общего анализа крови — все 30-40 строк. Для биохимии — все показатели.
    Формат: {"название": "значение единицы [норма: мин-макс]"}
    Пример: {"Гемоглобин": "130 г/л [130-160]", "СОЭ": "25 мм/ч [2-15]"}
    Если в документе указаны референсные значения — включи их в квадратных скобках.
    Для выписок/эпикризов указывай ПОСЛЕДНИЕ значения (при выписке).

12. **tags** — массив тегов для поиска и фильтрации.
    Примеры: ["онкология", "простата", "ПСА", "биохимия", "почки"]
    Включай: органы, заболевания, типы исследований, важные показатели.

13. **confidence** — твоя уверенность в анализе от 0 до 1.
    1.0 = документ чёткий, всё распознано
    0.5 = часть информации неразборчива или предположительна
    0.0 = не удалось проанализировать

14. **procedures** — ПРОВЕДЁННЫЕ ПРОЦЕДУРЫ. Массив объектов для гемотрансфузий, операций, манипуляций.
    Каждый объект содержит:
    - date: дата процедуры (YYYY-MM-DD) или null
    - type: тип ("hemotransfusion", "surgery", "manipulation", "puncture", "laparocentesis")
    - name: название процедуры по-русски
    - details: объект с деталями (volume, bloodType, component — для гемотрансфузии)
    - beforeValue: значение показателя ДО процедуры (число)
    - afterValue: значение показателя ПОСЛЕ процедуры (число)
    - unit: единица измерения

    ВАЖНО для гемотрансфузии: Если гемоглобин резко вырос за 1-2 дня (на 20+ г/л) — это признак гемотрансфузии!
    Пример: Hb 75 → 108 за 2 дня = была гемотрансфузия.
    Даже если в тексте явно не написано "гемотрансфузия", извлеки её по косвенным признакам:
    - Определение группы крови и резус-фактора
    - Фенотипирование эритроцитов
    - Скрининг антиэритроцитарных антител
    - Резкий скачок гемоглобина

    Пример: [{"date": "2026-01-29", "type": "hemotransfusion", "name": "Гемотрансфузия эритроцитарной массы", "details": {"bloodType": "A(II) Rh-"}, "beforeValue": 75, "afterValue": 108, "unit": "г/л"}]
    Если процедур нет — пустой массив [].

15. **measurementsDynamics** — ДИНАМИКА ПОКАЗАТЕЛЕЙ за госпитализацию.
    Для выписок/эпикризов извлеки ВСЕ значения показателей по датам.
    Каждый объект содержит:
    - name: название показателя ("Гемоглобин", "Лейкоциты")
    - unit: единица измерения
    - values: массив {date: "YYYY-MM-DD", value: число}

    Пример: [{"name": "Гемоглобин", "unit": "г/л", "values": [{"date": "2026-01-26", "value": 87}, {"date": "2026-01-28", "value": 75}, {"date": "2026-01-30", "value": 108}]}]
    Если динамики нет (одиночный анализ) — пустой массив [].

16. **fullText** — ПОЛНАЯ РАСШИФРОВКА документа. Перепиши ВЕСЬ текст документа как есть,
    сохраняя структуру. Для анализов — ВСЕ строки с показателями, не только ключевые.
    Для заключений — полный текст. Это нужно для поиска по документам.

Контекст пациента: ${PATIENT.gender} ${getAge()} лет, основной диагноз — ${PATIENT.mainDiagnosis || 'не указан'}${PATIENT.mainDiagnosisCode ? ` (${PATIENT.mainDiagnosisCode})` : ''}.

ВАЖНО:
- Заключение врача и рекомендации извлекай ДОСЛОВНО из документа, не перефразируй!
- Для выписок/эпикризов ОБЯЗАТЕЛЬНО извлекай procedures и measurementsDynamics!
- Гемотрансфузия определяется по резкому росту гемоглобина + подготовительным анализам (группа крови, антитела).

Верни ТОЛЬКО валидный JSON без markdown-форматирования, без \`\`\`json, просто чистый JSON объект.`

/**
 * Анализирует документ по URL и типу файла через Anthropic API.
 */
export async function analyzeDocument(
  fileUrl: string,
  fileType: string
): Promise<AnalysisResult> {
  if (fileType.startsWith('image/')) {
    return analyzeImage(fileUrl, fileType)
  }

  if (fileType === 'application/pdf') {
    return analyzePdf(fileUrl)
  }

  throw new Error(`Unsupported file type: ${fileType}`)
}

/**
 * Анализирует несколько изображений как один многостраничный документ.
 */
export async function analyzeMultipleImages(
  images: { url: string; mediaType: string }[]
): Promise<AnalysisResult> {
  if (images.length === 0) {
    throw new Error('No images to analyze')
  }

  if (images.length === 1) {
    return analyzeImage(images[0].url, images[0].mediaType)
  }

  // Конвертируем все изображения в base64
  const imageContents: Anthropic.Messages.ContentBlockParam[] = []

  for (let i = 0; i < images.length; i++) {
    const { url, mediaType } = images[i]
    const response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    imageContents.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: base64,
      },
    })
  }

  // Добавляем промпт с пояснением что это многостраничный документ
  const multiPagePrompt = `Это многостраничный медицинский документ, состоящий из ${images.length} страниц/фото.
Проанализируй ВСЕ страницы как ОДИН документ и извлеки информацию.

${ANALYSIS_PROMPT}`

  imageContents.push({
    type: 'text',
    text: multiPagePrompt,
  })

  const response = await getClient().messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 8000,
    messages: [
      {
        role: 'user',
        content: imageContents,
      },
    ],
  })

  const textContent = extractTextFromResponse(response)
  return parseAnalysisJson(textContent)
}

/**
 * Анализирует изображение через Anthropic (Claude Vision).
 */
async function analyzeImage(
  imageUrl: string,
  mediaType: string
): Promise<AnalysisResult> {
  // Скачиваем изображение и конвертируем в base64
  const response = await fetch(imageUrl)
  const arrayBuffer = await response.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')

  const apiResponse = await getClient().messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 8000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: base64,
            },
          },
          {
            type: 'text',
            text: ANALYSIS_PROMPT,
          },
        ],
      },
    ],
  })

  const textContent = extractTextFromResponse(apiResponse)
  return parseAnalysisJson(textContent)
}

/**
 * Анализирует извлечённый текст документа (без Vision).
 * Используется когда PDF содержит текстовый/OCR-слой.
 */
async function analyzeText(text: string): Promise<AnalysisResult> {
  // Ограничиваем текст ~30000 символов (~10000 токенов)
  const truncatedText = text.length > 30000
    ? text.substring(0, 30000) + '\n\n[...текст обрезан...]'
    : text

  const response = await getClient().messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 8000,
    messages: [
      {
        role: 'user',
        content: `Текст медицинского документа:\n\n${truncatedText}\n\n${ANALYSIS_PROMPT}`,
      },
    ],
  })

  const textContent = extractTextFromResponse(response)
  return parseAnalysisJson(textContent)
}

/**
 * Анализирует PDF через Anthropic.
 * Стратегия: сначала извлечь текст (быстро, работает для OCR-PDF),
 * если текста нет — отправить постранично через Vision.
 */
async function analyzePdf(pdfUrl: string): Promise<AnalysisResult> {
  const response = await fetch(pdfUrl)
  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const sizeMB = buffer.length / (1024 * 1024)

  // 1. Попытка извлечь текст из PDF (OCR-слой)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParseModule = await import('pdf-parse') as any
    let text = ''
    if (pdfParseModule.PDFParse) {
      const parser = new pdfParseModule.PDFParse(new Uint8Array(buffer))
      const result = await parser.getText()
      text = (typeof result === 'string' ? result : result?.text ?? '').trim()
    } else {
      const pdfParse = pdfParseModule.default ?? pdfParseModule
      const pdfData = await pdfParse(buffer)
      text = (pdfData.text ?? '').trim()
    }

    // Фильтруем фейковый текст (AnyScanner добавляет только водяной знак)
    const cleanText = text.replace(/AnyScanner/gi, '').replace(/--\s*\d+\s*of\s*\d+\s*--/g, '').trim()

    if (cleanText && cleanText.length > 200) {
      console.log(`PDF text extracted: ${cleanText.length} chars (${sizeMB.toFixed(1)} MB), using text-only analysis`)
      return analyzeText(cleanText)
    }
    console.log(`PDF text too short after cleanup (${cleanText?.length || 0} chars), falling back to vision`)
  } catch (err) {
    console.log('PDF text extraction failed:', err instanceof Error ? err.message : err)
  }

  // 2. Vision-подход: разбиваем PDF на страницы и отправляем как изображения
  console.log(`Using page-by-page vision analysis for PDF (${sizeMB.toFixed(1)} MB)`)
  return analyzePdfByPages(buffer)
}

/**
 * Разбивает PDF на отдельные страницы и отправляет через Vision API.
 * Anthropic SDK поддерживает PDF через document type.
 */
async function analyzePdfByPages(buffer: Buffer): Promise<AnalysisResult> {
  const { PDFDocument } = await import('pdf-lib')
  const pdfDoc = await PDFDocument.load(new Uint8Array(buffer))
  const pageCount = pdfDoc.getPageCount()

  // Ограничиваем до 15 страниц
  const maxPages = Math.min(pageCount, 15)
  console.log(`Splitting PDF: ${pageCount} pages, processing ${maxPages}`)

  const pageContents: Anthropic.Messages.ContentBlockParam[] = []

  for (let i = 0; i < maxPages; i++) {
    const singleDoc = await PDFDocument.create()
    const [copiedPage] = await singleDoc.copyPages(pdfDoc, [i])
    singleDoc.addPage(copiedPage)
    const pageBytes = await singleDoc.save()
    const pageBase64 = Buffer.from(pageBytes).toString('base64')

    pageContents.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: pageBase64,
      },
    })
  }

  const multiPagePrompt = pageCount > maxPages
    ? `Это многостраничный медицинский документ (${pageCount} страниц, показаны первые ${maxPages}).\nПроанализируй ВСЕ показанные страницы как ОДИН документ.\n\n${ANALYSIS_PROMPT}`
    : `Это многостраничный медицинский документ из ${pageCount} страниц.\nПроанализируй ВСЕ страницы как ОДИН документ и извлеки информацию.\n\n${ANALYSIS_PROMPT}`

  pageContents.push({
    type: 'text',
    text: multiPagePrompt,
  })

  console.log(`Sending ${maxPages} page PDFs to Anthropic API...`)

  const response = await getClient().messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 8000,
    messages: [
      {
        role: 'user',
        content: pageContents,
      },
    ],
  })

  const textContent = extractTextFromResponse(response)
  return parseAnalysisJson(textContent)
}

/**
 * Универсальная функция для генерации текста через Claude.
 * Используется в extract/route.ts и других местах.
 */
export async function generateWithClaude(
  prompt: string,
  options?: { model?: string; maxTokens?: number; system?: string }
): Promise<string> {
  const client = getClient()
  const response = await client.messages.create({
    model: options?.model || ANALYSIS_MODEL,
    max_tokens: options?.maxTokens || 4096,
    ...(options?.system && { system: options.system }),
    messages: [{ role: 'user', content: prompt }],
  })
  const block = response.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type')
  return block.text
}

/**
 * Извлекает текст из ответа Anthropic API.
 */
function extractTextFromResponse(response: Anthropic.Messages.Message): string {
  const block = response.content[0]
  if (!block || block.type !== 'text') {
    throw new Error('No text response from Anthropic')
  }
  return block.text
}

/**
 * Извлекает первый полный JSON-объект из текста с помощью balanced brace matching.
 */
function extractJsonObject(text: string): string | null {
  const startIdx = text.indexOf('{')
  if (startIdx === -1) return null
  let depth = 0, inString = false, escape = false
  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    if (ch === '}') { depth--; if (depth === 0) return text.substring(startIdx, i + 1) }
  }
  return null
}

/**
 * Парсит JSON-ответ от модели.
 */
function parseAnalysisJson(rawText: string): AnalysisResult {
  console.log('Raw AI response length:', rawText.length)
  console.log('Raw AI response (first 500 chars):', rawText.substring(0, 500))

  let jsonStr = rawText.trim()

  // Убираем возможные markdown-обёртки
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7)
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3)
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3)
  }
  jsonStr = jsonStr.trim()

  // Попытка 1: прямой парсинг
  try {
    const parsed = JSON.parse(jsonStr)
    if (!Array.isArray(parsed.recommendations)) {
      parsed.recommendations = []
    }
    return parsed as AnalysisResult
  } catch {
    console.log('Direct parse failed, trying to extract JSON...')
  }

  // Попытка 2: balanced brace extraction
  const extracted = extractJsonObject(rawText)
  if (extracted) {
    try {
      const parsed = JSON.parse(extracted)
      if (!Array.isArray(parsed.recommendations)) {
        parsed.recommendations = []
      }
      console.log('Extracted JSON successfully')
      return parsed as AnalysisResult
    } catch {
      console.log('Extracted JSON also invalid')
    }
  }

  // Попытка 3: вернуть базовый результат с текстом как summary
  console.error('All JSON parse attempts failed. Raw text:', rawText.substring(0, 1000))

  return {
    category: 'другое',
    subtype: 'другое',
    title: 'Документ (требует ручной обработки)',
    date: new Date().toISOString().split('T')[0],
    doctor: null,
    specialty: null,
    clinic: null,
    summary: rawText.substring(0, 500) + (rawText.length > 500 ? '...' : ''),
    conclusion: null,
    recommendations: [],
    keyValues: {},
    tags: ['требует проверки'],
    confidence: 0.3,
  }
}
