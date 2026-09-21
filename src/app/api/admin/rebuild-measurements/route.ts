import { NextRequest, NextResponse } from 'next/server'
import { getPrismaClient } from '@/lib/db'
import { isTestModeRequest } from '@/lib/test-mode'
import { rebuildMeasurements } from '@/lib/measurement-rebuild'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Пересобирает measurements всех документов из сохранённого fullText/keyValues — без вызовов API.
 * По умолчанию dry-run: возвращает точки графиков «до» и «после», ничего не меняя.
 *
 * POST /api/admin/rebuild-measurements?apply=true — применить.
 */
export async function POST(request: NextRequest) {
  try {
    const prisma = getPrismaClient({ testMode: isTestModeRequest(request) })
    const apply = new URL(request.url).searchParams.get('apply') === 'true'
    const result = await rebuildMeasurements(prisma, { apply })
    return NextResponse.json(result)
  } catch (error) {
    console.error('rebuild-measurements error:', error)
    const message = error instanceof Error ? error.message : 'Failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
