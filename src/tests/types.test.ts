import { describe, it, expect } from 'vitest'
import {
  normalizeDocumentType,
  DOCUMENT_CATEGORIES,
  CATEGORY_SUBTYPES,
  ALL_SUBTYPES,
  getCategoryBySubtype,
  getCategoryLabel,
  getSubtypeLabel,
  SPECIALTIES,
} from '@/lib/types'

describe('normalizeDocumentType', () => {
  it('должен возвращать категорию и подтип для корректных значений', () => {
    expect(normalizeDocumentType('анализы', 'кровь')).toEqual({
      category: 'анализы',
      subtype: 'кровь',
    })
  })

  it('должен нормализовать категорию по смыслу', () => {
    expect(normalizeDocumentType('заключение', 'консультация')).toEqual({
      category: 'заключения',
      subtype: 'консультация',
    })
  })

  it('должен определять подтип и категорию по ключевым словам', () => {
    expect(normalizeDocumentType('', 'КТ')).toEqual({
      category: 'исследования',
      subtype: 'кт',
    })
    expect(normalizeDocumentType('', 'ПСА общий')).toEqual({
      category: 'анализы',
      subtype: 'онкомаркеры',
    })
  })

  it('должен возвращать другое для неизвестных значений', () => {
    expect(normalizeDocumentType('', '')).toEqual({
      category: 'другое',
      subtype: 'другое',
    })
  })
})

describe('DOCUMENT_CATEGORIES', () => {
  it('должен содержать базовые категории', () => {
    expect(DOCUMENT_CATEGORIES.map((c) => c.value)).toEqual(
      expect.arrayContaining(['заключения', 'анализы', 'исследования', 'другое'])
    )
  })

  it('каждая категория должна иметь label', () => {
    DOCUMENT_CATEGORIES.forEach((category) => {
      expect(typeof category.label).toBe('string')
      expect(category.label.length).toBeGreaterThan(0)
    })
  })
})

describe('CATEGORY_SUBTYPES', () => {
  it('должен содержать подтипы для всех категорий', () => {
    expect(Object.keys(CATEGORY_SUBTYPES)).toEqual(
      expect.arrayContaining(['заключения', 'анализы', 'исследования', 'другое'])
    )
  })

  it('должен включать ключевые подтипы', () => {
    const allSubtypeValues = ALL_SUBTYPES.map((s) => s.value)
    expect(allSubtypeValues).toContain('узи')
    expect(allSubtypeValues).toContain('кровь')
    expect(allSubtypeValues).toContain('консультация')
  })
})

describe('labels and category helpers', () => {
  it('getCategoryBySubtype должен возвращать ожидаемую категорию', () => {
    expect(getCategoryBySubtype('узи')).toBe('исследования')
    expect(getCategoryBySubtype('кровь')).toBe('анализы')
    expect(getCategoryBySubtype('неизвестный')).toBe('другое')
  })

  it('getCategoryLabel и getSubtypeLabel должны возвращать label', () => {
    expect(getCategoryLabel('анализы')).toContain('Анализы')
    expect(getSubtypeLabel('узи')).toContain('УЗИ')
  })
})

describe('SPECIALTIES', () => {
  it('должен содержать основные специальности', () => {
    expect(SPECIALTIES).toContain('уролог')
    expect(SPECIALTIES).toContain('онколог')
    expect(SPECIALTIES).toContain('терапевт')
    expect(SPECIALTIES).toContain('хирург')
  })

  it('все элементы должны быть строками', () => {
    SPECIALTIES.forEach((spec) => {
      expect(typeof spec).toBe('string')
    })
  })
})
