import { describe, it, expect } from 'vitest'
import { PATIENT, getFullName, getShortName, getAge, getFormattedBirthDate, getTreatmentStartDate, getFormattedTreatmentStartDate } from '@/lib/patient'

describe('PATIENT profile', () => {
  it('должен содержать ключевые поля', () => {
    expect(PATIENT.firstName).toBeTruthy()
    expect(PATIENT.lastName).toBeTruthy()
    expect(PATIENT.patronymic).toBeTruthy()
    expect(PATIENT.birthDate).toBeTruthy()
    expect(PATIENT.treatmentStartDate).toBeTruthy()
  })

  it('ФИО и краткое имя должны формироваться корректно', () => {
    expect(getFullName()).toBe('Иоффе Виктор Борисович')
    expect(getShortName()).toBe('Иоффе В.Б.')
  })

  it('возраст должен быть числом больше 0', () => {
    const age = getAge()
    expect(typeof age).toBe('number')
    expect(age).toBeGreaterThan(0)
    expect(age).toBeLessThan(150)
  })

  it('дата рождения должна форматироваться в читабельный вид', () => {
    const formatted = getFormattedBirthDate()
    expect(formatted).toMatch(/1947/)
  })

  it('дата начала лечения должна быть корректной', () => {
    const startDate = getTreatmentStartDate()
    expect(startDate).toBe('2025-02-01')
  })

  it('дата начала лечения должна форматироваться в читабельный вид', () => {
    const formatted = getFormattedTreatmentStartDate()
    expect(formatted).toMatch(/2025/)
    expect(formatted).toMatch(/февраля/i)
  })
})
