'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  Stethoscope,
  Clock,
  TrendingUp,
  AlertTriangle,
  Shield,
  MessageSquare,
  RefreshCw,
  ListChecks,
  Activity,
} from 'lucide-react'

interface AssessmentData {
  id: string
  content: string
  createdAt: string
}

interface Section {
  key: string
  title: string
  icon: React.ReactNode
  content: string
}

const SECTION_CONFIG: { key: string; title: string; icon: React.ReactNode }[] = [
  { key: 'chronology', title: 'Хронология', icon: <Clock className="h-5 w-5" /> },
  { key: 'current_status', title: 'Текущий статус', icon: <Activity className="h-5 w-5" /> },
  { key: 'trends', title: 'Тренды показателей', icon: <TrendingUp className="h-5 w-5" /> },
  { key: 'problem_list', title: 'Лист проблем', icon: <ListChecks className="h-5 w-5" /> },
  { key: 'risk_assessment', title: 'Оценка рисков', icon: <AlertTriangle className="h-5 w-5" /> },
  { key: 'recommendations', title: 'Рекомендации', icon: <MessageSquare className="h-5 w-5" /> },
]

function parseSections(text: string): Section[] {
  const sections: Section[] = []
  // Match markdown headers like ## 1. Хронология or ## Хронология
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
    const headerTitle = headers[i].title

    // Try to match to known section by keyword
    const config = SECTION_CONFIG.find((s) => {
      const lowerTitle = headerTitle.toLowerCase()
      switch (s.key) {
        case 'chronology': return lowerTitle.includes('хронолог')
        case 'current_status': return lowerTitle.includes('статус') || lowerTitle.includes('состояни')
        case 'trends': return lowerTitle.includes('тренд') || lowerTitle.includes('динамик') || lowerTitle.includes('показател')
        case 'problem_list': return lowerTitle.includes('проблем') || lowerTitle.includes('лист')
        case 'risk_assessment': return lowerTitle.includes('риск') || lowerTitle.includes('оценк')
        case 'recommendations': return lowerTitle.includes('рекоменда')
        default: return false
      }
    })

    sections.push({
      key: config?.key || `section-${i}`,
      title: headerTitle,
      icon: config?.icon || <Stethoscope className="h-5 w-5" />,
      content,
    })
  }

  return sections
}

/** Simple markdown to HTML: bold, italic, lists, line breaks */
function renderMarkdown(md: string): string {
  let html = md
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Unordered list items
    .replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
    // Numbered list items
    .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul class="list-disc list-inside space-y-1 my-2">$1</ul>')
    // Paragraphs (double newline)
    .replace(/\n\n/g, '</p><p class="mb-2">')
    // Single newline -> br
    .replace(/\n/g, '<br />')

  return `<p class="mb-2">${html}</p>`
}

export default function AssessmentPage() {
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [assessment, setAssessment] = useState<AssessmentData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const streamRef = useRef<string>('')

  // Load cached assessment on mount
  const loadCached = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/assessment')
      if (res.ok) {
        const data = await res.json()
        if (data.exists && data.id) {
          setAssessment({
            id: data.id,
            content: data.content,
            createdAt: data.createdAt,
          })
        }
      }
    } catch (err) {
      console.error('Failed to load assessment:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCached()
  }, [loadCached])

  const generate = async () => {
    setGenerating(true)
    setError(null)
    setStreamText('')
    streamRef.current = ''

    try {
      const res = await fetch('/api/assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка генерации')
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6)

          try {
            const event = JSON.parse(jsonStr)

            if (event.type === 'text') {
              streamRef.current += event.text
              setStreamText(streamRef.current)
            } else if (event.type === 'done') {
              // Save final result
              setAssessment({
                id: event.assessmentId || 'generated',
                content: streamRef.current,
                createdAt: new Date().toISOString(),
              })
              setStreamText('')
            } else if (event.type === 'error') {
              throw new Error(event.error)
            }
          } catch (e) {
            // Re-throw real errors, skip JSON parse issues from incomplete chunks
            if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
              throw e
            }
          }
        }
      }
    } catch (err) {
      console.error('Assessment generation error:', err)
      setError(err instanceof Error ? err.message : 'Произошла ошибка')
    } finally {
      setGenerating(false)
    }
  }

  // Content to display: either finished assessment or streaming text
  const displayContent = assessment?.content || ''
  const isStreaming = generating && streamText.length > 0
  const textToRender = isStreaming ? streamText : displayContent
  const sections = textToRender ? parseSections(textToRender) : []

  if (loading) {
    return (
      <main className="pb-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <span className="ml-3 text-gray-600">Загрузка...</span>
        </div>
      </main>
    )
  }

  return (
    <main className="pb-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Stethoscope className="h-6 w-6 text-emerald-600" />
            <h2 className="text-xl font-semibold text-gray-900">ИИ-заключение</h2>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            Комплексный анализ медицинской карты
          </p>
        </div>

        <Button
          onClick={generate}
          disabled={generating}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Генерация...
            </>
          ) : assessment ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Обновить
            </>
          ) : (
            <>
              <Stethoscope className="h-4 w-4 mr-2" />
              Сгенерировать ИИ-заключение
            </>
          )}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <p className="text-red-600">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!assessment && !generating && !error && (
        <Card className="mb-6">
          <CardContent className="pt-6 text-center">
            <Stethoscope className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium mb-2">Заключение ещё не сгенерировано</h3>
            <p className="text-gray-500 mb-4">
              ИИ проанализирует все документы, показатели, лекарства и процедуры
              и создаст комплексное медицинское заключение.
            </p>
            <Button
              onClick={generate}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Stethoscope className="h-4 w-4 mr-2" />
              Сгенерировать ИИ-заключение
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Streaming indicator */}
      {generating && streamText.length === 0 && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
              <span className="text-gray-600">Анализируем медицинскую карту...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sections */}
      {sections.length > 0 && (
        <div className="space-y-4">
          {/* Generated at badge */}
          {assessment && !isStreaming && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Clock className="h-4 w-4" />
              <span>
                Сгенерировано: {new Date(assessment.createdAt).toLocaleString('ru-RU')}
              </span>
            </div>
          )}

          {sections.map((section) => (
            <Card key={section.key}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-600">{section.icon}</span>
                  <h3 className="font-semibold text-lg">{section.title}</h3>
                  {isStreaming && section === sections[sections.length - 1] && (
                    <Badge variant="secondary" className="ml-auto text-xs">
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      Генерация
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div
                  className="prose prose-sm max-w-none text-gray-700"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(section.content) }}
                />
                {isStreaming && section === sections[sections.length - 1] && (
                  <span className="inline-block w-1.5 h-4 bg-emerald-600 animate-pulse ml-0.5 align-text-bottom" />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Fallback for streaming before any sections are parsed */}
      {isStreaming && sections.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
              {streamText}
              <span className="inline-block w-1.5 h-4 bg-emerald-600 animate-pulse ml-0.5 align-text-bottom" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Disclaimer */}
      {(assessment || isStreaming) && (
        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2">
            <Shield className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Данное заключение сгенерировано ИИ и не является медицинским диагнозом.
              Оно предназначено для информационных целей и подготовки к визиту врача.
              Все медицинские решения должны приниматься квалифицированным специалистом.
            </p>
          </div>
        </div>
      )}
    </main>
  )
}
