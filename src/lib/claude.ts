import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export interface AnalysisResult {
  type: string
  title: string
  date: string | null
  doctor: string | null
  specialty: string | null
  clinic: string | null
  summary: string
  keyValues: Record<string, string>
  tags: string[]
  confidence: number
}

const ANALYSIS_PROMPT = `Ты — медицинский ассистент, анализирующий медицинские документы на русском языке.

Проанализируй предоставленный медицинский документ и извлеки следующую информацию:

1. **type** — тип документа. Возможные значения:
   - "анализ" (анализы крови, мочи, кала и т.д.)
   - "узи" (ультразвуковые исследования)
   - "кт" (компьютерная томография)
   - "мрт" (магнитно-резонансная томография)
   - "рентген"
   - "консультация" (заключение врача, осмотр)
   - "выписка" (выписной эпикриз)
   - "исследование" (другие исследования: ЭКГ, колоноскопия и т.д.)
   - "другое"

2. **title** — название документа (например: "Общий анализ крови", "УЗИ органов брюшной полости", "Консультация уролога")

3. **date** — дата документа в формате YYYY-MM-DD. Ищи дату взятия анализа, дату исследования или дату приёма. Если не найдена — null.

4. **doctor** — ФИО врача, если указано. Иначе null.

5. **specialty** — специальность врача (уролог, онколог, терапевт и т.д.). Если не указана явно, попробуй определить по контексту. Иначе null.

6. **clinic** — название медицинского учреждения, если указано. Иначе null.

7. **summary** — краткое резюме документа на 2-3 предложения. Укажи основные находки, отклонения от нормы, заключение врача.

8. **keyValues** — ключевые числовые показатели в формате {"название": "значение с единицами"}. 
   Примеры: {"ПСА общий": "4.5 нг/мл", "Гемоглобин": "130 г/л", "Креатинин": "98 мкмоль/л"}
   Включай только значимые показатели (отклонения от нормы или важные для мониторинга).
   Для консультаций/выписок этот блок может быть пустым {}.

9. **tags** — массив тегов для поиска и фильтрации. 
   Примеры: ["онкология", "простата", "ПСА", "биохимия", "почки"]
   Включай: органы, заболевания, типы исследований, важные показатели.

10. **confidence** — твоя уверенность в анализе от 0 до 1. 
    1.0 = документ чёткий, всё распознано
    0.5 = часть информации неразборчива или предположительна
    0.0 = не удалось проанализировать

Контекст пациента: мужчина 78 лет, основной диагноз — онкология простаты (рак предстательной железы), также есть сопутствующие заболевания.

Верни ТОЛЬКО валидный JSON без markdown-форматирования, без \`\`\`json, просто чистый JSON объект.`

/**
 * Анализирует документ по URL и типу файла.
 * Args:
 *   fileUrl (string): Публичный URL файла в Vercel Blob.
 *   fileType (string): MIME-тип файла.
 * Returns:
 *   AnalysisResult: Результат AI-анализа.
 */
export async function analyzeDocument(
  fileUrl: string,
  fileType: string
): Promise<AnalysisResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  if (fileType.startsWith('image/')) {
    return analyzeImage(fileUrl, fileType)
  }

  if (fileType === 'application/pdf') {
    return analyzePdf(fileUrl)
  }

  throw new Error(`Unsupported file type: ${fileType}`)
}

/**
 * Анализирует изображение через Claude Vision.
 * Args:
 *   imageUrl (string): URL изображения.
 *   mediaType (string): MIME-тип изображения.
 * Returns:
 *   AnalysisResult: Результат анализа.
 */
async function analyzeImage(
  imageUrl: string,
  mediaType: string
): Promise<AnalysisResult> {
  const response = await fetch(imageUrl)
  const arrayBuffer = await response.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')

  let claudeMediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' =
    'image/jpeg'
  if (mediaType.includes('png')) claudeMediaType = 'image/png'
  if (mediaType.includes('gif')) claudeMediaType = 'image/gif'
  if (mediaType.includes('webp')) claudeMediaType = 'image/webp'

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: claudeMediaType,
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

  const textContent = message.content.find((content) => content.type === 'text')
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude')
  }

  return parseAnalysisJson(textContent.text)
}

/**
 * Анализирует PDF (если в нём есть текст).
 * Args:
 *   pdfUrl (string): URL PDF.
 * Returns:
 *   AnalysisResult: Результат анализа.
 */
async function analyzePdf(pdfUrl: string): Promise<AnalysisResult> {
  const response = await fetch(pdfUrl)
  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  let pdfParse: (data: Buffer) => Promise<{ text: string }>
  try {
    const domMatrixModule = await import('dommatrix')
    if (!(globalThis as { DOMMatrix?: typeof domMatrixModule.default }).DOMMatrix) {
      ;(globalThis as { DOMMatrix?: typeof domMatrixModule.default }).DOMMatrix =
        domMatrixModule.default
    }

    const pdfParseModule = await import('pdf-parse')
    pdfParse = (pdfParseModule as unknown as { default: typeof pdfParse }).default
  } catch (error) {
    console.error('pdf-parse import error:', error)
    throw new Error('pdf-parse not available')
  }

  const pdfData = await pdfParse(buffer)
  const text = pdfData.text

  if (text.trim().length < 50) {
    throw new Error(
      'PDF appears to be scanned. Please upload as image (JPG/PNG) for better analysis.'
    )
  }

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: `${ANALYSIS_PROMPT}\n\n---\n\nТекст документа:\n\n${text.substring(0, 15000)}`,
      },
    ],
  })

  const textContent = message.content.find((content) => content.type === 'text')
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude')
  }

  return parseAnalysisJson(textContent.text)
}

/**
 * Парсит JSON-ответ Claude.
 * Args:
 *   rawText (string): Текст ответа.
 * Returns:
 *   AnalysisResult: Распарсенный JSON.
 */
function parseAnalysisJson(rawText: string): AnalysisResult {
  const jsonStr = rawText.trim()
  try {
    return JSON.parse(jsonStr) as AnalysisResult
  } catch (error) {
    console.error('Failed to parse Claude response as JSON:', error)
    throw new Error('Claude returned invalid JSON')
  }
}
