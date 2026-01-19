import { NextRequest, NextResponse } from 'next/server'
import { analyzeDocument } from '@/lib/claude'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fileUrl, fileType } = body

    if (!fileUrl || !fileType) {
      return NextResponse.json(
        { error: 'fileUrl and fileType are required' },
        { status: 400 }
      )
    }

    const result = await analyzeDocument(fileUrl, fileType)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Analysis error:', error)

    const message = error instanceof Error ? error.message : 'Analysis failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
