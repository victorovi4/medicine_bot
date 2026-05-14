'use client'

import { useState } from 'react'
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
        <button
          onClick={() => setActiveCategory('all')}
          className={activeCategory === 'all'
            ? 'rounded-full border border-[rgba(0,210,170,0.3)] bg-[rgba(0,210,170,0.1)] px-3 py-1 text-xs text-[#00d2aa] cursor-pointer'
            : 'rounded-full border border-[rgba(0,210,170,0.09)] bg-[#0a1525] px-3 py-1 text-xs text-[rgba(204,232,225,0.5)] transition-all hover:border-[rgba(0,210,170,0.25)] hover:text-[rgba(204,232,225,0.8)] cursor-pointer'}
        >
          Все ({items.length})
        </button>
        {DOCUMENT_CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setActiveCategory(cat.value)}
            disabled={!counts[cat.value]}
            className={activeCategory === cat.value
              ? 'rounded-full border border-[rgba(0,210,170,0.3)] bg-[rgba(0,210,170,0.1)] px-3 py-1 text-xs text-[#00d2aa] cursor-pointer'
              : `rounded-full border border-[rgba(0,210,170,0.09)] bg-[#0a1525] px-3 py-1 text-xs text-[rgba(204,232,225,0.5)] transition-all hover:border-[rgba(0,210,170,0.25)] hover:text-[rgba(204,232,225,0.8)] cursor-pointer${!counts[cat.value] ? ' opacity-50' : ''}`}
          >
            {cat.label} {counts[cat.value] ? `(${counts[cat.value]})` : ''}
          </button>
        ))}
        {diaryCount > 0 && (
          <button
            onClick={() => setActiveCategory('diary')}
            className={activeCategory === 'diary'
              ? 'rounded-full border border-[rgba(0,210,170,0.3)] bg-[rgba(0,210,170,0.1)] px-3 py-1 text-xs text-[#00d2aa] cursor-pointer'
              : 'rounded-full border border-[rgba(0,210,170,0.09)] bg-[#0a1525] px-3 py-1 text-xs text-[rgba(204,232,225,0.5)] transition-all hover:border-[rgba(0,210,170,0.25)] hover:text-[rgba(204,232,225,0.8)] cursor-pointer'}
          >
            Дневник ({diaryCount})
          </button>
        )}
      </div>

      {/* Список элементов — скрыт когда поиск активен */}
      <div className={isSearchActive ? 'opacity-30 pointer-events-none' : ''}>
        {filteredItems.length === 0 ? (
          <div className="text-center py-12 text-[rgba(204,232,225,0.4)]">
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
