import { describe, it, expect } from 'vitest'
import { checkDuplicate, findDuplicate } from '@/lib/duplicates'

describe('checkDuplicate', () => {
  const baseDoc = {
    id: 'doc-1',
    date: new Date('2025-03-25'),
    title: 'Консультация нейрохирурга',
    doctor: 'Иванов Иван Иванович',
    conclusion: 'Пациент здоров, рекомендовано наблюдение',
    keyValues: { 'Гемоглобин': '130 г/л', 'СОЭ': '15 мм/ч' },
  }

  it('должен находить дубликат по врачу + дате', () => {
    const result = checkDuplicate(baseDoc, {
      date: '2025-03-25',
      title: 'Другое название',
      doctor: 'Иванов Иван Иванович',
      conclusion: 'Совсем другое заключение',
    })
    
    expect(result.isDuplicate).toBe(true)
    expect(result.reason).toContain('врач')
    expect(result.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('не должен находить дубликат если врач другой', () => {
    const result = checkDuplicate(baseDoc, {
      date: '2025-03-25',
      title: 'Консультация нейрохирурга',
      doctor: 'Петров Петр Петрович',
      conclusion: 'Другое заключение',
    })
    
    // Может найти по названию, но не по врачу
    if (result.isDuplicate) {
      expect(result.reason).not.toContain('врач')
    }
  })

  it('должен находить дубликат по схожему заключению', () => {
    const result = checkDuplicate(baseDoc, {
      date: '2025-03-26', // другая дата
      title: 'Другое название',
      doctor: 'Другой врач',
      conclusion: 'Пациент здоров, рекомендовано наблюдение у специалиста',
    })
    
    expect(result.isDuplicate).toBe(true)
    expect(result.reason).toContain('заключение')
  })

  it('должен находить дубликат по совпадающим keyValues', () => {
    const result = checkDuplicate(baseDoc, {
      date: '2025-03-26',
      title: 'Анализ крови',
      keyValues: { 'Гемоглобин': '130 г/л', 'СОЭ': '15 мм/ч' },
    })
    
    expect(result.isDuplicate).toBe(true)
    expect(result.reason).toContain('показатели')
  })

  it('не должен находить дубликат для разных keyValues', () => {
    const result = checkDuplicate(baseDoc, {
      date: '2025-03-26',
      title: 'Анализ крови',
      keyValues: { 'Гемоглобин': '95 г/л', 'СОЭ': '45 мм/ч' },
    })
    
    // Значения разные, так что не должен совпасть по keyValues
    if (result.isDuplicate) {
      expect(result.reason).not.toContain('показатели')
    }
  })

  it('должен находить дубликат по схожему названию', () => {
    const result = checkDuplicate(baseDoc, {
      date: '2025-03-26',
      title: 'Консультация нейрохирурга в поликлинике',
    })
    
    expect(result.isDuplicate).toBe(true)
    expect(result.reason).toContain('название')
  })

  it('не должен находить дубликат для совершенно разных документов', () => {
    const result = checkDuplicate(baseDoc, {
      date: '2025-04-15',
      title: 'УЗИ органов брюшной полости',
      doctor: 'Сидоров С.С.',
      conclusion: 'Патологии не выявлено',
      keyValues: { 'Печень': 'норма' },
    })
    
    expect(result.isDuplicate).toBe(false)
  })
})

describe('findDuplicate', () => {
  const documents = [
    {
      id: 'doc-1',
      date: new Date('2025-03-25'),
      title: 'Консультация нейрохирурга',
      doctor: 'Иванов И.И.',
      conclusion: 'Всё хорошо',
      keyValues: null,
    },
    {
      id: 'doc-2',
      date: new Date('2025-03-20'),
      title: 'Анализ крови',
      doctor: null,
      conclusion: null,
      keyValues: { 'Гемоглобин': '130 г/л' },
    },
  ]

  it('должен находить первый подходящий дубликат', () => {
    const result = findDuplicate(documents, {
      date: '2025-03-25',
      title: 'Консультация нейрохирурга',
      doctor: 'Иванов И.И.',
    })
    
    expect(result).not.toBeNull()
    expect(result?.document.id).toBe('doc-1')
  })

  it('должен возвращать null если дубликатов нет', () => {
    const result = findDuplicate(documents, {
      date: '2025-04-01',
      title: 'Совершенно новый документ',
      doctor: 'Новый врач',
    })
    
    expect(result).toBeNull()
  })

  it('должен находить дубликат по keyValues', () => {
    const result = findDuplicate(documents, {
      date: '2025-03-21',
      title: 'ОАК',
      keyValues: { 'Гемоглобин': '130 г/л' },
    })
    
    expect(result).not.toBeNull()
    expect(result?.document.id).toBe('doc-2')
  })
})
