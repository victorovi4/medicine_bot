import { cookies, headers } from 'next/headers'
import type { NextRequest } from 'next/server'

const TEST_MODE_HEADER = 'x-test-mode'
const TEST_MODE_COOKIE = 'test_mode'

/**
 * Определяет test-mode из NextRequest (API routes).
 * Args:
 *   request (NextRequest): Запрос.
 * Returns:
 *   boolean: true если включён test-mode.
 */
export function isTestModeRequest(request: NextRequest): boolean {
  const headerValue = request.headers.get(TEST_MODE_HEADER)
  if (headerValue && headerValue.toLowerCase() === 'true') {
    return true
  }

  const { searchParams } = new URL(request.url)
  if (searchParams.get('test') === '1') {
    return true
  }

  const cookieValue = request.cookies.get(TEST_MODE_COOKIE)?.value
  return cookieValue === '1'
}

/**
 * Определяет test-mode в Server Components (SSR).
 * Returns:
 *   Promise<boolean>: true если включён test-mode.
 */
export async function isTestModeServerComponent(): Promise<boolean> {
  const headerStore = await headers()
  const headerValue = headerStore.get(TEST_MODE_HEADER)
  if (headerValue && headerValue.toLowerCase() === 'true') {
    return true
  }

  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(TEST_MODE_COOKIE)?.value
  return cookieValue === '1'
}
