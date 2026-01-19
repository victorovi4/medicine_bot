export type DocumentType = 
  | 'анализ' 
  | 'узи' 
  | 'консультация' 
  | 'выписка' 
  | 'исследование'
  | 'кт'
  | 'мрт'
  | 'рентген'
  | 'другое'

export const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'анализ', label: 'Анализ' },
  { value: 'узи', label: 'УЗИ' },
  { value: 'кт', label: 'КТ' },
  { value: 'мрт', label: 'МРТ' },
  { value: 'рентген', label: 'Рентген' },
  { value: 'консультация', label: 'Консультация врача' },
  { value: 'выписка', label: 'Выписка' },
  { value: 'исследование', label: 'Исследование' },
  { value: 'другое', label: 'Другое' },
]

/**
 * Нормализует тип документа к допустимому значению.
 * AI может вернуть тип в разном регистре или формате.
 * Args:
 *   rawType (string): Исходный тип от AI или из базы.
 * Returns:
 *   DocumentType: Нормализованный тип.
 */
export function normalizeDocumentType(rawType: string): DocumentType {
  if (!rawType) return 'другое'
  
  const normalized = rawType.toLowerCase().trim()
  
  // Прямое совпадение
  const exactMatch = DOCUMENT_TYPES.find(t => t.value === normalized)
  if (exactMatch) return exactMatch.value
  
  // Поиск по вхождению ключевых слов
  if (normalized.includes('анализ') || normalized.includes('кровь') || normalized.includes('моч') || normalized.includes('кал')) {
    return 'анализ'
  }
  if (normalized.includes('узи') || normalized.includes('ультразвук')) {
    return 'узи'
  }
  if (normalized.includes('кт') || normalized.includes('томограф') && normalized.includes('компьютер')) {
    return 'кт'
  }
  if (normalized.includes('мрт') || normalized.includes('магнитно')) {
    return 'мрт'
  }
  if (normalized.includes('рентген')) {
    return 'рентген'
  }
  if (normalized.includes('консультац') || normalized.includes('осмотр') || normalized.includes('приём') || normalized.includes('прием')) {
    return 'консультация'
  }
  if (normalized.includes('выписк') || normalized.includes('эпикриз')) {
    return 'выписка'
  }
  if (normalized.includes('экг') || normalized.includes('эхо') || normalized.includes('эндоскоп') || normalized.includes('колоноскоп')) {
    return 'исследование'
  }
  
  return 'другое'
}

export const SPECIALTIES = [
  'уролог',
  'онколог', 
  'терапевт',
  'хирург',
  'кардиолог',
  'невролог',
  'гастроэнтеролог',
  'эндокринолог',
  'радиолог',
  'другое',
]

export interface PatientInfo {
  fullName: string
  birthDate: string
  age: number
}

export const PATIENT: PatientInfo = {
  fullName: 'Иоффе Виктор Борисович',
  birthDate: '15.03.1947',
  age: Math.floor((Date.now() - new Date('1947-03-15').getTime()) / (365.25 * 24 * 60 * 60 * 1000)),
}
