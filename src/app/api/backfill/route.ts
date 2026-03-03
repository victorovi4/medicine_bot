import { NextRequest, NextResponse } from 'next/server'
import { prisma, withDbRetry } from '@/lib/db'
import { analyzeDocument } from '@/lib/claude'

const BACKFILL_ERROR_MARKER = '[backfill_error]'
const BACKFILL_PROCESSING_MARKER = '[backfill_processing]'

/**
 * GET /api/backfill?secret=...
 * Статистика: сколько документов без content, с content, процент.
 */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  if (!process.env.BACKFILL_SECRET || secret !== process.env.BACKFILL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [withContent, withoutContent, withError] = await Promise.all([
    prisma.document.count({
      where: {
        content: { not: null },
        NOT: { content: { in: [BACKFILL_ERROR_MARKER, BACKFILL_PROCESSING_MARKER] } },
      },
    }),
    prisma.document.count({ where: { content: null, fileUrl: { not: null } } }),
    prisma.document.count({
      where: { content: { in: [BACKFILL_ERROR_MARKER, BACKFILL_PROCESSING_MARKER] } },
    }),
  ])

  const total = withContent + withoutContent + withError
  const percent = total > 0 ? Math.round((withContent / total) * 100) : 0

  return NextResponse.json({
    withContent,
    withoutContent,
    withError,
    total,
    percent: `${percent}%`,
  })
}

/**
 * POST /api/backfill
 * Body: { secret, limit?, retry? }
 * Переанализирует документы без content через Claude Haiku Vision.
 * retry=true — повторить документы с ошибками.
 */
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { secret, limit = 1, retry = false } = body

  if (!process.env.BACKFILL_SECRET || secret !== process.env.BACKFILL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Найти документы для обработки
  const whereClause = retry
    ? { content: { in: [BACKFILL_ERROR_MARKER, BACKFILL_PROCESSING_MARKER] }, fileUrl: { not: null } }
    : { content: null, fileUrl: { not: null } }

  const documents = await prisma.document.findMany({
    where: whereClause,
    orderBy: { date: 'asc' },
    take: Math.min(limit, 3),
    select: {
      id: true,
      title: true,
      fileUrl: true,
      fileType: true,
      summary: true,
      conclusion: true,
      recommendations: true,
      clinic: true,
    },
  })

  if (documents.length === 0) {
    return NextResponse.json({
      processed: 0,
      failed: 0,
      remaining: 0,
      message: retry ? 'No error documents to retry' : 'All documents already have content',
    })
  }

  const remaining = await prisma.document.count({ where: whereClause })

  const results: { id: string; title: string; status: string; error?: string }[] = []
  let processed = 0
  let failed = 0

  for (const doc of documents) {
    try {
      // Помечаем "в процессе" ДО вызова AI — если Vercel убьёт функцию по таймауту,
      // документ не попадёт обратно в очередь (content уже не null)
      await prisma.document.update({
        where: { id: doc.id },
        data: { content: BACKFILL_PROCESSING_MARKER },
      })

      console.log(`[backfill] Analyzing: ${doc.title} (${doc.id})`)

      const result = await analyzeDocument(doc.fileUrl!, doc.fileType || 'application/pdf')

      const updateData: Record<string, unknown> = {
        content: result.fullText || result.summary || '[no text extracted]',
      }

      // Дополняем только пустые поля
      if (!doc.summary && result.summary) {
        updateData.summary = result.summary
      }
      if (!doc.conclusion && result.conclusion) {
        updateData.conclusion = result.conclusion
      }
      if ((!doc.recommendations || doc.recommendations.length === 0) && result.recommendations?.length > 0) {
        updateData.recommendations = result.recommendations
      }
      if (!doc.clinic && result.clinic) {
        updateData.clinic = result.clinic
      }

      await withDbRetry(() =>
        prisma.document.update({
          where: { id: doc.id },
          data: updateData,
        })
      )

      processed++
      results.push({ id: doc.id, title: doc.title, status: 'ok' })
      console.log(`[backfill] Done: ${doc.title} — content ${result.fullText?.length || 0} chars`)
    } catch (error) {
      failed++
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Помечаем ошибочный документ, чтобы не блокировал очередь
      try {
        await prisma.document.update({
          where: { id: doc.id },
          data: { content: BACKFILL_ERROR_MARKER },
        })
      } catch { /* ignore */ }

      results.push({ id: doc.id, title: doc.title, status: 'error', error: errorMessage })
      console.error(`[backfill] Error: ${doc.title}:`, errorMessage)
    }
  }

  return NextResponse.json({
    processed,
    failed,
    remaining: remaining - processed - failed,
    results,
  })
}
