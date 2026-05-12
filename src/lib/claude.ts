import Anthropic from '@anthropic-ai/sdk'
import { PATIENT, getAge } from '@/lib/patient'

// Модели
export const ANALYSIS_MODEL = 'claude-haiku-4-5-20251001'  // для анализа документов (OCR, извлечение JSON) — ~10x дешевле Sonnet
export const CHAT_MODEL = 'claude-sonnet-4-6'        // для чата и аналитики

// Ленивая инициализация клиента
let _client: Anthropic | null = null

export function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not configured')
    }
    const timeoutMs = process.env.ANTHROPIC_TIMEOUT
      ? parseInt(process.env.ANTHROPIC_TIMEOUT) * 1000
      : 45 * 1000  // 45с по умолчанию (Vercel timeout = 60с)
    _client = new Anthropic({
      maxRetries: 2,           // retry на 429/529 с exponential backoff
      timeout: timeoutMs,
    })
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

    🚨 КРИТИЧЕСКИ ВАЖНО — точность названий показателей:
    - В выписных эпикризах обычно ДВЕ или более таблиц: биохимия (АЛТ, АСТ, ферритин, билирубин) и
      клинический анализ крови (Гемоглобин/HGB, Эритроциты/RBC, Лейкоциты/WBC, Тромбоциты/PLT).
      Это РАЗНЫЕ таблицы — НИКОГДА не путай строки между ними!
    - Гемоглобин (HGB) измеряется в г/л, норма у взрослых 120-160 г/л. Если ты видишь "норма < 41"
      или единицы "Ед/л" — это НЕ гемоглобин, это АЛТ или АСТ.
    - АЛТ (Аланинаминотрансфераза, ALT) и АСТ (Аспартатаминотрансфераза, AST) — это ферменты,
      измеряются в Ед/л, норма < 41 Ед/л. Это НЕ гемоглобин.
    - Перед тем как записать значение для метрики, проверь соответствие единицы и нормы:
      Гемоглобин = г/л, норма 110-180 | АЛТ/АСТ = Ед/л, норма < 41 | Глюкоза = ммоль/л, норма 3.9-6.4.
    - Если в строке нет явного названия "Гемоглобин"/"HGB"/"Hb" — НЕ записывай значение как гемоглобин.

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

    🚨 ОБЯЗАТЕЛЬНО ищи и извлекай таблицу клинического анализа крови!
    Названия таблицы могут быть: "Плазма ЭДТА", "Клинический анализ крови",
    "Общий анализ крови", "Гематология", "Проточная цитофлуорометрия".
    Эта таблица содержит ИМЕННО: Гемоглобин (HGB), Эритроциты (RBC), Лейкоциты (WBC),
    Гематокрит (HCT), Тромбоциты (PLT). Не путай с биохимией!
    Норма гемоглобина 110-180 г/л. Если в таблице ты видишь значения порядка 70-120 для
    гемоглобина, эритроциты 2-4, лейкоциты 4-11 — ты нашёл правильную таблицу.
    Каждый объект содержит:
    - name: название показателя ("Гемоглобин", "Лейкоциты")
    - unit: единица измерения
    - values: массив {date: "YYYY-MM-DD", value: число}

    Пример: [{"name": "Гемоглобин", "unit": "г/л", "values": [{"date": "2026-01-26", "value": 87}, {"date": "2026-01-28", "value": 75}, {"date": "2026-01-30", "value": 108}]}]
    Если динамики нет (одиночный анализ) — пустой массив [].

    🚨 Перед тем как добавить показатель в measurementsDynamics, ПРОВЕРЬ единицы измерения:
    - Гемоглобин строго в г/л. Если в строке таблицы единица "Ед/л" — это НЕ гемоглобин (это АЛТ/АСТ/ЛДГ/амилаза).
    - Лейкоциты в 10^9/л или 10³/мкл. Эритроциты в 10^12/л.
    - Если значения показателя выходят за биологически возможный диапазон в 5+ раз
      (например "гемоглобин 49 г/л" — это критическая анемия, возможна, но "гемоглобин 79 Ед/л" — НЕВОЗМОЖНО)
      — перепроверь, не взял ли ты значение из соседней строки или другой таблицы.

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
  fileType: string,
  preloadedBuffer?: Buffer
): Promise<AnalysisResult> {
  if (fileType.startsWith('image/')) {
    return analyzeImage(fileUrl, fileType)
  }

  if (fileType === 'application/pdf') {
    return analyzePdf(fileUrl, preloadedBuffer)
  }

  if (fileType === 'application/rtf' || fileType === 'text/rtf') {
    return analyzeRtf(fileUrl)
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
 * Анализирует RTF-файл: извлекает текст и отправляет на анализ.
 * fullText берём из экстрактора напрямую — не просим Claude перепечатывать.
 * Для AI-анализа ограничиваем текст 15К символов (вписывается в 60с timeout).
 */
async function analyzeRtf(rtfUrl: string): Promise<AnalysisResult> {
  const response = await fetch(rtfUrl)
  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const fullText = extractRtfText(buffer)
  if (!fullText || fullText.length < 50) {
    throw new Error('RTF: не удалось извлечь текст')
  }

  // Для AI-анализа обрезаем до 15K (хватит для метаданных, keyValues, summary).
  // fullText уже есть — Claude не нужно его повторять.
  const textForAi = fullText.length > 15000
    ? fullText.substring(0, 15000) + '\n\n[...текст обрезан, полный текст сохранён...]'
    : fullText

  console.log(`RTF text extracted: ${fullText.length} chars, sending ${textForAi.length} to AI`)
  const result = await analyzeText(textForAi)
  result.fullText = fullText
  return result
}

/**
 * Извлекает плоский текст из RTF-буфера.
 * Обрабатывает Windows-1251 (Cyrillic), Unicode-escape, группы, картинки.
 */
function extractRtfText(buffer: Buffer): string {
  const rtf = buffer.toString('binary')

  // Windows-1251 → Unicode для кириллицы и спецсимволов
  const CP1251: Record<number, number> = {
    0x80:0x0402,0x81:0x0403,0x82:0x201A,0x83:0x0453,0x84:0x201E,0x85:0x2026,
    0x86:0x2020,0x87:0x2021,0x88:0x20AC,0x89:0x2030,0x8A:0x0409,0x8B:0x2039,
    0x8C:0x040A,0x8D:0x040C,0x8E:0x040B,0x8F:0x040F,0x90:0x0452,0x91:0x2018,
    0x92:0x2019,0x93:0x201C,0x94:0x201D,0x95:0x2022,0x96:0x2013,0x97:0x2014,
    0x99:0x2122,0x9A:0x0459,0x9B:0x203A,0x9C:0x045A,0x9D:0x045C,0x9E:0x045B,
    0x9F:0x045F,0xA0:0x00A0,0xA1:0x040E,0xA2:0x045E,0xA3:0x0408,0xA4:0x00A4,
    0xA5:0x0490,0xA6:0x00A6,0xA7:0x00A7,0xA8:0x0401,0xA9:0x00A9,0xAA:0x0404,
    0xAB:0x00AB,0xAC:0x00AC,0xAD:0x00AD,0xAE:0x00AE,0xAF:0x0407,0xB0:0x00B0,
    0xB1:0x00B1,0xB2:0x0406,0xB3:0x0456,0xB4:0x0491,0xB5:0x00B5,0xB6:0x00B6,
    0xB7:0x00B7,0xB8:0x0451,0xB9:0x2116,0xBA:0x0454,0xBB:0x00BB,0xBC:0x0458,
    0xBD:0x0405,0xBE:0x0455,0xBF:0x0457,
  }
  // 0xC0..0xFF → U+0410..U+044F (А..я)
  for (let i = 0xC0; i <= 0xFF; i++) CP1251[i] = 0x0410 + (i - 0xC0)

  function cp1251Char(code: number): string {
    if (CP1251[code]) return String.fromCodePoint(CP1251[code])
    if (code >= 0x20 && code < 0x80) return String.fromCharCode(code)
    return ''
  }

  // Группы, содержимое которых пропускаем целиком
  const SKIP = new Set([
    'fonttbl','colortbl','stylesheet','info','pict','shppict','blipuid',
    'panose','falt','xmlnstbl','defchp','defpap','rsidtbl','mmathPr',
    'wgrffmtfilter','fchars','lchars','datafield','fldinst',
    'pnseclvl','ftnsep','ftnsepc','aftnsep','aftnsepc',
    'headerr','footerr','header','footer',
    // Word-специфичные группы с бинарными/служебными данными
    'themedata','colorschememapping','datastore','latentstyles',
    'listtable','listoverridetable','revtbl','pgptbl','picprop',
    'objdata','objclass','result',
  ])

  let out = ''
  let i = 0
  let skip = 0          // >0 → внутри пропускаемой группы

  while (i < rtf.length) {
    const ch = rtf[i]

    if (ch === '{') { if (skip > 0) skip++; i++; continue }
    if (ch === '}') {
      if (skip > 0) skip--
      else out += '' // group end, no action
      i++; continue
    }
    if (skip > 0) { i++; continue }

    if (ch === '\\') {
      i++
      if (i >= rtf.length) break
      const c2 = rtf[i]

      // \'XX hex escape
      if (c2 === "'") {
        const hex = rtf.substring(i + 1, i + 3)
        i += 3
        out += cp1251Char(parseInt(hex, 16))
        continue
      }

      // \uN unicode escape
      if (c2 === 'u' && /\d|-/.test(rtf[i + 1] || '')) {
        const m = rtf.substring(i).match(/^u(-?\d+)/)
        if (m) {
          let code = parseInt(m[1])
          if (code < 0) code += 65536
          out += String.fromCodePoint(code)
          i += m[0].length
          // Skip replacement character(s)
          if (rtf[i] === ' ') i++
          else if (rtf[i] === '\\' && rtf[i + 1] === "'") i += 4
          else if (rtf[i] === '?') i++
          continue
        }
      }

      // \* ignorable destination
      if (c2 === '*') {
        i++
        // peek next control word
        const dm = rtf.substring(i).match(/^\\([a-z]+)/i)
        if (dm && SKIP.has(dm[1])) { skip = 1 }
        continue
      }

      // Literal escapes
      if (c2 === '\\' || c2 === '{' || c2 === '}') { out += c2; i++; continue }
      if (c2 === '~') { out += '\u00A0'; i++; continue }
      if (c2 === '_') { out += '\u2011'; i++; continue }
      if (c2 === '-') { i++; continue } // optional hyphen

      // Control word: \word[-]N[ ]
      const wm = rtf.substring(i).match(/^([a-z]+)(-?\d+)?[ ]?/i)
      if (wm) {
        const word = wm[1].toLowerCase()
        i += wm[0].length
        if (SKIP.has(word)) { skip = 1; continue }
        if (word === 'par' || word === 'line') out += '\n'
        else if (word === 'tab') out += '\t'
        else if (word === 'cell') out += '\t'
        else if (word === 'row') out += '\n'
        continue
      }

      i++ // unknown
      continue
    }

    // Ignore RTF line breaks (not semantic)
    if (ch === '\r' || ch === '\n') { i++; continue }

    out += ch
    i++
  }

  return out.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+$/gm, '').replace(/^[ \t]+$/gm, '').trim()
}

/**
 * Анализирует PDF через Anthropic.
 * Стратегия: сначала извлечь текст (быстро, работает для OCR-PDF),
 * если текста нет — отправить постранично через Vision.
 */
async function analyzePdf(pdfUrl: string, preloadedBuffer?: Buffer): Promise<AnalysisResult> {
  const buffer = preloadedBuffer ?? Buffer.from(await (await fetch(pdfUrl)).arrayBuffer())
  const sizeMB = buffer.length / (1024 * 1024)

  // 1. Попытка извлечь текст из PDF (OCR-слой) — с жёстким таймаутом 8с,
  // чтобы pdf-parse не подвешивал image-only PDF на Vercel без @napi-rs/canvas.
  try {
    const extractText = async (): Promise<string> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfParseModule = await import('pdf-parse') as any
      if (pdfParseModule.PDFParse) {
        const parser = new pdfParseModule.PDFParse(new Uint8Array(buffer))
        const result = await parser.getText()
        return (typeof result === 'string' ? result : result?.text ?? '').trim()
      }
      const pdfParse = pdfParseModule.default ?? pdfParseModule
      const pdfData = await pdfParse(buffer)
      return (pdfData.text ?? '').trim()
    }

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('pdf-parse timeout 8s')), 8000)
    )
    const text = await Promise.race([extractText(), timeout])

    // Фильтруем фейковый текст (AnyScanner добавляет только водяной знак)
    const cleanText = text.replace(/AnyScanner/gi, '').replace(/--\s*\d+\s*of\s*\d+\s*--/g, '').trim()

    if (cleanText && cleanText.length > 200) {
      console.log(`PDF text extracted: ${cleanText.length} chars (${sizeMB.toFixed(1)} MB), using text-only analysis`)
      return analyzeText(cleanText)
    }
    console.log(`PDF text too short after cleanup (${cleanText?.length || 0} chars), falling back to vision`)
  } catch (err) {
    console.log('PDF text extraction failed/timeout:', err instanceof Error ? err.message : err)
  }

  // 2. Vision-подход: разбиваем PDF на страницы и отправляем как изображения
  console.log(`Using page-by-page vision analysis for PDF (${sizeMB.toFixed(1)} MB)`)
  return analyzePdfByPages(buffer)
}

/**
 * Отправляет PDF целиком через Anthropic document type (без разбивки по страницам).
 * Anthropic поддерживает PDF до 100 страниц нативно — разбивка не нужна.
 */
async function analyzePdfByPages(buffer: Buffer): Promise<AnalysisResult> {
  const sizeMB = buffer.length / (1024 * 1024)
  const pdfBase64 = buffer.toString('base64')

  console.log(`Sending whole PDF (${sizeMB.toFixed(1)} MB) to Anthropic API...`)

  const response = await getClient().messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 8000,
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
          {
            type: 'text',
            text: `Это медицинский документ (PDF, ${sizeMB.toFixed(1)} MB).\nПроанализируй ВСЕ страницы как ОДИН документ и извлеки информацию.\n\n${ANALYSIS_PROMPT}`,
          },
        ],
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
