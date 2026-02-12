import { Card, CardContent } from '@/components/ui/card'
import { Calendar } from 'lucide-react'
import { VITAL_SIGNS_CONFIG } from '@/lib/diary'

interface DiaryData {
  intensity?: number | null
  duration?: string | null
  value?: number
  value2?: number | null
  unit?: string
  dosage?: string | null
  frequency?: string | null
  isActive?: boolean
  notes?: string | null
}

interface DiaryCardProps {
  type: 'symptom' | 'vital' | 'medication'
  title: string
  date: Date
  subtype?: string
  diaryData?: DiaryData
}

const borderColors: Record<string, string> = {
  symptom: 'border-l-orange-400',
  vital: 'border-l-blue-400',
  medication: 'border-l-emerald-400',
}

const typeLabels: Record<string, string> = {
  symptom: 'Симптом',
  vital: 'Показатель',
  medication: 'Препарат',
}

function getVitalIcon(subtype?: string): string {
  const config = VITAL_SIGNS_CONFIG.find(v => v.type === subtype)
  return config?.icon || '🌡'
}

const typeIcons: Record<string, string> = {
  symptom: '🩺',
  medication: '💊',
}

export function DiaryCard({ type, title, date, subtype, diaryData }: DiaryCardProps) {
  const docDate = new Date(date)
  const formattedDate = docDate.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const formattedTime = docDate.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })

  const icon = type === 'vital' ? getVitalIcon(subtype) : typeIcons[type]

  return (
    <Card className={`border-l-4 ${borderColors[type]}`}>
      <CardContent className="py-3 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <span className="text-lg flex-shrink-0 mt-0.5">{icon}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{title}</span>
                <span className="text-xs text-gray-400">{typeLabels[type]}</span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-sm text-gray-600">
                {/* Symptom details */}
                {type === 'symptom' && diaryData?.intensity != null && (
                  <span>Интенсивность: {diaryData.intensity}/10</span>
                )}
                {type === 'symptom' && diaryData?.duration && (
                  <span>Длительность: {diaryData.duration}</span>
                )}

                {/* Vital sign details */}
                {type === 'vital' && diaryData?.value != null && (
                  <span className="font-medium">
                    {diaryData.value}
                    {diaryData.value2 != null && `/${diaryData.value2}`}
                    {diaryData.unit && ` ${diaryData.unit}`}
                  </span>
                )}

                {/* Medication details */}
                {type === 'medication' && diaryData?.dosage && (
                  <span>{diaryData.dosage}</span>
                )}
                {type === 'medication' && diaryData?.frequency && (
                  <span>{diaryData.frequency}</span>
                )}
                {type === 'medication' && diaryData?.isActive != null && (
                  <span className={diaryData.isActive ? 'text-green-600' : 'text-gray-400'}>
                    {diaryData.isActive ? 'Активный' : 'Завершён'}
                  </span>
                )}
              </div>
              {diaryData?.notes && (
                <p className="text-xs text-gray-500 mt-1 line-clamp-1">{diaryData.notes}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
            <Calendar className="h-3 w-3" />
            <span>{formattedDate}</span>
            {type !== 'medication' && <span>{formattedTime}</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
