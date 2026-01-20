import { NextRequest, NextResponse } from 'next/server'
import { getPrismaClient } from '@/lib/db'
import { isTestModeRequest } from '@/lib/test-mode'

// GET — получить один документ
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const prisma = getPrismaClient({ testMode: isTestModeRequest(request) })
    const { id } = await params
    const document = await prisma.document.findUnique({
      where: { id },
    })
    
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }
    
    return NextResponse.json(document)
  } catch (error) {
    console.error('Error fetching document:', error)
    return NextResponse.json({ error: 'Failed to fetch document' }, { status: 500 })
  }
}

// PUT — обновить документ
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const prisma = getPrismaClient({ testMode: isTestModeRequest(request) })
    const { id } = await params
    const body = await request.json()
    
    const document = await prisma.document.update({
      where: { id },
      data: {
        date: body.date ? new Date(body.date) : undefined,
        type: body.type,
        title: body.title,
        doctor: body.doctor,
        specialty: body.specialty,
        clinic: body.clinic,
        summary: body.summary,
        content: body.content,
        fileUrl: body.fileUrl,
        fileName: body.fileName,
        fileType: body.fileType,
        tags: body.tags,
        keyValues: body.keyValues,
      },
    })
    
    return NextResponse.json(document)
  } catch (error) {
    console.error('Error updating document:', error)
    return NextResponse.json({ error: 'Failed to update document' }, { status: 500 })
  }
}

// DELETE — удалить документ
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const prisma = getPrismaClient({ testMode: isTestModeRequest(request) })
    const { id } = await params
    await prisma.document.delete({
      where: { id },
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting document:', error)
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
  }
}
