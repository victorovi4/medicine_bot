import { NextRequest } from 'next/server'
import { getPrismaClient } from '@/lib/db'
import { isTestModeRequest } from '@/lib/test-mode'
import { ANALYSIS_MODEL, getClient } from '@/lib/claude'
import { PATIENT, getFullName, getAge } from '@/lib/patient'
import { getGuidelineForPatient } from '@/lib/clinical-guidelines'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/kr-check
 * Проверяет медицинский документ на соответствие клиническим рекомендациям.
 * Response: streaming text/event-stream (SSE)
 */
export async function POST(request: NextRequest) {
  try {
    const { documentId } = await request.json()

    if (!documentId || typeof documentId !== 'string') {
      return new Response(JSON.stringify({ error: 'documentId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Загрузить клинические рекомендации
    const guideline = getGuidelineForPatient()
    if (!guideline) {
      return new Response(JSON.stringify({ error: 'Клинические рекомендации для данного диагноза не найдены' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const prisma = getPrismaClient({ testMode: isTestModeRequest(request) })

    // Загрузить документ с измерениями
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { measurements: true, procedures: true },
    })

    if (!document) {
      return new Response(JSON.stringify({ error: 'Документ не найден' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Загрузить текущие лекарства пациента
    const medications = await prisma.medication.findMany({
      where: { isActive: true },
      orderBy: { startDate: 'desc' },
    })

    // Построить контекст пациента
    const patientContext = buildPatientContext(document, medications)

    // Системный промпт с полным текстом КР
    const systemPrompt = buildSystemPrompt(guideline.text)

    // Streaming response через Anthropic SDK
    const client = getClient()
    const stream = client.messages.stream({
      model: ANALYSIS_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: patientContext }],
    })

    // SSE stream
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
          const result = parseKrCheckResult(fullResponse)

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: 'done',
              result,
              guidelineId: guideline.id,
              guidelineName: guideline.name,
            })}\n\n`)
          )

          controller.close()
        } catch (error) {
          console.error('KR-check streaming error:', error)
          const errorMsg = error instanceof Error ? error.message : 'Ошибка при проверке по КР'
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
    console.error('KR-check API error:', error)
    const msg = error instanceof Error ? error.message : 'Ошибка'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

/**
 * Системный промпт с полным текстом клинических рекомендаций.
 */
function buildSystemPrompt(guidelineText: string): string {
  return `Ты — медицинский эксперт-валидатор. Твоя задача — проверить медицинский документ на соответствие клиническим рекомендациям (КР).

## Клинические рекомендации (полный текст)

${guidelineText}

## Правила проверки

1. **Обследования**: Проверь, все ли рекомендованные обследования назначены/проведены. Например, если КР рекомендует ПЭТ-КТ при определённой стадии — упомяни это.
2. **Назначения**: Сверь назначенную терапию с рекомендациями КР. Отметь соответствия и расхождения.
3. **Сроки**: Проверь соблюдение рекомендованных интервалов обследований и контроля.
4. **Пропущенные исследования**: Укажи важные обследования, которые рекомендованы КР, но не упомянуты в документе.
5. **Стадирование**: Если есть данные о стадии, проверь соответствие рекомендованного лечения для этой стадии.

## Формат ответа

Верни ТОЛЬКО валидный JSON (без markdown-обёрток, без \`\`\`json). Структура:

{
  "items": [
    {
      "status": "ok" | "warning" | "missing" | "info",
      "title": "Краткий заголовок пункта",
      "description": "Подробное описание: что найдено, что рекомендуется по КР",
      "krReference": "Ссылка на раздел КР (например: 'Раздел 3.1 Диагностика', 'п. 7.2 Рекомендация')"
    }
  ]
}

Статусы:
- "ok" — документ соответствует КР
- "warning" — есть расхождение с КР, требует внимания
- "missing" — рекомендованное обследование/лечение отсутствует
- "info" — информационный пункт, дополнительный контекст

Выдай 5-15 пунктов проверки. Сначала ОК, потом warning, потом missing. Пиши на русском языке.`
}

/**
 * Контекст пациента и данные документа для проверки.
 */
function buildPatientContext(
  document: {
    title: string
    date: Date
    category: string
    subtype: string
    conclusion: string | null
    recommendations: string[]
    keyValues: unknown
    content: string | null
    summary: string | null
    doctor: string | null
    specialty: string | null
    clinic: string | null
    measurements: { name: string; value: number; unit: string }[]
    procedures: { name: string; type: string; date: Date }[]
  },
  medications: { name: string; dosage: string | null; frequency: string | null }[]
): string {
  const parts: string[] = []

  // Контекст пациента
  parts.push(`## Пациент`)
  parts.push(`- ФИО: ${getFullName()}`)
  parts.push(`- Возраст: ${getAge()} лет`)
  parts.push(`- Пол: ${PATIENT.gender}`)
  parts.push(`- Основной диагноз: ${PATIENT.mainDiagnosis || 'не указан'}${PATIENT.mainDiagnosisCode ? ` (${PATIENT.mainDiagnosisCode})` : ''}`)
  if (PATIENT.comorbidities.length > 0) {
    parts.push(`- Сопутствующие: ${PATIENT.comorbidities.join(', ')}`)
  }

  // Текущие лекарства
  if (medications.length > 0) {
    parts.push(`\n## Текущие лекарства`)
    for (const med of medications) {
      let line = `- ${med.name}`
      if (med.dosage) line += ` ${med.dosage}`
      if (med.frequency) line += ` (${med.frequency})`
      parts.push(line)
    }
  }

  // Данные документа
  parts.push(`\n## Проверяемый документ`)
  parts.push(`- Название: ${document.title}`)
  parts.push(`- Дата: ${document.date.toISOString().split('T')[0]}`)
  parts.push(`- Категория: ${document.category} / ${document.subtype}`)

  if (document.doctor) parts.push(`- Врач: ${document.doctor}`)
  if (document.specialty) parts.push(`- Специальность: ${document.specialty}`)
  if (document.clinic) parts.push(`- Учреждение: ${document.clinic}`)

  if (document.conclusion) {
    parts.push(`\n### Заключение врача`)
    parts.push(document.conclusion)
  }

  if (document.recommendations.length > 0) {
    parts.push(`\n### Рекомендации врача`)
    for (const rec of document.recommendations) {
      parts.push(`- ${rec}`)
    }
  }

  if (document.keyValues && typeof document.keyValues === 'object') {
    const kv = document.keyValues as Record<string, string>
    const entries = Object.entries(kv)
    if (entries.length > 0) {
      parts.push(`\n### Ключевые показатели`)
      for (const [key, value] of entries) {
        parts.push(`- ${key}: ${value}`)
      }
    }
  }

  if (document.measurements.length > 0) {
    parts.push(`\n### Измерения`)
    for (const m of document.measurements) {
      parts.push(`- ${m.name}: ${m.value} ${m.unit}`)
    }
  }

  if (document.procedures.length > 0) {
    parts.push(`\n### Процедуры`)
    for (const p of document.procedures) {
      parts.push(`- ${p.name} (${p.type}, ${p.date.toISOString().split('T')[0]})`)
    }
  }

  if (document.content) {
    parts.push(`\n### Полный текст документа`)
    // Ограничиваем fullText чтобы не превысить контекст (КР уже 70-170K)
    const maxFullText = 15000
    if (document.content.length > maxFullText) {
      parts.push(document.content.substring(0, maxFullText) + '\n\n[...текст обрезан...]')
    } else {
      parts.push(document.content)
    }
  } else if (document.summary) {
    parts.push(`\n### Резюме документа`)
    parts.push(document.summary)
  }

  return parts.join('\n')
}

/**
 * Парсит JSON-результат проверки по КР из ответа модели.
 */
function parseKrCheckResult(rawText: string): { items: KrCheckItem[] } {
  let jsonStr = rawText.trim()

  // Убираем markdown-обёртки
  if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7)
  else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3)
  if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3)
  jsonStr = jsonStr.trim()

  // Попытка 1: прямой парсинг
  try {
    const parsed = JSON.parse(jsonStr)
    if (parsed.items && Array.isArray(parsed.items)) {
      return { items: parsed.items }
    }
    // Если нет items, но есть массив на верхнем уровне
    if (Array.isArray(parsed)) {
      return { items: parsed }
    }
    return { items: [] }
  } catch {
    // Попытка 2: извлечь JSON из текста
    const startIdx = rawText.indexOf('{')
    if (startIdx !== -1) {
      let depth = 0, inString = false, escape = false
      for (let i = startIdx; i < rawText.length; i++) {
        const ch = rawText[i]
        if (escape) { escape = false; continue }
        if (ch === '\\' && inString) { escape = true; continue }
        if (ch === '"') { inString = !inString; continue }
        if (inString) continue
        if (ch === '{') depth++
        if (ch === '}') {
          depth--
          if (depth === 0) {
            try {
              const extracted = JSON.parse(rawText.substring(startIdx, i + 1))
              if (extracted.items && Array.isArray(extracted.items)) {
                return { items: extracted.items }
              }
              return { items: [] }
            } catch {
              break
            }
          }
        }
      }
    }

    console.error('KR-check: failed to parse JSON from response:', rawText.substring(0, 500))
    return { items: [] }
  }
}

interface KrCheckItem {
  status: 'ok' | 'warning' | 'missing' | 'info'
  title: string
  description: string
  krReference: string
}
