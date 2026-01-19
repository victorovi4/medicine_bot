import { PATIENT } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'

export function PatientHeader() {
  return (
    <Card className="mb-6 bg-blue-50 border-blue-200">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-blue-900">{PATIENT.fullName}</h1>
            <p className="text-blue-700">
              Дата рождения: {PATIENT.birthDate} ({PATIENT.age} лет)
            </p>
          </div>
          <div className="text-right text-sm text-blue-600">
            <p>Медицинская карта</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
