import Link from 'next/link'
import { getPrismaClient } from '@/lib/db'
import { isTestModeServerComponent } from '@/lib/test-mode'
import { PatientHeader } from '@/components/PatientHeader'
import { CategoryFilter } from '@/components/CategoryFilter'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

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
      specialty: true,
      summary: true,
    },
  })
  
  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <PatientHeader />
      
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">История болезни</h2>
        <Link href="/add">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Добавить документ
          </Button>
        </Link>
      </div>
      
      <CategoryFilter documents={documents} />
    </main>
  )
}
