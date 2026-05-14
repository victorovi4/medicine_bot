/**
 * OCR Engines через OpenRouter — A/B тестирование разных моделей для Pass 1.
 *
 * Все engine'ы делают одно: получают PDF → возвращают структурированный JSON
 * (ExtractedDocument) с таблицами и текстовыми блоками. Отличаются модели
 * и способ обработки PDF (native vs file-parser plugin).
 */

import { ExtractedDocument } from '@/lib/claude-two-pass'

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

export type OcrEngine =
  | 'mistral-ocr-pipeline'      // file-parser mistral-ocr → Claude Haiku 4.5
  | 'gemini-3-1-pro-direct'     // Gemini 3.1 Pro нативный PDF input
  | 'gemini-3-flash-direct'     // Gemini 3 Flash Preview нативный PDF (текущий primary)
  | 'qwen-vl-via-parser'        // Qwen 3 VL 32B + file-parser mistral-ocr
  | 'sonnet-via-parser'         // Claude Sonnet 4.6 + file-parser mistral-ocr
  | 'sonnet-direct'             // Claude Sonnet 4.6 нативный PDF (без parser plugin)
  | 'opus-direct'               // Claude Opus 4.7 нативный PDF — лучший на сложных таблицах

export const ENGINE_DESCRIPTIONS: Record<OcrEngine, string> = {
  'mistral-ocr-pipeline': 'OpenRouter file-parser (mistral-ocr) → Claude Haiku 4.5 normalize',
  'gemini-3-1-pro-direct': 'Gemini 3.1 Pro Preview (native PDF input)',
  'gemini-3-flash-direct': 'Gemini 3 Flash Preview (native PDF, текущий primary)',
  'qwen-vl-via-parser': 'Qwen 3 VL 32B Instruct + file-parser mistral-ocr',
  'sonnet-via-parser': 'Claude Sonnet 4.6 + file-parser mistral-ocr',
  'sonnet-direct': 'Claude Sonnet 4.6 (native PDF, без parser)',
  'opus-direct': 'Claude Opus 4.7 (native PDF, топ Anthropic для table+scan)',
}

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string | Array<{ type: string; text?: string }>
    }
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  error?: { message: string; code?: string }
}

/**
 * Универсальный вызов OpenRouter с PDF.
 * Если плагин `file-parser` указан и модель не поддерживает PDF нативно,
 * OpenRouter сам распарсит PDF указанным engine и отдаст result модели.
 */
async function callOpenRouter(opts: {
  model: string
  pdfBase64: string
  prompt: string
  maxTokens?: number
  parserEngine?: 'mistral-ocr' | 'cloudflare-ai' | 'native'
  timeoutMs?: number
}): Promise<{ text: string; raw: OpenRouterResponse }> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured')

  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 8000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'file',
            file: {
              filename: 'document.pdf',
              file_data: `data:application/pdf;base64,${opts.pdfBase64}`,
            },
          },
          { type: 'text', text: opts.prompt },
        ],
      },
    ],
  }
  if (opts.parserEngine) {
    body.plugins = [{ id: 'file-parser', pdf: { engine: opts.parserEngine } }]
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 50_000)
  try {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://medicine-bot-4xqt.vercel.app',
        'X-Title': 'Medicine Bot OCR A/B Test',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`OpenRouter ${res.status}: ${errText.substring(0, 500)}`)
    }
    const data = (await res.json()) as OpenRouterResponse
    if (data.error) throw new Error(`OpenRouter error: ${data.error.message}`)
    const msg = data.choices?.[0]?.message
    const text = typeof msg?.content === 'string'
      ? msg.content
      : (msg?.content || []).filter(b => b.type === 'text').map(b => b.text || '').join('\n')
    return { text, raw: data }
  } finally {
    clearTimeout(timer)
  }
}

const STRUCTURED_OCR_PROMPT = `Ты медицинский OCR-ассистент. Извлеки структурированные данные из медицинского документа.

Верни ТОЛЬКО валидный JSON (без markdown, без \`\`\`) со схемой:

{
  "documentType": "выписной эпикриз" | "анализ крови" | "консультация" | "УЗИ/КТ/МРТ" | "другое",
  "documentDate": "YYYY-MM-DD" | null,
  "patientName": "ФИО" | null,
  "clinic": "..." | null,
  "doctor": "..." | null,
  "pages": [
    {
      "pageNumber": 1,
      "tables": [
        {
          "title": "Биохимия" | "Клинический анализ крови" | "Анализ мочи" | "Гемостаз" | "Микроскопия осадка мочи" | <свой заголовок>,
          "dates": ["21.04.2026", "22.04.2026", "25.04.2026"] | null,
          "rows": [
            { "name": "Гемоглобин (HGB)", "unit": "г/л", "normalMin": 130, "normalMax": 160, "values": [82, 72, 110] }
          ]
        }
      ],
      "textBlocks": [
        { "type": "diagnosis_main" | "diagnosis_secondary" | "doctor" | "specialty" | "clinic" | "anamnesis" | "recommendations" | "conclusion" | "procedure" | "other", "text": "..." }
      ]
    }
  ]
}

🔴 ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:
1. Дословный OCR. "HGB" → "HGB", "Гемоглобин" → "Гемоглобин". Не нормализуй.
2. Каждая отдельная таблица — отдельный объект. На странице может быть 2-3 таблицы — не объединяй.
3. Если в таблице несколько колонок-дат — values строго по порядку колонок, длина == длине dates. Пустая ячейка → null.
4. Норма: "<41" → normalMax: 41, normalMin: null. "5-34" → normalMin: 5, normalMax: 34. ">3.5" → normalMin: 3.5, normalMax: null.
5. ВАЖНО: в эпикризе обычно ДВЕ разные таблицы — биохимия (АЛТ, АСТ, креатинин в Ед/л / мкмоль/л) и клинический анализ крови (HGB, RBC, WBC в г/л / 10^9/л). НЕ ПУТАЙ строки между ними.
6. Не пиши комментарии. Только JSON.`

function extractJson(text: string): string | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  return text.substring(start, end + 1)
}

export interface OcrResult {
  engine: OcrEngine
  model: string
  extracted: ExtractedDocument | null
  rawResponse: string
  durationMs: number
  promptTokens?: number
  completionTokens?: number
  error?: string
}

export async function runOcrEngine(engine: OcrEngine, pdfBuffer: Buffer): Promise<OcrResult> {
  const pdfBase64 = pdfBuffer.toString('base64')
  const t0 = Date.now()

  const cfg: Record<OcrEngine, { model: string; parserEngine?: 'mistral-ocr' | 'cloudflare-ai' | 'native'; maxTokens?: number }> = {
    'mistral-ocr-pipeline': { model: 'anthropic/claude-haiku-4.5', parserEngine: 'mistral-ocr' },
    'gemini-3-1-pro-direct': { model: 'google/gemini-3.1-pro-preview', parserEngine: 'native' },
    'gemini-3-flash-direct': { model: 'google/gemini-3-flash-preview', parserEngine: 'native' },
    'qwen-vl-via-parser': { model: 'qwen/qwen3-vl-32b-instruct', parserEngine: 'mistral-ocr', maxTokens: 6000 },
    'sonnet-via-parser': { model: 'anthropic/claude-sonnet-4.6', parserEngine: 'mistral-ocr' },
    'sonnet-direct': { model: 'anthropic/claude-sonnet-4.6', parserEngine: 'native' },
    'opus-direct': { model: 'anthropic/claude-opus-4.7', parserEngine: 'native' },
  }
  const { model, parserEngine, maxTokens } = cfg[engine]

  try {
    const { text, raw } = await callOpenRouter({
      model,
      pdfBase64,
      prompt: STRUCTURED_OCR_PROMPT,
      parserEngine,
      maxTokens: maxTokens ?? 8000,
      timeoutMs: 55_000,
    })
    const json = extractJson(text)
    const extracted = json ? (JSON.parse(json) as ExtractedDocument) : null

    return {
      engine,
      model,
      extracted,
      rawResponse: text,
      durationMs: Date.now() - t0,
      promptTokens: raw.usage?.prompt_tokens,
      completionTokens: raw.usage?.completion_tokens,
    }
  } catch (err) {
    return {
      engine,
      model,
      extracted: null,
      rawResponse: '',
      durationMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
