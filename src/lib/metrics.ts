/**
 * Конфигурация отслеживаемых показателей.
 * Нормы, единицы измерения, цвета для графиков.
 */

import { PATIENT } from '@/lib/patient'

export interface MetricConfig {
  name: string           // Название показателя
  aliases: string[]      // Альтернативные названия для парсинга
  unit: string           // Единица измерения
  normalMin: number      // Нижняя граница нормы
  normalMax: number      // Верхняя граница нормы
  critical?: number      // Критическое значение (опционально)
  color: string          // Цвет на графике
  description: string    // Описание для UI
}

/**
 * Справочник отслеживаемых показателей.
 * Ключ — каноническое название.
 */
export const METRICS_CONFIG: Record<string, MetricConfig> = {
  'ПСА общий': {
    name: 'ПСА общий',
    aliases: ['ПСА', 'PSA', 'PSA total', 'ПСА общ', 'Простатический специфический антиген'],
    unit: 'нг/мл',
    normalMin: 0,
    normalMax: 4.0,
    critical: 10.0,
    color: '#ef4444', // Красный — онкомаркер
    description: 'Простатический специфический антиген (онкомаркер)',
  },
  'ПСА свободный': {
    name: 'ПСА свободный',
    aliases: ['ПСА своб', 'PSA free', 'fPSA', 'Свободный ПСА'],
    unit: 'нг/мл',
    normalMin: 0,
    normalMax: 0.93,
    color: '#f97316', // Оранжевый
    description: 'Свободная фракция ПСА',
  },
  'Гемоглобин': {
    name: 'Гемоглобин',
    aliases: ['Hb', 'HGB', 'Hemoglobin', 'Гемоглоб'],
    unit: 'г/л',
    normalMin: 130,
    normalMax: 160,
    color: '#3b82f6', // Синий
    description: 'Уровень гемоглобина в крови',
  },
  'СРБ': {
    name: 'СРБ',
    aliases: ['C-реактивный белок', 'CRP', 'C-reactive protein', 'С-реактивный белок', 'СРБ ультрачувствительный', 'hs-CRP', 'СРБ количественно'],
    unit: 'мг/л',
    normalMin: 0,
    normalMax: 5.0,
    critical: 50.0, // Высокий уровень воспаления
    color: '#f59e0b', // Янтарный — маркер воспаления
    description: 'C-реактивный белок — маркер воспаления',
  },
  'Парапротеин': {
    name: 'Парапротеин',
    aliases: ['М-градиент', 'M-protein', 'М-белок', 'M-градиент', 'Парапротеин (М-градиент)', 'M-spike'],
    unit: 'г/л',
    normalMin: 0,
    normalMax: 0,
    color: '#8b5cf6', // Фиолетовый — маркер миеломы
    description: 'Парапротеин (М-градиент) — маркер множественной миеломы',
  },
  'Глюкоза': {
    name: 'Глюкоза',
    aliases: ['Glucose', 'Сахар крови', 'GLU', 'Глюкоза крови', 'Глюкоза натощак'],
    unit: 'ммоль/л',
    normalMin: 3.9,
    normalMax: 6.1,
    color: '#10b981', // Зелёный
    description: 'Уровень глюкозы в крови',
  },
  'Гликированный гемоглобин': {
    name: 'Гликированный гемоглобин',
    aliases: ['HbA1c', 'A1c', 'Гликозилированный гемоглобин', 'Glycated hemoglobin'],
    unit: '%',
    normalMin: 4.0,
    normalMax: 6.0,
    color: '#06b6d4', // Циан
    description: 'Гликированный гемоглобин (HbA1c) — контроль диабета',
  },
  'Тромбоциты': {
    name: 'Тромбоциты',
    aliases: ['PLT', 'Platelets', 'Тромб.', 'Тромбоц.'],
    unit: '×10⁹/л',
    normalMin: 150,
    normalMax: 400,
    color: '#ec4899', // Розовый
    description: 'Количество тромбоцитов в крови',
  },
  'Лейкоциты': {
    name: 'Лейкоциты',
    aliases: ['WBC', 'Leukocytes', 'Лейкоц.', 'Лейк.', 'White blood cells'],
    unit: '×10⁹/л',
    normalMin: 4.0,
    normalMax: 9.0,
    color: '#14b8a6', // Тил
    description: 'Количество лейкоцитов в крови',
  },
}

/**
 * Список всех отслеживаемых показателей.
 */
export const TRACKED_METRICS = Object.keys(METRICS_CONFIG)

/**
 * Возвращает подмножество METRICS_CONFIG на основе PATIENT.trackingMetrics.
 * Если trackingMetrics пуст или ни одна метрика не найдена — возвращает полный METRICS_CONFIG.
 * Используется в API /api/metrics для фильтрации отображаемых графиков.
 * extractMeasurements() продолжает работать с полным METRICS_CONFIG —
 * документы сохраняют ВСЕ найденные метрики, фильтрация только при отображении.
 */
export function getActiveMetricsConfig(): Record<string, MetricConfig> {
  const tracked = PATIENT.trackingMetrics
  if (tracked.length === 0) return METRICS_CONFIG
  const active: Record<string, MetricConfig> = {}
  for (const metricName of tracked) {
    if (METRICS_CONFIG[metricName]) {
      active[metricName] = METRICS_CONFIG[metricName]
    }
  }
  return Object.keys(active).length > 0 ? active : METRICS_CONFIG
}

/**
 * Получить конфиг метрики по названию (с учётом алиасов).
 */
export function getMetricConfig(name: string): MetricConfig | null {
  // Точное совпадение
  if (METRICS_CONFIG[name]) {
    return METRICS_CONFIG[name]
  }
  
  // Поиск по алиасам
  const nameLower = name.toLowerCase().trim()
  for (const [key, config] of Object.entries(METRICS_CONFIG)) {
    if (key.toLowerCase() === nameLower) {
      return config
    }
    for (const alias of config.aliases) {
      if (alias.toLowerCase() === nameLower) {
        return config
      }
    }
  }
  
  return null
}

/**
 * Получить каноническое название метрики.
 */
export function getCanonicalMetricName(name: string): string | null {
  const config = getMetricConfig(name)
  return config?.name || null
}

/**
 * Парсит строку вида "4.5 нг/мл" в { value, unit }.
 */
export function parseValueWithUnit(str: string): { value: number; unit: string } | null {
  if (!str) return null
  
  // Паттерн: число (возможно с запятой/точкой) + опционально единицы
  const match = str.match(/^([\d.,]+)\s*(.*)$/)
  if (!match) return null
  
  // Заменяем запятую на точку для парсинга
  const valueStr = match[1].replace(',', '.')
  const value = parseFloat(valueStr)
  
  if (isNaN(value)) return null
  
  const unit = match[2].trim() || ''
  return { value, unit }
}

/**
 * Валидация и автокоррекция значений.
 * Исправляет очевидные ошибки OCR (например, 9.2 г/л -> 92 г/л для гемоглобина).
 */
function validateAndCorrectValue(
  metricName: string,
  value: number
): { value: number; corrected: boolean } {
  // Гемоглобин: норма 130-160 г/л, значения < 30 г/л невозможны
  // Если значение < 30, скорее всего OCR пропустил цифру (9.2 -> 92, 8.4 -> 84)
  if (metricName === 'Гемоглобин') {
    if (value < 30 && value > 0) {
      // Вероятно, значение должно быть умножено на 10
      return { value: value * 10, corrected: true }
    }
  }
  
  // ПСА: отрицательные значения невозможны
  if (metricName.includes('ПСА') && value < 0) {
    return { value: 0, corrected: true }
  }
  
  return { value, corrected: false }
}

/**
 * Извлекает измерения из keyValues документа.
 * Возвращает массив { name, value, unit } для отслеживаемых показателей.
 * Включает валидацию и автокоррекцию очевидных ошибок OCR.
 */
export function extractMeasurements(
  keyValues: Record<string, string> | null | undefined
): Array<{ name: string; value: number; unit: string }> {
  if (!keyValues || typeof keyValues !== 'object') {
    return []
  }
  
  const measurements: Array<{ name: string; value: number; unit: string }> = []
  
  for (const [key, valueStr] of Object.entries(keyValues)) {
    // Проверяем, отслеживаем ли мы этот показатель
    const canonicalName = getCanonicalMetricName(key)
    if (!canonicalName) continue
    
    const config = METRICS_CONFIG[canonicalName]
    if (!config) continue
    
    // Парсим значение
    const parsed = parseValueWithUnit(valueStr)
    if (!parsed) continue
    
    // Валидируем и корректируем значение
    const { value: correctedValue } = validateAndCorrectValue(canonicalName, parsed.value)
    
    measurements.push({
      name: canonicalName,
      value: correctedValue,
      unit: parsed.unit || config.unit,
    })
  }
  
  return measurements
}

/**
 * Определяет статус значения относительно нормы.
 */
export function getValueStatus(
  metricName: string,
  value: number
): 'normal' | 'low' | 'high' | 'critical' | 'unknown' {
  const config = getMetricConfig(metricName)
  if (!config) return 'unknown'
  
  if (config.critical !== undefined && value >= config.critical) {
    return 'critical'
  }
  
  if (value < config.normalMin) {
    return 'low'
  }
  
  if (value > config.normalMax) {
    return 'high'
  }
  
  return 'normal'
}

/**
 * Форматирует значение с единицами.
 */
export function formatMetricValue(metricName: string, value: number): string {
  const config = getMetricConfig(metricName)
  const unit = config?.unit || ''
  return `${value} ${unit}`.trim()
}

/**
 * Вычисляет процент изменения между двумя значениями.
 */
export function calculateChange(oldValue: number, newValue: number): {
  percent: number
  direction: 'up' | 'down' | 'stable'
} {
  if (oldValue === 0) {
    return { percent: 0, direction: 'stable' }
  }
  
  const percent = ((newValue - oldValue) / oldValue) * 100
  
  if (Math.abs(percent) < 1) {
    return { percent: 0, direction: 'stable' }
  }
  
  return {
    percent: Math.round(percent),
    direction: percent > 0 ? 'up' : 'down',
  }
}
