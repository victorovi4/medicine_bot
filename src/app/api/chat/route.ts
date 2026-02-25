import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getPrismaClient } from '@/lib/db'
import { isTestModeRequest } from '@/lib/test-mode'
import { CHAT_MODEL } from '@/lib/claude'
import { PATIENT, getFullName, getAge } from '@/lib/patient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Максимум сообщений из истории в контекст
const MAX_HISTORY_MESSAGES = 10

const CHAT_SYSTEM_PROMPT = `Ты — "Доктор Хаус" — опытный врач-диагност с аналитическим складом ума.
Ты анализируешь медицинскую историю пациента и находишь неочевидные связи между документами, анализами и симптомами.

## Пациент
- ФИО: ${getFullName()}
- Возраст: ${getAge()} лет
- Пол: ${PATIENT.gender}
- Основной диагноз: ${PATIENT.mainDiagnosis || 'не указан'}${PATIENT.mainDiagnosisCode ? ` (${PATIENT.mainDiagnosisCode})` : ''}
- Сопутствующие: ${PATIENT.comorbidities.length > 0 ? PATIENT.comorbidities.join(', ') : 'не указаны'}
- Отслеживаемые показатели: ${PATIENT.trackingMetrics.join(', ')}

## Правила
1. Отвечай на русском языке, профессиональным но понятным языком.
2. Опирайся ТОЛЬКО на предоставленные документы и данные. Не выдумывай информацию.
3. Если данных недостаточно — честно скажи об этом.
4. Указывай даты и источники (названия документов), когда ссылаешься на данные.
5. Ищи паттерны и связи: корреляции между показателями, тренды, возможные причинно-следственные связи.
6. При обсуждении показателей — указывай динамику (рост/снижение) и соотношение с нормой.
7. НЕ ставь диагнозы. Ты помогаешь разобраться в данных, но финальное решение — за лечащим врачом.
8. Если вопрос выходит за рамки медицинских документов — вежливо перенаправь к врачу.`

/**
 * Собирает полный контекст из ВСЕХ медицинских данных пациента.
 */
async function buildFullContext(prisma: ReturnType<typeof getPrismaClient>): Promise<string> {
  let context = ''

  // 1. ВСЕ документы с полным текстом
  const documents = await prisma.document.findMany({
    orderBy: { date: 'asc' },
    include: {
      measurements: true,
    },
  })

  if (documents.length > 0) {
    context += `\n## Медицинские документы (${documents.length} шт.)\n\n`
    for (const doc of documents) {
      const date = new Date(doc.date).toLocaleDateString('ru-RU')
      context += `### ${date} — ${doc.title} [${doc.category}/${doc.subtype}]\n`
      if (doc.doctor) context += `Врач: ${doc.doctor}`
      if (doc.specialty) context += ` (${doc.specialty})`
      if (doc.clinic) context += ` | ${doc.clinic}`
      if (doc.doctor || doc.specialty || doc.clinic) context += '\n'

      // Полный текст документа (приоритет) или summary
      if (doc.content) {
        context += `${doc.content}\n`
      } else if (doc.summary) {
        context += `Резюме: ${doc.summary}\n`
      }

      if (doc.conclusion) {
        context += `Заключение: ${doc.conclusion}\n`
      }

      if (doc.recommendations.length > 0) {
        context += `Рекомендации: ${doc.recommendations.join('; ')}\n`
      }

      if (doc.keyValues && typeof doc.keyValues === 'object') {
        const kv = doc.keyValues as Record<string, string>
        if (Object.keys(kv).length > 0) {
          context += `Показатели: ${Object.entries(kv).map(([k, v]) => `${k}: ${v}`).join(', ')}\n`
        }
      }

      if (doc.tags.length > 0) {
        context += `Теги: ${doc.tags.join(', ')}\n`
      }

      context += '\n---\n\n'
    }
  }

  // 2. Активные лекарства
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

  // 3. Процедуры
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

  // 4. Последние показатели (vitals)
  const vitals = await prisma.vitalSign.findMany({
    orderBy: { datetime: 'desc' },
    take: 20,
  })
  if (vitals.length > 0) {
    context += '## Последние показатели (дневник)\n'
    for (const v of vitals) {
      const dt = new Date(v.datetime).toLocaleDateString('ru-RU')
      context += `- ${dt}: ${v.type} = ${v.value}${v.value2 != null ? `/${v.value2}` : ''} ${v.unit}\n`
    }
    context += '\n'
  }

  // 5. Последние симптомы
  const symptoms = await prisma.symptom.findMany({
    orderBy: { datetime: 'desc' },
    take: 10,
  })
  if (symptoms.length > 0) {
    context += '## Последние симптомы\n'
    for (const s of symptoms) {
      const dt = new Date(s.datetime).toLocaleDateString('ru-RU')
      context += `- ${dt}: ${s.name}`
      if (s.intensity) context += ` (интенсивность: ${s.intensity}/10)`
      if (s.notes) context += ` — ${s.notes}`
      context += '\n'
    }
    context += '\n'
  }

  return context
}

/**
 * POST /api/chat
 * Body: { message: string, conversationId?: string }
 * Response: streaming text/event-stream (SSE)
 */
export async function POST(request: NextRequest) {
  try {
    const prisma = getPrismaClient({ testMode: isTestModeRequest(request) })
    const body = await request.json()
    const { message, conversationId } = body

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Сообщение не может быть пустым' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 1. Получить или создать Conversation
    let conversation
    if (conversationId) {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: MAX_HISTORY_MESSAGES,
          },
        },
      })
      if (!conversation) {
        return new Response(JSON.stringify({ error: 'Разговор не найден' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    } else {
      const title = message.length > 50 ? message.substring(0, 50) + '...' : message
      conversation = await prisma.conversation.create({
        data: { title },
        include: { messages: true },
      })
    }

    // 2. Сохранить user message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: message,
      },
    })

    // 3. Собрать ПОЛНЫЙ контекст из всех данных
    const fullContext = await buildFullContext(prisma)

    // 4. Собрать историю разговора для Claude
    const conversationHistory: Anthropic.Messages.MessageParam[] = []

    if (conversation.messages && conversation.messages.length > 0) {
      for (const msg of conversation.messages) {
        conversationHistory.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })
      }
    }

    // Текущее сообщение с полным контекстом (контекст — только в первом сообщении разговора)
    const isFirstMessage = conversationHistory.length === 0
    const userMessageWithContext = isFirstMessage
      ? `${message}\n\n---\n[Полная медицинская история пациента]${fullContext}`
      : message

    conversationHistory.push({
      role: 'user',
      content: userMessageWithContext,
    })

    // 5. Streaming response через Anthropic SDK
    const client = new Anthropic({
      maxRetries: 2,
      timeout: 45 * 1000,
    })
    const stream = client.messages.stream({
      model: CHAT_MODEL,
      max_tokens: 4096,
      system: CHAT_SYSTEM_PROMPT,
      messages: conversationHistory,
    })

    let fullResponse = ''

    // 6. SSE stream
    const encoder = new TextEncoder()
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'meta', conversationId: conversation.id })}\n\n`)
          )

          stream.on('text', (text) => {
            fullResponse += text
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'text', text })}\n\n`)
            )
          })

          await stream.finalMessage()

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
          )

          // Сохраняем ответ ассистента
          await prisma.message.create({
            data: {
              conversationId: conversation.id,
              role: 'assistant',
              content: fullResponse,
            },
          })

          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { updatedAt: new Date() },
          })

          controller.close()
        } catch (error) {
          console.error('Streaming error:', error)
          const errorMsg = error instanceof Error ? error.message : 'Ошибка при генерации ответа'
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
    console.error('Chat API error:', error)
    const msg = error instanceof Error ? error.message : 'Ошибка'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

/**
 * GET /api/chat?conversationId=xxx
 * Получить историю разговора или список разговоров.
 */
export async function GET(request: NextRequest) {
  try {
    const prisma = getPrismaClient({ testMode: isTestModeRequest(request) })
    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversationId')

    if (conversationId) {
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
        },
      })
      if (!conversation) {
        return new Response(JSON.stringify({ error: 'Разговор не найден' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify(conversation), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const conversations = await prisma.conversation.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: {
        _count: { select: { messages: true } },
      },
    })

    return new Response(JSON.stringify(conversations), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Get conversations error:', error)
    const msg = error instanceof Error ? error.message : 'Ошибка'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
