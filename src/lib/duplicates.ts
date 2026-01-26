/**
 * Утилиты для определения дубликатов документов.
 * Улучшенная детекция: врач+дата, fuzzy matching заключения, сравнение keyValues.
 */

interface DocumentData {
  id: string
  date: Date
  title: string
  doctor?: string | null
  conclusion?: string | null
  keyValues?: Record<string, string> | null
}

interface AnalysisData {
  date: string
  title?: string | null
  doctor?: string | null
  conclusion?: string | null
  keyValues?: Record<string, string> | null
}

/**
 * Вычисляет коэффициент схожести двух строк (0-1).
 * Использует алгоритм схожести на основе общих n-грамм.
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0
  
  const s1 = str1.toLowerCase().trim()
  const s2 = str2.toLowerCase().trim()
  
  if (s1 === s2) return 1
  if (s1.length < 3 || s2.length < 3) return 0
  
  // Разбиваем на слова
  const words1 = s1.split(/\s+/).filter(w => w.length > 2)
  const words2 = s2.split(/\s+/).filter(w => w.length > 2)
  
  if (words1.length === 0 || words2.length === 0) return 0
  
  // Считаем общие слова
  const commonWords = words1.filter(w => words2.includes(w))
  
  // Коэффициент Жаккара
  const union = new Set([...words1, ...words2]).size
  return commonWords.length / union
}

/**
 * Сравнивает keyValues двух документов.
 * Возвращает долю совпадающих значений (0-1).
 */
function compareKeyValues(
  kv1: Record<string, string> | null | undefined,
  kv2: Record<string, string> | null | undefined
): number {
  if (!kv1 || !kv2) return 0
  
  const keys1 = Object.keys(kv1)
  const keys2 = Object.keys(kv2)
  
  if (keys1.length === 0 || keys2.length === 0) return 0
  
  // Находим общие ключи
  const commonKeys = keys1.filter(k => keys2.includes(k))
  if (commonKeys.length === 0) return 0
  
  // Считаем совпадающие значения
  let matchingValues = 0
  for (const key of commonKeys) {
    // Нормализуем значения (убираем пробелы, приводим к нижнему регистру)
    const v1 = kv1[key]?.toLowerCase().trim()
    const v2 = kv2[key]?.toLowerCase().trim()
    if (v1 === v2) {
      matchingValues++
    }
  }
  
  // Доля совпадающих значений от общих ключей
  return matchingValues / commonKeys.length
}

/**
 * Проверяет, являются ли два документа дубликатами.
 * Возвращает объект с результатом и причиной.
 */
export function checkDuplicate(
  existingDoc: DocumentData,
  newAnalysis: AnalysisData
): { isDuplicate: boolean; reason: string; confidence: number } {
  const newDate = new Date(newAnalysis.date)
  
  // 1. Точное совпадение: тот же врач + та же дата
  if (newAnalysis.doctor && existingDoc.doctor) {
    const sameDoctor = existingDoc.doctor.toLowerCase().trim() === 
                       newAnalysis.doctor.toLowerCase().trim()
    const sameDate = existingDoc.date.toDateString() === newDate.toDateString()
    
    if (sameDoctor && sameDate) {
      return {
        isDuplicate: true,
        reason: 'Тот же врач в тот же день',
        confidence: 0.9,
      }
    }
  }
  
  // 2. Схожесть заключения (fuzzy matching)
  if (newAnalysis.conclusion && existingDoc.conclusion) {
    const similarity = calculateSimilarity(
      existingDoc.conclusion,
      newAnalysis.conclusion
    )
    
    if (similarity >= 0.7) {
      return {
        isDuplicate: true,
        reason: `Схожее заключение (${Math.round(similarity * 100)}%)`,
        confidence: similarity,
      }
    }
  }
  
  // 3. Совпадение keyValues
  const kvMatch = compareKeyValues(
    existingDoc.keyValues,
    newAnalysis.keyValues as Record<string, string> | null
  )
  
  if (kvMatch >= 0.8) {
    return {
      isDuplicate: true,
      reason: `Совпадающие показатели (${Math.round(kvMatch * 100)}%)`,
      confidence: kvMatch,
    }
  }
  
  // 4. Проверка по названию (старая логика)
  const titleSimilarity = calculateSimilarity(
    existingDoc.title,
    newAnalysis.title || ''
  )
  
  if (titleSimilarity >= 0.5) {
    return {
      isDuplicate: true,
      reason: `Схожее название (${Math.round(titleSimilarity * 100)}%)`,
      confidence: titleSimilarity,
    }
  }
  
  return {
    isDuplicate: false,
    reason: '',
    confidence: 0,
  }
}

/**
 * Ищет дубликат среди списка документов.
 * Возвращает первый найденный дубликат или null.
 */
export function findDuplicate(
  documents: DocumentData[],
  newAnalysis: AnalysisData
): { document: DocumentData; reason: string; confidence: number } | null {
  for (const doc of documents) {
    const result = checkDuplicate(doc, newAnalysis)
    if (result.isDuplicate) {
      return {
        document: doc,
        reason: result.reason,
        confidence: result.confidence,
      }
    }
  }
  return null
}
