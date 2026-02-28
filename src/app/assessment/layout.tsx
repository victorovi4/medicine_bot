import { PatientHeader } from '@/components/PatientHeader'

export default function AssessmentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 pt-4">
        <PatientHeader />
        {children}
      </div>
    </div>
  )
}
