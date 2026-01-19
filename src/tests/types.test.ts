import { describe, it, expect } from 'vitest'
import {
  normalizeDocumentType,
  DOCUMENT_TYPES,
  SPECIALTIES,
  PATIENT,
} from '@/lib/types'

describe('normalizeDocumentType', () => {
  it('должен возвращать "анализ" для различных вариантов написания', () => {
    expect(normalizeDocumentType('анализ')).toBe('анализ')
    expect(normalizeDocumentType('Анализ')).toBe('анализ')
    expect(normalizeDocumentType('АНАЛИЗ')).toBe('анализ')
    expect(normalizeDocumentType('анализ крови')).toBe('анализ')
    expect(normalizeDocumentType('биохимия крови')).toBe('анализ')
    expect(normalizeDocumentType('анализ мочи')).toBe('анализ')
    expect(normalizeDocumentType('анализ кала')).toBe('анализ')
  })

  it('должен возвращать "узи" для УЗИ документов', () => {
    expect(normalizeDocumentType('узи')).toBe('узи')
    expect(normalizeDocumentType('УЗИ')).toBe('узи')
    expect(normalizeDocumentType('узи брюшной полости')).toBe('узи')
    expect(normalizeDocumentType('ультразвук')).toBe('узи')
  })

  it('должен возвращать "кт" для КТ документов', () => {
    expect(normalizeDocumentType('кт')).toBe('кт')
    expect(normalizeDocumentType('КТ')).toBe('кт')
    expect(normalizeDocumentType('компьютерная томография')).toBe('кт')
  })

  it('должен возвращать "мрт" для МРТ документов', () => {
    expect(normalizeDocumentType('мрт')).toBe('мрт')
    expect(normalizeDocumentType('МРТ')).toBe('мрт')
    expect(normalizeDocumentType('магнитно-резонансная')).toBe('мрт')
  })

  it('должен возвращать "рентген" для рентген документов', () => {
    expect(normalizeDocumentType('рентген')).toBe('рентген')
    expect(normalizeDocumentType('Рентген грудной клетки')).toBe('рентген')
  })

  it('должен возвращать "консультация" для консультаций', () => {
    expect(normalizeDocumentType('консультация')).toBe('консультация')
    expect(normalizeDocumentType('Консультация уролога')).toBe('консультация')
    expect(normalizeDocumentType('осмотр врача')).toBe('консультация')
    expect(normalizeDocumentType('приём терапевта')).toBe('консультация')
  })

  it('должен возвращать "выписка" для выписок', () => {
    expect(normalizeDocumentType('выписка')).toBe('выписка')
    expect(normalizeDocumentType('выписной эпикриз')).toBe('выписка')
  })

  it('должен возвращать "исследование" для специальных исследований', () => {
    expect(normalizeDocumentType('исследование')).toBe('исследование')
    expect(normalizeDocumentType('ЭКГ')).toBe('исследование')
    expect(normalizeDocumentType('эхокардиография')).toBe('исследование')
    expect(normalizeDocumentType('колоноскопия')).toBe('исследование')
  })

  it('должен возвращать "другое" для неизвестных типов', () => {
    expect(normalizeDocumentType('')).toBe('другое')
    expect(normalizeDocumentType('какой-то документ')).toBe('другое')
    expect(normalizeDocumentType('неизвестный тип')).toBe('другое')
  })

  it('должен обрабатывать пробелы и регистр', () => {
    expect(normalizeDocumentType('  АНАЛИЗ  ')).toBe('анализ')
    expect(normalizeDocumentType('  узи  ')).toBe('узи')
  })
})

describe('DOCUMENT_TYPES', () => {
  it('должен содержать все типы документов', () => {
    expect(DOCUMENT_TYPES).toHaveLength(9)
    expect(DOCUMENT_TYPES.map((t) => t.value)).toContain('анализ')
    expect(DOCUMENT_TYPES.map((t) => t.value)).toContain('узи')
    expect(DOCUMENT_TYPES.map((t) => t.value)).toContain('кт')
    expect(DOCUMENT_TYPES.map((t) => t.value)).toContain('мрт')
    expect(DOCUMENT_TYPES.map((t) => t.value)).toContain('консультация')
    expect(DOCUMENT_TYPES.map((t) => t.value)).toContain('выписка')
    expect(DOCUMENT_TYPES.map((t) => t.value)).toContain('другое')
  })

  it('каждый тип должен иметь value и label', () => {
    DOCUMENT_TYPES.forEach((type) => {
      expect(type).toHaveProperty('value')
      expect(type).toHaveProperty('label')
      expect(typeof type.value).toBe('string')
      expect(typeof type.label).toBe('string')
    })
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

describe('PATIENT', () => {
  it('должен содержать данные пациента', () => {
    expect(PATIENT).toHaveProperty('fullName')
    expect(PATIENT).toHaveProperty('birthDate')
    expect(PATIENT).toHaveProperty('age')
  })

  it('ФИО должно быть корректным', () => {
    expect(PATIENT.fullName).toBe('Иоффе Виктор Борисович')
  })

  it('дата рождения должна быть корректной', () => {
    expect(PATIENT.birthDate).toBe('15.03.1947')
  })

  it('возраст должен быть числом больше 0', () => {
    expect(typeof PATIENT.age).toBe('number')
    expect(PATIENT.age).toBeGreaterThan(0)
    expect(PATIENT.age).toBeLessThan(150)
  })
})
