import { PatientHeader } from '@/components/PatientHeader'

export const dynamic = 'force-dynamic'

export default function MetricsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="container mx-auto px-4 pt-8 max-w-6xl">
        <PatientHeader />
      </div>
      {children}
    </>
  )
}
