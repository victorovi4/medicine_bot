export type DocumentType = 
  | 'анализ' 
  | 'узи' 
  | 'консультация' 
  | 'выписка' 
  | 'исследование'
  | 'кт'
  | 'мрт'
  | 'рентген'
  | 'другое'

export const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'анализ', label: 'Анализ' },
  { value: 'узи', label: 'УЗИ' },
  { value: 'кт', label: 'КТ' },
  { value: 'мрт', label: 'МРТ' },
  { value: 'рентген', label: 'Рентген' },
  { value: 'консультация', label: 'Консультация врача' },
  { value: 'выписка', label: 'Выписка' },
  { value: 'исследование', label: 'Исследование' },
  { value: 'другое', label: 'Другое' },
]

export const SPECIALTIES = [
  'уролог',
  'онколог', 
  'терапевт',
  'хирург',
  'кардиолог',
  'невролог',
  'гастроэнтеролог',
  'эндокринолог',
  'радиолог',
  'другое',
]

export interface PatientInfo {
  fullName: string
  birthDate: string
  age: number
}

export const PATIENT: PatientInfo = {
  fullName: 'Иоффе Виктор Борисович',
  birthDate: '15.03.1947',
  age: Math.floor((Date.now() - new Date('1947-03-15').getTime()) / (365.25 * 24 * 60 * 60 * 1000)),
}
