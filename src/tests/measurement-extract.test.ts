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
    expect(canonicalizeMetricName('Средний объем эритроцитов (MCV) автоматизированным подсчетом')).toBe('MCV') // с 10.2026 MCV отслеживается
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
      { name: 'MCV', unit: 'фл', values: [
        { date: '2026-04-21', value: 109.3 }, { date: '2026-04-22', value: 112.6 }, { date: '2026-04-25', value: 102.4 },
      ] },
    ])
  })

  it('пропускает прочерки в значениях', () => {
    const fullText = '## Биохимия\nДаты: 21.04.2026 | 22.04.2026\nС-реактивный белок: — | 40 мг/л'
    const dyn = buildMeasurementsDynamicsFromExtracted(parseTablesFromFullText(fullText, null))
    expect(dyn).toEqual([{ name: 'СРБ', unit: 'мг/л', values: [{ date: '2026-04-22', value: 40 }] }])
  })
})

// Реальные строки из карты Иоффе В.Б.: расширение набора показателей (10.2026)
describe('canonicalizeMetricName — расширенный набор показателей', () => {
  it('MCV распознаётся во всех вариантах написания, но не RDW/MPV', () => {
    expect(canonicalizeMetricName('Средний объем эритроцита (MCV)')).toBe('MCV')
    expect(canonicalizeMetricName('Ср.объем эритр (MCV)')).toBe('MCV')
    expect(canonicalizeMetricName('MCV')).toBe('MCV')
    expect(canonicalizeMetricName('MCV (средний объем эритроцита)')).toBe('MCV')
    expect(canonicalizeMetricName('Средний объем эритроцита в крови методом автоматизированного подсчёта')).toBe('MCV')
    expect(canonicalizeMetricName('Средний объем тромбоцита (MPV)')).toBeNull()
    expect(canonicalizeMetricName('Распр. эрит. по V - станд отклон(RDW-SD)')).toBeNull()
    expect(canonicalizeMetricName('Стандартное отклонение ширины распределения эритроцитов по объему эритроцитов по объему')).toBeNull()
    expect(canonicalizeMetricName('Средн. сод. гемоглобина в эр-те (MCH)')).toBeNull()
    expect(canonicalizeMetricName('MCH')).toBeNull()
  })

  it('лейкоцитарная формула: абсолютные и относительные значения — разные метрики', () => {
    expect(canonicalizeMetricName('Нейтрофилы (NE)', '*10^9/л')).toBe('Нейтрофилы')
    expect(canonicalizeMetricName('Нейтрофилы, % (NE%)', '%')).toBe('Нейтрофилы %')
    expect(canonicalizeMetricName('Нейтрофилы (NEUT= BAND + SEG)', '10^9/л')).toBe('Нейтрофилы')
    expect(canonicalizeMetricName('Нейтрофилы % (NEUT% = BAND% + SEG%)', '%')).toBe('Нейтрофилы %')
    expect(canonicalizeMetricName('Нейтрофилы абс.', 'х10^9/л')).toBe('Нейтрофилы')
    expect(canonicalizeMetricName('Нейтрофилы', '%')).toBe('Нейтрофилы %')
    expect(canonicalizeMetricName('NEUT (Абс.количество нейтрофилов)', '10^9/л')).toBe('Нейтрофилы')
    expect(canonicalizeMetricName('АЧН', 'х10*9/л')).toBe('Нейтрофилы')
    expect(canonicalizeMetricName('Лимфоциты / 100 лейкоцитов в крови автоматизированным подсчетом', '%')).toBe('Лимфоциты %')
    expect(canonicalizeMetricName('Лимфоциты [# / объем] в крови автоматизированным подсчетом', '10^9/л')).toBe('Лимфоциты')
    expect(canonicalizeMetricName('LYM# (абсолютное кол-во лимфоцитов)', '10^9/л')).toBe('Лимфоциты')
    expect(canonicalizeMetricName('Лимфоциты, относительное количество в крови методом ручного подсчёта', '%')).toBe('Лимфоциты %')
    expect(canonicalizeMetricName('Моноциты (MO)', '*10^9/л')).toBe('Моноциты')
    expect(canonicalizeMetricName('Моноциты, % (МО%)', '%')).toBe('Моноциты %')
    expect(canonicalizeMetricName('MON# (моноциты)', '10^9/л')).toBe('Моноциты')
    expect(canonicalizeMetricName('Моноциты (микроскопия)', '%')).toBe('Моноциты %')
    expect(canonicalizeMetricName('Моноциты/100 лейкоцитов в крови автоматизированным подсчетом', '%')).toBe('Моноциты %')
  })

  it('подвиды нейтрофилов, миелограмма, эозинофилы/базофилы — не отслеживаем', () => {
    expect(canonicalizeMetricName('Нейтрофилы: палочк.', '%')).toBeNull()
    expect(canonicalizeMetricName('Нейтрофилы:Сегментоядерные', '%')).toBeNull()
    expect(canonicalizeMetricName('Нейтрофилы палочкоядерные, абсолютное количество в крови методом автоматизированного подсчёта', '10^9/л')).toBeNull()
    expect(canonicalizeMetricName('Нейтрофилы:Миелоциты', '%')).toBeNull()
    expect(canonicalizeMetricName('Всего клеток лимфоц. ростка', '%')).toBeNull()
    expect(canonicalizeMetricName('Эозинофилы / 100 лейкоцитов в крови автоматизированным подсчетом', '%')).toBeNull()
    expect(canonicalizeMetricName('Базофилы/100 лейкоцитов в крови методом автоматизированного подсчета', '%')).toBeNull()
    expect(canonicalizeMetricName('Незрелые гранулоциты (IG)', '10^9/л')).toBeNull()
  })

  it('коагулограмма и тромбокрит не попадают в Тромбоциты', () => {
    expect(canonicalizeMetricName('Тромбокрит (PCT)', '%')).toBeNull()
    expect(canonicalizeMetricName('PCT (тромбокрит)', '%')).toBeNull()
    expect(canonicalizeMetricName('Активированное частичное тромбопластиновое время', 'с')).toBeNull()
    expect(canonicalizeMetricName('АЧТВ', 'сек')).toBeNull()
    expect(canonicalizeMetricName('% протромбина по Квику', '%')).toBeNull()
    expect(canonicalizeMetricName('Протромбиновое время в бедной тромбоцитами плазме', 'с')).toBeNull()
    expect(canonicalizeMetricName('Тромбиновое время', 'сек')).toBeNull()
    expect(canonicalizeMetricName('Международное нормализованное отношение в бедной тромбоцитами плазме')).toBeNull()
    expect(canonicalizeMetricName('Тромбоциты (PLT)', '*10^9/л')).toBe('Тромбоциты')
    expect(canonicalizeMetricName('Тромб.', '10^9/л')).toBe('Тромбоциты')
    expect(canonicalizeMetricName('PLT (общее кол-во тромбоцитов)', '10^9/л')).toBe('Тромбоциты')
    // "фибриноген" длиннее "тромбоцит" — побеждает фибриноген
    expect(canonicalizeMetricName('Фибриноген [масса / объем] в плазме бедной тромбоцитами', 'г/л')).toBe('Фибриноген')
    expect(canonicalizeMetricName('Фибриноген по Клауссу', 'г/л')).toBe('Фибриноген')
  })

  it('АСТ/АЛТ только как целое слово, прайс-лист и антитела — мимо', () => {
    expect(canonicalizeMetricName('АСТ (Аспартатаминотрансфераза)', 'Ед/л')).toBe('АСТ')
    expect(canonicalizeMetricName('Исследование уровня аспартатаминотрансферазы в крови (ACT)', 'Ед/л')).toBe('АСТ')
    expect(canonicalizeMetricName('Аспартатаминотрансфера (АсАТ)', 'Ед/л')).toBe('АСТ')
    expect(canonicalizeMetricName('Аланинаминотрансфераза (АлАТ)', 'Ед/л')).toBe('АЛТ')
    expect(canonicalizeMetricName('А130283. Антитела к внутреннему фактору Кастла IgG (АВФ, Intrinsic factor antibodies, IgG), количеств.', 'руб.')).toBeNull()
    expect(canonicalizeMetricName('А110006. Клинический анализ крови: общий анализ, лейкоцитарная формула, СОЭ (ОАК, ЛФ, СОЭ) с микроскопией мазка крови при наличии патологических сдвигов', 'руб.')).toBeNull()
    expect(canonicalizeMetricName('Референтные пределы СОЭ по Вестергрену и интерпретация результатов')).toBeNull()
  })

  it('СОЭ, ферритин, креатинин (но не СКФ), белки, ЩФ, электролиты', () => {
    expect(canonicalizeMetricName('Скорость оседания', 'мм/ч')).toBe('СОЭ')
    expect(canonicalizeMetricName('Скорость оседания эритроцитов по Вестергрену', 'мм/ч')).toBe('СОЭ')
    expect(canonicalizeMetricName('СОЭ по Вестергрену', 'мм/ч')).toBe('СОЭ')
    expect(canonicalizeMetricName('Ферритин, массовая концентрация в сыворотке или плазме крови', 'нг/мл')).toBe('Ферритин')
    expect(canonicalizeMetricName('Исследование уровня трансферрина сыворотки крови', 'г/л')).toBeNull()
    expect(canonicalizeMetricName('Коэффициент насыщения трансферрина железом', '%')).toBeNull()
    expect(canonicalizeMetricName('Креатинин, молярная концентрация в сыворотке или плазме крови', 'мкмоль/л')).toBe('Креатинин')
    expect(canonicalizeMetricName('Скорость клубочковой фильтрации (СКФ) по креатинину на основе формулы CKD-EPI', 'мл/мин/1.73м^2')).toBeNull()
    expect(canonicalizeMetricName('Креатинкиназа', 'Ед/л')).toBeNull()
    expect(canonicalizeMetricName('Общий белок в сыворотке', 'г/л')).toBe('Общий белок')
    expect(canonicalizeMetricName('Белок общий, массовая концентрация в сыворотке или плазме крови', 'г/л')).toBe('Общий белок')
    expect(canonicalizeMetricName('Общий белок мочи, концентрация', 'г/л')).toBeNull()
    expect(canonicalizeMetricName('Белок')).toBeNull()
    expect(canonicalizeMetricName('Альбумин', 'г/л')).toBe('Альбумин')
    expect(canonicalizeMetricName('Albumin', '%')).toBeNull() // фракция электрофореза
    expect(canonicalizeMetricName('Определение активности щелочной фосфатазы в крови', 'Ед/л')).toBe('Щелочная фосфатаза')
    expect(canonicalizeMetricName('щелочная фосфотаза', 'ЕД/л')).toBe('Щелочная фосфатаза')
    expect(canonicalizeMetricName('Исследование уровня непрямого (свободного) билирубина в крови', 'мкмоль/л')).toBeNull()
    expect(canonicalizeMetricName('Билирубин общий, молярная концентрация в сыворотке или плазме крови', 'мкмоль/л')).toBe('Билирубин общий')
    expect(canonicalizeMetricName('Калий (К)', 'ммоль/л')).toBe('Калий')
    expect(canonicalizeMetricName('Кальций (Са)', 'ммоль/л')).toBeNull()
    expect(canonicalizeMetricName('Мочевая кислота', 'мкмоль/л')).toBeNull()
    expect(canonicalizeMetricName('Гликированный гемоглобин (HbA1c)', '%')).toBe('Гликированный гемоглобин')
    expect(canonicalizeMetricName('Анизоцитоз', 'балл')).toBeNull()
  })
})

describe('buildMeasurementsDynamicsFromExtracted — фильтр правдоподобия', () => {
  it('отбрасывает значения вне физиологического диапазона (цена, тромбокрит, процент)', () => {
    const extracted: ExtractedDocument = {
      documentType: 'анализ крови', documentDate: '2026-04-06', patientName: null, clinic: null, doctor: null,
      pages: [{ pageNumber: 1, textBlocks: [], tables: [
        { title: 'ОАК', dates: ['06.04.2026'], rows: [
          { name: 'Лейкоциты', unit: null, normalMin: null, normalMax: null, values: [730] },
          { name: 'Тромбоциты', unit: '10^9/л', normalMin: null, normalMax: null, values: [218] },
          { name: 'СОЭ', unit: null, normalMin: null, normalMax: null, values: [120] },
        ] },
      ] }],
    }
    expect(buildMeasurementsDynamicsFromExtracted(extracted)).toEqual([
      { name: 'Тромбоциты', unit: '10^9/л', values: [{ date: '2026-04-06', value: 218 }] },
      { name: 'СОЭ', unit: '', values: [{ date: '2026-04-06', value: 120 }] },
    ])
  })
})

describe('canonicalizeMetricName — клетки в микролитре (моча) не кровь', () => {
  it('отбрасывает лейкоциты/эритроциты в клет/мкл', () => {
    expect(canonicalizeMetricName('Лейкоциты', 'клет/мкл')).toBeNull()
    expect(canonicalizeMetricName('Эритроциты', 'клет/мкл')).toBeNull()
    expect(canonicalizeMetricName('Лейкоциты', '/мкл')).toBeNull()
    expect(canonicalizeMetricName('Лейкоциты (WBC)', '10^9/л')).toBe('Лейкоциты')
  })
})
