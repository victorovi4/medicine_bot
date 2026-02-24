import { describe, it, expect, vi } from 'vitest'
import {
  METRICS_CONFIG,
  TRACKED_METRICS,
  getMetricConfig,
  getCanonicalMetricName,
  getActiveMetricsConfig,
  parseValueWithUnit,
  extractMeasurements,
  getValueStatus,
  formatMetricValue,
  calculateChange,
} from '@/lib/metrics'

describe('METRICS_CONFIG', () => {
  it('должен содержать все отслеживаемые показатели', () => {
    expect(METRICS_CONFIG['ПСА общий']).toBeDefined()
    expect(METRICS_CONFIG['ПСА свободный']).toBeDefined()
    expect(METRICS_CONFIG['Гемоглобин']).toBeDefined()
    expect(METRICS_CONFIG['СРБ']).toBeDefined()
    expect(METRICS_CONFIG['Парапротеин']).toBeDefined()
    expect(METRICS_CONFIG['Глюкоза']).toBeDefined()
    expect(METRICS_CONFIG['Гликированный гемоглобин']).toBeDefined()
    expect(METRICS_CONFIG['Тромбоциты']).toBeDefined()
    expect(METRICS_CONFIG['Лейкоциты']).toBeDefined()
  })

  it('каждый показатель должен иметь обязательные поля', () => {
    for (const [name, config] of Object.entries(METRICS_CONFIG)) {
      expect(config.name).toBe(name)
      expect(config.aliases).toBeInstanceOf(Array)
      expect(typeof config.unit).toBe('string')
      expect(typeof config.normalMin).toBe('number')
      expect(typeof config.normalMax).toBe('number')
      expect(typeof config.color).toBe('string')
      expect(typeof config.description).toBe('string')
    }
  })

  it('TRACKED_METRICS должен содержать все ключи METRICS_CONFIG', () => {
    expect(TRACKED_METRICS).toHaveLength(Object.keys(METRICS_CONFIG).length)
    expect(TRACKED_METRICS).toContain('ПСА общий')
    expect(TRACKED_METRICS).toContain('Гемоглобин')
    expect(TRACKED_METRICS).toContain('Парапротеин')
    expect(TRACKED_METRICS).toContain('Лейкоциты')
  })
})

describe('getActiveMetricsConfig', () => {
  it('по умолчанию (Иоффе) возвращает подмножество из trackingMetrics', () => {
    // Default PATIENT.trackingMetrics = ['ПСА общий', 'ПСА свободный', 'Гемоглобин', 'СРБ']
    const active = getActiveMetricsConfig()
    const keys = Object.keys(active)
    expect(keys).toContain('ПСА общий')
    expect(keys).toContain('Гемоглобин')
    // Не должен содержать метрики, не входящие в trackingMetrics по умолчанию
    expect(keys).not.toContain('Парапротеин')
    expect(keys).not.toContain('Глюкоза')
  })

  it('должен возвращать только метрики из PATIENT.trackingMetrics', () => {
    // Проверяем что все возвращённые метрики есть в METRICS_CONFIG
    const active = getActiveMetricsConfig()
    for (const key of Object.keys(active)) {
      expect(METRICS_CONFIG[key]).toBeDefined()
    }
  })
})

describe('getMetricConfig', () => {
  it('должен находить конфиг по точному названию', () => {
    const config = getMetricConfig('Гемоглобин')
    expect(config).not.toBeNull()
    expect(config?.name).toBe('Гемоглобин')
  })

  it('должен находить конфиг по алиасу', () => {
    expect(getMetricConfig('HGB')?.name).toBe('Гемоглобин')
    expect(getMetricConfig('Hb')?.name).toBe('Гемоглобин')
    expect(getMetricConfig('PSA')?.name).toBe('ПСА общий')
    expect(getMetricConfig('fPSA')?.name).toBe('ПСА свободный')
    // Новые метрики
    expect(getMetricConfig('М-градиент')?.name).toBe('Парапротеин')
    expect(getMetricConfig('M-protein')?.name).toBe('Парапротеин')
    expect(getMetricConfig('GLU')?.name).toBe('Глюкоза')
    expect(getMetricConfig('Сахар крови')?.name).toBe('Глюкоза')
    expect(getMetricConfig('HbA1c')?.name).toBe('Гликированный гемоглобин')
    expect(getMetricConfig('PLT')?.name).toBe('Тромбоциты')
    expect(getMetricConfig('WBC')?.name).toBe('Лейкоциты')
  })

  it('должен быть регистронезависимым', () => {
    expect(getMetricConfig('гемоглобин')?.name).toBe('Гемоглобин')
    expect(getMetricConfig('ГЕМОГЛОБИН')?.name).toBe('Гемоглобин')
    expect(getMetricConfig('hgb')?.name).toBe('Гемоглобин')
  })

  it('должен возвращать null для неизвестных показателей', () => {
    expect(getMetricConfig('Неизвестный показатель')).toBeNull()
    expect(getMetricConfig('')).toBeNull()
  })
})

describe('getCanonicalMetricName', () => {
  it('должен возвращать каноническое название', () => {
    expect(getCanonicalMetricName('HGB')).toBe('Гемоглобин')
    expect(getCanonicalMetricName('PSA')).toBe('ПСА общий')
    expect(getCanonicalMetricName('Гемоглобин')).toBe('Гемоглобин')
  })

  it('должен возвращать null для неизвестных', () => {
    expect(getCanonicalMetricName('Неизвестный')).toBeNull()
  })
})

describe('parseValueWithUnit', () => {
  it('должен парсить значения с единицами', () => {
    expect(parseValueWithUnit('130 г/л')).toMatchObject({ value: 130, unit: 'г/л' })
    expect(parseValueWithUnit('4.5 нг/мл')).toMatchObject({ value: 4.5, unit: 'нг/мл' })
    expect(parseValueWithUnit('120 мм/ч')).toMatchObject({ value: 120, unit: 'мм/ч' })
  })

  it('должен парсить значения с запятой', () => {
    expect(parseValueWithUnit('4,5 нг/мл')).toMatchObject({ value: 4.5, unit: 'нг/мл' })
    expect(parseValueWithUnit('9,2 г/л')).toMatchObject({ value: 9.2, unit: 'г/л' })
  })

  it('должен парсить значения без единиц', () => {
    expect(parseValueWithUnit('130')).toMatchObject({ value: 130, unit: '' })
    expect(parseValueWithUnit('4.5')).toMatchObject({ value: 4.5, unit: '' })
  })

  it('должен парсить значения с референсными нормами', () => {
    const result = parseValueWithUnit('130 г/л [130-160]')
    expect(result).toMatchObject({ value: 130, unit: 'г/л', normalMin: 130, normalMax: 160 })
  })

  it('должен парсить значения с "норма:" префиксом', () => {
    const result = parseValueWithUnit('25 мм/ч [норма: 2-15]')
    expect(result).toMatchObject({ value: 25, unit: 'мм/ч', normalMin: 2, normalMax: 15 })
  })

  it('должен парсить значения с en-dash в нормах', () => {
    const result = parseValueWithUnit('4,5 нг/мл [0–4]')
    expect(result).toMatchObject({ value: 4.5, unit: 'нг/мл', normalMin: 0, normalMax: 4 })
  })

  it('должен возвращать undefined для normalMin/normalMax без норм', () => {
    const result = parseValueWithUnit('130 г/л')
    expect(result?.normalMin).toBeUndefined()
    expect(result?.normalMax).toBeUndefined()
  })

  it('должен возвращать null для пустых строк', () => {
    expect(parseValueWithUnit('')).toBeNull()
  })

  it('должен возвращать null для нечисловых строк', () => {
    expect(parseValueWithUnit('abc')).toBeNull()
    expect(parseValueWithUnit('не обнаружен')).toBeNull()
  })
})

describe('extractMeasurements', () => {
  it('должен извлекать отслеживаемые показатели', () => {
    const keyValues = {
      'Гемоглобин': '130 г/л',
      'СОЭ': '25 мм/ч', // не отслеживается
    }
    const result = extractMeasurements(keyValues)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      name: 'Гемоглобин',
      value: 130,
      unit: 'г/л',
    })
  })

  it('должен обрабатывать алиасы', () => {
    const keyValues = {
      'HGB': '140 г/л',
    }
    const result = extractMeasurements(keyValues)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Гемоглобин')
  })

  it('должен автокорректировать ошибки OCR для гемоглобина', () => {
    // Значение < 30 г/л умножается на 10
    const keyValues = {
      'Гемоглобин': '9.2 г/л', // ошибка OCR, должно быть 92
    }
    const result = extractMeasurements(keyValues)
    expect(result).toHaveLength(1)
    expect(result[0].value).toBe(92) // автокоррекция
  })

  it('не должен корректировать нормальные значения гемоглобина', () => {
    const keyValues = {
      'Гемоглобин': '84 г/л', // низкий, но реальный
    }
    const result = extractMeasurements(keyValues)
    expect(result[0].value).toBe(84) // не меняется
  })

  it('должен возвращать пустой массив для null/undefined', () => {
    expect(extractMeasurements(null)).toEqual([])
    expect(extractMeasurements(undefined)).toEqual([])
  })

  it('должен пропускать нечисловые значения', () => {
    const keyValues = {
      'Гемоглобин': 'не обнаружен',
    }
    const result = extractMeasurements(keyValues)
    expect(result).toHaveLength(0)
  })
})

describe('getValueStatus', () => {
  it('должен определять нормальные значения', () => {
    expect(getValueStatus('Гемоглобин', 140)).toBe('normal')
    expect(getValueStatus('ПСА общий', 2)).toBe('normal')
  })

  it('должен определять низкие значения', () => {
    expect(getValueStatus('Гемоглобин', 100)).toBe('low')
    expect(getValueStatus('Гемоглобин', 71)).toBe('low')
  })

  it('должен определять высокие значения', () => {
    expect(getValueStatus('Гемоглобин', 170)).toBe('high')
    expect(getValueStatus('ПСА общий', 5)).toBe('high')
  })

  it('должен определять критические значения', () => {
    expect(getValueStatus('ПСА общий', 15)).toBe('critical')
  })

  it('должен возвращать unknown для неизвестных показателей', () => {
    expect(getValueStatus('Неизвестный', 100)).toBe('unknown')
  })
})

describe('formatMetricValue', () => {
  it('должен форматировать значение с единицами', () => {
    expect(formatMetricValue('Гемоглобин', 130)).toBe('130 г/л')
    expect(formatMetricValue('ПСА общий', 4.5)).toBe('4.5 нг/мл')
  })

  it('должен работать с неизвестными показателями', () => {
    expect(formatMetricValue('Неизвестный', 100)).toBe('100')
  })
})

describe('calculateChange', () => {
  it('должен вычислять процент увеличения', () => {
    const result = calculateChange(100, 150)
    expect(result.percent).toBe(50)
    expect(result.direction).toBe('up')
  })

  it('должен вычислять процент уменьшения', () => {
    const result = calculateChange(100, 80)
    expect(result.percent).toBe(-20)
    expect(result.direction).toBe('down')
  })

  it('должен определять стабильное значение', () => {
    const result = calculateChange(100, 100.5)
    expect(result.direction).toBe('stable')
  })

  it('должен обрабатывать нулевое начальное значение', () => {
    const result = calculateChange(0, 100)
    expect(result.percent).toBe(0)
    expect(result.direction).toBe('stable')
  })

  it('должен округлять процент', () => {
    const result = calculateChange(71, 107)
    expect(result.percent).toBe(51) // 50.7% -> 51%
    expect(result.direction).toBe('up')
  })
})
