import { describe, it, expect } from 'vitest'
import {
  canonicalizeMetricName,
  buildMeasurementsDynamicsFromExtracted,
  parseTablesFromFullText,
  type ExtractedDocument,
} from '@/lib/claude-two-pass'

// Реальные строки из медкарты Иоффе В.Б. (Хеликс, Мариинская больница)

describe('canonicalizeMetricName', () => {
  it('не принимает соотношение свободный/общий ПСА за ПСА общий', () => {
    expect(canonicalizeMetricName('Соотношение ПСА свободный/ПСА общий')).toBeNull()
  })

  it('понимает названия с квалификаторами [масса/объем]', () => {
    expect(canonicalizeMetricName('Гемоглобин [масса / объем] в венозной крови')).toBe('Гемоглобин')
    expect(canonicalizeMetricName('Гемоглобин [масса/объем] в венозной крови')).toBe('Гемоглобин')
    expect(canonicalizeMetricName('Простатический антиген (ПСА) [масса/объем] в сыворотке или плазме крови')).toBe('ПСА общий')
    expect(canonicalizeMetricName('С-реактивный белок [масса / объем] в сыворотке или плазме')).toBe('СРБ')
  })

  it('по-прежнему отсекает производные показатели ОАК', () => {
    expect(canonicalizeMetricName('Средняя концентрация гемоглобина (MCHC) [масса / объем] в эритроците')).toBeNull()
    expect(canonicalizeMetricName('Средний объем эритроцитов (MCV) автоматизированным подсчетом')).toBeNull()
  })

  it('не берёт показатели мочи', () => {
    expect(canonicalizeMetricName('Эритроциты [#/объем] в моче методом автоматизированного подсчета')).toBeNull()
    expect(canonicalizeMetricName('Лейкоциты [#/объем] в моче с помощью тест-полоски')).toBeNull()
  })

  it('выбирает самое длинное совпадение', () => {
    expect(canonicalizeMetricName('ПСА свободный, концентрация')).toBe('ПСА свободный')
  })

  it('не путает общий белок с СРБ', () => {
    expect(canonicalizeMetricName('Белок')).toBeNull()
  })
})

describe('buildMeasurementsDynamicsFromExtracted', () => {
  const doc = (tables: ExtractedDocument['pages'][0]['tables'], documentDate: string | null = null): ExtractedDocument => ({
    documentType: 'анализ крови', documentDate, patientName: null, clinic: null, doctor: null,
    pages: [{ pageNumber: 1, tables, textBlocks: [] }],
  })

  it('берёт название показателя из заголовка таблицы, если строка называется «Концентрация»', () => {
    const result = buildMeasurementsDynamicsFromExtracted(doc([
      { title: 'Простатспецифический антиген (ПСА) общий', dates: ['02.06.2026'],
        rows: [{ name: 'Концентрация', unit: 'нг/мл', normalMin: 0, normalMax: 4, values: [0.029] }] },
      { title: 'Простатспецифический антиген (ПСА) свободный', dates: ['02.06.2026'],
        rows: [{ name: 'Концентрация', unit: 'нг/мл', normalMin: null, normalMax: null, values: [0.009] }] },
    ]))
    expect(result).toEqual([
      { name: 'ПСА общий', unit: 'нг/мл', values: [{ date: '2026-06-02', value: 0.029 }] },
      { name: 'ПСА свободный', unit: 'нг/мл', values: [{ date: '2026-06-02', value: 0.009 }] },
    ])
  })

  it('пропускает таблицы анализа мочи', () => {
    const result = buildMeasurementsDynamicsFromExtracted(doc([
      { title: 'Общий (клинический) анализ мочи', dates: ['12.03.2026'],
        rows: [{ name: 'Лейкоциты', unit: '1/мкл', normalMin: null, normalMax: 25, values: [25] }] },
    ]))
    expect(result).toEqual([])
  })

  it('для таблицы без дат использует дату документа', () => {
    const result = buildMeasurementsDynamicsFromExtracted(doc([
      { title: 'Биохимия', dates: null,
        rows: [{ name: 'С-реактивный белок', unit: 'мг/л', normalMin: 0, normalMax: 5, values: [83.71] }] },
    ], '2026-02-22'))
    expect(result).toEqual([{ name: 'СРБ', unit: 'мг/л', values: [{ date: '2026-02-22', value: 83.71 }] }])
  })
})

describe('parseTablesFromFullText', () => {
  it('восстанавливает таблицы из сохранённого fullText (анализ Хеликс)', () => {
    const fullText = [
      'Тип: анализ крови',
      'Дата: 2026-09-21',
      'Руководитель лабораторного комплекса А.С. Равтович',
      '',
      '## Простатспецифический антиген (ПСА) общий',
      'Даты: 21.09.2026',
      'Концентрация: 0.01 нг/мл [<4]',
    ].join('\n')
    const dyn = buildMeasurementsDynamicsFromExtracted(parseTablesFromFullText(fullText, '2026-09-21'))
    expect(dyn).toEqual([{ name: 'ПСА общий', unit: 'нг/мл', values: [{ date: '2026-09-21', value: 0.01 }] }])
  })

  it('восстанавливает многодатные таблицы выписки и строки с двоеточием в названии', () => {
    const fullText = [
      'C61 Рак предстательной железы',
      '',
      '## Общий (клинический) анализ крови развернутый',
      'Даты: 16.03.2026',
      'Гемоглобин [масса / объем] в венозной крови: 75 г/л [126-174]',
      'Нейтрофилы: палочк.: 0.8 % [0-5]',
      '',
      '## Биохимия',
      'Даты: 17.03.2026',
      'С-реактивный белок [масса / объем] в сыворотке или плазме: 25.4 мг/л [0-5]',
      '',
      '## Клинический анализ крови',
      'Даты: 21.04.2026 | 22.04.2026 | 25.04.2026',
      'Гемоглобин (HGB): 82 | 72 | 110 г/л [130-160]',
      'Средний объем эритроцита (MCV): 109.3 | 112.6 | 102.4 фл [80-90]',
      'Рекомендовано: контроль ОАК через 10 дней: 2 раза',
    ].join('\n')
    const dyn = buildMeasurementsDynamicsFromExtracted(parseTablesFromFullText(fullText, '2026-04-28'))
    expect(dyn).toEqual([
      { name: 'Гемоглобин', unit: 'г/л', values: [{ date: '2026-03-16', value: 75 }] },
      { name: 'СРБ', unit: 'мг/л', values: [{ date: '2026-03-17', value: 25.4 }] },
      { name: 'Гемоглобин', unit: 'г/л', values: [
        { date: '2026-04-21', value: 82 }, { date: '2026-04-22', value: 72 }, { date: '2026-04-25', value: 110 },
      ] },
    ])
  })

  it('пропускает прочерки в значениях', () => {
    const fullText = '## Биохимия\nДаты: 21.04.2026 | 22.04.2026\nС-реактивный белок: — | 40 мг/л'
    const dyn = buildMeasurementsDynamicsFromExtracted(parseTablesFromFullText(fullText, null))
    expect(dyn).toEqual([{ name: 'СРБ', unit: 'мг/л', values: [{ date: '2026-04-22', value: 40 }] }])
  })
})
