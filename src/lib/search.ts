/**
 * Утилиты для поиска документов.
 * Поддерживает точное совпадение и fuzzy matching.
 */

export interface SearchableDocument {
  id: string
  date: Date
  category: string
  subtype: string
  title: string
  doctor?: string | null
  specialty?: string | null
  summary?: string | null
  conclusion?: string | null
  tags: string[]
  keyValues?: Record<string, string> | null
  fileUrl?: string | null
  fileName?: string | null
}

export interface SearchResult {
  document: SearchableDocument
  matchType: 'exact' | 'partial' | 'context'
  matchedFields: string[]
  relevance: number // 0-1
  highlights: { field: string; text: string }[]
}

/**
 * Нормализует строку для поиска.
 */
function normalize(str: string): string {
  return str.toLowerCase().trim()
}

/**
 * Проверяет точное вхождение запроса в текст.
 */
function containsExact(text: string, query: string): boolean {
  return normalize(text).includes(normalize(query))
}

/**
 * Вычисляет схожесть на основе общих слов (Jaccard).
 */
function calculateWordSimilarity(text: string, query: string): number {
  const textWords = normalize(text).split(/\s+/).filter(w => w.length > 2)
  const queryWords = normalize(query).split(/\s+/).filter(w => w.length > 2)
  
  if (textWords.length === 0 || queryWords.length === 0) return 0
  
  // Считаем сколько слов запроса найдено в тексте
  let matchedCount = 0
  for (const qWord of queryWords) {
    if (textWords.some(tWord => tWord.includes(qWord) || qWord.includes(tWord))) {
      matchedCount++
    }
  }
  
  return matchedCount / queryWords.length
}

/**
 * Извлекает контекст вокруг найденного слова.
 */
function extractHighlight(text: string, query: string, contextLength: number = 50): string {
  const lowerText = normalize(text)
  const lowerQuery = normalize(query)
  
  // Ищем первое вхождение любого слова запроса
  const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 2)
  
  for (const word of queryWords) {
    const index = lowerText.indexOf(word)
    if (index !== -1) {
      const start = Math.max(0, index - contextLength)
      const end = Math.min(text.length, index + word.length + contextLength)
      
      let highlight = text.slice(start, end)
      if (start > 0) highlight = '...' + highlight
      if (end < text.length) highlight = highlight + '...'
      
      return highlight
    }
  }
  
  // Если не нашли — возвращаем начало текста
  return text.slice(0, contextLength * 2) + (text.length > contextLength * 2 ? '...' : '')
}

/**
 * Ищет документы по запросу.
 */
export function searchDocuments(
  documents: SearchableDocument[],
  query: string
): SearchResult[] {
  if (!query || query.trim().length < 2) {
    return []
  }
  
  const normalizedQuery = normalize(query)
  const results: SearchResult[] = []
  
  for (const doc of documents) {
    const matchedFields: string[] = []
    const highlights: { field: string; text: string }[] = []
    let maxRelevance = 0
    let matchType: 'exact' | 'partial' | 'context' = 'context'
    
    // 1. Точное совпадение в тегах (высший приоритет)
    const matchedTags = doc.tags.filter(tag => containsExact(tag, normalizedQuery))
    if (matchedTags.length > 0) {
      matchedFields.push('tags')
      highlights.push({ field: 'Теги', text: matchedTags.join(', ') })
      maxRelevance = Math.max(maxRelevance, 1.0)
      matchType = 'exact'
    }
    
    // 2. Точное совпадение в названии
    if (containsExact(doc.title, normalizedQuery)) {
      matchedFields.push('title')
      highlights.push({ field: 'Название', text: doc.title })
      maxRelevance = Math.max(maxRelevance, 0.95)
      matchType = 'exact'
    }
    
    // 3. Точное совпадение в специальности врача
    if (doc.specialty && containsExact(doc.specialty, normalizedQuery)) {
      matchedFields.push('specialty')
      highlights.push({ field: 'Специальность', text: doc.specialty })
      maxRelevance = Math.max(maxRelevance, 0.9)
      matchType = 'exact'
    }
    
    // 4. Точное совпадение в имени врача
    if (doc.doctor && containsExact(doc.doctor, normalizedQuery)) {
      matchedFields.push('doctor')
      highlights.push({ field: 'Врач', text: doc.doctor })
      maxRelevance = Math.max(maxRelevance, 0.85)
      matchType = 'exact'
    }
    
    // 5. Точное совпадение в резюме
    if (doc.summary && containsExact(doc.summary, normalizedQuery)) {
      matchedFields.push('summary')
      highlights.push({ field: 'Резюме', text: extractHighlight(doc.summary, query) })
      maxRelevance = Math.max(maxRelevance, 0.8)
      if (matchType !== 'exact') matchType = 'partial'
    }
    
    // 6. Точное совпадение в заключении
    if (doc.conclusion && containsExact(doc.conclusion, normalizedQuery)) {
      matchedFields.push('conclusion')
      highlights.push({ field: 'Заключение', text: extractHighlight(doc.conclusion, query) })
      maxRelevance = Math.max(maxRelevance, 0.8)
      if (matchType !== 'exact') matchType = 'partial'
    }
    
    // 7. Совпадение в ключевых показателях
    if (doc.keyValues) {
      for (const [key, value] of Object.entries(doc.keyValues)) {
        if (containsExact(key, normalizedQuery)) {
          matchedFields.push('keyValues')
          highlights.push({ field: 'Показатель', text: `${key}: ${value}` })
          maxRelevance = Math.max(maxRelevance, 0.85)
          matchType = 'exact'
          break
        }
      }
    }
    
    // 8. Fuzzy matching в резюме и заключении (контекстный поиск)
    if (maxRelevance < 0.5) {
      if (doc.summary) {
        const similarity = calculateWordSimilarity(doc.summary, query)
        if (similarity >= 0.3) {
          matchedFields.push('summary_fuzzy')
          highlights.push({ field: 'Возможно (резюме)', text: extractHighlight(doc.summary, query) })
          maxRelevance = Math.max(maxRelevance, similarity * 0.6)
          matchType = 'context'
        }
      }
      
      if (doc.conclusion) {
        const similarity = calculateWordSimilarity(doc.conclusion, query)
        if (similarity >= 0.3) {
          matchedFields.push('conclusion_fuzzy')
          highlights.push({ field: 'Возможно (заключение)', text: extractHighlight(doc.conclusion, query) })
          maxRelevance = Math.max(maxRelevance, similarity * 0.6)
          matchType = 'context'
        }
      }
    }
    
    // Добавляем в результаты только если нашли совпадение
    if (matchedFields.length > 0 && maxRelevance > 0) {
      results.push({
        document: doc,
        matchType,
        matchedFields,
        relevance: maxRelevance,
        highlights,
      })
    }
  }
  
  // Сортируем по релевантности
  results.sort((a, b) => b.relevance - a.relevance)
  
  return results
}

/**
 * Группирует результаты по типу совпадения.
 */
export function groupSearchResults(results: SearchResult[]): {
  exact: SearchResult[]
  partial: SearchResult[]
  context: SearchResult[]
} {
  return {
    exact: results.filter(r => r.matchType === 'exact'),
    partial: results.filter(r => r.matchType === 'partial'),
    context: results.filter(r => r.matchType === 'context'),
  }
}
