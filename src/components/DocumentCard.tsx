import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText, Calendar, User, Building } from 'lucide-react'
import { getCategoryLabel, getSubtypeLabel } from '@/lib/types'

interface DocumentCardProps {
  id: string
  date: Date
  category: string
  subtype: string
  title: string
  doctor?: string | null
  clinic?: string | null
  summary?: string | null
  tags?: string[]
  fileUrl?: string | null
}

export function DocumentCard({
  id,
  date,
  category,
  subtype,
  title,
  doctor,
  clinic,
  summary,
  tags,
  fileUrl,
}: DocumentCardProps) {
  const formattedDate = new Date(date).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  
  // Цвета для категорий
  const categoryColors: Record<string, string> = {
    'заключения': 'bg-purple-100 text-purple-800 border-purple-200',
    'анализы': 'bg-green-100 text-green-800 border-green-200',
    'исследования': 'bg-blue-100 text-blue-800 border-blue-200',
    'другое': 'bg-gray-100 text-gray-800 border-gray-200',
  }
  
  return (
    <Link href={`/documents/${id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={categoryColors[category] || categoryColors['другое']}>
                {getCategoryLabel(category)}
              </Badge>
              <Badge variant="outline">{getSubtypeLabel(subtype)}</Badge>
              {fileUrl && <FileText className="h-4 w-4 text-gray-400" />}
            </div>
            <div className="flex items-center gap-1 text-sm text-gray-500">
              <Calendar className="h-4 w-4" />
              {formattedDate}
            </div>
          </div>
          <CardTitle className="text-lg mt-2">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {doctor && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <User className="h-4 w-4" />
                {doctor}
              </div>
            )}
            {clinic && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Building className="h-4 w-4" />
                {clinic}
              </div>
            )}
            {summary && (
              <p className="text-sm text-gray-700 mt-2 line-clamp-2">{summary}</p>
            )}
            {tags && tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
