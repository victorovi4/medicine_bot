import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getVitalSignConfig } from '@/lib/diary'

export const dynamic = 'force-dynamic'

/**
 * GET /api/vitals
 * Список показателей за период.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const days = parseInt(searchParams.get('days') || '30', 10)
    const type = searchParams.get('type') // Опционально: фильтр по типу
    
    const since = new Date()
    since.setDate(since.getDate() - days)
    
    const vitals = await prisma.vitalSign.findMany({
      where: {
        datetime: { gte: since },
        ...(type ? { type } : {}),
      },
      orderBy: { datetime: 'desc' },
    })
    
    return NextResponse.json({ vitals })
  } catch (error) {
    console.error('Get vitals error:', error)
    return NextResponse.json({ error: 'Failed to get vitals' }, { status: 500 })
  }
}

/**
 * POST /api/vitals
 * Добавить показатель.
 */
export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    
    const config = getVitalSignConfig(data.type)
    if (!config) {
      return NextResponse.json({ error: 'Unknown vital sign type' }, { status: 400 })
    }
    
    const vital = await prisma.vitalSign.create({
      data: {
        datetime: data.datetime ? new Date(data.datetime) : new Date(),
        type: data.type,
        value: data.value,
        value2: data.value2 || null,
        unit: config.unit,
        notes: data.notes || null,
      },
    })
    
    return NextResponse.json({ vital })
  } catch (error) {
    console.error('Create vital error:', error)
    return NextResponse.json({ error: 'Failed to create vital' }, { status: 500 })
  }
}
