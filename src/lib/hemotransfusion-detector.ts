/**
 * Алгоритм автоматического обнаружения гемотрансфузий.
 * 
 * Признаки гемотрансфузии:
 * 1. Определение группы крови в период госпитализации — подготовка к переливанию
 * 2. Резкий рост гемоглобина (+15 г/л за 1-3 дня)
 * 3. Критически низкий уровень гемоглобина (<75 г/л) перед ростом
 */

export interface HemoglobinReading {
  date: Date
  value: number
  documentId: string
  documentTitle: string
}

export interface BloodTypingEvent {
  date: Date
  documentId: string
  bloodType?: string
  rhFactor?: string
}

export interface DetectedHemotransfusion {
  date: Date                    // Предполагаемая дата переливания
  beforeValue: number           // Гемоглобин до
  afterValue: number            // Гемоглобин после
  confidence: 'high' | 'medium' | 'low'  // Уверенность в обнаружении
  reason: string                // Причина детекции
  documentIds: string[]         // Связанные документы
}

// Пороговые значения
const CRITICAL_HB_THRESHOLD = 75     // г/л — критически низкий уровень
const MIN_HB_JUMP = 15               // г/л — минимальный рост для гемотрансфузии
const MAX_DAYS_FOR_JUMP = 4          // дней — максимальный интервал для резкого роста
const BLOOD_TYPING_WINDOW_DAYS = 7   // дней — окно вокруг определения группы крови

/**
 * Определяет, было ли определение группы крови (признак подготовки к гемотрансфузии).
 */
export function isBloodTypingDocument(title: string, keyValues: Record<string, string> | null): boolean {
  const lowerTitle = title.toLowerCase()
  
  // Проверяем название документа
  if (lowerTitle.includes('группа крови') || 
      lowerTitle.includes('резус-фактор') ||
      lowerTitle.includes('фенотипирование')) {
    return true
  }
  
  // Проверяем keyValues
  if (keyValues) {
    const keys = Object.keys(keyValues).map(k => k.toLowerCase())
    if (keys.some(k => 
      k.includes('группа крови') || 
      k.includes('резус') ||
      k.includes('антиэритроцитарные') ||
      k.includes('фенотип') ||
      k.includes('антиген k')
    )) {
      return true
    }
  }
  
  return false
}

/**
 * Извлекает значение гемоглобина из keyValues.
 */
export function extractHemoglobinValue(keyValues: Record<string, string> | null): number | null {
  if (!keyValues) return null
  
  for (const [key, value] of Object.entries(keyValues)) {
    const lowerKey = key.toLowerCase()
    if (lowerKey.includes('гемоглобин') || lowerKey === 'hb' || lowerKey === 'hgb') {
      // Извлекаем число из строки
      const match = value.match(/(\d+(?:[.,]\d+)?)/)?.[1]
      if (match) {
        const numValue = parseFloat(match.replace(',', '.'))
        // Проверяем, что значение в разумных пределах для гемоглобина
        if (numValue > 0 && numValue < 200) {
          return numValue
        }
      }
    }
  }
  
  return null
}

/**
 * Основной алгоритм обнаружения гемотрансфузий.
 */
export function detectHemotransfusions(
  readings: HemoglobinReading[],
  bloodTypingEvents: BloodTypingEvent[]
): DetectedHemotransfusion[] {
  const detected: DetectedHemotransfusion[] = []
  
  // Сортируем показания по дате
  const sorted = [...readings].sort((a, b) => a.date.getTime() - b.date.getTime())
  
  if (sorted.length < 2) return detected
  
  // Проверяем каждую пару последовательных показаний
  for (let i = 0; i < sorted.length - 1; i++) {
    const before = sorted[i]
    const after = sorted[i + 1]
    
    const daysDiff = Math.abs((after.date.getTime() - before.date.getTime()) / (1000 * 60 * 60 * 24))
    const hbJump = after.value - before.value
    
    // Условие 1: Резкий рост гемоглобина
    if (hbJump >= MIN_HB_JUMP && daysDiff <= MAX_DAYS_FOR_JUMP) {
      let confidence: 'high' | 'medium' | 'low' = 'medium'
      let reason = `Рост гемоглобина +${hbJump.toFixed(0)} г/л за ${daysDiff.toFixed(0)} дня`
      
      // Повышаем уверенность если был критический уровень
      if (before.value <= CRITICAL_HB_THRESHOLD) {
        confidence = 'high'
        reason = `Критический Hb ${before.value} г/л + рост на +${hbJump.toFixed(0)} г/л`
      }
      
      // Проверяем, было ли определение группы крови рядом
      const hasBloodTyping = bloodTypingEvents.some(bt => {
        const btDays = Math.abs((bt.date.getTime() - before.date.getTime()) / (1000 * 60 * 60 * 24))
        return btDays <= BLOOD_TYPING_WINDOW_DAYS
      })
      
      if (hasBloodTyping) {
        confidence = 'high'
        reason += ' + определение группы крови'
      }
      
      // Определяем дату переливания (примерно посередине между показаниями)
      const transfusionDate = new Date((before.date.getTime() + after.date.getTime()) / 2)
      
      detected.push({
        date: transfusionDate,
        beforeValue: before.value,
        afterValue: after.value,
        confidence,
        reason,
        documentIds: [before.documentId, after.documentId],
      })
    }
  }
  
  // Условие 2: Определение группы крови без явного роста Hb
  // (может быть подготовка к плановому переливанию)
  for (const bt of bloodTypingEvents) {
    // Проверяем, не обнаружили ли мы уже переливание рядом с этой датой
    const alreadyDetected = detected.some(d => {
      const daysDiff = Math.abs((d.date.getTime() - bt.date.getTime()) / (1000 * 60 * 60 * 24))
      return daysDiff <= BLOOD_TYPING_WINDOW_DAYS
    })
    
    if (!alreadyDetected) {
      // Ищем ближайшие показатели гемоглобина
      const nearbyReadings = sorted.filter(r => {
        const daysDiff = Math.abs((r.date.getTime() - bt.date.getTime()) / (1000 * 60 * 60 * 24))
        return daysDiff <= BLOOD_TYPING_WINDOW_DAYS
      })
      
      const lowHb = nearbyReadings.find(r => r.value <= CRITICAL_HB_THRESHOLD)
      
      if (lowHb) {
        detected.push({
          date: bt.date,
          beforeValue: lowHb.value,
          afterValue: 0, // Неизвестно
          confidence: 'low',
          reason: `Определение группы крови при низком Hb ${lowHb.value} г/л (вероятно была гемотрансфузия)`,
          documentIds: [bt.documentId, lowHb.documentId],
        })
      }
    }
  }
  
  return detected
}

/**
 * Анализирует документы и возвращает обнаруженные гемотрансфузии.
 */
export function analyzeDocumentsForHemotransfusions(
  documents: Array<{
    id: string
    date: Date
    title: string
    keyValues: Record<string, string> | null
  }>
): DetectedHemotransfusion[] {
  const readings: HemoglobinReading[] = []
  const bloodTypingEvents: BloodTypingEvent[] = []
  
  for (const doc of documents) {
    // Извлекаем показатели гемоглобина
    const hbValue = extractHemoglobinValue(doc.keyValues)
    if (hbValue !== null) {
      readings.push({
        date: doc.date,
        value: hbValue,
        documentId: doc.id,
        documentTitle: doc.title,
      })
    }
    
    // Определяем документы с группой крови
    if (isBloodTypingDocument(doc.title, doc.keyValues)) {
      bloodTypingEvents.push({
        date: doc.date,
        documentId: doc.id,
        bloodType: doc.keyValues?.['Группа крови'] || doc.keyValues?.['группа крови'],
        rhFactor: doc.keyValues?.['Резус-фактор'] || doc.keyValues?.['резус-фактор'],
      })
    }
  }
  
  return detectHemotransfusions(readings, bloodTypingEvents)
}
