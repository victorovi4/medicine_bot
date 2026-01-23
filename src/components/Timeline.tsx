import { DocumentCard } from './DocumentCard'

interface Document {
  id: string
  date: Date
  category: string
  subtype: string
  title: string
  doctor?: string | null
  clinic?: string | null
  summary?: string | null
  tags?: string[]
  fileUrl?: string | null
}

interface TimelineProps {
  documents: Document[]
}

export function Timeline({ documents }: TimelineProps) {
  // Группируем документы по месяцам
  const groupedByMonth = documents.reduce((acc, doc) => {
    const date = new Date(doc.date)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const label = date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
    
    if (!acc[key]) {
      acc[key] = { label, documents: [] }
    }
    acc[key].documents.push(doc)
    return acc
  }, {} as Record<string, { label: string; documents: Document[] }>)
  
  const sortedMonths = Object.keys(groupedByMonth).sort().reverse()
  
  if (documents.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg">Документов пока нет</p>
        <p className="text-sm mt-2">Добавьте первый документ, нажав кнопку выше</p>
      </div>
    )
  }
  
  return (
    <div className="space-y-8">
      {sortedMonths.map((monthKey) => {
        const { label, documents: monthDocs } = groupedByMonth[monthKey]
        return (
          <div key={monthKey}>
            <h2 className="text-lg font-semibold text-gray-700 mb-4 capitalize">
              {label}
            </h2>
            <div className="space-y-4">
              {monthDocs.map((doc) => (
                <DocumentCard key={doc.id} {...doc} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
