import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import JSZip from 'jszip'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Увеличенный таймаут для скачивания

/**
 * POST /api/download
 * Скачивает файлы по списку ID и возвращает ZIP-архив.
 */
export async function POST(request: NextRequest) {
  try {
    const { ids } = await request.json() as { ids: string[] }
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No document IDs provided' }, { status: 400 })
    }
    
    // Загружаем документы
    const documents = await prisma.document.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        date: true,
        title: true,
        fileUrl: true,
        fileName: true,
      },
    })
    
    const docsWithFiles = documents.filter(d => d.fileUrl)
    
    if (docsWithFiles.length === 0) {
      return NextResponse.json({ error: 'No files found' }, { status: 404 })
    }
    
    // Создаём ZIP
    const zip = new JSZip()
    
    for (const doc of docsWithFiles) {
      if (!doc.fileUrl) continue
      
      try {
        const response = await fetch(doc.fileUrl)
        if (!response.ok) continue
        
        const buffer = await response.arrayBuffer()
        
        // Формируем имя файла
        const date = new Date(doc.date).toLocaleDateString('ru-RU').replace(/\./g, '-')
        const ext = doc.fileName?.split('.').pop() || 'pdf'
        const safeName = doc.title.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 50)
        const fileName = `${date}_${safeName}.${ext}`
        
        zip.file(fileName, buffer)
      } catch (err) {
        console.error(`Failed to download: ${doc.title}`, err)
      }
    }
    
    // Генерируем ZIP
    const content = await zip.generateAsync({ type: 'arraybuffer' })
    
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="documents.zip"',
      },
    })
  } catch (error) {
    console.error('Download error:', error)
    return NextResponse.json(
      { error: 'Download failed' },
      { status: 500 }
    )
  }
}
