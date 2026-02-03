import { NextRequest, NextResponse } from 'next/server'
import { getPrismaClient } from '@/lib/db'
import { isTestModeRequest } from '@/lib/test-mode'

// Предустановленные типы событий с цветами
export const EVENT_TYPES = {
  hemotransfusion: {
    label: 'Гемотрансфузия',
    color: '#9333ea', // Фиолетовый
    icon: '💉',
    applicableTo: ['Гемоглобин'],
  },
  hormone_injection: {
    label: 'Гормональная терапия',
    color: '#3b82f6', // Синий
    icon: '💊',
    applicableTo: ['ПСА общий', 'ПСА свободный'],
  },
  surgery: {
    label: 'Операция',
    color: '#ef4444', // Красный
    icon: '🔪',
    applicableTo: ['*'],
  },
  hospitalization: {
    label: 'Госпитализация',
    color: '#6b7280', // Серый
    icon: '🏥',
    applicableTo: ['*'],
  },
  medication_start: {
    label: 'Начало препарата',
    color: '#22c55e', // Зелёный
    icon: '💊',
    applicableTo: ['*'],
  },
  medication_end: {
    label: 'Отмена препарата',
    color: '#f97316', // Оранжевый
    icon: '⏹️',
    applicableTo: ['*'],
  },
  other: {
    label: 'Другое',
    color: '#8b5cf6', // Фиолетовый светлый
    icon: '📌',
    applicableTo: ['*'],
  },
} as const

export type EventType = keyof typeof EVENT_TYPES

/**
 * GET /api/metric-events
 * Получить события для метрики
 * Query params:
 * - metricName: название метрики (опционально, по умолчанию все)
 * - fromDate: начало периода (ISO string)
 * - toDate: конец периода (ISO string)
 */
export async function GET(request: NextRequest) {
  const testMode = isTestModeRequest(request)
  const prisma = getPrismaClient({ testMode })
  
  const { searchParams } = new URL(request.url)
  const metricName = searchParams.get('metricName')
  const fromDate = searchParams.get('fromDate')
  const toDate = searchParams.get('toDate')
  
  const where: Record<string, unknown> = {}
  
  if (metricName) {
    // Показываем события для конкретной метрики и универсальные (*)
    where.metricName = { in: [metricName, '*'] }
  }
  
  if (fromDate || toDate) {
    where.date = {}
    if (fromDate) {
      (where.date as Record<string, Date>).gte = new Date(fromDate)
    }
    if (toDate) {
      (where.date as Record<string, Date>).lte = new Date(toDate)
    }
  }
  
  const events = await prisma.metricEvent.findMany({
    where,
    orderBy: { date: 'asc' },
  })
  
  return NextResponse.json({
    events,
    eventTypes: EVENT_TYPES,
  })
}

/**
 * POST /api/metric-events
 * Создать новое событие
 */
export async function POST(request: NextRequest) {
  const testMode = isTestModeRequest(request)
  const prisma = getPrismaClient({ testMode })
  
  try {
    const body = await request.json()
    
    const { metricName, date, eventType, label, color, endDate, notes } = body
    
    // Валидация
    if (!metricName || !date || !eventType || !label) {
      return NextResponse.json(
        { error: 'Обязательные поля: metricName, date, eventType, label' },
        { status: 400 }
      )
    }
    
    // Используем цвет из типа события, если не указан
    const eventColor = color || EVENT_TYPES[eventType as EventType]?.color || '#8b5cf6'
    
    const event = await prisma.metricEvent.create({
      data: {
        metricName,
        date: new Date(date),
        eventType,
        label,
        color: eventColor,
        endDate: endDate ? new Date(endDate) : null,
        notes: notes || null,
      },
    })
    
    return NextResponse.json(event, { status: 201 })
  } catch (error) {
    console.error('Error creating metric event:', error)
    return NextResponse.json(
      { error: 'Ошибка создания события' },
      { status: 500 }
    )
  }
}
