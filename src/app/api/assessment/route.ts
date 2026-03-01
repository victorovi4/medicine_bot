import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getPrismaClient } from '@/lib/db'
import { isTestModeRequest } from '@/lib/test-mode'
import { ANALYSIS_MODEL } from '@/lib/claude'
import { PATIENT, getFullName, getAge } from '@/lib/patient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ASSESSMENT_SYSTEM_PROMPT = `Ты — опытный врач-аналитик, составляющий комплексное медицинское заключение.
Ты анализируешь ВСЮ медицинскую историю пациента и формируешь структурированное экспертное заключение.

## Пациент
- ФИО: ${getFullName()}
- Возраст: ${getAge()} лет
- Пол: ${PATIENT.gender}
- Основной диагноз: ${PATIENT.mainDiagnosis || 'не указан'}${PATIENT.mainDiagnosisCode ? ` (${PATIENT.mainDiagnosisCode})` : ''}
- Сопутствующие: ${PATIENT.comorbidities.length > 0 ? PATIENT.comorbidities.join(', ') : 'не указаны'}
- Отслеживаемые показатели: ${PATIENT.trackingMetrics.join(', ')}

## Правила
1. Пиши на русском языке, профессиональным но понятным языком.
2. Опирайся ТОЛЬКО на предоставленные документы и данные. Не выдумывай информацию.
3. Если данных недостаточно — честно скажи об этом.
4. Указывай даты и источники, когда ссылаешься на данные.
5. Основной диагноз уже установлен — свободно обсуждай его, течение болезни, стадирование и ответ на терапию. Не ставь НОВЫХ диагнозов, но интерпретируй данные в контексте известного заболевания.
6. ОБЯЗАТЕЛЬНО уложись во ВСЕ 6 секций. Пиши лаконично, чтобы хватило места на каждую секцию.`

const ASSESSMENT_USER_PROMPT = `Составь экспертное заключение по медицинской истории ниже. Формат — ровно 6 секций Markdown. НЕ используй таблицы. Обсуждай основной диагноз, стадию, ответ на терапию.

БЮДЖЕТ ТЕКСТА: у тебя ~2500 слов на всё заключение. Распредели так:
- Секции 1-3: по ~300 слов (факты)
- Секции 4-6: по ~500 слов (аналитика подробнее)

## 1. Хронология заболевания
5-8 ключевых дат: диагноз, госпитализации, смена терапии. Одна строка на событие.

## 2. Текущий статус
Состояние на последнюю дату: ключевые показатели, жалобы, ответ на терапию. 3-4 предложения.

## 3. Динамика показателей
Тренды ${PATIENT.trackingMetrics.join(', ')}: начальное → текущее значение, направление. Если значение выросло (84→107) — пиши "повысился", если упало (107→84) — "снизился".

## 4. Лист активных проблем
Пронумерованный список проблем с кратким обоснованием.

## 5. Оценка рисков
Нежелательные тренды, пропущенные обследования, факторы мониторинга.

## 6. Рекомендации для обсуждения с врачом
Конкретные вопросы и предложения для лечащего врача.

---
*Данное заключение сформировано искусственным интеллектом на основе загруженных медицинских документов. Оно НЕ является медицинским документом и не может заменить консультацию врача. Используйте его только как вспомогательный материал для обсуждения с лечащим врачом.*`

/**
 * Собирает контекст из медицинских данных пациента.
 * Оптимизирован для укладки в 60с лимит Vercel:
 * — документы в компактном формате (заключение + keyValues, без fullText)
 * — measurements сгруппированы по метрикам
 * — vitals/symptoms ограничены последними 20
 */
async function buildAssessmentContext(prisma: ReturnType<typeof getPrismaClient>): Promise<string> {
  let context = ''

  // 1. Документы — последние 60, компактный формат
  const documents = await prisma.document.findMany({
    orderBy: { date: 'desc' },
    take: 60,
    include: {
      measurements: true,
    },
  })
  // Отсортировать хронологически для контекста
  documents.reverse()

  if (documents.length > 0) {
    context += `\n## Медицинские документы (${documents.length} шт.)\n\n`
    for (const doc of documents) {
      const date = new Date(doc.date).toLocaleDateString('ru-RU')
      context += `- **${date}** ${doc.title} [${doc.category}/${doc.subtype}]`
      if (doc.doctor) context += ` | ${doc.doctor}`
      if (doc.specialty) context += ` (${doc.specialty})`
      context += '\n'

      // Заключение — самое важное (до 300 символов)
      if (doc.conclusion) {
        const concl = doc.conclusion.length > 300 ? doc.conclusion.slice(0, 300) + '…' : doc.conclusion
        context += `  Заключение: ${concl}\n`
      }

      // keyValues — числовые показатели
      if (doc.keyValues && typeof doc.keyValues === 'object') {
        const kv = doc.keyValues as Record<string, string>
        if (Object.keys(kv).length > 0) {
          context += `  Показатели: ${Object.entries(kv).map(([k, v]) => `${k}: ${v}`).join(', ')}\n`
        }
      }

      // Рекомендации (до 200 символов)
      if (doc.recommendations.length > 0) {
        const recsStr = doc.recommendations.join('; ')
        context += `  Рекомендации: ${recsStr.length > 200 ? recsStr.slice(0, 200) + '…' : recsStr}\n`
      }
    }
    context += '\n'
  }

  // 2. ВСЕ measurements сгруппированные по метрике (для анализа трендов)
  const measurements = await prisma.measurement.findMany({
    orderBy: { date: 'asc' },
  })
  if (measurements.length > 0) {
    const grouped = new Map<string, typeof measurements>()
    for (const m of measurements) {
      const key = m.name
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(m)
    }
    context += '## Все измерения по метрикам (для анализа трендов)\n'
    for (const [name, values] of grouped) {
      context += `\n### ${name}\n`
      for (const v of values) {
        const dt = new Date(v.date).toLocaleDateString('ru-RU')
        let line = `- ${dt}: ${v.value} ${v.unit}`
        if (v.normalMin != null && v.normalMax != null) {
          line += ` [норма: ${v.normalMin}–${v.normalMax}]`
        }
        if (v.isAbnormal) line += ' (!)'
        context += line + '\n'
      }
    }
    context += '\n'
  }

  // 3. Активные лекарства
  const medications = await prisma.medication.findMany({
    where: { isActive: true },
    orderBy: { startDate: 'desc' },
  })
  if (medications.length > 0) {
    context += '## Текущие препараты\n'
    for (const med of medications) {
      const startDate = new Date(med.startDate).toLocaleDateString('ru-RU')
      context += `- ${med.name}`
      if (med.dosage) context += ` (${med.dosage})`
      if (med.frequency) context += `, ${med.frequency}`
      context += ` — с ${startDate}\n`
    }
    context += '\n'
  }

  // 4. ВСЕ процедуры
  const procedures = await prisma.procedure.findMany({
    orderBy: { date: 'desc' },
  })
  if (procedures.length > 0) {
    context += '## Процедуры\n'
    for (const proc of procedures) {
      const date = new Date(proc.date).toLocaleDateString('ru-RU')
      context += `- ${date}: ${proc.name}`
      if (proc.beforeValue != null && proc.afterValue != null) {
        context += ` (${proc.beforeValue} → ${proc.afterValue} ${proc.unit || ''})`
      }
      context += '\n'
    }
    context += '\n'
  }

  // 5. Последние показатели (vitals) — ограничение 20
  const vitals = await prisma.vitalSign.findMany({
    orderBy: { datetime: 'desc' },
    take: 20,
  })
  if (vitals.length > 0) {
    context += '## Показатели (дневник)\n'
    for (const v of vitals) {
      const dt = new Date(v.datetime).toLocaleDateString('ru-RU')
      context += `- ${dt}: ${v.type} = ${v.value}${v.value2 != null ? `/${v.value2}` : ''} ${v.unit}\n`
    }
    context += '\n'
  }

  // 6. Последние симптомы — ограничение 20
  const symptoms = await prisma.symptom.findMany({
    orderBy: { datetime: 'desc' },
    take: 20,
  })
  if (symptoms.length > 0) {
    context += '## Симптомы\n'
    for (const s of symptoms) {
      const dt = new Date(s.datetime).toLocaleDateString('ru-RU')
      context += `- ${dt}: ${s.name}`
      if (s.intensity) context += ` (интенсивность: ${s.intensity}/10)`
      if (s.notes) context += ` — ${s.notes}`
      context += '\n'
    }
    context += '\n'
  }

  // 7. События на графиках (MetricEvents)
  const metricEvents = await prisma.metricEvent.findMany({
    orderBy: { date: 'asc' },
  })
  if (metricEvents.length > 0) {
    context += '## События и маркеры\n'
    for (const evt of metricEvents) {
      const dt = new Date(evt.date).toLocaleDateString('ru-RU')
      context += `- ${dt}: [${evt.eventType}] ${evt.label}`
      if (evt.metricName !== '*') context += ` (метрика: ${evt.metricName})`
      if (evt.notes) context += ` — ${evt.notes}`
      context += '\n'
    }
    context += '\n'
  }

  return context
}

/**
 * POST /api/assessment
 * Генерирует комплексное ИИ-заключение по всей медицинской карте.
 * Response: streaming text/event-stream (SSE)
 */
export async function POST(request: NextRequest) {
  try {
    const prisma = getPrismaClient({ testMode: isTestModeRequest(request) })

    // Собрать ПОЛНЫЙ контекст из всех данных
    const fullContext = await buildAssessmentContext(prisma)

    if (!fullContext.trim()) {
      return new Response(JSON.stringify({ error: 'Нет медицинских данных для анализа' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const documentsCount = await prisma.document.count()

    const userMessage = `${ASSESSMENT_USER_PROMPT}\n\n---\n[Полная медицинская история пациента]${fullContext}`

    // Streaming response через Anthropic SDK
    const client = new Anthropic({
      maxRetries: 1,
      timeout: 55 * 1000,
    })
    const stream = client.messages.stream({
      model: ANALYSIS_MODEL,  // Haiku 4.5 — в 3-5x быстрее Sonnet, укладывается в 60с Vercel timeout
      max_tokens: 4096,
      system: ASSESSMENT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
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

          // Сохраняем заключение в БД
          const saved = await prisma.assessment.create({
            data: {
              content: fullResponse,
              metadata: {
                documentsCount,
                model: ANALYSIS_MODEL,
                generatedAt: new Date().toISOString(),
              },
            },
          })

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'done', assessmentId: saved.id })}\n\n`)
          )

          controller.close()
        } catch (error) {
          console.error('Assessment streaming error:', error)
          const errorMsg = error instanceof Error ? error.message : 'Ошибка при генерации заключения'
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
    console.error('Assessment API error:', error)
    const msg = error instanceof Error ? error.message : 'Ошибка'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

/**
 * GET /api/assessment
 * Получить последнее сохранённое ИИ-заключение.
 */
export async function GET(request: NextRequest) {
  try {
    const prisma = getPrismaClient({ testMode: isTestModeRequest(request) })

    const latest = await prisma.assessment.findFirst({
      orderBy: { createdAt: 'desc' },
    })

    if (!latest) {
      return new Response(JSON.stringify({ exists: false }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      exists: true,
      id: latest.id,
      content: latest.content,
      metadata: latest.metadata,
      createdAt: latest.createdAt,
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Get assessment error:', error)
    const msg = error instanceof Error ? error.message : 'Ошибка'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
