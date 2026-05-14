import Link from 'next/link'
import { FileText } from 'lucide-react'
import { getCategoryLabel, getSubtypeLabel } from '@/lib/types'

interface DocumentCardProps {
  id: string
  date: Date
  category: string
  subtype: string
  title: string
  doctor?: string | null
  specialty?: string | null
  clinic?: string | null
  summary?: string | null
  tags?: string[]
  fileUrl?: string | null
  fileName?: string | null
}

const CATEGORY_STYLES: Record<string, string> = {
  заключения: 'bg-[rgba(180,0,255,0.1)] text-[#c084fc] border-[rgba(180,0,255,0.25)]',
  анализы:    'bg-[rgba(0,210,170,0.1)] text-[#00d2aa] border-[rgba(0,210,170,0.25)]',
  исследования: 'bg-[rgba(59,130,246,0.1)] text-[#93c5fd] border-[rgba(59,130,246,0.25)]',
  другое:     'bg-[#0a1525] text-[rgba(204,232,225,0.5)] border-[rgba(0,210,170,0.09)]',
}

export function DocumentCard({
  id, date, category, subtype, title,
  doctor, specialty, clinic, summary, fileUrl,
}: DocumentCardProps) {
  const docDate = new Date(date)
  const formatted = docDate.toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  const isToday = docDate.toDateString() === new Date().toDateString()
  const categoryStyle = CATEGORY_STYLES[category] ?? CATEGORY_STYLES['другое']

  return (
    <Link href={`/documents/${id}`}>
      <div className="group rounded-xl border border-[rgba(0,210,170,0.09)] bg-[#060f1c] p-4 transition-all duration-200 hover:border-[rgba(0,210,170,0.28)] hover:bg-[#0a1525] cursor-pointer">
        {/* Top row — badges + date */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex flex-wrap gap-1.5">
            <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${categoryStyle}`}>
              {getCategoryLabel(category)}
            </span>
            <span className="inline-flex rounded-md border border-[rgba(0,210,170,0.09)] bg-[#0a1525] px-2 py-0.5 text-xs text-[rgba(204,232,225,0.45)]">
              {getSubtypeLabel(subtype)}
            </span>
            {fileUrl && <FileText className="h-3.5 w-3.5 text-[rgba(204,232,225,0.3)] mt-0.5" />}
          </div>
          <span className={`font-[var(--font-geist-mono)] text-xs whitespace-nowrap ${isToday ? 'text-[#f5a623]' : 'text-[rgba(204,232,225,0.35)]'}`}>
            {formatted}{isToday && ' ⚠'}
          </span>
        </div>

        {/* Title */}
        <p className="text-sm font-semibold text-[rgba(204,232,225,0.9)] mb-1.5 group-hover:text-[#cce8e1]">
          {title}
        </p>

        {/* Meta */}
        {(doctor || clinic) && (
          <p className="font-[var(--font-geist-mono)] text-[10px] text-[rgba(204,232,225,0.35)]">
            {[doctor, specialty, clinic].filter(Boolean).join(' · ')}
          </p>
        )}

        {/* Summary */}
        {summary && (
          <p className="mt-1.5 text-xs text-[rgba(204,232,225,0.45)] line-clamp-2">
            {summary}
          </p>
        )}
      </div>
    </Link>
  )
}
