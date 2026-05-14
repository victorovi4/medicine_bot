/**
 * Дедупликация measurements при сохранении документов.
 *
 * Зачем: консультации и эпикризы цитируют значения из прошлых анализов
 * ("ПСА от 18.02.2025 — 23.42 нг/мл"). Если первичный документ уже в БД,
 * новое measurement с тем же name + датой ±1д + value ±5% — дубликат.
 *
 * Правило идентификации дубликата:
 *   • name точное совпадение (после canonicalizeMetricName)
 *   • дата measurement в пределах ±1 день
 *   • value в пределах ±5% или абсолютной разницы < 0.5 (для малых значений)
 *   • в БД уже есть запись с других documentId
 */

import type { PrismaClient } from '@prisma/client'

export interface CandidateMeasurement {
  name: string
  value: number
  unit: string
  date: Date
  normalMin?: number
  normalMax?: number
  isAbnormal?: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000

function isValueClose(a: number, b: number): boolean {
  const diff = Math.abs(a - b)
  if (diff < 0.5) return true
  const rel = diff / Math.max(Math.abs(a), Math.abs(b), 1)
  return rel <= 0.05
}

function isDateClose(a: Date, b: Date): boolean {
  return Math.abs(a.getTime() - b.getTime()) <= DAY_MS
}

/**
 * Фильтрует measurements, оставляя только те, которых ещё нет в БД
 * (по другим documentId). Возвращает также список найденных дубликатов
 * для логирования.
 */
export async function filterDuplicateMeasurements(
  prisma: PrismaClient,
  measurements: CandidateMeasurement[],
  selfDocumentId: string | null
): Promise<{
  toCreate: CandidateMeasurement[]
  duplicates: Array<{ candidate: CandidateMeasurement; existingDocumentId: string }>
}> {
  if (measurements.length === 0) {
    return { toCreate: [], duplicates: [] }
  }

  const uniqueNames = Array.from(new Set(measurements.map(m => m.name)))
  const dates = measurements.map(m => m.date.getTime())
  const minDate = new Date(Math.min(...dates) - DAY_MS)
  const maxDate = new Date(Math.max(...dates) + DAY_MS)

  const existing = await prisma.measurement.findMany({
    where: {
      name: { in: uniqueNames },
      date: { gte: minDate, lte: maxDate },
      ...(selfDocumentId ? { documentId: { not: selfDocumentId } } : {}),
    },
    select: { name: true, value: true, date: true, documentId: true },
  })

  const toCreate: CandidateMeasurement[] = []
  const duplicates: Array<{ candidate: CandidateMeasurement; existingDocumentId: string }> = []

  for (const m of measurements) {
    const dup = existing.find(
      e => e.name === m.name && isDateClose(e.date, m.date) && isValueClose(e.value, m.value)
    )
    if (dup) {
      duplicates.push({ candidate: m, existingDocumentId: dup.documentId })
    } else {
      toCreate.push(m)
    }
  }

  return { toCreate, duplicates }
}
