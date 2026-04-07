'use client'

import { useState, useRef, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  ClipboardCheck,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Shield,
} from 'lucide-react'

interface KrCheckItem {
  status: 'ok' | 'warning' | 'error'
  title: string
  description: string
  krReference: string
}

interface KrCheckResult {
  items: KrCheckItem[]
  summary: {
    ok: number
    warning: number
    error: number
  }
}

interface KrCheckCardProps {
  documentId: string
  hasGuideline: boolean
}

const STATUS_CONFIG = {
  ok: {
    icon: CheckCircle2,
    bg: 'bg-green-950/50',
    border: 'border-l-green-500',
    text: 'text-green-500',
    label: 'соответствует',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-yellow-950/50',
    border: 'border-l-yellow-500',
    text: 'text-yellow-500',
    label: 'внимание',
  },
  error: {
    icon: XCircle,
    bg: 'bg-red-950/50',
    border: 'border-l-red-500',
    text: 'text-red-500',
    label: 'расхождений',
  },
} as const

export function KrCheckCard({ documentId, hasGuideline }: KrCheckCardProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<KrCheckResult | null>(null)
  const [guidelineId, setGuidelineId] = useState<string>('')
  const [guidelineName, setGuidelineName] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const streamRef = useRef<string>('')

  const runCheck = useCallback(async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    streamRef.current = ''

    try {
      const res = await fetch('/api/kr-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка проверки')
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
            } else if (event.type === 'done') {
              setResult(event.result)
              setGuidelineId(event.guidelineId || '')
              setGuidelineName(event.guidelineName || '')
            } else if (event.type === 'error') {
              throw new Error(event.error)
            }
          } catch (e) {
            if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
              throw e
            }
          }
        }
      }
    } catch (err) {
      console.error('KR check error:', err)
      setError(err instanceof Error ? err.message : 'Произошла ошибка')
    } finally {
      setLoading(false)
    }
  }, [documentId])

  if (!hasGuideline) {
    return null
  }

  // Initial state: show the trigger button
  if (!loading && !result && !error) {
    return (
      <button
        onClick={runCheck}
        className="w-full cursor-pointer rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-3 text-sm font-medium text-white shadow-sm transition-all hover:from-emerald-500 hover:to-emerald-400 hover:shadow-md active:scale-[0.98]"
      >
        <span className="flex items-center justify-center gap-2">
          <ClipboardCheck className="h-4 w-4" />
          Проверить по КР
        </span>
      </button>
    )
  }

  // Loading state
  if (loading) {
    return (
      <Card className="border-slate-700 bg-slate-900">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
            <span className="text-sm text-slate-300">
              Проверяю по клиническим рекомендациям...
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Error state
  if (error) {
    return (
      <Card className="border-red-800 bg-red-950/30">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-3">
            <XCircle className="h-5 w-5 text-red-500" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
          <Button
            onClick={runCheck}
            variant="outline"
            size="sm"
            className="border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Повторить
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Result state
  if (!result) return null

  const { summary, items } = result

  return (
    <Card className="border-slate-700 bg-slate-900">
      <CardContent className="pt-6">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <ClipboardCheck className="h-5 w-5 text-emerald-500" />
          <h3 className="text-sm font-semibold text-slate-200">
            Проверка по {guidelineId} &laquo;{guidelineName}&raquo;
          </h3>
        </div>

        {/* Items */}
        <div className="space-y-2 mb-4">
          {items.map((item, idx) => {
            const config = STATUS_CONFIG[item.status]
            const Icon = config.icon
            return (
              <div
                key={idx}
                className={`rounded-md border-l-4 ${config.border} ${config.bg} p-3`}
              >
                <div className="flex items-start gap-2">
                  <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${config.text}`} />
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${config.text}`}>
                      {item.title}
                    </p>
                    <p className="text-xs text-slate-300 mt-1">
                      {item.description}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 italic">
                      {item.krReference}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Summary bar */}
        <div className="flex items-center gap-4 rounded-md bg-slate-800 px-3 py-2 text-xs mb-4">
          <span className="flex items-center gap-1 text-green-500">
            <CheckCircle2 className="h-3 w-3" />
            {summary.ok} соответствует
          </span>
          <span className="flex items-center gap-1 text-yellow-500">
            <AlertTriangle className="h-3 w-3" />
            {summary.warning} внимание
          </span>
          <span className="flex items-center gap-1 text-red-500">
            <XCircle className="h-3 w-3" />
            {summary.error} расхождений
          </span>
        </div>

        {/* Disclaimer */}
        <div className="flex items-start gap-2 rounded-md bg-amber-950/30 border border-amber-800/50 p-3 mb-3">
          <Shield className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-400/80">
            ИИ-анализ носит информационный характер и не заменяет консультацию врача.
            Клинические рекомендации могут обновляться.
          </p>
        </div>

        {/* Repeat button */}
        <Button
          onClick={runCheck}
          variant="outline"
          size="sm"
          className="border-slate-600 text-slate-300 hover:bg-slate-800"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Повторить
        </Button>
      </CardContent>
    </Card>
  )
}
