import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/medications
 * Список препаратов.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const activeOnly = searchParams.get('active') !== 'false'
    
    const medications = await prisma.medication.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: { startDate: 'desc' },
    })
    
    return NextResponse.json({ medications })
  } catch (error) {
    console.error('Get medications error:', error)
    return NextResponse.json({ error: 'Failed to get medications' }, { status: 500 })
  }
}

/**
 * POST /api/medications
 * Добавить препарат.
 */
export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    
    const medication = await prisma.medication.create({
      data: {
        name: data.name,
        dosage: data.dosage || null,
        frequency: data.frequency || null,
        startDate: data.startDate ? new Date(data.startDate) : new Date(),
        endDate: data.endDate ? new Date(data.endDate) : null,
        notes: data.notes || null,
        isActive: data.isActive !== false,
      },
    })
    
    return NextResponse.json({ medication })
  } catch (error) {
    console.error('Create medication error:', error)
    return NextResponse.json({ error: 'Failed to create medication' }, { status: 500 })
  }
}

/**
 * PUT /api/medications
 * Обновить препарат (например, отметить как неактивный).
 */
export async function PUT(request: NextRequest) {
  try {
    const data = await request.json()
    
    if (!data.id) {
      return NextResponse.json({ error: 'Medication ID required' }, { status: 400 })
    }
    
    const medication = await prisma.medication.update({
      where: { id: data.id },
      data: {
        name: data.name,
        dosage: data.dosage,
        frequency: data.frequency,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        notes: data.notes,
        isActive: data.isActive,
      },
    })
    
    return NextResponse.json({ medication })
  } catch (error) {
    console.error('Update medication error:', error)
    return NextResponse.json({ error: 'Failed to update medication' }, { status: 500 })
  }
}
