import { describe, it, expect } from 'vitest'
import { candidatesForDocument, isLegacyDocument } from '@/lib/measurement-rebuild'

// Пересборка measurements: какие документы трогаем, какие оставляем как есть.
describe('isLegacyDocument', () => {
  it('документ без таблиц и без keyValues — старый пайплайн, не трогаем', () => {
    expect(isLegacyDocument({ content: 'Консультация уролога. ПСА от 18.02 — 23.42', keyValues: null })).toBe(true)
    expect(isLegacyDocument({ content: null, keyValues: {} })).toBe(true)
  })

  it('документ с таблицами two-pass или keyValues — пересобираем, даже если кандидатов ноль', () => {
    // Прайс-лист консультации: раньше давал «АСТ 2120 руб.», теперь ноль кандидатов — старые точки должны уйти
    expect(isLegacyDocument({ content: 'Назначения\n\n## Назначенные услуги\nА130283. Антитела к фактору Кастла: 2120 руб.', keyValues: null })).toBe(false)
    expect(isLegacyDocument({ content: null, keyValues: { 'Гемоглобин': '103 г/л' } })).toBe(false)
  })
})

describe('candidatesForDocument', () => {
  it('прайс-лист и анализ мочи не дают кандидатов', () => {
    const doc = {
      id: 'd1', date: new Date('2026-01-26'), category: 'заключения', subtype: 'консультация', keyValues: null,
      content: [
        '## Назначенные услуги (Лабораторная диагностика)',
        'Даты: 26.01.2026',
        'А130283. Антитела к внутреннему фактору Кастла IgG (АВФ, Intrinsic Factor Antibodies, IgG), количеств.: 2120 руб.',
        'А110006. Клинический анализ крови: общий анализ, лейкоцитарная формула, СОЭ (ОАК, ЛФ, СОЭ) с микроскопией мазка крови: 730 руб.',
        '',
        '## Микроскопия мочи',
        'Даты: 26.01.2026',
        'Лейкоциты: 1 клет/мкл [0-16.5]',
      ].join('\n'),
    }
    expect(candidatesForDocument(doc)).toEqual([])
  })

  it('таблица ОАК даёт кандидатов с датой из таблицы', () => {
    const doc = {
      id: 'd2', date: new Date('2026-10-04'), category: 'анализы', subtype: 'кровь', keyValues: null,
      content: ['## Скорость оседания эритроцитов (СОЭ)', 'Даты: 04.10.2026', 'Скорость оседания: 120 мм/ч [2-20]'].join('\n'),
    }
    expect(candidatesForDocument(doc)).toEqual([
      { name: 'СОЭ', value: 120, unit: 'мм/ч', date: new Date('2026-10-04'), datedByDocument: false },
    ])
  })
})
