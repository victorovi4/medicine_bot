import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPrismaClient } from '@/lib/db'
import { isTestModeServerComponent } from '@/lib/test-mode'
import { PatientHeader } from '@/components/PatientHeader'
import { DocumentActions } from '@/components/DocumentActions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Calendar, User, Building, FileText, Download, Sparkles, ClipboardList, CheckCircle2 } from 'lucide-react'

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
  })
  
  if (!document) {
    notFound()
  }
  
  const formattedDate = new Date(document.date).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  
  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <PatientHeader />
      
      <div className="flex items-center justify-between mb-6">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Назад к истории
          </Button>
        </Link>
        
        <DocumentActions documentId={document.id} documentTitle={document.title} />
      </div>
      
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline">{document.type}</Badge>
                {document.specialty && (
                  <Badge variant="secondary">{document.specialty}</Badge>
                )}
              </div>
              <CardTitle className="text-2xl">{document.title}</CardTitle>
            </div>
            <div className="flex items-center gap-1 text-gray-500">
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
                <User className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Врач</p>
                  <p className="font-medium">{document.doctor}</p>
                </div>
              </div>
            )}
            {document.clinic && (
              <div className="flex items-center gap-2">
                <Building className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Учреждение</p>
                  <p className="font-medium">{document.clinic}</p>
                </div>
              </div>
            )}
          </div>
          
          {/* Заключение врача (дословное) */}
          {document.conclusion && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
              <h3 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Заключение врача
              </h3>
              <p className="text-amber-900 whitespace-pre-wrap">{document.conclusion}</p>
            </div>
          )}
          
          {/* Рекомендации */}
          {document.recommendations && document.recommendations.length > 0 && (
            <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
              <h3 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                Рекомендации
              </h3>
              <ul className="space-y-2">
                {document.recommendations.map((rec: string, index: number) => (
                  <li key={index} className="flex items-start gap-2 text-green-800">
                    <span className="bg-green-200 text-green-800 rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">
                      {index + 1}
                    </span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* AI-резюме */}
          {document.summary && (
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
              <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                AI-резюме
              </h3>
              <p className="text-blue-800">{document.summary}</p>
            </div>
          )}
          
          {/* Полный текст (опционально) */}
          {document.content && (
            <div>
              <h3 className="font-semibold mb-2">Полный текст</h3>
              <div className="prose prose-sm max-w-none">
                <p className="whitespace-pre-wrap text-gray-700">{document.content}</p>
              </div>
            </div>
          )}
          
          {/* Ключевые показатели */}
          {document.keyValues && Object.keys(document.keyValues as object).length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Ключевые показатели</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(document.keyValues as Record<string, string>).map(
                  ([key, value]) => (
                    <div key={key} className="bg-gray-50 p-3 rounded">
                      <p className="text-sm text-gray-500">{key}</p>
                      <p className="font-semibold">{value}</p>
                    </div>
                  )
                )}
              </div>
            </div>
          )}
          
          {/* Теги */}
          {document.tags && document.tags.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Теги</h3>
              <div className="flex flex-wrap gap-2">
                {document.tags.map((tag: string) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {/* Файл */}
          {document.fileUrl && (
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">Прикреплённый файл</h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-gray-600">
                  <FileText className="h-5 w-5" />
                  <span>{document.fileName}</span>
                </div>
                <a href={document.fileUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm">
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
                    className="max-w-full h-auto rounded-lg border"
                  />
                </div>
              )}
              
              {/* Превью для PDF */}
              {document.fileType === 'application/pdf' && (
                <div className="mt-4">
                  <iframe
                    src={document.fileUrl}
                    className="w-full h-[600px] rounded-lg border"
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
