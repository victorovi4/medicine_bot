import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isUserAllowed } from '@/lib/telegram'

describe('isUserAllowed', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  it('должен разрешать всех, если TELEGRAM_ALLOWED_USERS не задан', () => {
    delete process.env.TELEGRAM_ALLOWED_USERS
    expect(isUserAllowed(123456789)).toBe(true)
    expect(isUserAllowed(987654321)).toBe(true)
  })

  it('должен разрешать пользователя из списка', () => {
    process.env.TELEGRAM_ALLOWED_USERS = '123456789'
    expect(isUserAllowed(123456789)).toBe(true)
  })

  it('должен запрещать пользователя не из списка', () => {
    process.env.TELEGRAM_ALLOWED_USERS = '123456789'
    expect(isUserAllowed(987654321)).toBe(false)
  })

  it('должен работать с несколькими ID через запятую', () => {
    process.env.TELEGRAM_ALLOWED_USERS = '123456789,987654321,111222333'
    expect(isUserAllowed(123456789)).toBe(true)
    expect(isUserAllowed(987654321)).toBe(true)
    expect(isUserAllowed(111222333)).toBe(true)
    expect(isUserAllowed(444555666)).toBe(false)
  })

  it('должен игнорировать пробелы вокруг ID', () => {
    process.env.TELEGRAM_ALLOWED_USERS = ' 123456789 , 987654321 '
    expect(isUserAllowed(123456789)).toBe(true)
    expect(isUserAllowed(987654321)).toBe(true)
  })
})
