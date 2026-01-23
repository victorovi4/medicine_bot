/**
 * Категории и типы документов.
 * Иерархическая структура: категория → подтипы.
 */

// === КАТЕГОРИИ ===

export type DocumentCategory = 'заключения' | 'анализы' | 'исследования' | 'другое'

export const DOCUMENT_CATEGORIES: { value: DocumentCategory; label: string; icon: string }[] = [
  { value: 'заключения', label: 'Заключения врачей', icon: '📋' },
  { value: 'анализы', label: 'Анализы', icon: '📊' },
  { value: 'исследования', label: 'Исследования', icon: '🔬' },
  { value: 'другое', label: 'Другое', icon: '📄' },
]

// === ПОДТИПЫ ===

export type DocumentSubtype = 
  // Заключения
  | 'консультация'
  | 'выписка'
  | 'направление'
  // Анализы
  | 'кровь'
  | 'моча'
  | 'кал'
  | 'онкомаркеры'
  | 'гистология'
  | 'биохимия'
  // Исследования
  | 'узи'
  | 'кт'
  | 'мрт'
  | 'пэт-кт'
  | 'рентген'
  | 'экг'
  | 'эндоскопия'
  | 'колоноскопия'
  // Общее
  | 'другое'

/**
 * Иерархия: категория → список подтипов.
 */
export const CATEGORY_SUBTYPES: Record<DocumentCategory, { value: DocumentSubtype; label: string }[]> = {
  заключения: [
    { value: 'консультация', label: 'Консультация врача' },
    { value: 'выписка', label: 'Выписка / эпикриз' },
    { value: 'направление', label: 'Направление' },
  ],
  анализы: [
    { value: 'кровь', label: 'Анализ крови (ОАК, биохимия)' },
    { value: 'биохимия', label: 'Биохимия крови' },
    { value: 'онкомаркеры', label: 'Онкомаркеры (ПСА и др.)' },
    { value: 'моча', label: 'Анализ мочи' },
    { value: 'кал', label: 'Анализ кала' },
    { value: 'гистология', label: 'Гистология / биопсия' },
  ],
  исследования: [
    { value: 'узи', label: 'УЗИ' },
    { value: 'кт', label: 'КТ' },
    { value: 'мрт', label: 'МРТ' },
    { value: 'пэт-кт', label: 'ПЭТ-КТ' },
    { value: 'рентген', label: 'Рентген' },
    { value: 'экг', label: 'ЭКГ' },
    { value: 'эндоскопия', label: 'Эндоскопия' },
    { value: 'колоноскопия', label: 'Колоноскопия' },
  ],
  другое: [
    { value: 'другое', label: 'Другое' },
  ],
}

/**
 * Плоский список всех подтипов (для Select).
 */
export const ALL_SUBTYPES: { value: DocumentSubtype; label: string; category: DocumentCategory }[] = 
  Object.entries(CATEGORY_SUBTYPES).flatMap(([category, subtypes]) =>
    subtypes.map(s => ({ ...s, category: category as DocumentCategory }))
  )

/**
 * Получить категорию по подтипу.
 */
export function getCategoryBySubtype(subtype: string): DocumentCategory {
  for (const [category, subtypes] of Object.entries(CATEGORY_SUBTYPES)) {
    if (subtypes.some(s => s.value === subtype)) {
      return category as DocumentCategory
    }
  }
  return 'другое'
}

/**
 * Получить label для категории.
 */
export function getCategoryLabel(category: string): string {
  const found = DOCUMENT_CATEGORIES.find(c => c.value === category)
  return found?.label || category
}

/**
 * Получить label для подтипа.
 */
export function getSubtypeLabel(subtype: string): string {
  const found = ALL_SUBTYPES.find(s => s.value === subtype)
  return found?.label || subtype
}

/**
 * Нормализует категорию и подтип из AI-ответа.
 */
export function normalizeDocumentType(rawCategory: string, rawSubtype: string): { category: DocumentCategory; subtype: DocumentSubtype } {
  const cat = rawCategory?.toLowerCase().trim() || ''
  const sub = rawSubtype?.toLowerCase().trim() || ''
  
  // Пробуем найти категорию напрямую
  let category: DocumentCategory = 'другое'
  if (DOCUMENT_CATEGORIES.some(c => c.value === cat)) {
    category = cat as DocumentCategory
  } else if (cat.includes('заключен') || cat.includes('консультац') || cat.includes('выпис')) {
    category = 'заключения'
  } else if (cat.includes('анализ') || cat.includes('кровь') || cat.includes('моч')) {
    category = 'анализы'
  } else if (cat.includes('исследован') || cat.includes('узи') || cat.includes('кт') || cat.includes('мрт')) {
    category = 'исследования'
  }
  
  // Пробуем найти подтип
  let subtype: DocumentSubtype = 'другое'
  const found = ALL_SUBTYPES.find(s => s.value === sub)
  if (found) {
    subtype = found.value
    category = found.category // Подтип определяет категорию
  } else {
    // Поиск по ключевым словам
    if (sub.includes('консультац') || sub.includes('осмотр') || sub.includes('приём') || sub.includes('прием')) {
      subtype = 'консультация'
      category = 'заключения'
    } else if (sub.includes('выпис') || sub.includes('эпикриз')) {
      subtype = 'выписка'
      category = 'заключения'
    } else if (sub.includes('пса') || sub.includes('онкомаркер')) {
      subtype = 'онкомаркеры'
      category = 'анализы'
    } else if (sub.includes('биохим')) {
      subtype = 'биохимия'
      category = 'анализы'
    } else if (sub.includes('кровь') || sub.includes('оак') || sub.includes('гемоглобин')) {
      subtype = 'кровь'
      category = 'анализы'
    } else if (sub.includes('моч')) {
      subtype = 'моча'
      category = 'анализы'
    } else if (sub.includes('гистолог') || sub.includes('биопси')) {
      subtype = 'гистология'
      category = 'анализы'
    } else if (sub.includes('узи') || sub.includes('ультразвук')) {
      subtype = 'узи'
      category = 'исследования'
    } else if (sub.includes('пэт') || sub.includes('пет-кт') || sub.includes('pet')) {
      subtype = 'пэт-кт'
      category = 'исследования'
    } else if (sub.includes('кт') || sub.includes('компьютерн')) {
      subtype = 'кт'
      category = 'исследования'
    } else if (sub.includes('мрт') || sub.includes('магнитн')) {
      subtype = 'мрт'
      category = 'исследования'
    } else if (sub.includes('рентген')) {
      subtype = 'рентген'
      category = 'исследования'
    } else if (sub.includes('экг')) {
      subtype = 'экг'
      category = 'исследования'
    } else if (sub.includes('эндоскоп')) {
      subtype = 'эндоскопия'
      category = 'исследования'
    } else if (sub.includes('колоноскоп')) {
      subtype = 'колоноскопия'
      category = 'исследования'
    }
  }
  
  return { category, subtype }
}

// === СПЕЦИАЛЬНОСТИ ===

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

// Профиль пациента перенесён в src/lib/patient.ts
