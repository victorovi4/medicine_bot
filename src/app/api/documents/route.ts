import { NextRequest, NextResponse } from 'next/server'
import { getPrismaClient } from '@/lib/db'
import { isTestModeRequest } from '@/lib/test-mode'
import { extractMeasurements } from '@/lib/metrics'

/**
 * Триггер фоновой регенерации выписки.
 * Не блокирует основной запрос.
 */
async function triggerExtractRegeneration(): Promise<void> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    // Fire and forget — не ждём ответа
    fetch(`${baseUrl}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forceRegenerate: true }),
    }).catch(() => {
      // Игнорируем ошибки — это фоновая задача
    })
  } catch {
    // Игнорируем
  }
}

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
    
    const documentDate = new Date(body.date)
    
    // Извлекаем измерения из keyValues
    const measurements = extractMeasurements(body.keyValues)
    
    const document = await prisma.document.create({
      data: {
        date: documentDate,
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
        // Создаём измерения вместе с документом
        measurements: {
          create: measurements.map(m => ({
            name: m.name,
            value: m.value,
            unit: m.unit,
            date: documentDate,
          })),
        },
      },
    })
    
    // Запускаем регенерацию выписки в фоне (не блокируем ответ)
    triggerExtractRegeneration()
    
    return NextResponse.json(document, { status: 201 })
  } catch (error) {
    console.error('Error creating document:', error)
    return NextResponse.json({ error: 'Failed to create document' }, { status: 500 })
  }
}
