import Link from 'next/link'
import { getPrismaClient } from '@/lib/db'
import { isTestModeServerComponent } from '@/lib/test-mode'
import { PatientHeader } from '@/components/PatientHeader'
import { CategoryFilter } from '@/components/CategoryFilter'
import { Button } from '@/components/ui/button'
import { Plus, FileText, Activity } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const testMode = await isTestModeServerComponent()
  const prisma = getPrismaClient({ testMode })
  const documents = await prisma.document.findMany({
    orderBy: { date: 'desc' },
    select: {
      id: true,
      date: true,
      category: true,
      subtype: true,
      title: true,
      doctor: true,
      summary: true,
      fileName: true,
    },
  })
  
  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <PatientHeader />
      
      {/* Заголовок и кнопки — адаптивно для мобильных */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h2 className="text-xl font-semibold">История болезни</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/metrics">
            <Button variant="outline" size="sm" className="text-xs sm:text-sm">
              <Activity className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Показатели</span>
            </Button>
          </Link>
          <Link href="/extract">
            <Button variant="outline" size="sm" className="text-xs sm:text-sm">
              <FileText className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Выписка 027/у</span>
            </Button>
          </Link>
          <Link href="/add">
            <Button size="sm" className="text-xs sm:text-sm">
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Добавить</span>
            </Button>
          </Link>
        </div>
      </div>
      
      <CategoryFilter documents={documents} />
    </main>
  )
}
