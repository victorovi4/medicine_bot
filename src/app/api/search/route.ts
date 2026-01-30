import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { searchDocuments, groupSearchResults, SearchResult } from '@/lib/search'

export const dynamic = 'force-dynamic'

export interface SearchResponse {
  query: string
  total: number
  exact: SearchResultDTO[]
  partial: SearchResultDTO[]
  context: SearchResultDTO[]
}

interface SearchResultDTO {
  id: string
  date: string
  category: string
  subtype: string
  title: string
  doctor: string | null
  specialty: string | null
  fileUrl: string | null
  fileName: string | null
  matchType: 'exact' | 'partial' | 'context'
  relevance: number
  highlights: { field: string; text: string }[]
}

function toDTO(result: SearchResult): SearchResultDTO {
  return {
    id: result.document.id,
    date: result.document.date.toISOString(),
    category: result.document.category,
    subtype: result.document.subtype,
    title: result.document.title,
    doctor: result.document.doctor || null,
    specialty: result.document.specialty || null,
    fileUrl: result.document.fileUrl || null,
    fileName: result.document.fileName || null,
    matchType: result.matchType,
    relevance: result.relevance,
    highlights: result.highlights,
  }
}

/**
 * GET /api/search?q=запрос
 * Поиск документов по тексту, тегам, контексту.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q') || ''
    
    if (query.length < 2) {
      return NextResponse.json({
        query,
        total: 0,
        exact: [],
        partial: [],
        context: [],
      } satisfies SearchResponse)
    }
    
    // Загружаем все документы (для небольшой базы это ОК)
    const documents = await prisma.document.findMany({
      orderBy: { date: 'desc' },
      select: {
        id: true,
        date: true,
        category: true,
        subtype: true,
        title: true,
        doctor: true,
        specialty: true,
        summary: true,
        conclusion: true,
        tags: true,
        keyValues: true,
        fileUrl: true,
        fileName: true,
      },
    })
    
    // Преобразуем для поиска
    const searchable = documents.map(doc => ({
      ...doc,
      keyValues: doc.keyValues as Record<string, string> | null,
    }))
    
    // Выполняем поиск
    const results = searchDocuments(searchable, query)
    const grouped = groupSearchResults(results)
    
    return NextResponse.json({
      query,
      total: results.length,
      exact: grouped.exact.map(toDTO),
      partial: grouped.partial.map(toDTO),
      context: grouped.context.map(toDTO),
    } satisfies SearchResponse)
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    )
  }
}
