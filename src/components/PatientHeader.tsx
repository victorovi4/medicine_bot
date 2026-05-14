import Link from 'next/link'
import {
  PATIENT,
  getFullName,
  getAge,
  getFormattedBirthDate,
  getFormattedTreatmentStartDate,
} from '@/lib/patient'

const NAV_LINKS = [
  { href: '/', label: 'Карта' },
  { href: '/chat', label: 'Чат' },
  { href: '/assessment', label: 'Заключение' },
  { href: '/metrics', label: 'Метрики' },
  { href: '/extract', label: 'Выписка' },
]

export function PatientHeader() {
  const hasComorbidities = PATIENT.comorbidities.length > 0

  return (
    <div className="mb-6 rounded-xl border border-[rgba(0,210,170,0.12)] bg-[#060f1c] p-5 border-l-2 border-l-[#00d2aa] pl-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        {/* Left — patient info */}
        <div className="space-y-1.5">
          <h1 className="text-xl font-bold text-[#cce8e1]">
            <Link href="/" className="hover:text-[#00d2aa] transition-colors">
              {getFullName()}
            </Link>
          </h1>

          <p className="font-[var(--font-geist-mono)] text-xs text-[rgba(204,232,225,0.45)] tracking-wide">
            {getFormattedBirthDate()} · {getAge()} лет · лечение с {getFormattedTreatmentStartDate()}
          </p>

          {PATIENT.mainDiagnosis && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-[rgba(204,232,225,0.4)]">Диагноз:</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(255,107,107,0.3)] bg-[rgba(255,107,107,0.1)] px-2.5 py-0.5 text-xs font-medium text-[#ff8888]">
                {PATIENT.mainDiagnosis}
                {PATIENT.mainDiagnosisCode && (
                  <span className="opacity-60">({PATIENT.mainDiagnosisCode})</span>
                )}
              </span>
            </div>
          )}

          {hasComorbidities && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-xs text-[rgba(204,232,225,0.4)]">Сопутствующие:</span>
              {PATIENT.comorbidities.map((d) => (
                <span
                  key={d}
                  className="rounded-full border border-[rgba(0,210,170,0.12)] bg-[#0a1525] px-2 py-0.5 text-[10px] text-[rgba(204,232,225,0.55)]"
                >
                  {d}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right — nav links */}
        <div className="flex flex-wrap gap-1.5 md:justify-end">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="rounded-lg border border-[rgba(0,210,170,0.12)] bg-[#0a1525] px-3 py-1.5 text-xs font-medium text-[rgba(204,232,225,0.55)] transition-all hover:border-[rgba(0,210,170,0.35)] hover:bg-[rgba(0,210,170,0.08)] hover:text-[#00d2aa]"
            >
              {label}
            </Link>
          ))}
          <Link
            href="/add"
            className="rounded-lg bg-[#00d2aa] px-3 py-1.5 text-xs font-semibold text-[#030b14] transition-all hover:bg-[#00f0c6]"
          >
            + Добавить
          </Link>
        </div>
      </div>
    </div>
  )
}
