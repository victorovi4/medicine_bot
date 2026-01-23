/**
 * Профиль пациента.
 * Хранится в коде, т.к. пациент один.
 * В будущем можно вынести в БД (таблица Patient).
 */

export interface PatientProfile {
  // Основная информация
  firstName: string
  lastName: string
  patronymic: string
  birthDate: string // YYYY-MM-DD
  
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

/**
 * Данные пациента Иоффе В.Б.
 */
export const PATIENT: PatientProfile = {
  firstName: 'Виктор',
  lastName: 'Иоффе',
  patronymic: 'Борисович',
  birthDate: '1947-03-15',
  
  // Основной диагноз
  mainDiagnosis: 'Рак предстательной железы',
  mainDiagnosisCode: 'C61',
  
  // Сопутствующие (пока нет)
  comorbidities: [],
  
  // Показатели для мониторинга
  trackingMetrics: ['ПСА общий', 'ПСА свободный', 'Гемоглобин'],
  
  // Аллергии (пока нет)
  allergies: [],
  
  // Заметки
  notes: '',
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
