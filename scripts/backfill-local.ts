/**
 * Локальный скрипт для backfill документов, которые не укладываются в 60с Vercel timeout.
 * Запуск: npx tsx scripts/backfill-local.ts --env .env.ioffe
 *    или: npx tsx scripts/backfill-local.ts --env .env.popov
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { PrismaClient } from '@prisma/client'
import { analyzeDocument } from '../src/lib/claude.js'

// Парсим аргументы
const envArg = process.argv.indexOf('--env')
const envFile = envArg !== -1 ? process.argv[envArg + 1] : null
if (!envFile) {
  console.error('Usage: npx tsx scripts/backfill-local.ts --env .env.ioffe')
  process.exit(1)
}

// Загружаем env vars из файла
const envPath = resolve(process.cwd(), envFile)
const envContent = readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_]+)="?(.*?)"?$/)
  if (match) {
    process.env[match[1]] = match[2]
  }
}

// Увеличиваем timeout для тяжёлых PDF (5 мин на попытку вместо 45с)
process.env.ANTHROPIC_TIMEOUT = '300'

console.log(`Loaded env from ${envFile}`)
console.log(`DATABASE_URL: ${process.env.DATABASE_URL?.substring(0, 30)}...`)
console.log(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY?.substring(0, 12)}...`)
console.log(`ANTHROPIC_TIMEOUT: ${process.env.ANTHROPIC_TIMEOUT}s`)

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL || process.env.POSTGRES_URL },
  },
})

const MARKERS = ['[backfill_error]', '[backfill_processing]']

async function main() {
  const docs = await prisma.document.findMany({
    where: {
      content: { in: MARKERS },
      fileUrl: { not: null },
    },
    orderBy: { date: 'asc' },
    select: {
      id: true,
      title: true,
      fileUrl: true,
      fileType: true,
      summary: true,
      conclusion: true,
      recommendations: true,
      clinic: true,
    },
  })

  console.log(`\nFound ${docs.length} documents to retry\n`)

  let success = 0
  let failed = 0

  for (const doc of docs) {
    const start = Date.now()
    console.log(`[${success + failed + 1}/${docs.length}] ${doc.title}...`)

    try {
      const result = await analyzeDocument(doc.fileUrl!, doc.fileType || 'application/pdf')

      const updateData: Record<string, unknown> = {
        content: result.fullText || result.summary || '[no text extracted]',
      }

      if (!doc.summary && result.summary) {
        updateData.summary = result.summary
      }
      if (!doc.conclusion && result.conclusion) {
        updateData.conclusion = result.conclusion
      }
      if ((!doc.recommendations || doc.recommendations.length === 0) && result.recommendations?.length > 0) {
        updateData.recommendations = result.recommendations
      }
      if (!doc.clinic && result.clinic) {
        updateData.clinic = result.clinic
      }

      await prisma.document.update({
        where: { id: doc.id },
        data: updateData,
      })

      const elapsed = ((Date.now() - start) / 1000).toFixed(1)
      const contentLen = (result.fullText || '').length
      console.log(`  OK (${elapsed}s, ${contentLen} chars)`)
      success++
    } catch (error) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1)
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`  FAIL (${elapsed}s): ${msg.substring(0, 200)}`)
      failed++
    }
  }

  console.log(`\nDone: ${success} success, ${failed} failed out of ${docs.length}`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
