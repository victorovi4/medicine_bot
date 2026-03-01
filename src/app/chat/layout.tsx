import { PatientHeader } from '@/components/PatientHeader'

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 pt-4 w-full">
        <PatientHeader />
      </div>
      <div className="flex-1 overflow-hidden max-w-4xl mx-auto px-4 w-full">
        {children}
      </div>
    </div>
  )
}
