'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  ReferenceArea,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TrendingUp, TrendingDown, Minus, Plus, Trash2 } from 'lucide-react'
import { AddEventModal } from './AddEventModal'

interface DataPoint {
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
  dataPoints: DataPoint[]
  firstValue: number | null
  lastValue: number | null
  minValue: number | null
  maxValue: number | null
  changePercent: number
  changeDirection: 'up' | 'down' | 'stable'
  lastStatus: 'normal' | 'low' | 'high' | 'critical' | 'unknown'
}

interface MetricEvent {
  id: string
  metricName: string
  date: string
  eventType: string
  label: string
  color: string
  endDate?: string | null
  notes?: string | null
}

// Иконки для типов событий
const EVENT_ICONS: Record<string, string> = {
  hemotransfusion: '💉',
  hormone_injection: '💊',
  surgery: '🔪',
  hospitalization: '🏥',
  medication_start: '💊',
  medication_end: '⏹️',
  manipulation: '🩹',
  puncture: '🪡',
  other: '📌',
}

// Цвета для типов процедур
const PROCEDURE_COLORS: Record<string, string> = {
  hemotransfusion: '#9333ea', // фиолетовый
  surgery: '#ef4444',         // красный
  manipulation: '#f59e0b',    // жёлтый
  puncture: '#06b6d4',        // циановый
}

// Названия типов процедур
const PROCEDURE_LABELS: Record<string, string> = {
  hemotransfusion: 'Гемотрансфузия',
  surgery: 'Операция',
  manipulation: 'Манипуляция',
  puncture: 'Пункция',
}

interface ProcedureMarker {
  date: string
  type: string
  name: string
  beforeValue?: number
  afterValue?: number
  unit?: string
}

interface MetricsChartProps {
  metric: MetricSummary
  compact?: boolean
  showEventControls?: boolean
  procedures?: ProcedureMarker[]
}

export function MetricsChart({ metric, compact = false, showEventControls = true, procedures = [] }: MetricsChartProps) {
  const [events, setEvents] = useState<MetricEvent[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [loadingEvents, setLoadingEvents] = useState(false)
  
  // Загрузка событий
  const loadEvents = useCallback(async () => {
    if (compact) return // Не загружаем события в компактном режиме
    
    setLoadingEvents(true)
    try {
      const response = await fetch(`/api/metric-events?metricName=${encodeURIComponent(metric.name)}`)
      if (response.ok) {
        const data = await response.json()
        setEvents(data.events || [])
      }
    } catch (error) {
      console.error('Error loading events:', error)
    } finally {
      setLoadingEvents(false)
    }
  }, [metric.name, compact])
  
  useEffect(() => {
    loadEvents()
  }, [loadEvents])
  
  // Удаление события
  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('Удалить это событие?')) return
    
    try {
      const response = await fetch(`/api/metric-events/${eventId}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        loadEvents()
      }
    } catch (error) {
      console.error('Error deleting event:', error)
    }
  }
  if (metric.dataPoints.length === 0) {
    return (
      <Card className={compact ? 'print:break-inside-avoid' : ''}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>{metric.name}</span>
            <span className="text-sm text-gray-500 font-normal">Нет данных</span>
          </CardTitle>
        </CardHeader>
      </Card>
    )
  }

  // Подготовка данных для графика
  const chartData = metric.dataPoints.map((dp) => ({
    ...dp,
    dateFormatted: new Date(dp.date).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
    }),
    fullDate: new Date(dp.date).toLocaleDateString('ru-RU'),
  }))
  
  // Подготовка маркеров событий — привязка к ближайшим точкам
  const eventMarkers = events.map((event) => {
    const eventDate = new Date(event.date).getTime()
    
    // Находим ближайшую точку данных
    let closestIdx = 0
    let minDiff = Infinity
    
    chartData.forEach((point, idx) => {
      const diff = Math.abs(new Date(point.date).getTime() - eventDate)
      if (diff < minDiff) {
        minDiff = diff
        closestIdx = idx
      }
    })
    
    return {
      ...event,
      dateFormatted: chartData[closestIdx]?.dateFormatted || '',
      isVisible: minDiff < 30 * 24 * 60 * 60 * 1000, // 30 дней
    }
  }).filter(e => e.isVisible)

  // Подготовка маркеров процедур — привязка к ближайшим точкам
  const procedureMarkers = (procedures || []).map((proc) => {
    const procDate = new Date(proc.date).getTime()

    let closestIdx = 0
    let minDiff = Infinity

    chartData.forEach((point, idx) => {
      const diff = Math.abs(new Date(point.date).getTime() - procDate)
      if (diff < minDiff) {
        minDiff = diff
        closestIdx = idx
      }
    })

    return {
      ...proc,
      dateFormatted: chartData[closestIdx]?.dateFormatted || '',
      color: PROCEDURE_COLORS[proc.type] || '#6b7280',
      isVisible: minDiff < 30 * 24 * 60 * 60 * 1000,
    }
  }).filter(p => p.isVisible)

  // Определяем диапазон Y оси
  const allValues = metric.dataPoints.map((d) => d.value)
  const dataMin = Math.min(...allValues)
  const dataMax = Math.max(...allValues)

  // Включаем норму в диапазон для наглядности
  const yMin = Math.min(dataMin, metric.normalMin) * 0.9
  const yMax = Math.max(dataMax, metric.normalMax) * 1.1

  // Иконка тренда
  const TrendIcon =
    metric.changeDirection === 'up'
      ? TrendingUp
      : metric.changeDirection === 'down'
      ? TrendingDown
      : Minus

  // Цвет тренда (для ПСА рост — плохо, для гемоглобина зависит)
  const getTrendColor = () => {
    if (metric.changeDirection === 'stable') return 'text-gray-500'
    
    // Для ПСА: рост — плохо (красный), снижение — хорошо (зелёный)
    if (metric.name.includes('ПСА')) {
      return metric.changeDirection === 'up' ? 'text-red-500' : 'text-green-500'
    }
    
    // Для гемоглобина: низкий — плохо
    if (metric.name === 'Гемоглобин') {
      if (metric.lastStatus === 'low') return 'text-red-500'
      if (metric.lastStatus === 'high') return 'text-orange-500'
    }
    
    return 'text-gray-500'
  }

  // Статус badge
  const getStatusBadge = () => {
    switch (metric.lastStatus) {
      case 'normal':
        return <Badge className="bg-green-100 text-green-800">Норма</Badge>
      case 'low':
        return <Badge className="bg-blue-100 text-blue-800">Ниже нормы</Badge>
      case 'high':
        return <Badge className="bg-orange-100 text-orange-800">Выше нормы</Badge>
      case 'critical':
        return <Badge className="bg-red-100 text-red-800">Критично</Badge>
      default:
        return null
    }
  }

  const height = compact ? 150 : 200

  return (
    <>
    <Card className={compact ? 'print:break-inside-avoid' : ''}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
          <span>{metric.name}</span>
          <div className="flex items-center gap-2">
            {getStatusBadge()}
            {metric.lastValue !== null && (
              <span className="text-sm font-normal">
                {metric.lastValue} {metric.unit}
              </span>
            )}
            {metric.changePercent !== 0 && (
              <span className={`flex items-center text-sm ${getTrendColor()}`}>
                <TrendIcon className="h-4 w-4 mr-1" />
                {metric.changePercent > 0 ? '+' : ''}
                {metric.changePercent}%
              </span>
            )}
            {/* Кнопка добавления события */}
            {showEventControls && !compact && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 print:hidden"
                onClick={() => setShowAddModal(true)}
                title="Добавить событие"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardTitle>
        {!compact && metric.firstValue !== null && metric.lastValue !== null && (
          <p className="text-xs text-gray-500">
            {chartData[0]?.fullDate}: {metric.firstValue} {metric.unit} →{' '}
            {chartData[chartData.length - 1]?.fullDate}: {metric.lastValue} {metric.unit}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart
            data={chartData}
            margin={{ top: 20, right: 5, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            
            {/* Зона нормы */}
            <ReferenceArea
              y1={metric.normalMin}
              y2={metric.normalMax}
              fill="#22c55e"
              fillOpacity={0.1}
            />
            
            {/* Линии нормы */}
            <ReferenceLine
              y={metric.normalMax}
              stroke="#22c55e"
              strokeDasharray="5 5"
              label={{ value: 'Норма', position: 'right', fontSize: 10 }}
            />
            {metric.normalMin > 0 && (
              <ReferenceLine
                y={metric.normalMin}
                stroke="#22c55e"
                strokeDasharray="5 5"
              />
            )}
            
            {/* Критическое значение */}
            {metric.critical && (
              <ReferenceLine
                y={metric.critical}
                stroke="#ef4444"
                strokeDasharray="3 3"
                label={{ value: 'Критично', position: 'right', fontSize: 10 }}
              />
            )}
            
            <XAxis
              dataKey="dateFormatted"
              tick={{ fontSize: 10 }}
              tickMargin={5}
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: 10 }}
              width={40}
              tickFormatter={(v) => v.toFixed(1)}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload
                  return (
                    <div className="bg-white border rounded shadow-lg p-2 text-sm">
                      <p className="font-medium">{data.fullDate}</p>
                      <p style={{ color: metric.color }}>
                        {metric.name}: {data.value} {metric.unit}
                      </p>
                      <p className="text-gray-500 text-xs">{data.documentTitle}</p>
                    </div>
                  )
                }
                return null
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={metric.color}
              strokeWidth={2}
              dot={{ fill: metric.color, strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6 }}
            />
            
            {/* Маркеры событий (ручные — пунктирные) */}
            {eventMarkers.map((event) => (
              <ReferenceLine
                key={event.id}
                x={event.dateFormatted}
                stroke={event.color}
                strokeWidth={2}
                strokeDasharray="4 2"
                label={{
                  value: EVENT_ICONS[event.eventType] || '📌',
                  position: 'top',
                  fontSize: 14,
                }}
              />
            ))}

            {/* Маркеры процедур (из БД — сплошные) */}
            {procedureMarkers.map((proc, idx) => (
              <ReferenceLine
                key={`proc-${idx}`}
                x={proc.dateFormatted}
                stroke={proc.color}
                strokeWidth={2}
                label={{
                  value: EVENT_ICONS[proc.type] || '📌',
                  position: 'top',
                  fontSize: 14,
                }}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
        
        {/* Легенда событий */}
        {!compact && events.length > 0 && (
          <div className="mt-3 space-y-2 print:hidden">
            <p className="text-xs font-medium text-gray-500">События на графике:</p>
            <div className="flex flex-wrap gap-2">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-1 text-xs bg-gray-50 rounded-full px-2 py-1 group"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: event.color }}
                  />
                  <span>{EVENT_ICONS[event.eventType] || '📌'}</span>
                  <span>{new Date(event.date).toLocaleDateString('ru-RU')}</span>
                  <span className="text-gray-500">—</span>
                  <span>{event.label}</span>
                  <button
                    onClick={() => handleDeleteEvent(event.id)}
                    className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 ml-1"
                    title="Удалить"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Легенда процедур */}
        {!compact && procedureMarkers.length > 0 && (
          <div className="mt-3 space-y-2 print:hidden">
            <p className="text-xs font-medium text-gray-500">Процедуры:</p>
            <div className="flex flex-wrap gap-2">
              {procedureMarkers.map((proc, idx) => (
                <div
                  key={`proc-legend-${idx}`}
                  className="flex items-center gap-1 text-xs bg-gray-50 rounded-full px-2 py-1"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: proc.color }}
                  />
                  <span>{EVENT_ICONS[proc.type] || '📌'}</span>
                  <span>{new Date(proc.date).toLocaleDateString('ru-RU')}</span>
                  <span className="text-gray-500">—</span>
                  <span>{proc.name || PROCEDURE_LABELS[proc.type] || proc.type}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    
    {/* Модальное окно добавления события */}
    <AddEventModal
      metricName={metric.name}
      isOpen={showAddModal}
      onClose={() => setShowAddModal(false)}
      onEventAdded={loadEvents}
    />
    </>
  )
}

interface MetricsGridProps {
  metrics: MetricSummary[]
  compact?: boolean
}

export function MetricsGrid({ metrics, compact = false }: MetricsGridProps) {
  // Фильтруем метрики с данными
  const metricsWithData = metrics.filter((m) => m.dataPoints.length > 0)

  if (metricsWithData.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        Нет данных для отображения графиков.
        <br />
        Показатели будут извлекаться автоматически при добавлении документов.
      </div>
    )
  }

  return (
    <div className={`grid gap-4 ${compact ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
      {metricsWithData.map((metric) => (
        <MetricsChart 
          key={metric.name} 
          metric={metric} 
          compact={compact}
        />
      ))}
    </div>
  )
}
