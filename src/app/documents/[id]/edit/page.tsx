import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPrismaClient } from '@/lib/db'
import { isTestModeServerComponent } from '@/lib/test-mode'
import { PatientHeader } from '@/components/PatientHeader'
import { DocumentForm } from '@/components/DocumentForm'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

/**
 * Страница редактирования документа.
 */
export default async function EditDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const prisma = getPrismaClient({ testMode: isTestModeServerComponent() })
  const document = await prisma.document.findUnique({
    where: { id },
  })

  if (!document) {
    notFound()
  }

  // Преобразуем документ в формат для формы
  const documentData = {
    id: document.id,
    date: document.date.toISOString(),
    type: document.type,
    title: document.title,
    doctor: document.doctor,
    specialty: document.specialty,
    clinic: document.clinic,
    summary: document.summary,
    content: document.content,
    tags: document.tags,
    keyValues: document.keyValues as Record<string, string> | null,
    fileUrl: document.fileUrl,
    fileName: document.fileName,
    fileType: document.fileType,
  }

  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <PatientHeader />

      <div className="mb-6">
        <Link href={`/documents/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Назад к документу
          </Button>
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">Редактирование документа</h1>

      <DocumentForm initialData={documentData} mode="edit" />
    </main>
  )
}
