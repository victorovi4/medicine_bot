import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { analyzeDocumentsForHemotransfusions, DetectedHemotransfusion } from '@/lib/hemotransfusion-detector'

export const dynamic = 'force-dynamic'

/**
 * GET /api/procedures/detect — обнаружить гемотрансфузии в документах
 * POST /api/procedures/detect — обнаружить и создать записи Procedure
 */

export async function GET() {
  try {
    // Получаем все документы с keyValues
    const documents = await prisma.document.findMany({
      where: {
        keyValues: { not: null },
      },
      select: {
        id: true,
        date: true,
        title: true,
        keyValues: true,
      },
      orderBy: { date: 'asc' },
    })
    
    // Преобразуем для анализа
    const docsForAnalysis = documents.map(doc => ({
      id: doc.id,
      date: doc.date,
      title: doc.title,
      keyValues: doc.keyValues as Record<string, string> | null,
    }))
    
    // Запускаем алгоритм обнаружения
    const detected = analyzeDocumentsForHemotransfusions(docsForAnalysis)
    
    // Получаем существующие процедуры гемотрансфузий
    const existing = await prisma.procedure.findMany({
      where: { type: 'hemotransfusion' },
      select: { date: true, beforeValue: true, afterValue: true },
    })
    
    // Определяем, какие уже созданы
    const results = detected.map(d => {
      const isExisting = existing.some(e => {
        const daysDiff = Math.abs((e.date.getTime() - d.date.getTime()) / (1000 * 60 * 60 * 24))
        return daysDiff <= 3 && e.beforeValue === d.beforeValue
      })
      
      return {
        ...d,
        date: d.date.toISOString(),
        alreadyExists: isExisting,
      }
    })
    
    return NextResponse.json({
      detected: results,
      total: results.length,
      new: results.filter(r => !r.alreadyExists).length,
      existing: results.filter(r => r.alreadyExists).length,
    })
    
  } catch (error) {
    console.error('Hemotransfusion detection error:', error)
    return NextResponse.json(
      { error: 'Detection failed' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { dryRun = false } = await request.json().catch(() => ({}))
    
    // Получаем все документы с keyValues
    const documents = await prisma.document.findMany({
      where: {
        keyValues: { not: null },
      },
      select: {
        id: true,
        date: true,
        title: true,
        keyValues: true,
      },
      orderBy: { date: 'asc' },
    })
    
    // Преобразуем для анализа
    const docsForAnalysis = documents.map(doc => ({
      id: doc.id,
      date: doc.date,
      title: doc.title,
      keyValues: doc.keyValues as Record<string, string> | null,
    }))
    
    // Запускаем алгоритм обнаружения
    const detected = analyzeDocumentsForHemotransfusions(docsForAnalysis)
    
    // Получаем существующие процедуры гемотрансфузий
    const existing = await prisma.procedure.findMany({
      where: { type: 'hemotransfusion' },
      select: { id: true, date: true, beforeValue: true, afterValue: true },
    })
    
    // Фильтруем только новые
    const newDetections = detected.filter(d => {
      return !existing.some(e => {
        const daysDiff = Math.abs((e.date.getTime() - d.date.getTime()) / (1000 * 60 * 60 * 24))
        return daysDiff <= 3 && e.beforeValue === d.beforeValue
      })
    })
    
    const created: DetectedHemotransfusion[] = []
    
    if (!dryRun) {
      // Создаём записи Procedure для новых обнаружений
      for (const d of newDetections) {
        await prisma.procedure.create({
          data: {
            date: d.date,
            type: 'hemotransfusion',
            name: 'Гемотрансфузия эритроцитарной массы',
            beforeValue: d.beforeValue,
            afterValue: d.afterValue > 0 ? d.afterValue : null,
            unit: 'г/л',
            notes: d.reason,
            documentId: d.documentIds[0] || null,
          },
        })
        created.push(d)
      }
    }
    
    return NextResponse.json({
      dryRun,
      detected: detected.length,
      alreadyExisting: existing.length,
      newDetections: newDetections.length,
      created: created.length,
      details: newDetections.map(d => ({
        date: d.date.toISOString(),
        beforeValue: d.beforeValue,
        afterValue: d.afterValue,
        confidence: d.confidence,
        reason: d.reason,
      })),
    })
    
  } catch (error) {
    console.error('Hemotransfusion detection error:', error)
    return NextResponse.json(
      { error: 'Detection failed' },
      { status: 500 }
    )
  }
}
