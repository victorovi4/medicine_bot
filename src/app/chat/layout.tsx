import { PatientHeader } from '@/components/PatientHeader'

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col h-screen">
      <div className="flex-shrink-0 px-4 pt-4">
        <div className="max-w-3xl mx-auto">
          <PatientHeader />
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
