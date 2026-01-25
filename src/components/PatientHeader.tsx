import Link from 'next/link'
import { PATIENT, getFullName, getAge, getFormattedBirthDate, getFormattedTreatmentStartDate } from '@/lib/patient'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText } from 'lucide-react'

export function PatientHeader() {
  const hasComorbidities = PATIENT.comorbidities.length > 0
  
  return (
    <Card className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
      <CardContent className="pt-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          {/* Основная информация */}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-blue-900">
              {getFullName()}
            </h1>
            <p className="text-blue-700">
              {getFormattedBirthDate()} ({getAge()} лет)
            </p>
            
            {/* Основной диагноз */}
            {PATIENT.mainDiagnosis && (
              <div className="flex items-center gap-2 mt-3">
                <span className="text-sm text-gray-600">Основной диагноз:</span>
                <Badge variant="destructive" className="font-medium">
                  {PATIENT.mainDiagnosis}
                  {PATIENT.mainDiagnosisCode && (
                    <span className="ml-1 opacity-75">({PATIENT.mainDiagnosisCode})</span>
                  )}
                </Badge>
              </div>
            )}
            
            {/* Сопутствующие заболевания */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-600">Сопутствующие:</span>
              {hasComorbidities ? (
                PATIENT.comorbidities.map((disease) => (
                  <Badge key={disease} variant="secondary" className="text-xs">
                    {disease}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-gray-400 italic">Не указаны</span>
              )}
            </div>
          </div>
          
          {/* Правая колонка */}
          <div className="text-right space-y-2">
            <p className="text-sm font-medium text-blue-800">Медицинская карта</p>
            
            {/* Ссылка на выписку */}
            <Link 
              href="/extract" 
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 hover:underline"
            >
              <FileText className="h-4 w-4" />
              <span>Резюме (027/у)</span>
            </Link>
            
            {/* Период лечения */}
            <p className="text-xs text-gray-500">
              Лечение с {getFormattedTreatmentStartDate()}
            </p>
            
            {/* Отслеживаемые показатели */}
            {PATIENT.trackingMetrics.length > 0 && (
              <div className="text-xs text-gray-500">
                <p className="mb-1">Отслеживаем:</p>
                <div className="flex flex-wrap justify-end gap-1">
                  {PATIENT.trackingMetrics.map((metric) => (
                    <Badge key={metric} variant="outline" className="text-xs">
                      {metric}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
