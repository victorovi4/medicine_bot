import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaTest: PrismaClient | undefined
}

const databaseUrl =
  process.env.DATABASE_URL ??
  process.env.PRISMA_DATABASE_URL ??
  process.env.POSTGRES_URL

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.TEST_POSTGRES_POSTGRES_URL ??
  process.env.TEST_POSTGRES_PRISMA_DATABASE_URL ??
  process.env.TEST_POSTGRES_URL

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(
    databaseUrl
      ? {
          datasources: {
            db: { url: databaseUrl },
          },
        }
      : undefined
  )

const prismaTest =
  globalForPrisma.prismaTest ??
  (testDatabaseUrl
    ? new PrismaClient({
        datasources: {
          db: { url: testDatabaseUrl },
        },
      })
    : undefined)

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
  if (prismaTest) globalForPrisma.prismaTest = prismaTest
}

/**
 * Возвращает PrismaClient с учётом test-mode.
 * Args:
 *   options (object): Параметры выбора клиента.
 * Returns:
 *   PrismaClient: Клиент для основной или тестовой базы.
 */
export function getPrismaClient(options?: { testMode?: boolean }): PrismaClient {
  if (options?.testMode) {
    if (!prismaTest) {
      throw new Error('TEST_DATABASE_URL is not configured')
    }
    return prismaTest
  }

  return prisma
}

/**
 * Выполняет БД-операцию с retry при ошибках соединения.
 * Используется после длительных операций (AI-анализ), когда
 * соединение с PostgreSQL может протухнуть.
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  client: PrismaClient = prisma,
  maxRetries = 2
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: unknown) {
      const isConnectionError =
        error instanceof Error &&
        (error.message.includes('Server has closed the connection') ||
         error.message.includes('Connection pool timeout') ||
         error.message.includes('Can\'t reach database server') ||
         error.message.includes('Connection refused') ||
         error.message.includes('Connection terminated unexpectedly'))

      if (!isConnectionError || attempt === maxRetries) {
        throw error
      }

      console.warn(`DB connection error (attempt ${attempt + 1}/${maxRetries + 1}), reconnecting...`)
      await client.$disconnect()
      await client.$connect()
    }
  }
  throw new Error('withDbRetry: unreachable')
}
