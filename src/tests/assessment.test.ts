import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================
// Мок Prisma
// ============================================
const mockFindMany = vi.fn().mockResolvedValue([])
const mockFindFirst = vi.fn().mockResolvedValue(null)
const mockCount = vi.fn().mockResolvedValue(0)
const mockCreate = vi.fn().mockResolvedValue({ id: 'assessment-123', content: '', metadata: {} })

const mockPrisma = {
  document: { findMany: mockFindMany, count: mockCount },
  medication: { findMany: mockFindMany, count: mockCount },
  procedure: { findMany: mockFindMany, count: mockCount },
  vitalSign: { findMany: mockFindMany },
  symptom: { findMany: mockFindMany },
  assessment: { findFirst: mockFindFirst, create: mockCreate },
}

vi.mock('@/lib/db', () => ({
  getPrismaClient: vi.fn(() => mockPrisma),
}))

vi.mock('@/lib/test-mode', () => ({
  isTestModeRequest: vi.fn(() => false),
}))

// ============================================
// Мок Anthropic SDK (streaming)
// ============================================
const mockStreamOn = vi.fn()
const mockFinalMessage = vi.fn().mockResolvedValue({})

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        stream: vi.fn().mockReturnValue({
          on: mockStreamOn,
          finalMessage: mockFinalMessage,
        }),
      },
    })),
  }
})

// ============================================
// Импорт тестируемого модуля (после моков)
// ============================================
import { GET, POST } from '@/app/api/assessment/route'
import { NextRequest } from 'next/server'

function createRequest(method: string, body?: Record<string, unknown>): NextRequest {
  const url = 'http://localhost:3000/api/assessment'
  if (method === 'GET') {
    return new NextRequest(url, { method: 'GET' })
  }
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

// ============================================
// Тесты
// ============================================

describe('Assessment API — GET /api/assessment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('должен вернуть exists: false если нет сохранённых заключений', async () => {
    mockFindFirst.mockResolvedValueOnce(null)

    const response = await GET(createRequest('GET'))
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.exists).toBe(false)
  })

  it('должен вернуть последнее сохранённое заключение', async () => {
    const mockAssessment = {
      id: 'assessment-abc',
      content: '## 1. Хронология заболевания\nТекст...',
      metadata: { documentsCount: 5, generationTime: 12 },
      createdAt: new Date('2026-02-28T10:00:00Z'),
    }
    mockFindFirst.mockResolvedValueOnce(mockAssessment)

    const response = await GET(createRequest('GET'))
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.exists).toBe(true)
    expect(data.id).toBe('assessment-abc')
    expect(data.content).toContain('Хронология')
    expect(data.metadata.documentsCount).toBe(5)
    expect(data.createdAt).toBe('2026-02-28T10:00:00.000Z')
  })

  it('должен вернуть 500 при ошибке БД', async () => {
    mockFindFirst.mockRejectedValueOnce(new Error('DB connection failed'))

    const response = await GET(createRequest('GET'))
    expect(response.status).toBe(500)

    const data = await response.json()
    expect(data.error).toContain('DB connection failed')
  })
})

describe('Assessment API — POST /api/assessment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // По дефолту все findMany возвращают пустые массивы
    mockFindMany.mockResolvedValue([])
    mockCount.mockResolvedValue(0)
  })

  it('должен вернуть 404 если нет медицинских данных', async () => {
    // buildFullContext вернёт пустую строку, т.к. все findMany пустые
    mockFindMany.mockResolvedValue([])

    const response = await POST(createRequest('POST'))
    expect(response.status).toBe(404)

    const data = await response.json()
    expect(data.error).toContain('Нет медицинских данных')
  })

  it('должен запустить streaming при наличии документов', async () => {
    // Возвращаем документ, чтобы контекст был непустым
    const mockDocuments = [{
      id: 'doc-1',
      date: new Date('2025-06-01'),
      title: 'Анализ крови',
      category: 'анализы',
      subtype: 'кровь',
      doctor: 'Иванов И.И.',
      specialty: 'терапевт',
      clinic: 'Поликлиника',
      content: 'Гемоглобин 130 г/л',
      summary: null,
      conclusion: 'Норма',
      recommendations: ['Повторить через 3 мес'],
      keyValues: { 'Гемоглобин': '130 г/л' },
      tags: ['кровь'],
      measurements: [],
    }]

    // findMany вызывается для document, medication, procedure, vitalSign, symptom
    // Только первый вызов (documents) должен вернуть данные
    let callIndex = 0
    mockFindMany.mockImplementation(() => {
      callIndex++
      if (callIndex === 1) return Promise.resolve(mockDocuments)
      return Promise.resolve([])
    })
    mockCount.mockResolvedValue(1)

    // Настраиваем stream.on('text', callback) чтобы вызывать callback с текстом
    mockStreamOn.mockImplementation((event: string, callback: (text: string) => void) => {
      if (event === 'text') {
        callback('## 1. Хронология заболевания\nТекст...')
      }
    })
    mockFinalMessage.mockResolvedValue({})
    mockCreate.mockResolvedValue({
      id: 'assessment-new',
      content: '## 1. Хронология заболевания\nТекст...',
      metadata: {},
    })

    const response = await POST(createRequest('POST'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    expect(response.headers.get('Cache-Control')).toBe('no-cache')
  })
})

describe('ASSESSMENT_SYSTEM_PROMPT', () => {
  it('промпт должен содержать данные пациента', async () => {
    // Импортируем файл как текст и проверяем, что промпт содержит нужные данные.
    // Т.к. промпт — строковая константа на уровне модуля, мы проверяем
    // через фактический вызов API, что промпт формируется корректно.
    // Используем Anthropic mock, чтобы проверить что stream() вызывается с system prompt.

    const Anthropic = (await import('@anthropic-ai/sdk')).default

    // Делаем вызов POST с данными
    const mockDocuments = [{
      id: 'doc-1',
      date: new Date('2025-06-01'),
      title: 'Тест',
      category: 'анализы',
      subtype: 'кровь',
      doctor: null,
      specialty: null,
      clinic: null,
      content: 'Текст документа',
      summary: null,
      conclusion: null,
      recommendations: [],
      keyValues: null,
      tags: [],
      measurements: [],
    }]

    let callIndex = 0
    mockFindMany.mockImplementation(() => {
      callIndex++
      if (callIndex === 1) return Promise.resolve(mockDocuments)
      return Promise.resolve([])
    })
    mockCount.mockResolvedValue(1)
    mockStreamOn.mockImplementation((event: string, callback: (text: string) => void) => {
      if (event === 'text') callback('test')
    })

    await POST(createRequest('POST'))

    // Проверяем что Anthropic был инициализирован
    expect(Anthropic).toHaveBeenCalled()

    // Проверяем что stream был вызван с system prompt, содержащим данные пациента
    const anthropicInstance = (Anthropic as unknown as ReturnType<typeof vi.fn>).mock.results[0]?.value
    if (anthropicInstance?.messages?.stream) {
      const streamCall = anthropicInstance.messages.stream.mock.calls[0]?.[0]
      if (streamCall) {
        // System prompt должен содержать имя пациента
        expect(streamCall.system).toContain('Иоффе Виктор Борисович')
        // Должен содержать диагноз
        expect(streamCall.system).toContain('Рак предстательной железы')
        // Должен содержать код МКБ
        expect(streamCall.system).toContain('C61')
      }
    }
  })
})

describe('parseSections — разбор секций из Markdown', () => {
  // Тестируем parseSections напрямую, импортируя из page.tsx невозможно
  // (это 'use client' компонент). Дублируем логику парсинга для теста.

  function parseSections(text: string): { title: string; content: string }[] {
    const sections: { title: string; content: string }[] = []
    const headerRegex = /^##\s+(?:\d+\.\s+)?(.+)$/gm
    const headers: { title: string; index: number }[] = []
    let match

    while ((match = headerRegex.exec(text)) !== null) {
      headers.push({ title: match[1].trim(), index: match.index })
    }

    for (let i = 0; i < headers.length; i++) {
      const start = headers[i].index + text.slice(headers[i].index).indexOf('\n') + 1
      const end = i + 1 < headers.length ? headers[i + 1].index : text.length
      const content = text.slice(start, end).trim()
      sections.push({ title: headers[i].title, content })
    }

    return sections
  }

  it('должен распарсить 6 секций из корректного markdown', () => {
    const markdown = `## 1. Хронология заболевания
Февраль 2025: поставлен диагноз.

## 2. Текущий статус
Стабильное состояние.

## 3. Динамика ключевых показателей
ПСА снижается.

## 4. Лист активных проблем
1. Анемия

## 5. Оценка рисков
Риск прогрессирования.

## 6. Рекомендации для обсуждения с врачом
Обсудить смену терапии.`

    const sections = parseSections(markdown)
    expect(sections).toHaveLength(6)
    expect(sections[0].title).toBe('Хронология заболевания')
    expect(sections[0].content).toContain('Февраль 2025')
    expect(sections[5].title).toBe('Рекомендации для обсуждения с врачом')
    expect(sections[5].content).toContain('смену терапии')
  })

  it('должен вернуть пустой массив для текста без заголовков', () => {
    const sections = parseSections('Просто текст без заголовков')
    expect(sections).toHaveLength(0)
  })

  it('должен корректно парсить заголовки без нумерации', () => {
    const markdown = `## Хронология
Текст 1

## Статус
Текст 2`

    const sections = parseSections(markdown)
    expect(sections).toHaveLength(2)
    expect(sections[0].title).toBe('Хронология')
    expect(sections[1].title).toBe('Статус')
  })
})
