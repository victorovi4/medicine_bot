import { NextRequest, NextResponse } from 'next/server'
import { getPrismaClient } from '@/lib/db'
import { isTestModeRequest } from '@/lib/test-mode'
import { analyzeDocument } from '@/lib/claude'
import { normalizeDocumentType } from '@/lib/types'
import { extractMeasurements } from '@/lib/metrics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Повторный анализ существующего документа.
 * Скачивает оригинальный файл, прогоняет через Claude заново,
 * удаляет старые measurements/procedures и создаёт новые.
 *
 * Используй когда оригинальный анализ дал ошибочные данные
 * (например, перепутал названия показателей).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const prisma = getPrismaClient({ testMode: isTestModeRequest(request) })
    const { id } = await params

    const document = await prisma.document.findUnique({ where: { id } })
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }
    if (!document.fileUrl || !document.fileType) {
      return NextResponse.json({ error: 'Document has no source file to reanalyze' }, { status: 400 })
    }

    // Скачиваем оригинальный файл для повторного анализа
    const response = await fetch(document.fileUrl)
    if (!response.ok) {
      return NextResponse.json({ error: `Failed to fetch source file: ${response.status}` }, { status: 502 })
    }
    const buffer = Buffer.from(await response.arrayBuffer())

    // Запускаем анализ
    const analysis = await analyzeDocument(document.fileUrl, document.fileType, buffer)

    // Нормализуем категорию
    const { category, subtype } = normalizeDocumentType(
      analysis.category || document.category,
      analysis.subtype || document.subtype
    )
    const docDate = analysis.date ? new Date(analysis.date) : document.date

    // Собираем measurements (из measurementsDynamics + keyValues)
    const keyValueMeasurements = extractMeasurements(
      (analysis.keyValues as Record<string, string>) || null
    )

    type Meas = { name: string; value: number; unit: string; date: Date; normalMin?: number; normalMax?: number; isAbnormal?: boolean }
    const dynamicMeasurements: Meas[] = []
    if (analysis.measurementsDynamics && analysis.measurementsDynamics.length > 0) {
      for (const metric of analysis.measurementsDynamics) {
        for (const v of metric.values) {
          dynamicMeasurements.push({
            name: metric.name,
            value: v.value,
            unit: metric.unit,
            date: new Date(v.date),
          })
        }
      }
    }

    const allMeasurements: Meas[] = dynamicMeasurements.length > 0
      ? dynamicMeasurements
      : keyValueMeasurements.map(m => ({ ...m, date: docDate }))

    // Атомарно: удалить старые связи, обновить документ, создать новые
    const updated = await prisma.$transaction(async (tx) => {
      await tx.measurement.deleteMany({ where: { documentId: id } })
      await tx.procedure.deleteMany({ where: { documentId: id } })

      const doc = await tx.document.update({
        where: { id },
        data: {
          date: docDate,
          category,
          subtype,
          title: analysis.title || document.title,
          doctor: analysis.doctor ?? document.doctor,
          specialty: analysis.specialty ?? document.specialty,
          clinic: analysis.clinic ?? document.clinic,
          summary: analysis.summary ?? document.summary,
          conclusion: analysis.conclusion ?? document.conclusion,
          recommendations: analysis.recommendations || [],
          content: analysis.fullText ?? document.content,
          tags: analysis.tags || [],
          keyValues: (analysis.keyValues as object) ?? undefined,
        },
      })

      if (allMeasurements.length > 0) {
        await tx.measurement.createMany({
          data: allMeasurements.map(m => ({
            documentId: id,
            name: m.name,
            value: m.value,
            unit: m.unit,
            date: m.date,
            normalMin: m.normalMin,
            normalMax: m.normalMax,
            isAbnormal: m.isAbnormal,
          })),
        })
      }

      if (analysis.procedures && analysis.procedures.length > 0) {
        for (const proc of analysis.procedures) {
          await tx.procedure.create({
            data: {
              documentId: id,
              date: proc.date ? new Date(proc.date) : docDate,
              type: proc.type,
              name: proc.name,
              details: proc.details ? JSON.parse(JSON.stringify(proc.details)) : undefined,
              beforeValue: proc.beforeValue ?? null,
              afterValue: proc.afterValue ?? null,
              unit: proc.unit ?? null,
            },
          })
        }
      }

      return doc
    }, { timeout: 30000 })

    return NextResponse.json({
      ok: true,
      document: updated,
      measurementsCount: allMeasurements.length,
      proceduresCount: analysis.procedures?.length || 0,
    })
  } catch (error) {
    console.error('Reanalyze error:', error)
    const message = error instanceof Error ? error.message : 'Reanalyze failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
