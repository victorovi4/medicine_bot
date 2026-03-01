import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getPrismaClient } from '@/lib/db'
import { isTestModeRequest } from '@/lib/test-mode'
import { CHAT_MODEL } from '@/lib/claude'
import { PATIENT, getFullName, getAge } from '@/lib/patient'
import { buildMedicalContext } from '@/lib/context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CHAT_SYSTEM_PROMPT = `Ты — доктор Хаус, опытный диагност с энциклопедическими знаниями в медицине.
Ты анализируешь медицинскую историю пациента, находишь неочевидные связи между данными и отвечаешь на вопросы.

## Пациент
- ФИО: ${getFullName()}
- Возраст: ${getAge()} лет
- Пол: ${PATIENT.gender}
- Основной диагноз: ${PATIENT.mainDiagnosis || 'не указан'}${PATIENT.mainDiagnosisCode ? ` (${PATIENT.mainDiagnosisCode})` : ''}
- Сопутствующие: ${PATIENT.comorbidities.length > 0 ? PATIENT.comorbidities.join(', ') : 'не указаны'}
- Отслеживаемые показатели: ${PATIENT.trackingMetrics.join(', ')}

## Правила
1. Пиши на русском языке.
2. Опирайся ТОЛЬКО на предоставленные данные. Не выдумывай информацию.
3. Указывай даты и источники, когда ссылаешься на данные.
4. Основной диагноз уже установлен — свободно обсуждай его, течение болезни, стадирование и ответ на терапию. Не ставь НОВЫХ диагнозов, но интерпретируй данные в контексте известного заболевания.
5. Если данных недостаточно для ответа — честно скажи об этом.
6. Будь конкретным: называй числа, даты, показатели.
7. Если видишь тревожные тренды — обрати на них внимание.`

/**
 * POST /api/chat
 * Отправка сообщения в ИИ-чат. Streaming SSE response.
 * Body: { message: string, conversationId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const prisma = getPrismaClient({ testMode: isTestModeRequest(request) })
    const body = await request.json()
    const { message, conversationId } = body as { message: string; conversationId?: string }

    if (!message || typeof message !== 'string' || !message.trim()) {
      return new Response(JSON.stringify({ error: 'Сообщение не может быть пустым' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 1. Создать или загрузить разговор
    let conversation
    if (conversationId) {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      })
      if (!conversation) {
        return new Response(JSON.stringify({ error: 'Разговор не найден' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    } else {
      conversation = await prisma.conversation.create({
        data: {},
        include: { messages: true },
      })
    }

    // 2. Сохранить user message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: message.trim(),
      },
    })

    // 3. Собрать медицинский контекст
    const medicalContext = await buildMedicalContext(prisma)

    // 4. Сформировать messages для Claude
    const history = conversation.messages.slice(-10) // последние 10 сообщений
    const claudeMessages: Anthropic.Messages.MessageParam[] = []

    // Первое сообщение содержит медицинский контекст
    if (history.length === 0) {
      // Новый разговор — контекст + первый вопрос
      claudeMessages.push({
        role: 'user',
        content: `[Полная медицинская история пациента]\n${medicalContext}\n\n---\nВопрос: ${message.trim()}`,
      })
    } else {
      // Существующий разговор — контекст в первом сообщении, потом история
      claudeMessages.push({
        role: 'user',
        content: `[Полная медицинская история пациента]\n${medicalContext}\n\n---\nВопрос: ${history[0].content}`,
      })
      // Добавить оставшуюся историю
      for (let i = 1; i < history.length; i++) {
        claudeMessages.push({
          role: history[i].role as 'user' | 'assistant',
          content: history[i].content,
        })
      }
      // Текущий вопрос
      claudeMessages.push({
        role: 'user',
        content: message.trim(),
      })
    }

    // 5. Streaming response
    const client = new Anthropic({
      maxRetries: 2,
      timeout: 45 * 1000,
    })
    const stream = client.messages.stream({
      model: CHAT_MODEL,
      max_tokens: 4096,
      system: CHAT_SYSTEM_PROMPT,
      messages: claudeMessages,
    })

    // SSE stream
    let fullResponse = ''
    const encoder = new TextEncoder()
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // Отправить meta с conversationId
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

          // 6. Сохранить assistant message
          await prisma.message.create({
            data: {
              conversationId: conversation.id,
              role: 'assistant',
              content: fullResponse,
            },
          })

          // Обновить title если первое сообщение
          if (!conversation.title) {
            const title = message.trim().length > 60
              ? message.trim().slice(0, 57) + '...'
              : message.trim()
            await prisma.conversation.update({
              where: { id: conversation.id },
              data: { title },
            })
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
          )
          controller.close()
        } catch (error) {
          console.error('Chat streaming error:', error)
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
 * GET /api/chat
 * Получить список разговоров или конкретный разговор.
 * ?conversationId=xxx — конкретный разговор со всеми messages
 * Без параметров — последние 20 разговоров
 */
export async function GET(request: NextRequest) {
  try {
    const prisma = getPrismaClient({ testMode: isTestModeRequest(request) })
    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversationId')

    if (conversationId) {
      // Конкретный разговор
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

    // Список последних разговоров
    const conversations = await prisma.conversation.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: {
        _count: { select: { messages: true } },
      },
    })

    const result = conversations.map((c) => ({
      id: c.id,
      title: c.title || 'Без названия',
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: c._count.messages,
    }))

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Chat GET error:', error)
    const msg = error instanceof Error ? error.message : 'Ошибка'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
