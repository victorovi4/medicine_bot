import { PatientHeader } from '@/components/PatientHeader'

export const dynamic = 'force-dynamic'

export default function ExtractLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#030b14]">
      <div className="max-w-4xl mx-auto px-4 pt-4 print:hidden">
        <PatientHeader />
      </div>
      {children}
    </div>
  )
}
