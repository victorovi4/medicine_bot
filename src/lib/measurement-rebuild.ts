/**
 * Пересборка measurements уже загруженных документов — без повторного OCR и без вызовов API.
 *
 * Источник — сохранённый fullText (content) документа: в нём лежат таблицы в формате
 * buildFullTextFromExtracted. Если таблиц нет — keyValues (как при загрузке).
 * Документы, из которых ничего не извлекается, но measurements уже есть (старый пайплайн),
 * не трогаем.
 *
 * Порядок обработки как в scripts/reanalyze-all.sh --priority-sort: сначала первичные анализы,
 * потом выписки, исследования, остальное — чтобы при дедупе значение оставалось за первоисточником.
 */

import type { PrismaClient } from '@prisma/client'
import { extractMeasurements, getActiveMetricsConfig } from '@/lib/metrics'
import { buildMeasurementsDynamicsFromExtracted, parseTablesFromFullText } from '@/lib/claude-two-pass'
import { isDateClose, isValueClose, type CandidateMeasurement } from '@/lib/measurement-dedup'

interface RebuildDocument {
  id: string
  date: Date
  category: string
  subtype: string
  content: string | null
  keyValues: unknown
}

// datedByDocument: дата взята из даты документа (keyValues), а не из таблицы анализа.
type Candidate = CandidateMeasurement & { datedByDocument: boolean }

// Консультации часто цитируют прошлые анализы ("от 04.03: Гемоглобин-85") без таблицы с датой —
// такое значение получает дату консультации. Совпадение с уже принятой точкой за это окно = цитата.
const CITATION_WINDOW_MS = 90 * 24 * 60 * 60 * 1000

export function candidatesForDocument(doc: RebuildDocument): Candidate[] {
  const docDate = doc.date.toISOString().slice(0, 10)
  const dynamics = doc.content
    ? buildMeasurementsDynamicsFromExtracted(parseTablesFromFullText(doc.content, docDate))
    : []
  if (dynamics.length > 0) {
    return dynamics.flatMap(m => m.values.map(v => ({
      name: m.name,
      value: v.value,
      unit: m.unit,
      date: new Date(v.date),
      datedByDocument: false,
    })))
  }
  return extractMeasurements(doc.keyValues as Record<string, string> | null)
    .map(m => ({ ...m, date: doc.date, datedByDocument: true }))
}

function isDuplicate(accepted: CandidateMeasurement[], c: Candidate, isPrimaryLab: boolean): boolean {
  return accepted.some(a => {
    if (a.name !== c.name || !isValueClose(a.value, c.value)) return false
    if (isDateClose(a.date, c.date)) return true
    const citation = c.datedByDocument && !isPrimaryLab
    return citation && a.date.getTime() < c.date.getTime() && c.date.getTime() - a.date.getTime() <= CITATION_WINDOW_MS
  })
}

function priority(doc: RebuildDocument): number {
  if (doc.category === 'анализы') return 1
  if (doc.category === 'заключения' && doc.subtype === 'выписка') return 2
  if (doc.category === 'исследования') return 3
  return 4
}

const point = (m: { date: Date; value: number }) => `${m.date.toISOString().slice(0, 10)} ${m.value}`

export async function rebuildMeasurements(prisma: PrismaClient, options: { apply: boolean }) {
  const documents = await prisma.document.findMany({
    select: { id: true, date: true, category: true, subtype: true, content: true, keyValues: true },
  })
  const existing = await prisma.measurement.findMany({
    select: { documentId: true, name: true, value: true, unit: true, date: true },
    orderBy: { date: 'asc' },
  })
  const existingByDoc = new Map<string, typeof existing>()
  for (const m of existing) {
    existingByDoc.set(m.documentId, [...(existingByDoc.get(m.documentId) || []), m])
  }

  const plans = documents.map(doc => ({ doc, candidates: candidatesForDocument(doc) }))
  const kept = plans.filter(p => p.candidates.length === 0 && existingByDoc.has(p.doc.id))
  const rebuilt = plans
    .filter(p => !kept.includes(p))
    .sort((a, b) => priority(a.doc) - priority(b.doc) || a.doc.date.getTime() - b.doc.date.getTime())

  const accepted: CandidateMeasurement[] = kept.flatMap(p => existingByDoc.get(p.doc.id) || [])
  const toCreate: Array<CandidateMeasurement & { documentId: string }> = []
  for (const { doc, candidates } of rebuilt) {
    for (const { datedByDocument, ...c } of candidates) {
      if (isDuplicate(accepted, { ...c, datedByDocument }, priority(doc) === 1)) continue
      accepted.push(c)
      toCreate.push({ ...c, documentId: doc.id })
    }
  }

  if (options.apply) {
    const rebuiltIds = rebuilt.map(p => p.doc.id)
    await prisma.$transaction([
      prisma.measurement.deleteMany({ where: { documentId: { in: rebuiltIds } } }),
      prisma.measurement.createMany({
        data: toCreate.map(m => ({
          documentId: m.documentId,
          name: m.name,
          value: m.value,
          unit: m.unit,
          date: m.date,
          normalMin: m.normalMin,
          normalMax: m.normalMax,
          isAbnormal: m.isAbnormal,
        })),
      }),
    ])
  }

  // Сводка по метрикам, которые показываются на графиках
  const after = [...accepted].sort((a, b) => a.date.getTime() - b.date.getTime())
  const charts: Record<string, { before: string[]; after: string[] }> = {}
  for (const name of Object.keys(getActiveMetricsConfig())) {
    charts[name] = {
      before: existing.filter(m => m.name === name).map(point),
      after: after.filter(m => m.name === name).map(point),
    }
  }

  return {
    applied: options.apply,
    documents: documents.length,
    documentsRebuilt: rebuilt.length,
    documentsKept: kept.length,
    measurementsBefore: existing.length,
    measurementsAfter: accepted.length,
    charts,
  }
}
