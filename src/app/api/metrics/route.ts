import { NextRequest, NextResponse } from 'next/server'
import { getPrismaClient } from '@/lib/db'
import { isTestModeRequest } from '@/lib/test-mode'
import { getTreatmentStartDate } from '@/lib/patient'
import { METRICS_CONFIG, calculateChange, getValueStatus } from '@/lib/metrics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface MetricDataPoint {
  date: string      // ISO date
  value: number
  documentId: string
  documentTitle: string
}

export interface MetricSummary {
  name: string
  unit: string
  color: string
  normalMin: number
  normalMax: number
  critical?: number
  dataPoints: MetricDataPoint[]
  // Сводка
  firstValue: number | null
  lastValue: number | null
  minValue: number | null
  maxValue: number | null
  changePercent: number
  changeDirection: 'up' | 'down' | 'stable'
  lastStatus: 'normal' | 'low' | 'high' | 'critical' | 'unknown'
}

/**
 * GET /api/metrics — получить данные для графиков.
 * Query params: fromDate, toDate (опционально, по умолчанию период лечения)
 */
export async function GET(request: NextRequest) {
  try {
    const prisma = getPrismaClient({ testMode: isTestModeRequest(request) })
    const { searchParams } = new URL(request.url)
    
    // Период по умолчанию — период лечения
    const fromDate = searchParams.get('fromDate') || getTreatmentStartDate()
    const toDate = searchParams.get('toDate') || new Date().toISOString().split('T')[0]
    
    const periodFrom = new Date(fromDate)
    const periodTo = new Date(toDate)
    
    // Получаем все измерения за период
    const measurements = await prisma.measurement.findMany({
      where: {
        date: {
          gte: periodFrom,
          lte: periodTo,
        },
      },
      include: {
        document: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: { date: 'asc' },
    })
    
    // Группируем по названию показателя
    const grouped: Record<string, MetricDataPoint[]> = {}
    
    for (const m of measurements) {
      if (!grouped[m.name]) {
        grouped[m.name] = []
      }
      grouped[m.name].push({
        date: m.date.toISOString(),
        value: m.value,
        documentId: m.document.id,
        documentTitle: m.document.title,
      })
    }
    
    // Формируем сводку для каждого показателя
    const metrics: MetricSummary[] = []
    
    for (const [name, config] of Object.entries(METRICS_CONFIG)) {
      const dataPoints = grouped[name] || []
      
      let firstValue: number | null = null
      let lastValue: number | null = null
      let minValue: number | null = null
      let maxValue: number | null = null
      
      if (dataPoints.length > 0) {
        firstValue = dataPoints[0].value
        lastValue = dataPoints[dataPoints.length - 1].value
        minValue = Math.min(...dataPoints.map(d => d.value))
        maxValue = Math.max(...dataPoints.map(d => d.value))
      }
      
      const change = firstValue !== null && lastValue !== null
        ? calculateChange(firstValue, lastValue)
        : { percent: 0, direction: 'stable' as const }
      
      const lastStatus = lastValue !== null
        ? getValueStatus(name, lastValue)
        : 'unknown'
      
      metrics.push({
        name,
        unit: config.unit,
        color: config.color,
        normalMin: config.normalMin,
        normalMax: config.normalMax,
        critical: config.critical,
        dataPoints,
        firstValue,
        lastValue,
        minValue,
        maxValue,
        changePercent: change.percent,
        changeDirection: change.direction,
        lastStatus,
      })
    }
    
    return NextResponse.json({
      period: {
        from: fromDate,
        to: toDate,
      },
      metrics,
    })
    
  } catch (error) {
    console.error('Metrics API error:', error)
    const message = error instanceof Error ? error.message : 'Ошибка'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/metrics/sync — ретроактивный парсинг показателей из существующих документов.
 * Query params: force=true — удалить все измерения и пересоздать.
 */
export async function POST(request: NextRequest) {
  try {
    const prisma = getPrismaClient({ testMode: isTestModeRequest(request) })
    const { searchParams } = new URL(request.url)
    const force = searchParams.get('force') === 'true'
    
    let deleted = 0
    
    // Если force=true, удаляем все измерения
    if (force) {
      const deleteResult = await prisma.measurement.deleteMany({})
      deleted = deleteResult.count
    }
    
    // Получаем все документы
    const allDocuments = await prisma.document.findMany({
      select: {
        id: true,
        date: true,
        keyValues: true,
      },
    })
    
    // Фильтруем документы с keyValues
    const documents = allDocuments.filter(d => d.keyValues !== null)
    
    let created = 0
    let skipped = 0
    
    // Динамический импорт для избежания циклических зависимостей
    const { extractMeasurements } = await import('@/lib/metrics')
    
    for (const doc of documents) {
      const keyValues = doc.keyValues as Record<string, string> | null
      const measurements = extractMeasurements(keyValues)
      
      for (const m of measurements) {
        // Проверяем, нет ли уже такого измерения (если не force)
        if (!force) {
          const existing = await prisma.measurement.findFirst({
            where: {
              documentId: doc.id,
              name: m.name,
            },
          })
          
          if (existing) {
            skipped++
            continue
          }
        }
        
        await prisma.measurement.create({
          data: {
            documentId: doc.id,
            name: m.name,
            value: m.value,
            unit: m.unit,
            date: doc.date,
          },
        })
        created++
      }
    }
    
    return NextResponse.json({
      success: true,
      force,
      deleted,
      documentsProcessed: documents.length,
      measurementsCreated: created,
      measurementsSkipped: skipped,
    })
    
  } catch (error) {
    console.error('Metrics sync error:', error)
    const message = error instanceof Error ? error.message : 'Ошибка'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
