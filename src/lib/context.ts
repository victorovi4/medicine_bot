import { getPrismaClient } from '@/lib/db'

/**
 * Собирает полный медицинский контекст пациента из БД.
 * Используется в chat и assessment API.
 *
 * Оптимизирован для укладки в 60с лимит Vercel:
 * — документы в компактном формате (заключение + keyValues, без fullText)
 * — measurements сгруппированы по метрикам
 * — vitals/symptoms ограничены последними 20
 */
export async function buildMedicalContext(prisma: ReturnType<typeof getPrismaClient>): Promise<string> {
  let context = ''

  // 1. Документы — последние 60, компактный формат
  const documents = await prisma.document.findMany({
    orderBy: { date: 'desc' },
    take: 60,
    include: {
      measurements: true,
    },
  })
  // Отсортировать хронологически для контекста
  documents.reverse()

  if (documents.length > 0) {
    context += `\n## Медицинские документы (${documents.length} шт.)\n\n`
    for (const doc of documents) {
      const date = new Date(doc.date).toLocaleDateString('ru-RU')
      context += `- **${date}** ${doc.title} [${doc.category}/${doc.subtype}]`
      if (doc.doctor) context += ` | ${doc.doctor}`
      if (doc.specialty) context += ` (${doc.specialty})`
      context += '\n'

      // Заключение — самое важное (до 300 символов)
      if (doc.conclusion) {
        const concl = doc.conclusion.length > 300 ? doc.conclusion.slice(0, 300) + '…' : doc.conclusion
        context += `  Заключение: ${concl}\n`
      }

      // keyValues — числовые показатели
      if (doc.keyValues && typeof doc.keyValues === 'object') {
        const kv = doc.keyValues as Record<string, string>
        if (Object.keys(kv).length > 0) {
          context += `  Показатели: ${Object.entries(kv).map(([k, v]) => `${k}: ${v}`).join(', ')}\n`
        }
      }

      // Рекомендации (до 200 символов)
      if (doc.recommendations.length > 0) {
        const recsStr = doc.recommendations.join('; ')
        context += `  Рекомендации: ${recsStr.length > 200 ? recsStr.slice(0, 200) + '…' : recsStr}\n`
      }
    }
    context += '\n'
  }

  // 2. ВСЕ measurements сгруппированные по метрике (для анализа трендов)
  const measurements = await prisma.measurement.findMany({
    orderBy: { date: 'asc' },
  })
  if (measurements.length > 0) {
    const grouped = new Map<string, typeof measurements>()
    for (const m of measurements) {
      const key = m.name
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(m)
    }
    context += '## Все измерения по метрикам (для анализа трендов)\n'
    for (const [name, values] of grouped) {
      context += `\n### ${name}\n`
      for (const v of values) {
        const dt = new Date(v.date).toLocaleDateString('ru-RU')
        let line = `- ${dt}: ${v.value} ${v.unit}`
        if (v.normalMin != null && v.normalMax != null) {
          line += ` [норма: ${v.normalMin}–${v.normalMax}]`
        }
        if (v.isAbnormal) line += ' (!)'
        context += line + '\n'
      }
    }
    context += '\n'
  }

  // 3. Активные лекарства
  const medications = await prisma.medication.findMany({
    where: { isActive: true },
    orderBy: { startDate: 'desc' },
  })
  if (medications.length > 0) {
    context += '## Текущие препараты\n'
    for (const med of medications) {
      const startDate = new Date(med.startDate).toLocaleDateString('ru-RU')
      context += `- ${med.name}`
      if (med.dosage) context += ` (${med.dosage})`
      if (med.frequency) context += `, ${med.frequency}`
      context += ` — с ${startDate}\n`
    }
    context += '\n'
  }

  // 4. ВСЕ процедуры
  const procedures = await prisma.procedure.findMany({
    orderBy: { date: 'desc' },
  })
  if (procedures.length > 0) {
    context += '## Процедуры\n'
    for (const proc of procedures) {
      const date = new Date(proc.date).toLocaleDateString('ru-RU')
      context += `- ${date}: ${proc.name}`
      if (proc.beforeValue != null && proc.afterValue != null) {
        context += ` (${proc.beforeValue} → ${proc.afterValue} ${proc.unit || ''})`
      }
      context += '\n'
    }
    context += '\n'
  }

  // 5. Последние показатели (vitals) — ограничение 20
  const vitals = await prisma.vitalSign.findMany({
    orderBy: { datetime: 'desc' },
    take: 20,
  })
  if (vitals.length > 0) {
    context += '## Показатели (дневник)\n'
    for (const v of vitals) {
      const dt = new Date(v.datetime).toLocaleDateString('ru-RU')
      context += `- ${dt}: ${v.type} = ${v.value}${v.value2 != null ? `/${v.value2}` : ''} ${v.unit}\n`
    }
    context += '\n'
  }

  // 6. Последние симптомы — ограничение 20
  const symptoms = await prisma.symptom.findMany({
    orderBy: { datetime: 'desc' },
    take: 20,
  })
  if (symptoms.length > 0) {
    context += '## Симптомы\n'
    for (const s of symptoms) {
      const dt = new Date(s.datetime).toLocaleDateString('ru-RU')
      context += `- ${dt}: ${s.name}`
      if (s.intensity) context += ` (интенсивность: ${s.intensity}/10)`
      if (s.notes) context += ` — ${s.notes}`
      context += '\n'
    }
    context += '\n'
  }

  // 7. События на графиках (MetricEvents)
  const metricEvents = await prisma.metricEvent.findMany({
    orderBy: { date: 'asc' },
  })
  if (metricEvents.length > 0) {
    context += '## События и маркеры\n'
    for (const evt of metricEvents) {
      const dt = new Date(evt.date).toLocaleDateString('ru-RU')
      context += `- ${dt}: [${evt.eventType}] ${evt.label}`
      if (evt.metricName !== '*') context += ` (метрика: ${evt.metricName})`
      if (evt.notes) context += ` — ${evt.notes}`
      context += '\n'
    }
    context += '\n'
  }

  return context
}
