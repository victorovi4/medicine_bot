import { NextRequest, NextResponse } from 'next/server'
import { list } from '@vercel/blob'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Получить список результатов A/B теста OCR-движков для документа.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const prefix = `ocr-tests/${id}-`
    const { blobs } = await list({ prefix })

    const results = await Promise.all(
      blobs.map(async (b) => {
        try {
          const res = await fetch(b.url)
          const data = await res.json()
          return {
            blobName: b.pathname,
            url: b.url,
            size: b.size,
            uploadedAt: b.uploadedAt,
            engine: data.engine,
            durationMs: data.durationMs,
            tablesFound: data.extracted?.pages?.reduce((s: number, p: { tables?: unknown[] }) => s + (p.tables?.length || 0), 0) || 0,
            cbcRowFound: hasCbcRow(data.extracted),
            hgbValues: extractHgbValues(data.extracted),
            error: data.error,
          }
        } catch (e) {
          return { blobName: b.pathname, url: b.url, error: String(e) }
        }
      })
    )

    // Сортируем по uploadedAt desc
    results.sort((a, b) => {
      const ua = 'uploadedAt' in a && a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0
      const ub = 'uploadedAt' in b && b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0
      return ub - ua
    })

    return NextResponse.json({ docId: id, count: blobs.length, results })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'list failed' },
      { status: 500 }
    )
  }
}

interface ExtractedDoc {
  pages?: Array<{
    tables?: Array<{
      title?: string
      dates?: string[] | null
      rows?: Array<{ name?: string; unit?: string; values?: (number | null)[] }>
    }>
  }>
}

function hasCbcRow(doc: ExtractedDoc | null | undefined): boolean {
  if (!doc?.pages) return false
  for (const p of doc.pages) {
    for (const t of p.tables || []) {
      const title = (t.title || '').toLowerCase()
      if (title.includes('клинич') || title.includes('эдта') || title.includes('cbc') || title.includes('гематол')) {
        return true
      }
      // Или ищем по строкам
      for (const r of t.rows || []) {
        const n = (r.name || '').toLowerCase()
        if (n.includes('гемоглоб') || n.includes('hgb')) return true
      }
    }
  }
  return false
}

function extractHgbValues(doc: ExtractedDoc | null | undefined): (number | null)[] | null {
  if (!doc?.pages) return null
  for (const p of doc.pages) {
    for (const t of p.tables || []) {
      for (const r of t.rows || []) {
        const n = (r.name || '').toLowerCase()
        if (n.includes('гемоглоб') || n.includes('hgb')) {
          return r.values || null
        }
      }
    }
  }
  return null
}
