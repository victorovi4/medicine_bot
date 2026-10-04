/**
 * Отслеживаемые показатели: извлечение из keyValues, статусы, форматирование.
 * Справочник (нормы, группы) — в metrics-config.ts, канонизация названий — в metric-names.ts.
 */

import { PATIENT } from '@/lib/patient'
import { METRICS_CONFIG, isPlausibleValue, type MetricConfig } from '@/lib/metrics-config'
import { canonicalizeMetricName } from '@/lib/metric-names'

export { METRICS_CONFIG, METRIC_GROUPS, isPlausibleValue } from '@/lib/metrics-config'
export type { MetricConfig, MetricGroup } from '@/lib/metrics-config'

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
 * Получить конфиг метрики по названию (точное имя, алиас или строка из анализа).
 */
export function getMetricConfig(name: string): MetricConfig | null {
  if (!name) return null
  if (METRICS_CONFIG[name]) return METRICS_CONFIG[name]
  const canonical = canonicalizeMetricName(name)
  return canonical ? METRICS_CONFIG[canonical] ?? null : null
}

/**
 * Получить каноническое название метрики.
 */
export function getCanonicalMetricName(name: string): string | null {
  const config = getMetricConfig(name)
  return config?.name || null
}

/**
 * Парсит строку вида "4.5 нг/мл", "130 г/л [130-160]", "5.1 [< 10]", "80 [> 60]"
 * в { value, unit, normalMin, normalMax }.
 */
export function parseValueWithUnit(str: string): {
  value: number; unit: string; normalMin?: number; normalMax?: number
} | null {
  if (!str) return null

  // Паттерн: число единицы [норма: мин-макс] или [мин-макс]
  const rangMatch = str.match(/^([\d.,]+)\s*([^[\]]*?)(?:\s*\[(?:норма:\s*)?([\d.,]+)\s*[-–]\s*([\d.,]+)\])?$/)
  if (rangMatch) {
    const value = parseFloat(rangMatch[1].replace(',', '.'))
    if (isNaN(value)) return null
    const unit = rangMatch[2].trim() || ''
    const normalMin = rangMatch[3] ? parseFloat(rangMatch[3].replace(',', '.')) : undefined
    const normalMax = rangMatch[4] ? parseFloat(rangMatch[4].replace(',', '.')) : undefined
    return { value, unit, normalMin, normalMax }
  }

  // Паттерн одностороннего референса: "79 г/л [< 41]" или "5.1 [> 3.5]"
  const boundMatch = str.match(/^([\d.,]+)\s*([^[\]]*?)\s*\[\s*([<>])\s*([\d.,]+)\s*\]$/)
  if (boundMatch) {
    const value = parseFloat(boundMatch[1].replace(',', '.'))
    if (isNaN(value)) return null
    const unit = boundMatch[2].trim() || ''
    const bound = parseFloat(boundMatch[4].replace(',', '.'))
    if (boundMatch[3] === '<') return { value, unit, normalMax: bound }
    if (boundMatch[3] === '>') return { value, unit, normalMin: bound }
  }

  return null
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
 * Возвращает массив { name, value, unit, normalMin, normalMax, isAbnormal } для отслеживаемых показателей.
 * Включает валидацию и автокоррекцию очевидных ошибок OCR.
 */
export function extractMeasurements(
  keyValues: Record<string, string> | null | undefined
): Array<{ name: string; value: number; unit: string; normalMin?: number; normalMax?: number; isAbnormal?: boolean }> {
  if (!keyValues || typeof keyValues !== 'object') {
    return []
  }

  const measurements: Array<{ name: string; value: number; unit: string; normalMin?: number; normalMax?: number; isAbnormal?: boolean }> = []

  for (const [key, valueStr] of Object.entries(keyValues)) {
    if (typeof valueStr !== 'string') continue

    // Парсим значение
    const parsed = parseValueWithUnit(valueStr)
    if (!parsed) continue

    // Проверяем, отслеживаем ли мы этот показатель (единица различает "Нейтрофилы" и "Нейтрофилы %")
    const canonicalName = canonicalizeMetricName(key, parsed.unit)
    if (!canonicalName) continue

    const config = METRICS_CONFIG[canonicalName]
    if (!config) continue

    // Валидируем и корректируем значение
    const { value: correctedValue } = validateAndCorrectValue(canonicalName, parsed.value)
    if (!isPlausibleValue(canonicalName, correctedValue)) continue

    // Определяем normalMin/normalMax: приоритет — из документа, затем из конфига
    const normalMin = parsed.normalMin ?? config.normalMin
    const normalMax = parsed.normalMax ?? config.normalMax

    // Определяем, выходит ли за пределы нормы
    const isAbnormal = normalMin !== undefined && normalMax !== undefined
      ? correctedValue < normalMin || correctedValue > normalMax
      : undefined

    measurements.push({
      name: canonicalName,
      value: correctedValue,
      unit: parsed.unit || config.unit,
      normalMin,
      normalMax,
      isAbnormal,
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
