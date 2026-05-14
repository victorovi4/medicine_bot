import { NextRequest, NextResponse } from 'next/server'
import { getPrismaClient } from '@/lib/db'
import { isTestModeRequest } from '@/lib/test-mode'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Удаляет ВСЕ measurements в БД. Используется перед массовым реанализом,
 * чтобы дедуп корректно срабатывал в правильном порядке обработки документов.
 *
 * POST /api/admin/wipe-measurements
 */
export async function POST(request: NextRequest) {
  try {
    const testMode = isTestModeRequest(request)
    const prisma = getPrismaClient({ testMode })
    const before = await prisma.measurement.count()
    const deleteResult = await prisma.measurement.deleteMany({})
    return NextResponse.json({
      ok: true,
      countBefore: before,
      deleted: deleteResult.count,
    })
  } catch (error) {
    console.error('wipe-measurements error:', error)
    const message = error instanceof Error ? error.message : 'Failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
