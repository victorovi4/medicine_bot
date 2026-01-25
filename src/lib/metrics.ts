/**
 * Конфигурация отслеживаемых показателей.
 * Нормы, единицы измерения, цвета для графиков.
 */

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
}

/**
 * Список всех отслеживаемых показателей.
 */
export const TRACKED_METRICS = Object.keys(METRICS_CONFIG)

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
 * Извлекает измерения из keyValues документа.
 * Возвращает массив { name, value, unit } для отслеживаемых показателей.
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
    
    measurements.push({
      name: canonicalName,
      value: parsed.value,
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
