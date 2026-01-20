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
  process.env.TEST_PRISMA_DATABASE_URL ??
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
