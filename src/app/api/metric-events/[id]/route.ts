import { NextRequest, NextResponse } from 'next/server'
import { getPrismaClient } from '@/lib/db'
import { isTestModeRequest } from '@/lib/test-mode'
import { EVENT_TYPES, EventType } from '../route'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/metric-events/[id]
 * Получить событие по ID
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const testMode = isTestModeRequest(request)
  const prisma = getPrismaClient({ testMode })
  const { id } = await params
  
  const event = await prisma.metricEvent.findUnique({
    where: { id },
  })
  
  if (!event) {
    return NextResponse.json(
      { error: 'Событие не найдено' },
      { status: 404 }
    )
  }
  
  return NextResponse.json(event)
}

/**
 * PUT /api/metric-events/[id]
 * Обновить событие
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const testMode = isTestModeRequest(request)
  const prisma = getPrismaClient({ testMode })
  const { id } = await params
  
  try {
    const body = await request.json()
    
    const { metricName, date, eventType, label, color, endDate, notes } = body
    
    // Проверяем, существует ли событие
    const existing = await prisma.metricEvent.findUnique({
      where: { id },
    })
    
    if (!existing) {
      return NextResponse.json(
        { error: 'Событие не найдено' },
        { status: 404 }
      )
    }
    
    // Определяем цвет
    const eventColor = color || 
      (eventType ? EVENT_TYPES[eventType as EventType]?.color : null) || 
      existing.color
    
    const event = await prisma.metricEvent.update({
      where: { id },
      data: {
        metricName: metricName ?? existing.metricName,
        date: date ? new Date(date) : existing.date,
        eventType: eventType ?? existing.eventType,
        label: label ?? existing.label,
        color: eventColor,
        endDate: endDate !== undefined ? (endDate ? new Date(endDate) : null) : existing.endDate,
        notes: notes !== undefined ? (notes || null) : existing.notes,
      },
    })
    
    return NextResponse.json(event)
  } catch (error) {
    console.error('Error updating metric event:', error)
    return NextResponse.json(
      { error: 'Ошибка обновления события' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/metric-events/[id]
 * Удалить событие
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const testMode = isTestModeRequest(request)
  const prisma = getPrismaClient({ testMode })
  const { id } = await params
  
  try {
    const event = await prisma.metricEvent.delete({
      where: { id },
    })
    
    return NextResponse.json({ success: true, deleted: event })
  } catch (error) {
    console.error('Error deleting metric event:', error)
    return NextResponse.json(
      { error: 'Событие не найдено или уже удалено' },
      { status: 404 }
    )
  }
}
