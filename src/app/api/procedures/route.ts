import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/procedures — получить список процедур
 * Query params:
 *   - type: фильтр по типу (hemotransfusion, surgery, etc.)
 *   - from: начало периода (YYYY-MM-DD)
 *   - to: конец периода (YYYY-MM-DD)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const where: {
      type?: string
      date?: { gte?: Date; lte?: Date }
    } = {}

    if (type) {
      where.type = type
    }

    if (from || to) {
      where.date = {}
      if (from) where.date.gte = new Date(from)
      if (to) where.date.lte = new Date(to)
    }

    const procedures = await prisma.procedure.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            date: true,
          },
        },
      },
    })

    return NextResponse.json(procedures)
  } catch (error) {
    console.error('Procedures fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch procedures' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/procedures — добавить процедуру вручную
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { date, type, name, details, beforeValue, afterValue, unit, notes, documentId } = body

    if (!date || !type || !name) {
      return NextResponse.json(
        { error: 'date, type, and name are required' },
        { status: 400 }
      )
    }

    const procedure = await prisma.procedure.create({
      data: {
        date: new Date(date),
        type,
        name,
        details: details || null,
        beforeValue: beforeValue ?? null,
        afterValue: afterValue ?? null,
        unit: unit || null,
        notes: notes || null,
        documentId: documentId || null,
      },
    })

    return NextResponse.json(procedure)
  } catch (error) {
    console.error('Procedure create error:', error)
    return NextResponse.json(
      { error: 'Failed to create procedure' },
      { status: 500 }
    )
  }
}
