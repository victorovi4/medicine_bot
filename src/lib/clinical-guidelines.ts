import { readFileSync } from 'fs'
import { join } from 'path'
import { PATIENT } from './patient'

const GUIDELINES_MAP: Record<string, { file: string; name: string; id: string }> = {
  'C61': { file: 'KR12-C61.txt', name: 'Рак предстательной железы', id: 'КР12' },
  'C90': { file: 'KR144-C90.txt', name: 'Множественная миелома', id: 'КР144' },
  'C90.0': { file: 'KR144-C90.txt', name: 'Множественная миелома', id: 'КР144' },
}

export function getGuidelineForPatient(): { text: string; name: string; id: string } | null {
  const code = PATIENT.mainDiagnosisCode
  if (!code) return null
  const entry = GUIDELINES_MAP[code] || GUIDELINES_MAP[code.split('.')[0]]
  if (!entry) return null
  const filePath = join(process.cwd(), 'src', 'data', 'clinical-guidelines', entry.file)
  try {
    const text = readFileSync(filePath, 'utf-8')
    return { text, name: entry.name, id: entry.id }
  } catch {
    console.error(`Clinical guideline file not found: ${filePath}`)
    return null
  }
}

export function hasGuidelineForPatient(): boolean {
  const code = PATIENT.mainDiagnosisCode
  if (!code) return false
  return !!(GUIDELINES_MAP[code] || GUIDELINES_MAP[code.split('.')[0]])
}
