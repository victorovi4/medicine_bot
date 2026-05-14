'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
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
          <Loader2 className="h-8 w-8 animate-spin text-[#00d2aa]" />
          <span className="ml-3 text-[rgba(204,232,225,0.6)]">Загрузка...</span>
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
            <Stethoscope className="h-6 w-6 text-[#00d2aa]" />
            <h2 className="text-xl font-semibold text-[#cce8e1]">ИИ-заключение</h2>
          </div>
          <p className="text-[rgba(204,232,225,0.5)] text-sm mt-1">
            Комплексный анализ медицинской карты
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/chat">
            <Button variant="outline" className="border-[rgba(0,210,170,0.2)] text-[#00d2aa] bg-transparent hover:bg-[rgba(0,210,170,0.08)] hover:text-[#00f0c6]">
              <MessageSquare className="h-4 w-4 mr-2" />
              Задать вопрос
            </Button>
          </Link>
          <button
            onClick={generate}
            disabled={generating}
            className="rounded-lg bg-[#00d2aa] px-5 py-2.5 text-sm font-semibold text-[#030b14] hover:bg-[#00f0c6] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Генерация...
              </span>
            ) : assessment ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Обновить
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Stethoscope className="h-4 w-4" />
                Сгенерировать ИИ-заключение
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-[rgba(255,107,107,0.2)] bg-[rgba(255,107,107,0.08)] p-4 mb-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-[#ff6b6b]" />
            <p className="text-[#ff6b6b]">{error}</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!assessment && !generating && !error && (
        <div className="rounded-xl border border-[rgba(0,210,170,0.09)] bg-[#060f1c] p-8 mb-6 text-center">
          <Stethoscope className="h-12 w-12 mx-auto text-[rgba(204,232,225,0.3)] mb-4" />
          <h3 className="text-lg font-medium text-[#cce8e1] mb-2">Заключение ещё не сгенерировано</h3>
          <p className="text-[rgba(204,232,225,0.5)] mb-4">
            ИИ проанализирует все документы, показатели, лекарства и процедуры
            и создаст комплексное медицинское заключение.
          </p>
          <button
            onClick={generate}
            className="rounded-lg bg-[#00d2aa] px-5 py-2.5 text-sm font-semibold text-[#030b14] hover:bg-[#00f0c6] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4" />
              Сгенерировать ИИ-заключение
            </span>
          </button>
        </div>
      )}

      {/* Streaming indicator */}
      {generating && streamText.length === 0 && (
        <div className="rounded-xl border border-[rgba(0,210,170,0.09)] bg-[#060f1c] p-5 mb-6">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-[#00d2aa]" />
            <span className="text-[rgba(204,232,225,0.6)]">Анализируем медицинскую карту...</span>
          </div>
        </div>
      )}

      {/* Sections */}
      {sections.length > 0 && (
        <div className="space-y-4">
          {/* Generated at badge */}
          {assessment && !isStreaming && (
            <div className="flex items-center gap-2 text-[rgba(204,232,225,0.4)] text-xs font-[var(--font-geist-mono)]">
              <Clock className="h-4 w-4" />
              <span>
                Сгенерировано: {new Date(assessment.createdAt).toLocaleString('ru-RU')}
              </span>
            </div>
          )}

          {sections.map((section) => (
            <div key={section.key} className="rounded-xl border border-[rgba(0,210,170,0.09)] bg-[#060f1c] p-5 mb-4">
              <div className="flex items-center gap-2 text-sm font-medium text-[#00d2aa] mb-3 section-label">
                {section.icon}
                <h3 className="font-semibold text-base text-[#cce8e1]">{section.title}</h3>
                {isStreaming && section === sections[sections.length - 1] && (
                  <Badge variant="secondary" className="ml-auto text-xs bg-[rgba(0,210,170,0.12)] text-[#00d2aa] border-0">
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    Генерация
                  </Badge>
                )}
              </div>
              <div
                className="text-sm text-[rgba(204,232,225,0.85)] leading-relaxed [&_strong]:text-[#cce8e1] [&_ul]:list-disc [&_ul]:pl-4 [&_li]:mb-1 [&_h3]:text-[#cce8e1] [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(section.content) }}
              />
              {isStreaming && section === sections[sections.length - 1] && (
                <span className="inline-block w-1.5 h-4 bg-[#00d2aa] animate-pulse ml-0.5 align-text-bottom" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Fallback for streaming before any sections are parsed */}
      {isStreaming && sections.length === 0 && (
        <div className="rounded-xl border border-[rgba(0,210,170,0.09)] bg-[#060f1c] p-5">
          <div className="text-sm text-[rgba(204,232,225,0.85)] leading-relaxed whitespace-pre-wrap">
            {streamText}
            <span className="inline-block w-1.5 h-4 bg-[#00d2aa] animate-pulse ml-0.5 align-text-bottom" />
          </div>
        </div>
      )}

      {/* Disclaimer */}
      {(assessment || isStreaming) && (
        <div className="rounded-lg border border-[rgba(0,210,170,0.09)] bg-[#0a1525] p-3 text-xs text-[rgba(204,232,225,0.4)] mt-4">
          <div className="flex items-start gap-2">
            <Shield className="h-4 w-4 text-[rgba(204,232,225,0.3)] flex-shrink-0 mt-0.5" />
            <p>
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
