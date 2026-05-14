'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MetricsChart } from '@/components/MetricsChart'
import { ArrowLeft, RefreshCw, Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface MetricDataPoint {
  date: string
  value: number
  documentId: string
  documentTitle: string
}

interface MetricSummary {
  name: string
  unit: string
  color: string
  normalMin: number
  normalMax: number
  critical?: number
  dataPoints: MetricDataPoint[]
  firstValue: number | null
  lastValue: number | null
  minValue: number | null
  maxValue: number | null
  changePercent: number
  changeDirection: 'up' | 'down' | 'stable'
  lastStatus: 'normal' | 'low' | 'high' | 'critical' | 'unknown'
}

interface ProcedureMarker {
  date: string
  type: string
  name: string
  beforeValue?: number
  afterValue?: number
  unit?: string
}

interface MetricsResponse {
  period: {
    from: string
    to: string
  }
  metrics: MetricSummary[]
  procedures: ProcedureMarker[]
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    normal: 'bg-[rgba(0,210,170,0.1)] text-[#00d2aa]',
    low: 'bg-[rgba(59,130,246,0.1)] text-[#93c5fd]',
    high: 'bg-[rgba(245,166,35,0.1)] text-[#f5a623]',
    critical: 'bg-[rgba(255,107,107,0.1)] text-[#ff6b6b]',
    unknown: 'bg-[#0a1525] text-[rgba(204,232,225,0.4)]',
  }

  const labels: Record<string, string> = {
    normal: 'Норма',
    low: 'Ниже нормы',
    high: 'Выше нормы',
    critical: 'Критично',
    unknown: 'Нет данных',
  }

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.unknown}`}>
      {labels[status] || status}
    </span>
  )
}

function TrendIcon({ direction }: { direction: 'up' | 'down' | 'stable' }) {
  if (direction === 'up') return <TrendingUp className="h-4 w-4 text-[#34d399]" />
  if (direction === 'down') return <TrendingDown className="h-4 w-4 text-[#ff6b6b]" />
  return <Minus className="h-4 w-4 text-[rgba(204,232,225,0.4)]" />
}

export default function MetricsPage() {
  const [data, setData] = useState<MetricsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadMetrics = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/metrics')
      if (!response.ok) throw new Error('Ошибка загрузки данных')
      const result: MetricsResponse = await response.json()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMetrics()
  }, [])

  const metricsWithData = data?.metrics.filter(m => m.dataPoints.length > 0) || []
  const metricsWithoutData = data?.metrics.filter(m => m.dataPoints.length === 0) || []

  return (
    <main className="container mx-auto px-4 pb-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Назад
            </Button>
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-[#cce8e1]">
            <Activity className="h-6 w-6" />
            Динамика показателей
          </h1>
        </div>
        <Button onClick={loadMetrics} disabled={loading} variant="outline" size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </Button>
      </div>

      {data && (
        <p className="text-sm text-[rgba(204,232,225,0.4)] mb-6">
          Период: {formatDate(data.period.from)} — {formatDate(data.period.to)}
        </p>
      )}

      {error && (
        <Card className="border-[rgba(255,107,107,0.2)] bg-[rgba(255,107,107,0.05)] mb-6">
          <CardContent className="py-4">
            <p className="text-[#ff6b6b]">{error}</p>
          </CardContent>
        </Card>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-[rgba(204,232,225,0.4)]" />
        </div>
      )}

      {/* Сводная таблица */}
      {metricsWithData.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Сводка по показателям</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium">Показатель</th>
                    <th className="text-center py-2 px-3 font-medium">Первое</th>
                    <th className="text-center py-2 px-3 font-medium">Последнее</th>
                    <th className="text-center py-2 px-3 font-medium">Мин</th>
                    <th className="text-center py-2 px-3 font-medium">Макс</th>
                    <th className="text-center py-2 px-3 font-medium">Изменение</th>
                    <th className="text-center py-2 px-3 font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {metricsWithData.map(metric => (
                    <tr key={metric.name} className="border-b last:border-0">
                      <td className="py-3 px-3 font-medium">{metric.name}</td>
                      <td className="py-3 px-3 text-center">
                        {metric.firstValue !== null ? `${metric.firstValue} ${metric.unit}` : '—'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {metric.lastValue !== null ? `${metric.lastValue} ${metric.unit}` : '—'}
                      </td>
                      <td className="py-3 px-3 text-center text-[rgba(204,232,225,0.5)]">
                        {metric.minValue !== null ? metric.minValue : '—'}
                      </td>
                      <td className="py-3 px-3 text-center text-[rgba(204,232,225,0.5)]">
                        {metric.maxValue !== null ? metric.maxValue : '—'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center gap-1">
                          <TrendIcon direction={metric.changeDirection} />
                          {metric.changePercent !== 0 && (
                            <span className={metric.changeDirection === 'up' ? 'text-[#34d399]' : 'text-[#ff6b6b]'}>
                              {metric.changeDirection === 'up' ? '+' : ''}{metric.changePercent}%
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <StatusBadge status={metric.lastStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Графики */}
      {metricsWithData.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-[#cce8e1]">Графики динамики</h2>
          <div className="grid gap-6">
            {metricsWithData.map(metric => (
              <Card key={metric.name}>
                <CardContent className="pt-6">
                  <MetricsChart metric={metric} procedures={data?.procedures ?? []} />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Показатели без данных */}
      {metricsWithoutData.length > 0 && (
        <Card className="mt-8 border-dashed border-[rgba(0,210,170,0.09)]">
          <CardHeader>
            <CardTitle className="text-lg text-[rgba(204,232,225,0.5)]">Показатели без данных</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[rgba(204,232,225,0.4)] mb-3">
              Для этих показателей пока нет измерений за период лечения:
            </p>
            <div className="flex flex-wrap gap-2">
              {metricsWithoutData.map(metric => (
                <span
                  key={metric.name}
                  className="px-3 py-1 bg-[#0a1525] rounded-full text-sm text-[rgba(204,232,225,0.5)]"
                >
                  {metric.name}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Нет данных вообще */}
      {!loading && metricsWithData.length === 0 && !error && (
        <Card className="border-dashed border-[rgba(0,210,170,0.09)]">
          <CardContent className="py-12 text-center">
            <Activity className="h-12 w-12 mx-auto text-[rgba(204,232,225,0.2)] mb-4" />
            <p className="text-[rgba(204,232,225,0.4)]">Нет данных о показателях за период лечения</p>
            <p className="text-sm text-[rgba(204,232,225,0.3)] mt-2">
              Импортируйте документы с анализами через Telegram или веб-интерфейс
            </p>
          </CardContent>
        </Card>
      )}
    </main>
  )
}
