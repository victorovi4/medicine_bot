import Link from 'next/link'
import { PatientHeader } from '@/components/PatientHeader'
import { DocumentForm } from '@/components/DocumentForm'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export default function AddDocumentPage() {
  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <PatientHeader />
      
      <div className="mb-6">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Назад к истории
          </Button>
        </Link>
      </div>
      
      <h2 className="text-xl font-semibold mb-6">Добавить документ</h2>
      
      <DocumentForm />
    </main>
  )
}
