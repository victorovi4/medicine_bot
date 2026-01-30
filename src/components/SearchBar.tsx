'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, X, FileText, CheckCircle, HelpCircle, Loader2, Download } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import type { SearchResponse } from '@/app/api/search/route'

interface SearchResultItem {
  id: string
  date: string
  category: string
  subtype: string
  title: string
  doctor: string | null
  specialty: string | null
  fileUrl: string | null
  fileName: string | null
  matchType: 'exact' | 'partial' | 'context'
  relevance: number
  highlights: { field: string; text: string }[]
}

interface SearchBarProps {
  onSearchActive?: (active: boolean) => void
}

export function SearchBar({ onSearchActive }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Скачать все файлы как ZIP через серверный API
  const downloadAllFiles = useCallback(async () => {
    if (!results) return
    
    const allResults = [...results.exact, ...results.partial, ...results.context]
    const filesWithUrl = allResults.filter(r => r.fileUrl)
    
    if (filesWithUrl.length === 0) {
      alert('Нет файлов для скачивания')
      return
    }
    
    setIsDownloading(true)
    setDownloadProgress('Подготовка...')
    
    try {
      const ids = filesWithUrl.map(r => r.id)
      
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      
      if (!response.ok) {
        throw new Error('Download failed')
      }
      
      setDownloadProgress('Скачивание...')
      
      const blob = await response.blob()
      
      // Скачиваем файл
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `документы_${query}.zip`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Download error:', error)
      alert('Ошибка при скачивании файлов')
    } finally {
      setIsDownloading(false)
      setDownloadProgress('')
    }
  }, [results, query])

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults(null)
      setIsOpen(false)
      onSearchActive?.(false)
      return
    }

    const timer = setTimeout(async () => {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
        const data: SearchResponse = await res.json()
        setResults(data)
        setIsOpen(true)
        onSearchActive?.(true)
      } catch (error) {
        console.error('Search error:', error)
      } finally {
        setIsLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query, onSearchActive])

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        onSearchActive?.(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onSearchActive])

  const clearSearch = useCallback(() => {
    setQuery('')
    setResults(null)
    setIsOpen(false)
    onSearchActive?.(false)
    inputRef.current?.focus()
  }, [onSearchActive])

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  const renderResultItem = (item: SearchResultItem) => (
    <Link
      key={item.id}
      href={`/documents/${item.id}`}
      className="block p-3 hover:bg-gray-50 active:bg-gray-100 border-b border-gray-100 last:border-b-0"
      onClick={() => {
        setIsOpen(false)
        onSearchActive?.(false)
      }}
    >
      <div className="flex items-start gap-2">
        {/* Match type indicator */}
        <div className="mt-0.5 flex-shrink-0">
          {item.matchType === 'exact' && (
            <CheckCircle className="h-4 w-4 text-green-600" />
          )}
          {item.matchType === 'partial' && (
            <FileText className="h-4 w-4 text-blue-600" />
          )}
          {item.matchType === 'context' && (
            <HelpCircle className="h-4 w-4 text-orange-500" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Title */}
          <div className="font-medium text-gray-900 truncate">{item.title}</div>

          {/* Meta */}
          <div className="flex flex-wrap gap-x-2 text-xs text-gray-500 mt-0.5">
            <span>{formatDate(item.date)}</span>
            {item.specialty && <span>• {item.specialty}</span>}
            {item.doctor && <span className="truncate">• {item.doctor}</span>}
          </div>

          {/* Highlights */}
          {item.highlights.length > 0 && (
            <div className="mt-1 text-xs">
              {item.highlights.slice(0, 2).map((h, i) => (
                <div key={i} className="text-gray-600 truncate">
                  <span className={`font-medium ${
                    h.field.startsWith('Возможно') ? 'text-orange-600' : 'text-green-700'
                  }`}>
                    {h.field}:
                  </span>{' '}
                  <span className="text-gray-500">{h.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Match type label for mobile */}
        {item.matchType === 'context' && (
          <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded flex-shrink-0">
            возможно
          </span>
        )}
      </div>
    </Link>
  )

  const renderResultGroup = (
    title: string,
    items: SearchResultItem[],
    icon: React.ReactNode,
    color: string
  ) => {
    if (items.length === 0) return null

    return (
      <div>
        <div className={`px-3 py-2 text-xs font-medium ${color} bg-gray-50 sticky top-0`}>
          <div className="flex items-center gap-1.5">
            {icon}
            {title} ({items.length})
          </div>
        </div>
        {items.map(renderResultItem)}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Поиск: простата, ПСА, уролог..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results && results.total > 0) {
              setIsOpen(true)
              onSearchActive?.(true)
            }
          }}
          className="pl-9 pr-9 h-10 text-base"
        />
        {query && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
            onClick={clearSearch}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            ) : (
              <X className="h-4 w-4 text-gray-400" />
            )}
          </Button>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && results && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 max-h-[70vh] overflow-y-auto z-50">
          {results.total === 0 ? (
            <div className="p-4 text-center text-gray-500">
              <Search className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              <p>Ничего не найдено</p>
              <p className="text-xs mt-1">Попробуйте другой запрос</p>
            </div>
          ) : (
            <>
              {/* Exact matches */}
              {renderResultGroup(
                'Точные совпадения',
                results.exact,
                <CheckCircle className="h-3.5 w-3.5" />,
                'text-green-700'
              )}

              {/* Partial matches */}
              {renderResultGroup(
                'Совпадения в тексте',
                results.partial,
                <FileText className="h-3.5 w-3.5" />,
                'text-blue-700'
              )}

              {/* Context matches */}
              {renderResultGroup(
                'Возможно релевантно',
                results.context,
                <HelpCircle className="h-3.5 w-3.5" />,
                'text-orange-600'
              )}

              {/* Summary + Download button */}
              <div className="px-3 py-2 bg-gray-50 border-t flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500">
                  Найдено: {results.total} документ(ов)
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    downloadAllFiles()
                  }}
                  disabled={isDownloading || ![...results.exact, ...results.partial, ...results.context].some(r => r.fileUrl)}
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      {downloadProgress}
                    </>
                  ) : (
                    <>
                      <Download className="h-3 w-3 mr-1" />
                      Скачать все
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
