import { PatientHeader } from '@/components/PatientHeader'

export const dynamic = 'force-dynamic'

export default function ExtractLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="container mx-auto px-4 pt-8 max-w-4xl print:hidden">
        <PatientHeader />
      </div>
      {children}
    </>
  )
}
