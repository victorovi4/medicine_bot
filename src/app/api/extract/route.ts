import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getPrismaClient } from '@/lib/db'
import { isTestModeRequest } from '@/lib/test-mode'
import { PATIENT, getFullName, getAge, getFormattedBirthDate, getTreatmentStartDate } from '@/lib/patient'
import { getCategoryLabel, getSubtypeLabel } from '@/lib/types'
import type { Prisma } from '@prisma/client'

type DocumentModel = Prisma.DocumentGetPayload<object>

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Модель Claude через OpenRouter
const MODEL = 'anthropic/claude-sonnet-4'

// Ленивая инициализация клиента
let _openrouter: OpenAI | null = null

function getOpenRouter(): OpenAI {
  if (!_openrouter) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not configured')
    }
    _openrouter = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': process.env.VERCEL_URL || 'http://localhost:3000',
        'X-Title': 'Medical Card - Extract',
      },
    })
  }
  return _openrouter
}

export interface ExtractData {
  patient: {
    fullName: string
    birthDate: string
    age: number
    address?: string
    occupation?: string
  }
  period: {
    from: string
    to: string
  }
  diagnosis: {
    main: string
    secondary: string[]
  }
  anamnesis: string
  diagnosticStudies: string
  treatment: string
  dynamics: string
  currentState: string
  recommendations: string
  documentsCount: number
  generatedAt: string
  cached?: boolean
}

const EXTRACT_PROMPT = `Ты — опытный врач, составляющий выписку из истории болезни по форме 027/у.

На основе предоставленных медицинских документов за указанный период составь структурированную выписку.

## Контекст пациента
- ФИО: ${getFullName()}
- Дата рождения: ${getFormattedBirthDate()} (${getAge()} лет)
- Основное заболевание: ${PATIENT.mainDiagnosis || 'не указано'}

## Требования к выписке

1. **Диагноз** (diagnosis):
   - main: Основной диагноз с кодом МКБ-10 если возможно определить стадию
   - secondary: Массив сопутствующих диагнозов

2. **Анамнез заболевания** (anamnesis):
   Краткая история болезни: когда выявлено, как развивалось, ключевые события за период.
   2-4 абзаца.

3. **Диагностические исследования** (diagnosticStudies):
   Перечень проведённых исследований с датами и ключевыми результатами.
   Формат: "ДД.ММ.ГГГГ — Название исследования: ключевые показатели/заключение"

4. **Проведённое лечение** (treatment):
   Назначенные препараты, процедуры, рекомендации врачей.
   Если есть информация о дозировках — указать.

5. **Динамика состояния** (dynamics):
   Как менялись ключевые показатели (ПСА, общее состояние и т.д.).
   Отметить улучшения или ухудшения.

6. **Текущее состояние** (currentState):
   Состояние на конец периода по последним документам.
   1-2 абзаца.

7. **Рекомендации** (recommendations):
   Что рекомендовано: дальнейшее наблюдение, анализы, консультации, лечение.

## Важно
- Пиши профессиональным медицинским языком, но понятно
- Используй только информацию из предоставленных документов
- Если данных недостаточно — укажи "Данные отсутствуют" для соответствующего раздела
- Даты в формате ДД.ММ.ГГГГ
- Не выдумывай информацию

Верни ответ ТОЛЬКО в формате JSON без markdown-форматирования:
{
  "diagnosis": {
    "main": "...",
    "secondary": ["...", "..."]
  },
  "anamnesis": "...",
  "diagnosticStudies": "...",
  "treatment": "...",
  "dynamics": "...",
  "currentState": "...",
  "recommendations": "..."
}`

/**
 * GET /api/extract - получить кэшированную выписку за период лечения.
 */
export async function GET(request: NextRequest) {
  try {
    const prisma = getPrismaClient({ testMode: isTestModeRequest(request) })
    
    // Период: от начала лечения до сегодня
    const fromDate = getTreatmentStartDate()
    const periodFrom = new Date(fromDate)
    
    // Проверяем кэш
    const cached = await prisma.cachedExtract.findFirst({
      where: { periodFrom },
      orderBy: { generatedAt: 'desc' },
    })
    
    if (cached) {
      const extractData = cached.content as unknown as ExtractData
      return NextResponse.json({
        ...extractData,
        cached: true,
        generatedAt: cached.generatedAt.toISOString(),
      })
    }
    
    // Кэша нет — возвращаем информацию что нужно сгенерировать
    return NextResponse.json({
      needsGeneration: true,
      treatmentStartDate: fromDate,
      message: 'Выписка ещё не сгенерирована. Нажмите кнопку для генерации.',
    })
    
  } catch (error) {
    console.error('Get cached extract error:', error)
    const message = error instanceof Error ? error.message : 'Ошибка'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/extract - сгенерировать новую выписку.
 * Body: { fromDate?, toDate?, forceRegenerate? }
 * Если не указаны даты — используется период лечения.
 */
export async function POST(request: NextRequest) {
  try {
    const prisma = getPrismaClient({ testMode: isTestModeRequest(request) })
    const body = await request.json().catch(() => ({}))
    
    // По умолчанию: период лечения
    const fromDate = body.fromDate || getTreatmentStartDate()
    const toDate = body.toDate || new Date().toISOString().split('T')[0]
    const forceRegenerate = body.forceRegenerate || false
    
    const periodFrom = new Date(fromDate)
    const periodTo = new Date(toDate)
    
    // Проверяем кэш (если не форсируем регенерацию)
    if (!forceRegenerate) {
      const cached = await prisma.cachedExtract.findFirst({
        where: { periodFrom },
        orderBy: { generatedAt: 'desc' },
      })
      
      if (cached) {
        // Проверяем, есть ли новые документы после генерации
        const newDocsCount = await prisma.document.count({
          where: {
            date: { gte: periodFrom, lte: periodTo },
            createdAt: { gt: cached.generatedAt },
          },
        })
        
        if (newDocsCount === 0) {
          // Кэш актуален
          const extractData = cached.content as unknown as ExtractData
          return NextResponse.json({
            ...extractData,
            cached: true,
            generatedAt: cached.generatedAt.toISOString(),
          })
        }
      }
    }
    
    // Получаем документы за период
    const documents = await prisma.document.findMany({
      where: {
        date: {
          gte: periodFrom,
          lte: periodTo,
        },
      },
      orderBy: { date: 'asc' },
    })
    
    if (documents.length === 0) {
      return NextResponse.json(
        { error: 'Нет документов за выбранный период' },
        { status: 404 }
      )
    }
    
    // Формируем текст документов для Claude
    const documentsText = documents.map((doc: DocumentModel) => {
      const date = new Date(doc.date).toLocaleDateString('ru-RU')
      const categoryLabel = getCategoryLabel(doc.category)
      const subtypeLabel = getSubtypeLabel(doc.subtype)
      
      let text = `\n### ${date} — ${categoryLabel} / ${subtypeLabel}: ${doc.title}\n`
      
      if (doc.doctor) text += `Врач: ${doc.doctor}`
      if (doc.specialty) text += ` (${doc.specialty})`
      if (doc.clinic) text += ` | ${doc.clinic}`
      text += '\n'
      
      if (doc.conclusion) {
        text += `\n**Заключение врача:**\n${doc.conclusion}\n`
      }
      
      if (doc.recommendations && doc.recommendations.length > 0) {
        text += `\n**Рекомендации:**\n`
        doc.recommendations.forEach((rec, i) => {
          text += `${i + 1}. ${rec}\n`
        })
      }
      
      if (doc.summary) text += `\nРезюме: ${doc.summary}\n`
      if (doc.content) text += `\nСодержание: ${doc.content}\n`
      
      if (doc.keyValues && typeof doc.keyValues === 'object') {
        const kv = doc.keyValues as Record<string, string>
        if (Object.keys(kv).length > 0) {
          text += `Показатели: ${Object.entries(kv).map(([k, v]) => `${k}: ${v}`).join(', ')}\n`
        }
      }
      
      if (doc.tags && doc.tags.length > 0) {
        text += `Теги: ${doc.tags.join(', ')}\n`
      }
      
      return text
    }).join('\n---\n')
    
    // Запрос к Claude через OpenRouter
    const completion = await getOpenRouter().chat.completions.create({
      model: MODEL,
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: `${EXTRACT_PROMPT}\n\n## Период выписки\nС ${fromDate} по ${toDate}\n\n## Медицинские документы (${documents.length} шт.)\n${documentsText}`,
        },
      ],
    })
    
    const textContent = completion.choices[0]?.message?.content
    if (!textContent) {
      throw new Error('Нет ответа от AI')
    }
    
    // Парсим JSON
    let extractContent
    try {
      let jsonStr = textContent.trim()
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7)
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3)
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3)
      }
      jsonStr = jsonStr.trim()
      
      extractContent = JSON.parse(jsonStr)
    } catch {
      const jsonMatch = textContent.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        extractContent = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Не удалось распознать ответ AI')
      }
    }
    
    // Формируем полный ответ
    const now = new Date()
    const extractData: ExtractData = {
      patient: {
        fullName: getFullName(),
        birthDate: getFormattedBirthDate(),
        age: getAge(),
        address: 'Адрес не указан',
        occupation: 'Пенсионер',
      },
      period: {
        from: periodFrom.toLocaleDateString('ru-RU'),
        to: periodTo.toLocaleDateString('ru-RU'),
      },
      diagnosis: extractContent.diagnosis || { main: 'Не указан', secondary: [] },
      anamnesis: extractContent.anamnesis || 'Данные отсутствуют',
      diagnosticStudies: extractContent.diagnosticStudies || 'Данные отсутствуют',
      treatment: extractContent.treatment || 'Данные отсутствуют',
      dynamics: extractContent.dynamics || 'Данные отсутствуют',
      currentState: extractContent.currentState || 'Данные отсутствуют',
      recommendations: extractContent.recommendations || 'Данные отсутствуют',
      documentsCount: documents.length,
      generatedAt: now.toISOString(),
    }
    
    // Сохраняем в кэш (upsert по periodFrom)
    await prisma.cachedExtract.upsert({
      where: { periodFrom },
      update: {
        periodTo,
        content: extractData as object,
        documentsCount: documents.length,
        generatedAt: now,
      },
      create: {
        periodFrom,
        periodTo,
        content: extractData as object,
        documentsCount: documents.length,
        generatedAt: now,
      },
    })
    
    return NextResponse.json(extractData)
    
  } catch (error) {
    console.error('Extract generation error:', error)
    const message = error instanceof Error ? error.message : 'Ошибка генерации'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
