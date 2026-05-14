import Link from 'next/link'
import { getPrismaClient } from '@/lib/db'
import { isTestModeServerComponent } from '@/lib/test-mode'
import { PatientHeader } from '@/components/PatientHeader'
import { CategoryFilter, TimelineItem } from '@/components/CategoryFilter'
import { Button } from '@/components/ui/button'
import { Plus, FileText, Activity } from 'lucide-react'
import { getVitalSignConfig } from '@/lib/diary'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const testMode = await isTestModeServerComponent()
  const prisma = getPrismaClient({ testMode })

  const [documents, symptoms, vitals, medications] = await Promise.all([
    prisma.document.findMany({
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
    }),
    prisma.symptom.findMany({ orderBy: { datetime: 'desc' } }),
    prisma.vitalSign.findMany({ orderBy: { datetime: 'desc' } }),
    prisma.medication.findMany({ orderBy: { startDate: 'desc' } }),
  ])

  const timelineItems: TimelineItem[] = [
    ...documents.map(doc => ({
      id: doc.id,
      date: doc.date,
      type: 'document' as const,
      category: doc.category,
      subtype: doc.subtype,
      title: doc.title,
      doctor: doc.doctor,
      summary: doc.summary,
      fileName: doc.fileName,
    })),
    ...symptoms.map(s => ({
      id: s.id,
      date: s.datetime,
      type: 'symptom' as const,
      title: s.name,
      diaryData: {
        intensity: s.intensity,
        duration: s.duration,
        notes: s.notes,
      },
    })),
    ...vitals.map(v => {
      const config = getVitalSignConfig(v.type)
      return {
        id: v.id,
        date: v.datetime,
        type: 'vital' as const,
        subtype: v.type,
        title: config?.name || v.type,
        diaryData: {
          value: v.value,
          value2: v.value2,
          unit: v.unit,
          notes: v.notes,
        },
      }
    }),
    ...medications.map(m => ({
      id: m.id,
      date: m.startDate,
      type: 'medication' as const,
      title: m.name,
      diaryData: {
        dosage: m.dosage,
        frequency: m.frequency,
        isActive: m.isActive,
        notes: m.notes,
      },
    })),
  ]

  timelineItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl bg-transparent">
      <PatientHeader />

      {/* Заголовок и кнопки — адаптивно для мобильных */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h2 className="text-xl font-semibold text-[#cce8e1]">История болезни</h2>
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
          <Link href="/add" className="inline-flex items-center gap-2 rounded-lg bg-[#00d2aa] px-4 py-2 text-sm font-semibold text-[#030b14] hover:bg-[#00f0c6] transition-colors">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Добавить</span>
          </Link>
        </div>
      </div>

      <CategoryFilter items={timelineItems} />
    </main>
  )
}
