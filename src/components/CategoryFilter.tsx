'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DocumentCard } from '@/components/DocumentCard'
import { DiaryCard } from '@/components/DiaryCard'
import { SearchBar } from '@/components/SearchBar'
import { DOCUMENT_CATEGORIES, DocumentCategory } from '@/lib/types'

export interface TimelineItem {
  id: string
  date: Date
  type: 'document' | 'symptom' | 'vital' | 'medication'
  category?: string
  subtype?: string
  title: string
  doctor?: string | null
  summary?: string | null
  fileName?: string | null
  diaryData?: {
    intensity?: number | null
    duration?: string | null
    value?: number
    value2?: number | null
    unit?: string
    dosage?: string | null
    frequency?: string | null
    isActive?: boolean
    notes?: string | null
  }
}

type FilterCategory = DocumentCategory | 'all' | 'diary'

const DIARY_TYPES = new Set(['symptom', 'vital', 'medication'])

interface CategoryFilterProps {
  items: TimelineItem[]
}

export function CategoryFilter({ items }: CategoryFilterProps) {
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('all')
  const [isSearchActive, setIsSearchActive] = useState(false)

  const filteredItems = activeCategory === 'all'
    ? items
    : activeCategory === 'diary'
    ? items.filter(item => DIARY_TYPES.has(item.type))
    : items.filter(item => item.type === 'document' && item.category === activeCategory)

  // Count documents by category
  const counts = items.reduce((acc, item) => {
    if (item.type === 'document' && item.category) {
      acc[item.category] = (acc[item.category] || 0) + 1
    }
    return acc
  }, {} as Record<string, number>)

  const diaryCount = items.filter(item => DIARY_TYPES.has(item.type)).length

  return (
    <div>
      {/* Поиск */}
      <div className="mb-4">
        <SearchBar onSearchActive={setIsSearchActive} />
      </div>

      {/* Фильтры — скрыты когда поиск активен */}
      <div className={`flex flex-wrap gap-2 mb-6 ${isSearchActive ? 'opacity-30 pointer-events-none' : ''}`}>
        <Button
          variant={activeCategory === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveCategory('all')}
        >
          Все ({items.length})
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
        {diaryCount > 0 && (
          <Button
            variant={activeCategory === 'diary' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveCategory('diary')}
          >
            Дневник ({diaryCount})
          </Button>
        )}
      </div>

      {/* Список элементов — скрыт когда поиск активен */}
      <div className={isSearchActive ? 'opacity-30 pointer-events-none' : ''}>
        {filteredItems.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>Записей в этой категории пока нет</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredItems.map((item) =>
              item.type === 'document' ? (
                <DocumentCard
                  key={item.id}
                  id={item.id}
                  date={item.date}
                  category={item.category!}
                  subtype={item.subtype!}
                  title={item.title}
                  doctor={item.doctor}
                  summary={item.summary}
                  fileName={item.fileName}
                />
              ) : (
                <DiaryCard
                  key={`${item.type}-${item.id}`}
                  type={item.type as 'symptom' | 'vital' | 'medication'}
                  title={item.title}
                  date={item.date}
                  subtype={item.subtype}
                  diaryData={item.diaryData}
                />
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}
