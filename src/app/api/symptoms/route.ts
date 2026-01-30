import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/symptoms
 * Список симптомов за период.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const days = parseInt(searchParams.get('days') || '30', 10)
    
    const since = new Date()
    since.setDate(since.getDate() - days)
    
    const symptoms = await prisma.symptom.findMany({
      where: {
        datetime: { gte: since },
      },
      orderBy: { datetime: 'desc' },
    })
    
    return NextResponse.json({ symptoms })
  } catch (error) {
    console.error('Get symptoms error:', error)
    return NextResponse.json({ error: 'Failed to get symptoms' }, { status: 500 })
  }
}

/**
 * POST /api/symptoms
 * Добавить симптом.
 */
export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    
    const symptom = await prisma.symptom.create({
      data: {
        datetime: data.datetime ? new Date(data.datetime) : new Date(),
        name: data.name,
        intensity: data.intensity || null,
        duration: data.duration || null,
        notes: data.notes || null,
      },
    })
    
    return NextResponse.json({ symptom })
  } catch (error) {
    console.error('Create symptom error:', error)
    return NextResponse.json({ error: 'Failed to create symptom' }, { status: 500 })
  }
}
