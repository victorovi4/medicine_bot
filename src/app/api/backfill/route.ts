import { NextRequest, NextResponse } from 'next/server'
import { prisma, withDbRetry } from '@/lib/db'
import { analyzeDocument } from '@/lib/claude'

/**
 * GET /api/backfill?secret=...
 * Статистика: сколько документов без content, с content, процент.
 */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  if (!process.env.BACKFILL_SECRET || secret !== process.env.BACKFILL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [withContent, withoutContent] = await Promise.all([
    prisma.document.count({ where: { content: { not: null } } }),
    prisma.document.count({ where: { content: null, fileUrl: { not: null } } }),
  ])

  const total = withContent + withoutContent
  const percent = total > 0 ? Math.round((withContent / total) * 100) : 0

  return NextResponse.json({
    withContent,
    withoutContent,
    total,
    percent: `${percent}%`,
  })
}

/**
 * POST /api/backfill
 * Body: { secret, limit?, updateExisting? }
 * Переанализирует документы без content через Claude Haiku Vision.
 */
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { secret, limit = 3 } = body

  if (!process.env.BACKFILL_SECRET || secret !== process.env.BACKFILL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Найти документы без content, у которых есть файл
  const documents = await prisma.document.findMany({
    where: {
      content: null,
      fileUrl: { not: null },
    },
    orderBy: { date: 'asc' },
    take: Math.min(limit, 5), // максимум 5 за вызов для безопасности
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
    const total = await prisma.document.count({ where: { fileUrl: { not: null } } })
    return NextResponse.json({
      processed: 0,
      failed: 0,
      remaining: 0,
      total,
      message: 'All documents already have content',
    })
  }

  const remaining = await prisma.document.count({
    where: { content: null, fileUrl: { not: null } },
  })

  const results: { id: string; title: string; status: string; error?: string }[] = []
  let processed = 0
  let failed = 0

  for (const doc of documents) {
    try {
      console.log(`[backfill] Analyzing: ${doc.title} (${doc.id})`)

      const result = await analyzeDocument(doc.fileUrl!, doc.fileType || 'application/pdf')

      // Формируем данные для обновления
      const updateData: Record<string, unknown> = {
        content: result.fullText || null,
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
      results.push({
        id: doc.id,
        title: doc.title,
        status: 'ok',
      })

      console.log(`[backfill] Done: ${doc.title} — content ${result.fullText?.length || 0} chars`)
    } catch (error) {
      failed++
      const errorMessage = error instanceof Error ? error.message : String(error)
      results.push({
        id: doc.id,
        title: doc.title,
        status: 'error',
        error: errorMessage,
      })
      console.error(`[backfill] Error: ${doc.title}:`, errorMessage)
    }
  }

  return NextResponse.json({
    processed,
    failed,
    remaining: remaining - processed,
    results,
  })
}
