'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { PatientHeader } from '@/components/PatientHeader'
import { MetricsGrid } from '@/components/MetricsChart'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Loader2, 
  FileText, 
  Download, 
  Copy, 
  Check,
  Calendar,
  Stethoscope,
  FlaskConical,
  Pill,
  TrendingUp,
  Heart,
  ClipboardList,
  ArrowLeft,
  RefreshCw,
  Clock,
  Activity
} from 'lucide-react'

interface ExtractData {
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
  needsGeneration?: boolean
}

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

interface MetricsResponse {
  period: { from: string; to: string }
  metrics: MetricSummary[]
}

export default function ExtractPage() {
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [extract, setExtract] = useState<ExtractData | null>(null)
  const [metrics, setMetrics] = useState<MetricSummary[]>([])
  const [copied, setCopied] = useState(false)
  
  // Загружаем кэшированную выписку и метрики при открытии
  useEffect(() => {
    loadData()
  }, [])
  
  const loadData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Загружаем выписку и метрики параллельно
      const [extractRes, metricsRes] = await Promise.all([
        fetch('/api/extract'),
        fetch('/api/metrics'),
      ])
      
      const extractData = await extractRes.json()
      const metricsData: MetricsResponse = await metricsRes.json()
      
      if (extractData.needsGeneration) {
        setExtract(null)
      } else if (extractData.error) {
        setError(extractData.error)
      } else {
        setExtract(extractData)
      }
      
      if (metricsData.metrics) {
        setMetrics(metricsData.metrics)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }
  
  const generateExtract = async (forceRegenerate = false) => {
    setGenerating(true)
    setError(null)
    
    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceRegenerate }),
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Ошибка генерации')
      }
      
      const data = await response.json()
      setExtract(data)
      
      // Также перезагружаем метрики — они могли измениться
      const metricsRes = await fetch('/api/metrics')
      const metricsData: MetricsResponse = await metricsRes.json()
      if (metricsData.metrics) {
        setMetrics(metricsData.metrics)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка')
    } finally {
      setGenerating(false)
    }
  }
  
  const copyToClipboard = () => {
    if (!extract) return
    
    const text = formatExtractAsText(extract, metrics)
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  
  const downloadPdf = () => {
    window.print()
  }
  
  if (loading) {
    return (
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <PatientHeader />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-3 text-gray-600">Загрузка выписки...</span>
        </div>
      </main>
    )
  }
  
  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="print:hidden">
        <PatientHeader />
      </div>
      
      <div className="mb-6 flex items-center justify-between print:hidden">
        <div>
          <h2 className="text-xl font-semibold">Выписка из истории болезни</h2>
          <p className="text-gray-500 text-sm">Форма 027/у — текущий период лечения</p>
        </div>
        <Link href="/">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            К истории
          </Button>
        </Link>
      </div>
      
      {error && (
        <Card className="mb-6 border-red-200 bg-red-50 print:hidden">
          <CardContent className="pt-6">
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}
      
      {/* Если выписки нет — предлагаем сгенерировать */}
      {!extract && !error && (
        <Card className="mb-6 print:hidden">
          <CardContent className="pt-6 text-center">
            <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium mb-2">Выписка ещё не сгенерирована</h3>
            <p className="text-gray-500 mb-4">
              Нажмите кнопку, чтобы создать выписку за период лечения
            </p>
            <Button onClick={() => generateExtract()} disabled={generating}>
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Генерация...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Сгенерировать выписку
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
      
      {/* Выписка */}
      {extract && (
        <div className="space-y-4">
          {/* Кнопки действий */}
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="outline" onClick={downloadPdf}>
              <Download className="h-4 w-4 mr-2" />
              Скачать PDF
            </Button>
            <Button variant="outline" onClick={copyToClipboard}>
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Скопировано!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Копировать текст
                </>
              )}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => generateExtract(true)}
              disabled={generating}
            >
              {generating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Обновить
            </Button>
            
            {/* Информация о кэше */}
            {extract.cached && extract.generatedAt && (
              <div className="flex items-center text-sm text-gray-500 ml-auto">
                <Clock className="h-4 w-4 mr-1" />
                Обновлено: {new Date(extract.generatedAt).toLocaleString('ru-RU')}
              </div>
            )}
          </div>
          
          {/* Документ выписки */}
          <Card className="print:shadow-none print:border-none" id="extract-document">
            <CardHeader className="text-center border-b">
              <p className="text-sm text-gray-500">Медицинская документация</p>
              <CardTitle className="text-xl">
                ВЫПИСКА ИЗ МЕДИЦИНСКОЙ КАРТЫ<br />
                АМБУЛАТОРНОГО БОЛЬНОГО
              </CardTitle>
              <p className="text-sm text-gray-500">Форма № 027/у</p>
            </CardHeader>
            
            <CardContent className="pt-6 space-y-6">
              {/* Данные пациента */}
              <div className="grid grid-cols-2 gap-4 pb-4 border-b">
                <div>
                  <p className="text-sm text-gray-500">ФИО пациента</p>
                  <p className="font-semibold">{extract.patient.fullName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Дата рождения</p>
                  <p className="font-semibold">{extract.patient.birthDate} ({extract.patient.age} лет)</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Период лечения</p>
                  <p className="font-semibold">{extract.period.from} — {extract.period.to}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Документов в периоде</p>
                  <p className="font-semibold">{extract.documentsCount}</p>
                </div>
              </div>
              
              {/* Диагноз */}
              <Section
                icon={<Stethoscope className="h-5 w-5" />}
                title="Диагноз"
              >
                <p className="font-semibold">{extract.diagnosis.main}</p>
                {extract.diagnosis.secondary.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm text-gray-500">Сопутствующие:</p>
                    <ul className="list-disc list-inside">
                      {extract.diagnosis.secondary.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </Section>
              
              {/* Анамнез */}
              <Section
                icon={<Calendar className="h-5 w-5" />}
                title="Анамнез заболевания"
              >
                <p className="whitespace-pre-wrap">{extract.anamnesis}</p>
              </Section>
              
              {/* Исследования */}
              <Section
                icon={<FlaskConical className="h-5 w-5" />}
                title="Диагностические исследования"
              >
                <p className="whitespace-pre-wrap">{extract.diagnosticStudies}</p>
              </Section>
              
              {/* Динамика показателей — ГРАФИКИ */}
              <Section
                icon={<Activity className="h-5 w-5" />}
                title="Динамика ключевых показателей"
              >
                {metrics.length > 0 ? (
                  <div className="space-y-4">
                    {/* Таблица сводки */}
                    <MetricsSummaryTable metrics={metrics} />
                    
                    {/* Графики */}
                    <MetricsGrid metrics={metrics} compact />
                  </div>
                ) : (
                  <p className="text-gray-500">
                    Данные о динамике показателей отсутствуют.
                  </p>
                )}
              </Section>
              
              {/* Лечение */}
              <Section
                icon={<Pill className="h-5 w-5" />}
                title="Проведённое лечение"
              >
                <p className="whitespace-pre-wrap">{extract.treatment}</p>
              </Section>
              
              {/* Динамика (AI) */}
              <Section
                icon={<TrendingUp className="h-5 w-5" />}
                title="Описание динамики состояния"
              >
                <p className="whitespace-pre-wrap">{extract.dynamics}</p>
              </Section>
              
              {/* Текущее состояние */}
              <Section
                icon={<Heart className="h-5 w-5" />}
                title="Текущее состояние"
              >
                <p className="whitespace-pre-wrap">{extract.currentState}</p>
              </Section>
              
              {/* Рекомендации */}
              <Section
                icon={<ClipboardList className="h-5 w-5" />}
                title="Рекомендации"
              >
                <p className="whitespace-pre-wrap">{extract.recommendations}</p>
              </Section>
              
              {/* Подпись */}
              <div className="pt-6 border-t text-sm text-gray-500">
                <p>Выписка сгенерирована: {new Date(extract.generatedAt).toLocaleString('ru-RU')}</p>
                <p className="mt-2">
                  Данный документ сформирован автоматически на основе {extract.documentsCount} медицинских документов
                  из электронной медицинской карты пациента.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  )
}

// Компонент секции
function Section({ 
  icon, 
  title, 
  children 
}: { 
  icon: React.ReactNode
  title: string
  children: React.ReactNode 
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-blue-600">{icon}</span>
        <h3 className="font-semibold text-lg">{title}</h3>
      </div>
      <div className="pl-7 text-gray-700">
        {children}
      </div>
    </div>
  )
}

// Таблица сводки по показателям
function MetricsSummaryTable({ metrics }: { metrics: MetricSummary[] }) {
  const metricsWithData = metrics.filter(m => m.dataPoints.length > 0)
  
  if (metricsWithData.length === 0) return null
  
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 pr-4">Показатель</th>
            <th className="text-right py-2 px-2">Начало</th>
            <th className="text-right py-2 px-2">Конец</th>
            <th className="text-right py-2 px-2">Изменение</th>
            <th className="text-left py-2 pl-2">Статус</th>
          </tr>
        </thead>
        <tbody>
          {metricsWithData.map((m) => (
            <tr key={m.name} className="border-b">
              <td className="py-2 pr-4 font-medium">{m.name}</td>
              <td className="py-2 px-2 text-right">
                {m.firstValue !== null ? `${m.firstValue} ${m.unit}` : '—'}
              </td>
              <td className="py-2 px-2 text-right">
                {m.lastValue !== null ? `${m.lastValue} ${m.unit}` : '—'}
              </td>
              <td className="py-2 px-2 text-right">
                {m.changePercent !== 0 ? (
                  <span className={
                    m.name.includes('ПСА') 
                      ? (m.changeDirection === 'up' ? 'text-red-600' : 'text-green-600')
                      : ''
                  }>
                    {m.changeDirection === 'up' ? '↑' : m.changeDirection === 'down' ? '↓' : '→'}
                    {' '}
                    {m.changePercent > 0 ? '+' : ''}{m.changePercent}%
                  </span>
                ) : '→ 0%'}
              </td>
              <td className="py-2 pl-2">
                <StatusBadge status={m.lastStatus} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    normal: 'bg-green-100 text-green-800',
    low: 'bg-blue-100 text-blue-800',
    high: 'bg-orange-100 text-orange-800',
    critical: 'bg-red-100 text-red-800',
    unknown: 'bg-gray-100 text-gray-600',
  }
  
  const labels: Record<string, string> = {
    normal: 'Норма',
    low: 'Ниже нормы',
    high: 'Выше нормы',
    critical: 'Критично',
    unknown: '—',
  }
  
  return (
    <span className={`px-2 py-0.5 rounded text-xs ${styles[status] || styles.unknown}`}>
      {labels[status] || status}
    </span>
  )
}

// Форматирование в текст для копирования
function formatExtractAsText(extract: ExtractData, metrics: MetricSummary[]): string {
  let text = `
ВЫПИСКА ИЗ МЕДИЦИНСКОЙ КАРТЫ АМБУЛАТОРНОГО БОЛЬНОГО
Форма № 027/у

Пациент: ${extract.patient.fullName}
Дата рождения: ${extract.patient.birthDate} (${extract.patient.age} лет)
Период лечения: ${extract.period.from} — ${extract.period.to}

ДИАГНОЗ
${extract.diagnosis.main}
${extract.diagnosis.secondary.length > 0 ? 'Сопутствующие: ' + extract.diagnosis.secondary.join('; ') : ''}

АНАМНЕЗ ЗАБОЛЕВАНИЯ
${extract.anamnesis}

ДИАГНОСТИЧЕСКИЕ ИССЛЕДОВАНИЯ
${extract.diagnosticStudies}

ДИНАМИКА КЛЮЧЕВЫХ ПОКАЗАТЕЛЕЙ
`

  const metricsWithData = metrics.filter(m => m.dataPoints.length > 0)
  if (metricsWithData.length > 0) {
    text += metricsWithData.map(m => {
      const arrow = m.changeDirection === 'up' ? '↑' : m.changeDirection === 'down' ? '↓' : '→'
      return `${m.name}: ${m.firstValue} → ${m.lastValue} ${m.unit} (${arrow} ${m.changePercent > 0 ? '+' : ''}${m.changePercent}%)`
    }).join('\n')
    text += '\n'
  } else {
    text += 'Данные отсутствуют\n'
  }

  text += `
ПРОВЕДЁННОЕ ЛЕЧЕНИЕ
${extract.treatment}

ДИНАМИКА СОСТОЯНИЯ
${extract.dynamics}

ТЕКУЩЕЕ СОСТОЯНИЕ
${extract.currentState}

РЕКОМЕНДАЦИИ
${extract.recommendations}

---
Выписка сгенерирована: ${new Date(extract.generatedAt).toLocaleString('ru-RU')}
Документов в периоде: ${extract.documentsCount}
`

  return text.trim()
}
