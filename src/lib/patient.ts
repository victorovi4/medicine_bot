/**
 * Профиль пациента.
 * Читается из environment variables с фоллбэком на данные Иоффе В.Б.
 * Для нового пациента — задать env vars в Vercel project settings.
 */

export interface PatientProfile {
  // Основная информация
  firstName: string
  lastName: string
  patronymic: string
  birthDate: string // YYYY-MM-DD
  gender: string
  occupation: string

  // Текущий период лечения
  treatmentStartDate: string // YYYY-MM-DD — начало текущего периода лечения

  // Диагнозы
  mainDiagnosis: string | null
  mainDiagnosisCode: string | null // МКБ-10, например C61
  comorbidities: string[] // Сопутствующие заболевания

  // Мониторинг
  trackingMetrics: string[] // Какие показатели отслеживать

  // Дополнительно
  allergies: string[]
  notes: string
}

function parseList(envValue: string | undefined, defaults: string[]): string[] {
  if (!envValue) return defaults
  return envValue.split(',').map(s => s.trim()).filter(Boolean)
}

/**
 * Профиль пациента из env vars с фоллбэком на данные Иоффе В.Б.
 */
export const PATIENT: PatientProfile = {
  firstName: process.env.PATIENT_FIRST_NAME || 'Виктор',
  lastName: process.env.PATIENT_LAST_NAME || 'Иоффе',
  patronymic: process.env.PATIENT_PATRONYMIC || 'Борисович',
  birthDate: process.env.PATIENT_BIRTH_DATE || '1947-03-15',
  gender: process.env.PATIENT_GENDER || 'мужчина',
  occupation: process.env.PATIENT_OCCUPATION || 'Пенсионер',

  treatmentStartDate: process.env.PATIENT_TREATMENT_START || '2025-02-01',

  mainDiagnosis: process.env.PATIENT_DIAGNOSIS ?? 'Рак предстательной железы',
  mainDiagnosisCode: process.env.PATIENT_DIAGNOSIS_CODE ?? 'C61',

  comorbidities: parseList(process.env.PATIENT_COMORBIDITIES, [
    'Анемия',
    'ИБС',
    'ГБ 3 ст.',
    'ХСН 2а',
    'Глаукома',
  ]),

  trackingMetrics: parseList(process.env.PATIENT_TRACKING_METRICS, [
    'ПСА общий', 'ПСА свободный', 'Гемоглобин', 'СРБ',
  ]),

  allergies: parseList(process.env.PATIENT_ALLERGIES, []),
  notes: process.env.PATIENT_NOTES || '',
}

/**
 * Получить полное ФИО пациента.
 */
export function getFullName(patient: PatientProfile = PATIENT): string {
  return `${patient.lastName} ${patient.firstName} ${patient.patronymic}`
}

/**
 * Получить краткое ФИО (Иоффе В.Б.)
 */
export function getShortName(patient: PatientProfile = PATIENT): string {
  return `${patient.lastName} ${patient.firstName[0]}.${patient.patronymic[0]}.`
}

/**
 * Получить возраст пациента.
 */
export function getAge(patient: PatientProfile = PATIENT): number {
  const birth = new Date(patient.birthDate)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return age
}

/**
 * Форматировать дату рождения.
 */
export function getFormattedBirthDate(patient: PatientProfile = PATIENT): string {
  return new Date(patient.birthDate).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Получить дату начала текущего периода лечения.
 */
export function getTreatmentStartDate(patient: PatientProfile = PATIENT): string {
  return patient.treatmentStartDate
}

/**
 * Получить форматированную дату начала лечения.
 */
export function getFormattedTreatmentStartDate(patient: PatientProfile = PATIENT): string {
  return new Date(patient.treatmentStartDate).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
