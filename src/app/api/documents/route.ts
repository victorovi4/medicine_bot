import { NextRequest, NextResponse } from 'next/server'
import { getPrismaClient } from '@/lib/db'
import { isTestModeRequest } from '@/lib/test-mode'

// GET — получить все документы
export async function GET(request: NextRequest) {
  try {
    const prisma = getPrismaClient({ testMode: isTestModeRequest(request) })
    const documents = await prisma.document.findMany({
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(documents)
  } catch (error) {
    console.error('Error fetching documents:', error)
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
  }
}

// POST — создать новый документ
export async function POST(request: NextRequest) {
  try {
    const prisma = getPrismaClient({ testMode: isTestModeRequest(request) })
    const body = await request.json()
    
    const document = await prisma.document.create({
      data: {
        date: new Date(body.date),
        category: body.category,
        subtype: body.subtype,
        title: body.title,
        doctor: body.doctor || null,
        specialty: body.specialty || null,
        clinic: body.clinic || null,
        summary: body.summary || null,
        conclusion: body.conclusion || null,
        recommendations: body.recommendations || [],
        content: body.content || null,
        fileUrl: body.fileUrl || null,
        fileName: body.fileName || null,
        fileType: body.fileType || null,
        tags: body.tags || [],
        keyValues: body.keyValues || null,
      },
    })
    
    return NextResponse.json(document, { status: 201 })
  } catch (error) {
    console.error('Error creating document:', error)
    return NextResponse.json({ error: 'Failed to create document' }, { status: 500 })
  }
}
