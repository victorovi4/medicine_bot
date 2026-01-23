'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DocumentCard } from '@/components/DocumentCard'
import { DOCUMENT_CATEGORIES, DocumentCategory } from '@/lib/types'

interface Document {
  id: string
  date: Date
  category: string
  subtype: string
  title: string
  doctor: string | null
  summary: string | null
}

interface CategoryFilterProps {
  documents: Document[]
}

export function CategoryFilter({ documents }: CategoryFilterProps) {
  const [activeCategory, setActiveCategory] = useState<DocumentCategory | 'all'>('all')
  
  const filteredDocuments = activeCategory === 'all' 
    ? documents 
    : documents.filter(doc => doc.category === activeCategory)
  
  // Подсчёт документов по категориям
  const counts = documents.reduce((acc, doc) => {
    acc[doc.category] = (acc[doc.category] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  
  return (
    <div>
      {/* Фильтры */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Button
          variant={activeCategory === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveCategory('all')}
        >
          Все ({documents.length})
        </Button>
        {DOCUMENT_CATEGORIES.map((cat) => (
          <Button
            key={cat.value}
            variant={activeCategory === cat.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveCategory(cat.value)}
            disabled={!counts[cat.value]}
            className={!counts[cat.value] ? 'opacity-50' : ''}
          >
            {cat.label} {counts[cat.value] ? `(${counts[cat.value]})` : ''}
          </Button>
        ))}
      </div>
      
      {/* Список документов */}
      {filteredDocuments.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>Документов в этой категории пока нет</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredDocuments.map((doc) => (
            <DocumentCard
              key={doc.id}
              id={doc.id}
              date={doc.date}
              category={doc.category}
              subtype={doc.subtype}
              title={doc.title}
              doctor={doc.doctor}
              summary={doc.summary}
            />
          ))}
        </div>
      )}
    </div>
  )
}
