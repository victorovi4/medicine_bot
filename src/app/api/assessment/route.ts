import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getPrismaClient } from '@/lib/db'
import { isTestModeRequest } from '@/lib/test-mode'
import { CHAT_MODEL } from '@/lib/claude'
import { PATIENT, getFullName, getAge } from '@/lib/patient'
import { buildMedicalContext } from '@/lib/context'

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

const ASSESSMENT_USER_PROMPT = `Составь КРАТКОЕ экспертное заключение. Формат — ровно 6 секций Markdown. БЕЗ таблиц. Обсуждай диагноз, стадию, ответ на терапию.

ЖЁСТКИЙ ЛИМИТ: ~1200 слов на ВСЁ заключение. Каждая секция — MAX 200 слов. Пиши ТЕЛЕГРАФНЫМ СТИЛЕМ: короткие предложения, без воды.

## 1. Хронология заболевания
5-7 ключевых дат. Одна строка = одно событие. Без подробностей.

## 2. Текущий статус
3-4 предложения: ключевые показатели, ответ на терапию, основные жалобы.

## 3. Динамика показателей
${PATIENT.trackingMetrics.join(', ')}: начальное → текущее, направление тренда. Одна строка на метрику.

## 4. Лист активных проблем
MAX 5 проблем. Одна строка на проблему: название + обоснование.

## 5. Оценка рисков
3-5 пунктов: тревожные тренды, пропущенные обследования.

## 6. Рекомендации для обсуждения с врачом
3-5 конкретных вопросов для лечащего врача.

---
*Данное заключение сформировано искусственным интеллектом на основе загруженных медицинских документов. Оно НЕ является медицинским документом и не может заменить консультацию врача. Используйте его только как вспомогательный материал для обсуждения с лечащим врачом.*`

/**
 * POST /api/assessment
 * Генерирует комплексное ИИ-заключение по всей медицинской карте.
 * Response: streaming text/event-stream (SSE)
 */
export async function POST(request: NextRequest) {
  try {
    const prisma = getPrismaClient({ testMode: isTestModeRequest(request) })

    // Собрать ПОЛНЫЙ контекст из всех данных
    const fullContext = await buildMedicalContext(prisma)

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
      model: CHAT_MODEL,  // Sonnet 4.6 — качественнее Haiku, может не уложиться в 60с на Hobby
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
                model: CHAT_MODEL,
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
 * PUT /api/assessment
 * Заменить заключение вручную (например, сгенерированное Opus в CLI).
 * Body: { content, metadata? }
 */
export async function PUT(request: NextRequest) {
  try {
    const prisma = getPrismaClient({ testMode: isTestModeRequest(request) })
    const body = await request.json()

    if (!body.content || typeof body.content !== 'string') {
      return new Response(JSON.stringify({ error: 'content is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Удалить все старые заключения
    await prisma.assessment.deleteMany({})

    // Сохранить новое
    const saved = await prisma.assessment.create({
      data: {
        content: body.content,
        metadata: body.metadata || null,
      },
    })

    return new Response(JSON.stringify({
      id: saved.id,
      createdAt: saved.createdAt,
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Put assessment error:', error)
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
