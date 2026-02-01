import OpenAI from 'openai'

// Модель Claude через OpenRouter
const MODEL = 'anthropic/claude-sonnet-4'

// Ленивая инициализация клиента (чтобы не падать при билде)
let _openrouter: OpenAI | null = null

function getOpenRouter(): OpenAI {
  if (!_openrouter) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not configured')
    }
    _openrouter = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': process.env.VERCEL_URL || 'http://localhost:3000',
        'X-Title': 'Medical Card',
      },
    })
  }
  return _openrouter
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

11. **keyValues** — ключевые числовые показатели в формате {"название": "значение с единицами"}. 
    Примеры: {"ПСА общий": "4.5 нг/мл", "Гемоглобин": "130 г/л", "Креатинин": "98 мкмоль/л"}
    Для выписок/эпикризов указывай ПОСЛЕДНИЕ значения (при выписке).
    Для анализов — все значимые показатели.

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

Контекст пациента: мужчина 78 лет, основной диагноз — рак предстательной железы (C61).

ВАЖНО: 
- Заключение врача и рекомендации извлекай ДОСЛОВНО из документа, не перефразируй!
- Для выписок/эпикризов ОБЯЗАТЕЛЬНО извлекай procedures и measurementsDynamics!
- Гемотрансфузия определяется по резкому росту гемоглобина + подготовительным анализам (группа крови, антитела).

Верни ТОЛЬКО валидный JSON без markdown-форматирования, без \`\`\`json, просто чистый JSON объект.`

/**
 * Анализирует документ по URL и типу файла через OpenRouter.
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
  // Проверка ключа происходит в getOpenRouter()
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
 * Args:
 *   images (array): Массив объектов { url, mediaType }.
 * Returns:
 *   AnalysisResult: Результат AI-анализа.
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
  const imageContents: OpenAI.Chat.Completions.ChatCompletionContentPart[] = []

  for (let i = 0; i < images.length; i++) {
    const { url, mediaType } = images[i]
    const response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const dataUrl = `data:${mediaType};base64,${base64}`

    imageContents.push({
      type: 'image_url',
      image_url: {
        url: dataUrl,
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

  const completion = await getOpenRouter().chat.completions.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content: imageContents,
      },
    ],
  })

  const textContent = completion.choices[0]?.message?.content
  if (!textContent) {
    throw new Error('No response from OpenRouter')
  }

  return parseAnalysisJson(textContent)
}

/**
 * Анализирует изображение через OpenRouter (Claude Vision).
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
  // Скачиваем изображение и конвертируем в base64 data URL
  const response = await fetch(imageUrl)
  const arrayBuffer = await response.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const dataUrl = `data:${mediaType};base64,${base64}`

  const completion = await getOpenRouter().chat.completions.create({
    model: MODEL,
    max_tokens: 3000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: dataUrl,
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

  const textContent = completion.choices[0]?.message?.content
  if (!textContent) {
    throw new Error('No response from OpenRouter')
  }

  return parseAnalysisJson(textContent)
}

/**
 * Анализирует PDF через OpenRouter.
 * Конвертируем PDF в base64 и отправляем как file URL.
 * Args:
 *   pdfUrl (string): URL PDF.
 * Returns:
 *   AnalysisResult: Результат анализа.
 */
async function analyzePdf(pdfUrl: string): Promise<AnalysisResult> {
  // Скачиваем PDF и конвертируем в base64 data URL
  const response = await fetch(pdfUrl)
  const arrayBuffer = await response.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const dataUrl = `data:application/pdf;base64,${base64}`

  const completion = await getOpenRouter().chat.completions.create({
    model: MODEL,
    max_tokens: 3000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'file',
            file: {
              filename: 'document.pdf',
              file_data: dataUrl,
            },
          } as OpenAI.Chat.Completions.ChatCompletionContentPart,
          {
            type: 'text',
            text: ANALYSIS_PROMPT,
          },
        ],
      },
    ],
  })

  const textContent = completion.choices[0]?.message?.content
  if (!textContent) {
    throw new Error('No response from OpenRouter')
  }

  return parseAnalysisJson(textContent)
}

/**
 * Парсит JSON-ответ от модели.
 * Args:
 *   rawText (string): Текст ответа.
 * Returns:
 *   AnalysisResult: Распарсенный JSON.
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

  // Попытка 2: найти JSON объект в тексте
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
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
