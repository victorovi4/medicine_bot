'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PatientHeader } from '@/components/PatientHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  ArrowLeft
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
}

export default function ExtractPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [extract, setExtract] = useState<ExtractData | null>(null)
  const [copied, setCopied] = useState(false)
  
  // По умолчанию: последний год
  const today = new Date()
  const yearAgo = new Date(today)
  yearAgo.setFullYear(yearAgo.getFullYear() - 1)
  
  const [fromDate, setFromDate] = useState(yearAgo.toISOString().split('T')[0])
  const [toDate, setToDate] = useState(today.toISOString().split('T')[0])
  
  const generateExtract = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromDate, toDate }),
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Ошибка генерации')
      }
      
      const data = await response.json()
      setExtract(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка')
    } finally {
      setLoading(false)
    }
  }
  
  const copyToClipboard = () => {
    if (!extract) return
    
    const text = formatExtractAsText(extract)
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  
  const downloadPdf = () => {
    // Открываем страницу печати, которую можно сохранить как PDF
    window.print()
  }
  
  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="print:hidden">
        <PatientHeader />
      </div>
      
      <div className="mb-6 flex items-center justify-between print:hidden">
        <div>
          <h2 className="text-xl font-semibold">Выписка из истории болезни</h2>
          <p className="text-gray-500 text-sm">Форма 027/у</p>
        </div>
        <Link href="/">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            К истории
          </Button>
        </Link>
      </div>
      
      {/* Форма выбора периода */}
      <Card className="mb-6 print:hidden">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="fromDate">Период с</Label>
              <Input
                id="fromDate"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="toDate">по</Label>
              <Input
                id="toDate"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-40"
              />
            </div>
            <Button onClick={generateExtract} disabled={loading}>
              {loading ? (
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
          </div>
          
          {error && (
            <p className="text-red-600 mt-4">{error}</p>
          )}
        </CardContent>
      </Card>
      
      {/* Выписка */}
      {extract && (
        <div className="space-y-4">
          {/* Кнопки действий */}
          <div className="flex gap-2 print:hidden">
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
                  <p className="text-sm text-gray-500">Период выписки</p>
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
              
              {/* Лечение */}
              <Section
                icon={<Pill className="h-5 w-5" />}
                title="Проведённое лечение"
              >
                <p className="whitespace-pre-wrap">{extract.treatment}</p>
              </Section>
              
              {/* Динамика */}
              <Section
                icon={<TrendingUp className="h-5 w-5" />}
                title="Динамика состояния"
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

// Форматирование в текст для копирования
function formatExtractAsText(extract: ExtractData): string {
  return `
ВЫПИСКА ИЗ МЕДИЦИНСКОЙ КАРТЫ АМБУЛАТОРНОГО БОЛЬНОГО
Форма № 027/у

Пациент: ${extract.patient.fullName}
Дата рождения: ${extract.patient.birthDate} (${extract.patient.age} лет)
Период: ${extract.period.from} — ${extract.period.to}

ДИАГНОЗ
${extract.diagnosis.main}
${extract.diagnosis.secondary.length > 0 ? 'Сопутствующие: ' + extract.diagnosis.secondary.join('; ') : ''}

АНАМНЕЗ ЗАБОЛЕВАНИЯ
${extract.anamnesis}

ДИАГНОСТИЧЕСКИЕ ИССЛЕДОВАНИЯ
${extract.diagnosticStudies}

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
`.trim()
}
