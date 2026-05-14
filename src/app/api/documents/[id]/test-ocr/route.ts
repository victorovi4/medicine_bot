import { NextRequest, NextResponse, after } from 'next/server'
import { put } from '@vercel/blob'
import { getPrismaClient } from '@/lib/db'
import { isTestModeRequest } from '@/lib/test-mode'
import { runOcrEngine, OcrEngine, ENGINE_DESCRIPTIONS } from '@/lib/ocr-engines'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_ENGINES: OcrEngine[] = ['mistral-ocr-pipeline', 'gemini-direct', 'pixtral-direct', 'qwen-direct']

/**
 * Тестовый endpoint для A/B сравнения OCR-движков (через OpenRouter).
 *
 * GET — список engine-ов и их описания.
 * POST ?engine=X — запускает Pass 1 на оригинальном файле документа,
 *   сохраняет результат в Vercel Blob и возвращает URL для сравнения.
 *   НЕ обновляет основной документ, только пишет JSON-отчёт в Blob.
 */
export async function GET() {
  return NextResponse.json({
    engines: VALID_ENGINES.map(e => ({ id: e, description: ENGINE_DESCRIPTIONS[e] })),
    usage: 'POST /api/documents/[id]/test-ocr?engine=mistral-ocr-pipeline|gemini-direct|pixtral-direct|qwen-direct',
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const testMode = isTestModeRequest(request)
    const prisma = getPrismaClient({ testMode })
    const { id } = await params

    const engine = (request.nextUrl.searchParams.get('engine') || '') as OcrEngine
    if (!VALID_ENGINES.includes(engine)) {
      return NextResponse.json(
        { error: `Invalid engine. Valid: ${VALID_ENGINES.join(', ')}` },
        { status: 400 }
      )
    }

    const document = await prisma.document.findUnique({ where: { id } })
    if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    if (!document.fileUrl) return NextResponse.json({ error: 'Document has no source file' }, { status: 400 })

    const timestamp = Date.now()
    const resultBlobName = `ocr-tests/${id}-${engine}-${timestamp}.json`
    const resultUrl = `https://medicine-bot-4xqt.vercel.app/_blob/${resultBlobName}`

    after(async () => {
      try {
        console.log(`[test-ocr:${id}] engine=${engine} starting`)

        const fileRes = await fetch(document.fileUrl!)
        if (!fileRes.ok) throw new Error(`Failed to fetch source: ${fileRes.status}`)
        const buffer = Buffer.from(await fileRes.arrayBuffer())

        const result = await runOcrEngine(engine, buffer)

        const report = {
          docId: id,
          engine,
          ranAt: new Date().toISOString(),
          durationMs: result.durationMs,
          model: result.model,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          error: result.error,
          extracted: result.extracted,
          rawResponseHead: result.rawResponse.substring(0, 2000),
        }

        const blob = await put(resultBlobName, JSON.stringify(report, null, 2), {
          access: 'public',
          contentType: 'application/json',
        })

        console.log(`[test-ocr:${id}] engine=${engine} done in ${result.durationMs}ms → ${blob.url}`)
      } catch (err) {
        console.error(`[test-ocr:${id}] engine=${engine} failed:`, err)
        // Сохраним ошибку тоже в Blob чтобы видеть
        try {
          await put(resultBlobName, JSON.stringify({
            docId: id, engine, ranAt: new Date().toISOString(),
            error: err instanceof Error ? err.message : String(err),
          }, null, 2), { access: 'public', contentType: 'application/json' })
        } catch { /* ignore */ }
      }
    })

    return NextResponse.json({
      ok: true,
      status: 'accepted',
      engine,
      documentId: id,
      pollUrl: `/api/documents/${id}/test-ocr/result?engine=${engine}&ts=${timestamp}`,
      hint: 'Результат сохранится в Vercel Blob через ~30-60с. URL: ' + resultUrl,
      blobNamePrefix: `ocr-tests/${id}-${engine}-`,
    }, { status: 202 })
  } catch (error) {
    console.error('test-ocr error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'test-ocr failed' },
      { status: 500 }
    )
  }
}
