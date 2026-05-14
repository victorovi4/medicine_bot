import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPrismaClient } from '@/lib/db'
import { isTestModeServerComponent } from '@/lib/test-mode'
import { getCategoryLabel, getSubtypeLabel } from '@/lib/types'
import { parseValueWithUnit } from '@/lib/metrics'
import { hasGuidelineForPatient } from '@/lib/clinical-guidelines'
import { PatientHeader } from '@/components/PatientHeader'
import { DocumentActions } from '@/components/DocumentActions'
import { KrCheckCard } from '@/components/KrCheckCard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Calendar, User, Building, FileText, Download, Sparkles, ClipboardList, CheckCircle2, Syringe } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const testMode = await isTestModeServerComponent()
  const prisma = getPrismaClient({ testMode })
  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      procedures: {
        orderBy: { date: 'asc' },
      },
    },
  })
  
  if (!document) {
    notFound()
  }
  
  const formattedDate = new Date(document.date).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const showKrCheck = hasGuidelineForPatient()

  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <PatientHeader />
      
      <div className="flex items-center justify-between mb-6">
        <Link href="/">
          <Button variant="ghost" size="sm" className="text-[rgba(204,232,225,0.5)] hover:text-[rgba(204,232,225,0.8)]">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Назад к истории
          </Button>
        </Link>
        
        <DocumentActions documentId={document.id} documentTitle={document.title} />
      </div>
      
      <Card className="rounded-xl border border-[rgba(0,210,170,0.09)] bg-[#060f1c]">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge variant="outline" className="bg-[rgba(139,92,246,0.1)] text-[#c4b5fd] border-[rgba(139,92,246,0.2)]">
                  {getCategoryLabel(document.category)}
                </Badge>
                <Badge variant="outline" className="bg-[#0a1525] text-[rgba(204,232,225,0.6)] border-[rgba(0,210,170,0.15)]">
                  {getSubtypeLabel(document.subtype)}
                </Badge>
                {document.specialty && (
                  <Badge variant="secondary" className="bg-[#0a1525] text-[rgba(204,232,225,0.5)]">{document.specialty}</Badge>
                )}
              </div>
              <CardTitle className="text-2xl text-[#cce8e1]">{document.title}</CardTitle>
            </div>
            <div className="flex items-center gap-1 text-[rgba(204,232,225,0.4)]">
              <Calendar className="h-4 w-4" />
              {formattedDate}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Врач и клиника */}
          <div className="grid grid-cols-2 gap-4">
            {document.doctor && (
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-[rgba(204,232,225,0.3)]" />
                <div>
                  <p className="text-xs text-[rgba(204,232,225,0.4)] font-[var(--font-geist-mono)] uppercase tracking-wide">Врач</p>
                  <p className="text-sm text-[rgba(204,232,225,0.8)] font-medium">{document.doctor}</p>
                </div>
              </div>
            )}
            {document.clinic && (
              <div className="flex items-center gap-2">
                <Building className="h-5 w-5 text-[rgba(204,232,225,0.3)]" />
                <div>
                  <p className="text-xs text-[rgba(204,232,225,0.4)] font-[var(--font-geist-mono)] uppercase tracking-wide">Учреждение</p>
                  <p className="text-sm text-[rgba(204,232,225,0.8)] font-medium">{document.clinic}</p>
                </div>
              </div>
            )}
          </div>
          
          {/* Заключение врача (дословное) */}
          {document.conclusion && (
            <div className="bg-[rgba(245,166,35,0.05)] border border-[rgba(245,166,35,0.15)] p-4 rounded-lg">
              <h3 className="font-semibold text-[#f5a623] mb-2 flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Заключение врача
              </h3>
              <p className="text-[rgba(204,232,225,0.8)] whitespace-pre-wrap">{document.conclusion}</p>
            </div>
          )}

          {/* Проверка по клиническим рекомендациям */}
          {showKrCheck && (
            <div className="px-6 pb-4">
              <KrCheckCard documentId={document.id} hasGuideline={showKrCheck} />
            </div>
          )}

          {/* Рекомендации */}
          {document.recommendations && document.recommendations.length > 0 && (
            <div className="bg-[rgba(0,210,170,0.05)] border border-[rgba(0,210,170,0.15)] p-4 rounded-lg">
              <h3 className="font-semibold text-[#00d2aa] mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                Рекомендации
              </h3>
              <ul className="space-y-2">
                {document.recommendations.map((rec: string, index: number) => (
                  <li key={index} className="flex items-start gap-2 text-[rgba(204,232,225,0.8)]">
                    <span className="bg-[rgba(0,210,170,0.15)] text-[#00d2aa] rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">
                      {index + 1}
                    </span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Проведённые процедуры */}
          {document.procedures && document.procedures.length > 0 && (
            <div className="bg-[rgba(139,92,246,0.05)] border border-[rgba(139,92,246,0.15)] p-4 rounded-lg">
              <h3 className="font-semibold text-[#c4b5fd] mb-3 flex items-center gap-2">
                <Syringe className="h-5 w-5" />
                Проведённые процедуры
              </h3>
              <ul className="space-y-3">
                {document.procedures.map((proc) => {
                  const procDate = new Date(proc.date).toLocaleDateString('ru-RU')
                  const details = proc.details as Record<string, string> | null

                  return (
                    <li key={proc.id} className="flex items-start gap-3 text-[rgba(204,232,225,0.8)]">
                      <span className="bg-[rgba(139,92,246,0.15)] text-[#c4b5fd] rounded-full w-6 h-6 flex items-center justify-center text-sm flex-shrink-0 mt-0.5">
                        💉
                      </span>
                      <div>
                        <p className="font-medium">{proc.name}</p>
                        <p className="text-sm text-[rgba(204,232,225,0.5)]">
                          {procDate}
                          {proc.beforeValue !== null && proc.afterValue !== null && (
                            <span className="ml-2">
                              • {proc.beforeValue} → {proc.afterValue} {proc.unit}
                            </span>
                          )}
                        </p>
                        {details && (
                          <p className="text-sm text-[rgba(204,232,225,0.5)]">
                            {details.bloodType && `Группа: ${details.bloodType}`}
                            {details.volume && ` • Объём: ${details.volume}`}
                            {details.component && ` • ${details.component}`}
                          </p>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          
          {/* AI-резюме */}
          {document.summary && (
            <div className="bg-[rgba(59,130,246,0.05)] border border-[rgba(59,130,246,0.15)] p-4 rounded-lg">
              <h3 className="font-semibold text-[#93c5fd] mb-2 flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                AI-резюме
              </h3>
              <p className="text-[rgba(204,232,225,0.8)]">{document.summary}</p>
            </div>
          )}
          
          {/* Полный текст (опционально) */}
          {document.content && (
            <div>
              <h3 className="font-semibold mb-2 text-[#cce8e1]">Полный текст</h3>
              <div className="prose prose-sm max-w-none">
                <p className="whitespace-pre-wrap text-[rgba(204,232,225,0.7)]">{document.content}</p>
              </div>
            </div>
          )}
          
          {/* Ключевые показатели */}
          {document.keyValues && Object.keys(document.keyValues as object).length > 0 && (
            <div>
              <h3 className="font-semibold mb-2 text-[#cce8e1]">Ключевые показатели</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(document.keyValues as Record<string, string>).map(
                  ([key, value]) => {
                    const parsed = parseValueWithUnit(value)
                    // Показываем очищенное "значение единица" без норм из документа.
                    // Норма [< N] / [> N] / [min-max] из OCR часто содержит ошибки.
                    const display = parsed
                      ? `${parsed.value} ${parsed.unit}`.trim()
                      : value
                    return (
                      <div key={key} className="bg-[#0a1525] p-3 rounded border border-[rgba(0,210,170,0.06)]">
                        <p className="text-xs text-[rgba(204,232,225,0.4)] font-[var(--font-geist-mono)] uppercase tracking-wide">{key}</p>
                        <p className="font-semibold text-[rgba(204,232,225,0.9)]">{display}</p>
                      </div>
                    )
                  }
                )}
              </div>
            </div>
          )}
          
          {/* Теги */}
          {document.tags && document.tags.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2 text-[#cce8e1]">Теги</h3>
              <div className="flex flex-wrap gap-2">
                {document.tags.map((tag: string) => (
                  <Badge key={tag} variant="secondary" className="bg-[#0a1525] text-[rgba(204,232,225,0.6)] border-[rgba(0,210,170,0.12)]">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {/* Файл */}
          {document.fileUrl && (
            <div className="border-t border-[rgba(0,210,170,0.09)] pt-4">
              <h3 className="font-semibold mb-3 text-[#cce8e1]">Прикреплённый файл</h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-[rgba(204,232,225,0.6)]">
                  <FileText className="h-5 w-5" />
                  <span>{document.fileName}</span>
                </div>
                <a href={document.fileUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="border-[rgba(0,210,170,0.2)] text-[rgba(204,232,225,0.7)] hover:border-[rgba(0,210,170,0.4)]">
                    <Download className="h-4 w-4 mr-2" />
                    Открыть файл
                  </Button>
                </a>
              </div>

              {/* Превью для изображений */}
              {document.fileType?.startsWith('image/') && (
                <div className="mt-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={document.fileUrl}
                    alt={document.fileName || 'Document scan'}
                    className="max-w-full h-auto rounded-lg border border-[rgba(0,210,170,0.09)]"
                  />
                </div>
              )}

              {/* Превью для PDF */}
              {document.fileType === 'application/pdf' && (
                <div className="mt-4 rounded-lg border border-[rgba(0,210,170,0.09)] bg-[#0a1525] overflow-hidden">
                  <iframe
                    src={document.fileUrl}
                    className="w-full h-[600px]"
                    title={document.fileName || 'PDF document'}
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
