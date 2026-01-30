/**
 * Конфигурация и утилиты для дневника пациента.
 */

// Типы показателей здоровья
export interface VitalSignConfig {
  type: string
  name: string
  unit: string
  hasSecondValue: boolean // Для давления
  normMin?: number
  normMax?: number
  normMin2?: number // Для диастолического давления
  normMax2?: number
  icon: string
}

export const VITAL_SIGNS_CONFIG: VitalSignConfig[] = [
  {
    type: 'temperature',
    name: 'Температура',
    unit: '°C',
    hasSecondValue: false,
    normMin: 36.0,
    normMax: 37.0,
    icon: '🌡',
  },
  {
    type: 'pressure',
    name: 'Давление',
    unit: 'мм рт.ст.',
    hasSecondValue: true,
    normMin: 90, // Систолическое
    normMax: 140,
    normMin2: 60, // Диастолическое
    normMax2: 90,
    icon: '💓',
  },
  {
    type: 'pulse',
    name: 'Пульс',
    unit: 'уд/мин',
    hasSecondValue: false,
    normMin: 60,
    normMax: 100,
    icon: '❤️',
  },
  {
    type: 'spo2',
    name: 'Сатурация',
    unit: '%',
    hasSecondValue: false,
    normMin: 95,
    normMax: 100,
    icon: '🫁',
  },
  {
    type: 'weight',
    name: 'Вес',
    unit: 'кг',
    hasSecondValue: false,
    icon: '⚖️',
  },
]

export function getVitalSignConfig(type: string): VitalSignConfig | undefined {
  return VITAL_SIGNS_CONFIG.find(v => v.type === type)
}

// Частые симптомы для быстрого выбора
export const COMMON_SYMPTOMS = [
  'Головная боль',
  'Тошнота',
  'Слабость',
  'Головокружение',
  'Боль в животе',
  'Температура',
  'Озноб',
  'Потливость',
  'Бессонница',
  'Отёки',
  'Одышка',
  'Боль в спине',
  'Кашель',
  'Насморк',
  'Боль в горле',
]

/**
 * Парсит ввод показателя из текста.
 * Примеры: "37.2", "120/80", "72"
 */
export function parseVitalSignInput(
  input: string,
  type: string
): { value: number; value2?: number } | null {
  const config = getVitalSignConfig(type)
  if (!config) return null

  const trimmed = input.trim()

  if (config.hasSecondValue) {
    // Для давления: "120/80" или "120 80"
    const match = trimmed.match(/^(\d+)[\/\s](\d+)$/)
    if (match) {
      return {
        value: parseFloat(match[1]),
        value2: parseFloat(match[2]),
      }
    }
  }

  // Обычное значение
  const value = parseFloat(trimmed.replace(',', '.'))
  if (isNaN(value)) return null

  return { value }
}

/**
 * Форматирует показатель для отображения.
 */
export function formatVitalSign(
  type: string,
  value: number,
  value2?: number | null
): string {
  const config = getVitalSignConfig(type)
  if (!config) return `${value}`

  if (config.hasSecondValue && value2 != null) {
    return `${value}/${value2} ${config.unit}`
  }

  // Для температуры показываем один десятичный знак
  if (type === 'temperature') {
    return `${value.toFixed(1)} ${config.unit}`
  }

  return `${value} ${config.unit}`
}

/**
 * Проверяет, в норме ли значение.
 */
export function isVitalSignNormal(
  type: string,
  value: number,
  value2?: number | null
): 'normal' | 'low' | 'high' | 'unknown' {
  const config = getVitalSignConfig(type)
  if (!config || config.normMin == null || config.normMax == null) {
    return 'unknown'
  }

  // Для давления проверяем оба значения
  if (config.hasSecondValue && value2 != null) {
    const systolicOk = value >= config.normMin && value <= config.normMax
    const diastolicOk =
      config.normMin2 != null &&
      config.normMax2 != null &&
      value2 >= config.normMin2 &&
      value2 <= config.normMax2

    if (!systolicOk || !diastolicOk) {
      if (value > config.normMax || (value2 && value2 > (config.normMax2 || 90))) {
        return 'high'
      }
      return 'low'
    }
    return 'normal'
  }

  if (value < config.normMin) return 'low'
  if (value > config.normMax) return 'high'
  return 'normal'
}
