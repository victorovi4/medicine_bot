'use client'

import {
  LineChart,
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
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

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

interface MetricsChartProps {
  metric: MetricSummary
  compact?: boolean
}

export function MetricsChart({ metric, compact = false }: MetricsChartProps) {
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
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
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
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
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
        <MetricsChart key={metric.name} metric={metric} compact={compact} />
      ))}
    </div>
  )
}
