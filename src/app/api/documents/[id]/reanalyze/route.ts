import { NextRequest, NextResponse, after } from 'next/server'
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
 * Возвращает 202 Accepted сразу — анализ идёт в фоне через after().
 * Клиент должен опросить документ через 30-60с чтобы увидеть результат.
 *
 * Используй когда оригинальный анализ дал ошибочные данные
 * (например, перепутал названия показателей).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const testMode = isTestModeRequest(request)
    const prisma = getPrismaClient({ testMode })
    const { id } = await params

    const document = await prisma.document.findUnique({ where: { id } })
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }
    if (!document.fileUrl || !document.fileType) {
      return NextResponse.json({ error: 'Document has no source file to reanalyze' }, { status: 400 })
    }

    // Запускаем тяжёлую обработку в фоне — analyzeDocument + Claude API могут превышать 60с
    after(async () => {
      try {
        await runReanalyze(id, document.fileUrl!, document.fileType!, document, testMode)
      } catch (err) {
        console.error(`[reanalyze:${id}] failed:`, err)
      }
    })

    return NextResponse.json({ ok: true, status: 'accepted', documentId: id }, { status: 202 })
  } catch (error) {
    console.error('Reanalyze error:', error)
    const message = error instanceof Error ? error.message : 'Reanalyze failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function runReanalyze(
  id: string,
  fileUrl: string,
  fileType: string,
  document: { date: Date; category: string; subtype: string; title: string; doctor: string | null; specialty: string | null; clinic: string | null; summary: string | null; conclusion: string | null; content: string | null },
  testMode: boolean,
): Promise<void> {
  const prisma = getPrismaClient({ testMode })

  // Промежуточные обновления документа чтобы видеть прогресс по updatedAt
  // (Vercel CLI logs не показывает after() background output надёжно).
  const stage = async (label: string): Promise<void> => {
    try {
      await prisma.document.update({ where: { id }, data: { content: `[reanalyze stage: ${label}] ${new Date().toISOString()}` } })
    } catch { /* ignore */ }
  }

  console.log(`[reanalyze:${id}] starting`)
  await stage('starting')

  try {
    const response = await fetch(fileUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch source file: ${response.status}`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())

    console.log(`[reanalyze:${id}] file fetched (${buffer.length} bytes), calling Claude`)
    await stage(`file fetched (${buffer.length})`)

    const analysis = await analyzeDocument(fileUrl, fileType, buffer)
    console.log(`[reanalyze:${id}] Claude returned analysis, updating DB`)
    await stage(`analyzeDocument done — kv=${Object.keys(analysis.keyValues || {}).length} dyn=${analysis.measurementsDynamics?.length || 0}`)

  const { category, subtype } = normalizeDocumentType(
    analysis.category || document.category,
    analysis.subtype || document.subtype
  )
  const docDate = analysis.date ? new Date(analysis.date) : document.date

  type Meas = { name: string; value: number; unit: string; date: Date; normalMin?: number; normalMax?: number; isAbnormal?: boolean }
  const keyValueMeasurements = extractMeasurements(
    (analysis.keyValues as Record<string, string>) || null
  )
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

  await prisma.$transaction(async (tx) => {
    await tx.measurement.deleteMany({ where: { documentId: id } })
    await tx.procedure.deleteMany({ where: { documentId: id } })

    await tx.document.update({
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
    }, { timeout: 30000 })

    console.log(`[reanalyze:${id}] done: ${allMeasurements.length} measurements, ${analysis.procedures?.length || 0} procedures`)
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack || ''}` : String(err)
    console.error(`[reanalyze:${id}] failed:`, msg)
    await stage(`FAILED: ${msg.substring(0, 800)}`)
    throw err
  }
}
