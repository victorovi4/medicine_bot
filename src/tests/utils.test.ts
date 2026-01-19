import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn (className merge utility)', () => {
  it('должен объединять классы', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('должен обрабатывать условные классы', () => {
    expect(cn('foo', true && 'bar')).toBe('foo bar')
    expect(cn('foo', false && 'bar')).toBe('foo')
  })

  it('должен мержить конфликтующие Tailwind классы', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('должен обрабатывать массивы классов', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar')
  })

  it('должен обрабатывать объекты классов', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz')
  })

  it('должен обрабатывать undefined и null', () => {
    expect(cn('foo', undefined, 'bar', null)).toBe('foo bar')
  })

  it('должен обрабатывать пустые входные данные', () => {
    expect(cn()).toBe('')
    expect(cn('')).toBe('')
  })
})
