/**
 * Справочник отслеживаемых показателей: нормы, единицы, цвета, группы.
 * Чистые данные без импортов окружения — безопасно для клиентских компонентов
 * и для src/lib/metric-names.ts (канонизация названий из анализов).
 */

export type MetricGroup = 'oncology' | 'red' | 'white' | 'inflammation' | 'biochem'

export const METRIC_GROUPS: Record<MetricGroup, { label: string; order: number }> = {
  oncology: { label: 'Онкомаркеры', order: 1 },
  red: { label: 'Красная кровь', order: 2 },
  white: { label: 'Лейкоциты и тромбоциты', order: 3 },
  inflammation: { label: 'Воспаление и обмен железа', order: 4 },
  biochem: { label: 'Биохимия', order: 5 },
}

export interface MetricConfig {
  name: string           // Название показателя
  aliases: string[]      // Альтернативные названия для парсинга
  unit: string           // Единица измерения
  normalMin: number      // Нижняя граница нормы
  normalMax: number      // Верхняя граница нормы
  critical?: number      // Критическое значение (опционально)
  color: string          // Цвет на графике
  description: string    // Описание для UI
  group: MetricGroup     // Группа на странице показателей
  // Физиологически возможный диапазон: значения вне него — ошибка распознавания
  // (цена в рублях, процент вместо абсолютного числа, тромбокрит вместо тромбоцитов).
  plausible: [number, number]
}

/**
 * Справочник отслеживаемых показателей. Ключ — каноническое название.
 * Нормы — типовые референсы для взрослого мужчины (российские лаборатории);
 * конкретный документ хранит свои нормы в Measurement.normalMin/normalMax.
 */
export const METRICS_CONFIG: Record<string, MetricConfig> = {
  // ---------- Онкомаркеры ----------
  'ПСА общий': {
    name: 'ПСА общий',
    aliases: ['ПСА', 'PSA', 'PSA total', 'ПСА общ', 'Простатический специфический антиген'],
    unit: 'нг/мл',
    normalMin: 0,
    normalMax: 4.0,
    critical: 10.0,
    color: '#ef4444',
    description: 'Простатический специфический антиген (онкомаркер)',
    group: 'oncology',
    plausible: [0, 10000],
  },
  'ПСА свободный': {
    name: 'ПСА свободный',
    aliases: ['ПСА своб', 'PSA free', 'fPSA', 'Свободный ПСА'],
    unit: 'нг/мл',
    normalMin: 0,
    normalMax: 0.93,
    color: '#f97316',
    description: 'Свободная фракция ПСА',
    group: 'oncology',
    plausible: [0, 1000],
  },
  'Парапротеин': {
    name: 'Парапротеин',
    aliases: ['М-градиент', 'M-protein', 'М-белок', 'M-градиент', 'Парапротеин (М-градиент)', 'M-spike'],
    unit: 'г/л',
    normalMin: 0,
    normalMax: 0,
    color: '#8b5cf6',
    description: 'Парапротеин (М-градиент) — маркер множественной миеломы',
    group: 'oncology',
    plausible: [0, 150],
  },

  // ---------- Красная кровь ----------
  'Гемоглобин': {
    name: 'Гемоглобин',
    aliases: ['Hb', 'HGB', 'Hemoglobin', 'Гемоглоб'],
    unit: 'г/л',
    normalMin: 130,
    normalMax: 160,
    color: '#3b82f6',
    description: 'Уровень гемоглобина в крови',
    group: 'red',
    plausible: [30, 250],
  },
  'Эритроциты': {
    name: 'Эритроциты',
    aliases: ['RBC', 'Erythrocytes', 'Эритр.'],
    unit: '×10¹²/л',
    normalMin: 4.0,
    normalMax: 5.5,
    color: '#dc2626',
    description: 'Количество эритроцитов в крови',
    group: 'red',
    plausible: [1, 8],
  },
  'Гематокрит': {
    name: 'Гематокрит',
    aliases: ['HCT', 'Hematocrit', 'Ht'],
    unit: '%',
    normalMin: 39,
    normalMax: 49,
    color: '#b91c1c',
    description: 'Доля эритроцитов в объёме крови',
    group: 'red',
    plausible: [10, 70],
  },
  'MCV': {
    name: 'MCV',
    aliases: ['Средний объем эритроцита', 'Средний объём эритроцита', 'Mean corpuscular volume'],
    unit: 'фл',
    normalMin: 80,
    normalMax: 100,
    color: '#7c3aed',
    description: 'Средний объём эритроцита — макроцитоз при >100 фл',
    group: 'red',
    plausible: [50, 150],
  },

  // ---------- Лейкоциты и тромбоциты ----------
  'Лейкоциты': {
    name: 'Лейкоциты',
    aliases: ['WBC', 'Leukocytes', 'Лейкоц.', 'Лейк.', 'White blood cells'],
    unit: '×10⁹/л',
    normalMin: 4.0,
    normalMax: 9.0,
    color: '#14b8a6',
    description: 'Количество лейкоцитов в крови',
    group: 'white',
    plausible: [0.1, 100],
  },
  'Нейтрофилы': {
    name: 'Нейтрофилы',
    aliases: ['NEUT', 'NE', 'Нейтрофилы абс.', 'АЧН'],
    unit: '×10⁹/л',
    normalMin: 1.8,
    normalMax: 7.7,
    color: '#0ea5e9',
    description: 'Нейтрофилы, абсолютное количество',
    group: 'white',
    plausible: [0, 50],
  },
  'Нейтрофилы %': {
    name: 'Нейтрофилы %',
    aliases: ['NEUT%', 'NE%'],
    unit: '%',
    normalMin: 47,
    normalMax: 72,
    color: '#38bdf8',
    description: 'Нейтрофилы, доля в лейкоцитарной формуле',
    group: 'white',
    plausible: [0, 100],
  },
  'Лимфоциты': {
    name: 'Лимфоциты',
    aliases: ['LYMPH', 'LY', 'LYM#', 'Лимфоциты абс.'],
    unit: '×10⁹/л',
    normalMin: 1.2,
    normalMax: 3.0,
    color: '#22c55e',
    description: 'Лимфоциты, абсолютное количество',
    group: 'white',
    plausible: [0, 50],
  },
  'Лимфоциты %': {
    name: 'Лимфоциты %',
    aliases: ['LYMPH%', 'LY%', 'LYM%'],
    unit: '%',
    normalMin: 19,
    normalMax: 37,
    color: '#4ade80',
    description: 'Лимфоциты, доля в лейкоцитарной формуле',
    group: 'white',
    plausible: [0, 100],
  },
  'Моноциты': {
    name: 'Моноциты',
    aliases: ['MONO', 'MO', 'MON#', 'Моноциты абс.'],
    unit: '×10⁹/л',
    normalMin: 0.2,
    normalMax: 0.8,
    color: '#a855f7',
    description: 'Моноциты, абсолютное количество — моноцитопения при <0,2',
    group: 'white',
    plausible: [0, 10],
  },
  'Моноциты %': {
    name: 'Моноциты %',
    aliases: ['MONO%', 'MO%', 'MON%'],
    unit: '%',
    normalMin: 3,
    normalMax: 11,
    color: '#c084fc',
    description: 'Моноциты, доля в лейкоцитарной формуле',
    group: 'white',
    plausible: [0, 100],
  },
  'Тромбоциты': {
    name: 'Тромбоциты',
    aliases: ['PLT', 'Platelets', 'Тромб.', 'Тромбоц.'],
    unit: '×10⁹/л',
    normalMin: 150,
    normalMax: 400,
    color: '#ec4899',
    description: 'Количество тромбоцитов в крови',
    group: 'white',
    plausible: [1, 1500],
  },

  // ---------- Воспаление и обмен железа ----------
  'СРБ': {
    name: 'СРБ',
    aliases: ['C-реактивный белок', 'CRP', 'C-reactive protein', 'С-реактивный белок', 'СРБ ультрачувствительный', 'hs-CRP', 'СРБ количественно'],
    unit: 'мг/л',
    normalMin: 0,
    normalMax: 5.0,
    critical: 50.0,
    color: '#f59e0b',
    description: 'C-реактивный белок — маркер воспаления',
    group: 'inflammation',
    plausible: [0, 1000],
  },
  'СОЭ': {
    name: 'СОЭ',
    aliases: ['ESR', 'Скорость оседания эритроцитов', 'СОЭ по Вестергрену', 'Скорость оседания'],
    unit: 'мм/ч',
    normalMin: 0,
    normalMax: 20,
    critical: 100,
    color: '#eab308',
    description: 'Скорость оседания эритроцитов — маркер воспаления',
    group: 'inflammation',
    plausible: [0, 200],
  },
  'Ферритин': {
    name: 'Ферритин',
    aliases: ['Ferritin'],
    unit: 'нг/мл',
    normalMin: 30,
    normalMax: 400,
    critical: 1000,
    color: '#78350f',
    description: 'Ферритин — запасы железа и белок острой фазы',
    group: 'inflammation',
    plausible: [0, 20000],
  },
  'Фибриноген': {
    name: 'Фибриноген',
    aliases: ['Fibrinogen', 'Фибриноген по Клауссу'],
    unit: 'г/л',
    normalMin: 2,
    normalMax: 4,
    color: '#9f1239',
    description: 'Фибриноген — белок острой фазы и свёртывания',
    group: 'inflammation',
    plausible: [0.3, 20],
  },

  // ---------- Биохимия ----------
  'Креатинин': {
    name: 'Креатинин',
    aliases: ['Creatinine', 'Crea'],
    unit: 'мкмоль/л',
    normalMin: 62,
    normalMax: 115,
    critical: 200,
    color: '#0891b2',
    description: 'Креатинин — функция почек',
    group: 'biochem',
    plausible: [20, 2000],
  },
  'Мочевина': {
    name: 'Мочевина',
    aliases: ['Urea', 'Мочевина крови'],
    unit: 'ммоль/л',
    normalMin: 2.8,
    normalMax: 8.1,
    color: '#0e7490',
    description: 'Мочевина — функция почек, белковый обмен',
    group: 'biochem',
    plausible: [0.5, 100],
  },
  'Глюкоза': {
    name: 'Глюкоза',
    aliases: ['Glucose', 'Сахар крови', 'GLU', 'Глюкоза крови', 'Глюкоза натощак'],
    unit: 'ммоль/л',
    normalMin: 3.9,
    normalMax: 6.1,
    color: '#10b981',
    description: 'Уровень глюкозы в крови',
    group: 'biochem',
    plausible: [1, 50],
  },
  'Гликированный гемоглобин': {
    name: 'Гликированный гемоглобин',
    aliases: ['HbA1c', 'A1c', 'Гликозилированный гемоглобин', 'Glycated hemoglobin'],
    unit: '%',
    normalMin: 4.0,
    normalMax: 6.0,
    color: '#06b6d4',
    description: 'Гликированный гемоглобин (HbA1c) — контроль диабета',
    group: 'biochem',
    plausible: [2, 20],
  },
  'АЛТ': {
    name: 'АЛТ',
    aliases: ['ALT', 'Аланинаминотрансфераза', 'АлАТ'],
    unit: 'Ед/л',
    normalMin: 0,
    normalMax: 41,
    color: '#65a30d',
    description: 'Аланинаминотрансфераза — печень',
    group: 'biochem',
    plausible: [0, 5000],
  },
  'АСТ': {
    name: 'АСТ',
    aliases: ['AST', 'Аспартатаминотрансфераза', 'АсАТ'],
    unit: 'Ед/л',
    normalMin: 0,
    normalMax: 40,
    color: '#4d7c0f',
    description: 'Аспартатаминотрансфераза — печень, мышцы',
    group: 'biochem',
    plausible: [0, 5000],
  },
  'Билирубин общий': {
    name: 'Билирубин общий',
    aliases: ['Билирубин', 'Bilirubin total', 'Общий билирубин'],
    unit: 'мкмоль/л',
    normalMin: 3.4,
    normalMax: 20.5,
    color: '#ca8a04',
    description: 'Билирубин общий — печень, гемолиз',
    group: 'biochem',
    plausible: [0, 1000],
  },
  'Общий белок': {
    name: 'Общий белок',
    aliases: ['Белок общий', 'Total protein', 'Общий белок в сыворотке'],
    unit: 'г/л',
    normalMin: 64,
    normalMax: 83,
    color: '#6366f1',
    description: 'Общий белок сыворотки',
    group: 'biochem',
    plausible: [20, 120],
  },
  'Альбумин': {
    name: 'Альбумин',
    aliases: ['Albumin'],
    unit: 'г/л',
    normalMin: 35,
    normalMax: 52,
    color: '#4f46e5',
    description: 'Альбумин — питание, воспаление, печень',
    group: 'biochem',
    plausible: [10, 70],
  },
  'Щелочная фосфатаза': {
    name: 'Щелочная фосфатаза',
    aliases: ['ЩФ', 'ALP', 'Alkaline phosphatase', 'Щелочная фосфотаза'],
    unit: 'Ед/л',
    normalMin: 40,
    normalMax: 130,
    critical: 300,
    color: '#f43f5e',
    description: 'Щелочная фосфатаза — кости (метастазы), желчные пути',
    group: 'biochem',
    plausible: [0, 5000],
  },
  'ЛДГ': {
    name: 'ЛДГ',
    aliases: ['LDH', 'Лактатдегидрогеназа'],
    unit: 'Ед/л',
    normalMin: 125,
    normalMax: 250,
    color: '#e11d48',
    description: 'Лактатдегидрогеназа — гемолиз, опухолевая нагрузка (нормы зависят от метода)',
    group: 'biochem',
    plausible: [0, 10000],
  },
  'Калий': {
    name: 'Калий',
    aliases: ['K', 'Potassium', 'Калий в сыворотке'],
    unit: 'ммоль/л',
    normalMin: 3.5,
    normalMax: 5.1,
    color: '#2563eb',
    description: 'Калий сыворотки — электролиты (диуретики, ИАПФ)',
    group: 'biochem',
    plausible: [1, 10],
  },
  'Натрий': {
    name: 'Натрий',
    aliases: ['Na', 'Sodium', 'Натрий в сыворотке'],
    unit: 'ммоль/л',
    normalMin: 136,
    normalMax: 145,
    color: '#1d4ed8',
    description: 'Натрий сыворотки — электролиты',
    group: 'biochem',
    plausible: [100, 180],
  },
}

/** Показатели, которые измеряются в процентах (единица «%» для них нормальна). */
export const PERCENT_METRICS = new Set(
  Object.values(METRICS_CONFIG).filter(m => m.unit === '%').map(m => m.name)
)

/** Значение физиологически возможно для показателя (иначе — ошибка распознавания). */
export function isPlausibleValue(metricName: string, value: number): boolean {
  const config = METRICS_CONFIG[metricName]
  if (!config) return Number.isFinite(value)
  const [min, max] = config.plausible
  return Number.isFinite(value) && value >= min && value <= max
}
