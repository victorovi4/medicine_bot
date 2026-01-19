import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    
    // Генерируем уникальное имя с сохранением расширения
    const timestamp = Date.now()
    const blobName = `documents/${timestamp}-${file.name}`
    
    const blob = await put(blobName, file, {
      access: 'public',
    })
    
    return NextResponse.json({
      url: blob.url,
      fileName: file.name,
      fileType: file.type,
    })
  } catch (error) {
    console.error('Error uploading file:', error)
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
  }
}
