import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { PDFDocument } from 'pdf-lib'
import { prisma } from '@/lib/db'
import { analyzeDocument, analyzeMultipleImages, AnalysisResult } from '@/lib/claude'
import { normalizeDocumentType } from '@/lib/types'
import { extractMeasurements } from '@/lib/metrics'
import { findDuplicate } from '@/lib/duplicates'
import {
  TelegramUpdate,
  sendMessage,
  editMessage,
  answerCallbackQuery,
  getFile,
  downloadFile,
  isUserAllowed,
  MAIN_KEYBOARD,
  DIARY_KEYBOARD,
  BATCH_KEYBOARD,
  VITALS_KEYBOARD,
  INTENSITY_KEYBOARD,
} from '@/lib/telegram'
import {
  VITAL_SIGNS_CONFIG,
  COMMON_SYMPTOMS,
  parseVitalSignInput,
  formatVitalSign,
} from '@/lib/diary'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Форматирует понятное имя файла для загрузок без оригинального имени.
 * Вместо telegram-1769396799832.jpg будет "Загрузка 26.01.2026 13-45.jpg"
 */
function formatUploadFileName(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const year = date.getFullYear()
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `Загрузка ${day}.${month}.${year} ${hours}-${minutes}.jpg`
}

/**
 * Webhook endpoint для Telegram бота.
 */
export async function POST(request: NextRequest) {
  try {
    const update: TelegramUpdate = await request.json()

    // Обработка callback_query (нажатие на inline кнопку)
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query)
      return NextResponse.json({ ok: true })
    }

    // Обработка сообщений
    if (!update.message) {
      return NextResponse.json({ ok: true })
    }

    const message = update.message
    const chatId = message.chat.id
    const userId = message.from.id
    const userName = message.from.first_name

    // Проверяем доступ
    if (!isUserAllowed(userId)) {
      await sendMessage(
        chatId,
        '⛔ Извините, у вас нет доступа к этому боту.\n\n' +
          `Ваш ID: ${userId}`
      )
      return NextResponse.json({ ok: true })
    }

    // === КОМАНДЫ ===

    if (message.text === '/start') {
      await sendMessage(
        chatId,
        `👋 Привет, ${userName}!\n\n` +
          `Я помогаю вести медицинскую карту.\n\n` +
          `📄 Отправьте фото или PDF — документ добавится в карту.\n\n` +
          `📋 Дневник — запись симптомов, показателей, лекарств.\n\n` +
          `🔗 Карта: ${process.env.NEXT_PUBLIC_APP_URL}`,
        { reply_markup: MAIN_KEYBOARD }
      )
      return NextResponse.json({ ok: true })
    }

    if (message.text === '/help') {
      await sendMessage(
        chatId,
        `📖 Справка\n\n` +
          `📄 Отправьте фото или PDF — добавится в карту.\n\n` +
          `📎 Много фото (многостраничный документ):\n` +
          `1. Нажмите "📎 Много фото"\n` +
          `2. Отправляйте фото по одному\n` +
          `3. Нажмите "✅ Готово"\n\n` +
          `📋 Выписка — генерация выписки 027/у за последний год.\n\n` +
          `💡 Совет: чтобы сохранить имя файла, отправляйте его как "Файл" (📎 → Файл), а не как "Фото".\n\n` +
          `Команды: /status, /last, /extract, /cancel`
      )
      return NextResponse.json({ ok: true })
    }

    if (message.text === '/status' || message.text === '📊 Статистика') {
      const count = await prisma.document.count()
      const lastDoc = await prisma.document.findFirst({
        orderBy: { createdAt: 'desc' },
      })

      let text = `📊 Статистика:\n\n📄 Документов: ${count}\n`
      if (lastDoc) {
        const lastDate = new Date(lastDoc.createdAt).toLocaleDateString('ru-RU')
        text += `📅 Последний: ${lastDate}\n   "${lastDoc.title}"`
      }
      text += `\n\n🔗 ${process.env.NEXT_PUBLIC_APP_URL}`

      await sendMessage(chatId, text)
      return NextResponse.json({ ok: true })
    }

    if (message.text === '/last' || message.text === '📋 Последние') {
      const docs = await prisma.document.findMany({
        take: 5,
        orderBy: { date: 'desc' },
      })

      let text = '📋 Последние документы:\n\n'
      for (const doc of docs) {
        const date = new Date(doc.date).toLocaleDateString('ru-RU')
        text += `• ${date} — ${doc.title}\n`
      }
      text += `\n🔗 ${process.env.NEXT_PUBLIC_APP_URL}`

      await sendMessage(chatId, text)
      return NextResponse.json({ ok: true })
    }

    // === РЕЖИМ BATCH ===

    if (message.text === '/batch' || message.text === '📎 Много фото') {
      // Проверяем, нет ли уже активного batch
      const existing = await prisma.batchPending.findFirst({
        where: { chatId: BigInt(chatId) },
      })

      if (existing) {
        const count = await prisma.batchPending.count({
          where: { chatId: BigInt(chatId), fileUrl: { not: '__batch_marker__' } },
        })
        await sendMessage(
          chatId,
          `⚠️ Уже идёт сбор страниц (${count} шт.)\n\n` +
            `Отправьте ещё фото или нажмите кнопку ниже.`,
          {
            reply_markup: {
              keyboard: [
                [{ text: '✅ Готово' }, { text: '❌ Отмена' }],
              ],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        )
      } else {
        // Создаём маркер активного batch
        await prisma.batchPending.create({
          data: {
            chatId: BigInt(chatId),
            fileUrl: '__batch_marker__',
            fileType: 'marker',
          },
        })
        await sendMessage(
          chatId,
          `📎 Режим сбора страниц включён!\n\n` +
            `Отправляйте фото страниц документа по одному.\n` +
            `Когда закончите — нажмите "✅ Готово"`,
          {
            reply_markup: {
              keyboard: [
                [{ text: '✅ Готово' }, { text: '❌ Отмена' }],
              ],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        )
      }
      return NextResponse.json({ ok: true })
    }

    if (message.text === '/cancel' || message.text === '❌ Отмена') {
      // Считаем страницы (без маркера)
      const pageCount = await prisma.batchPending.count({
        where: { chatId: BigInt(chatId), fileUrl: { not: '__batch_marker__' } },
      })
      
      const deleted = await prisma.batchPending.deleteMany({
        where: { chatId: BigInt(chatId) },
      })

      if (deleted.count > 0) {
        await sendMessage(
          chatId,
          `❌ Сбор отменён.${pageCount > 0 ? ` Удалено ${pageCount} страниц.` : ''}`,
          { reply_markup: MAIN_KEYBOARD }
      )
    } else {
      await sendMessage(chatId, `ℹ️ Нет активного сбора страниц.`)
      }
      return NextResponse.json({ ok: true })
    }

    if (message.text === '/done' || message.text === '✅ Готово') {
      await processBatch(chatId)
      return NextResponse.json({ ok: true })
    }

    // === ВЫПИСКА 027/у ===

    if (message.text === '/extract' || message.text === '📋 Выписка') {
      await generateExtract(chatId)
      return NextResponse.json({ ok: true })
    }

    // === ДНЕВНИК ===

    if (message.text === '📋 Дневник') {
      await sendMessage(
        chatId,
        `📋 Дневник пациента\n\n` +
          `🩺 Симптом — записать что беспокоит\n` +
          `🌡 Показатели — температура, давление, пульс\n` +
          `💊 Лекарства — список препаратов`,
        { reply_markup: DIARY_KEYBOARD }
      )
      return NextResponse.json({ ok: true })
    }

    if (message.text === '◀️ Назад') {
      await sendMessage(chatId, '👌 Главное меню', { reply_markup: MAIN_KEYBOARD })
      return NextResponse.json({ ok: true })
    }

    // --- Симптомы ---
    if (message.text === '🩺 Симптом') {
      // Показываем популярные симптомы как inline кнопки
      const inlineButtons = COMMON_SYMPTOMS.slice(0, 12).map(s => [{ text: s, callback_data: `symptom:${s}` }])
      await sendMessage(
        chatId,
        `🩺 Выберите симптом или напишите свой:\n\n` +
          `Например: "головная боль" или "тошнота"`,
        {
          reply_markup: {
            inline_keyboard: [
              ...inlineButtons.slice(0, 4),
              [{ text: '✏️ Написать свой', callback_data: 'symptom:custom' }],
            ],
          },
        }
      )
      return NextResponse.json({ ok: true })
    }

    // --- Показатели ---
    if (message.text === '🌡 Показатели') {
      await sendMessage(
        chatId,
        `🌡 Выберите показатель для записи:`,
        { reply_markup: VITALS_KEYBOARD }
      )
      return NextResponse.json({ ok: true })
    }

    // Ввод конкретного показателя
    if (message.text === '🌡 Температура') {
      await setUserState(chatId, 'awaiting_vital:temperature')
      await sendMessage(chatId, '🌡 Введите температуру (например: 37.2):')
      return NextResponse.json({ ok: true })
    }

    if (message.text === '💓 Давление') {
      await setUserState(chatId, 'awaiting_vital:pressure')
      await sendMessage(chatId, '💓 Введите давление (например: 120/80):')
      return NextResponse.json({ ok: true })
    }

    if (message.text === '❤️ Пульс') {
      await setUserState(chatId, 'awaiting_vital:pulse')
      await sendMessage(chatId, '❤️ Введите пульс (например: 72):')
      return NextResponse.json({ ok: true })
    }

    if (message.text === '🫁 Сатурация') {
      await setUserState(chatId, 'awaiting_vital:spo2')
      await sendMessage(chatId, '🫁 Введите сатурацию (например: 98):')
      return NextResponse.json({ ok: true })
    }

    // --- Лекарства ---
    if (message.text === '💊 Лекарства') {
      await showMedications(chatId)
      return NextResponse.json({ ok: true })
    }

    // Команда добавления лекарства: /med Название, дозировка, частота
    if (message.text?.startsWith('/med ')) {
      const parts = message.text.slice(5).split(',').map(s => s.trim())
      const name = parts[0]
      const dosage = parts[1] || null
      const frequency = parts[2] || null
      
      if (!name) {
        await sendMessage(chatId, '❌ Укажите название препарата.')
        return NextResponse.json({ ok: true })
      }
      
      await prisma.medication.create({
        data: {
          name,
          dosage,
          frequency,
          startDate: new Date(),
          isActive: true,
        },
      })
      
      await sendMessage(
        chatId,
        `✅ Препарат добавлен:\n\n💊 *${name}*` +
          (dosage ? `\n📋 Дозировка: ${dosage}` : '') +
          (frequency ? `\n🕐 Частота: ${frequency}` : ''),
        {
          parse_mode: 'Markdown',
          reply_markup: DIARY_KEYBOARD,
        }
      )
      return NextResponse.json({ ok: true })
    }

    // === ПРОВЕРКА СОСТОЯНИЯ ОЖИДАНИЯ ВВОДА ===
    const userState = await getUserState(chatId)
    
    if (userState?.startsWith('awaiting_vital:')) {
      const vitalType = userState.split(':')[1]
      const parsed = parseVitalSignInput(message.text || '', vitalType)
      
      if (!parsed) {
        await sendMessage(chatId, '❌ Не удалось распознать значение. Попробуйте ещё раз.')
        return NextResponse.json({ ok: true })
      }
      
      // Сохраняем показатель
      const config = VITAL_SIGNS_CONFIG.find(v => v.type === vitalType)
      await prisma.vitalSign.create({
        data: {
          datetime: new Date(),
          type: vitalType,
          value: parsed.value,
          value2: parsed.value2 || null,
          unit: config?.unit || '',
        },
      })
      
      await clearUserState(chatId)
      
      const formatted = formatVitalSign(vitalType, parsed.value, parsed.value2)
      await sendMessage(
        chatId,
        `✅ ${config?.icon || ''} ${config?.name || vitalType}: ${formatted}\n\nЗаписано!`,
        { reply_markup: DIARY_KEYBOARD }
      )
      return NextResponse.json({ ok: true })
    }

    if (userState?.startsWith('awaiting_symptom:')) {
      // Сохраняем симптом
      const symptomName = message.text || 'Неизвестный симптом'
      
      await prisma.symptom.create({
        data: {
          datetime: new Date(),
          name: symptomName,
        },
      })
      
      await clearUserState(chatId)
      
      await sendMessage(
        chatId,
        `✅ Симптом "${symptomName}" записан!`,
        { reply_markup: DIARY_KEYBOARD }
      )
      return NextResponse.json({ ok: true })
    }

    // === ОБРАБОТКА ФОТО ===

    if (message.photo && message.photo.length > 0) {
      // Проверяем, активен ли режим batch
      const batchActive = await prisma.batchPending.findFirst({
        where: { chatId: BigInt(chatId) },
      })

      if (batchActive) {
        // Добавляем в batch
        await addToBatch(chatId, message.photo, 'image/jpeg')
      } else {
        // Одиночное фото — обрабатываем сразу
        await processPhoto(chatId, message.photo, message.caption)
      }
      return NextResponse.json({ ok: true })
    }

    // === ОБРАБОТКА PDF ===

    if (message.document) {
      await processDocument(chatId, message.document, message.caption)
      return NextResponse.json({ ok: true })
    }

    // Неизвестное сообщение
    if (message.text && !message.text.startsWith('/')) {
      await sendMessage(
        chatId,
        '🤔 Отправьте фото или PDF документа.\n\n' +
          'Для многостраничного документа используйте /batch'
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ ok: true })
  }
}

/**
 * Добавить фото в batch.
 */
async function addToBatch(
  chatId: number,
  photos: { file_id: string }[],
  fileType: string
): Promise<void> {
  const photo = photos[photos.length - 1]

  try {
    // Скачиваем и загружаем в Blob сразу
    const fileInfo = await getFile(photo.file_id)
    if (!fileInfo.file_path) throw new Error('File path not available')

    const fileBuffer = await downloadFile(fileInfo.file_path)
    const timestamp = Date.now()
    const blobName = `documents/batch-${chatId}-${timestamp}.jpg`

    const blob = await put(blobName, fileBuffer, {
      access: 'public',
      contentType: fileType,
    })

    await prisma.batchPending.create({
      data: {
        chatId: BigInt(chatId),
        fileUrl: blob.url,
        fileType,
      },
    })

    const count = await prisma.batchPending.count({
      where: { chatId: BigInt(chatId), fileUrl: { not: '__batch_marker__' } },
    })

    await sendMessage(chatId, `✅ Страница ${count} добавлена. Ещё? Или /done`)
  } catch (error) {
    console.error('Add to batch error:', error)
    await sendMessage(chatId, '❌ Ошибка при добавлении страницы')
  }
}

/**
 * Обработать собранный batch.
 */
async function processBatch(chatId: number): Promise<void> {
  // Получаем страницы (без маркера)
  const pages = await prisma.batchPending.findMany({
    where: { chatId: BigInt(chatId), fileUrl: { not: '__batch_marker__' } },
    orderBy: { receivedAt: 'asc' },
  })

  if (pages.length === 0) {
    // Проверяем, был ли вообще активный batch
    const hasMarker = await prisma.batchPending.findFirst({
      where: { chatId: BigInt(chatId), fileUrl: '__batch_marker__' },
    })
    
    if (hasMarker) {
      await prisma.batchPending.deleteMany({ where: { chatId: BigInt(chatId) } })
      await sendMessage(chatId, 'ℹ️ Вы не добавили ни одной страницы. Режим сбора отключён.')
    } else {
      await sendMessage(chatId, 'ℹ️ Нет страниц для обработки. Сначала /batch')
    }
    return
  }

  // Удаляем все записи (включая маркер)
  await prisma.batchPending.deleteMany({
    where: { chatId: BigInt(chatId) },
  })

  const pageCount = pages.length
  await sendMessage(
    chatId,
    `📄 Обрабатываю ${pageCount} ${pluralize(pageCount, 'страницу', 'страницы', 'страниц')}...`
  )

  try {
    // Создаём PDF из всех страниц
    await sendMessage(chatId, '📑 Объединяю страницы в PDF...')
    
    const pdfDoc = await PDFDocument.create()
    
    for (const page of pages) {
      const response = await fetch(page.fileUrl)
      const imageBytes = await response.arrayBuffer()
      
      // Определяем тип изображения и встраиваем
      let image
      if (page.fileType.includes('png')) {
        image = await pdfDoc.embedPng(imageBytes)
      } else {
        image = await pdfDoc.embedJpg(imageBytes)
      }
      
      // Создаём страницу с размером изображения
      const pdfPage = pdfDoc.addPage([image.width, image.height])
      pdfPage.drawImage(image, {
        x: 0,
        y: 0,
        width: image.width,
        height: image.height,
      })
    }
    
    const pdfBytes = await pdfDoc.save()
    
    // Загружаем PDF в Blob (конвертируем Uint8Array в Buffer)
    const timestamp = Date.now()
    const blobName = `documents/tg-${timestamp}-combined.pdf`
    
    const pdfBlob = await put(blobName, Buffer.from(pdfBytes), {
      access: 'public',
      contentType: 'application/pdf',
    })
    
    console.log('Created combined PDF:', pdfBlob.url)

    await sendMessage(chatId, '🤖 AI анализирует документ...')

    // AI-анализ всех страниц
    const images = pages.map((p) => ({ url: p.fileUrl, mediaType: p.fileType }))
    const analysis = await analyzeMultipleImages(images)

    // Сохраняем с URL объединённого PDF
    await checkDuplicatesAndSave(
      chatId, 
      analysis, 
      pdfBlob.url,  // URL объединённого PDF
      pageCount,
      undefined,
      `telegram-${timestamp}-combined.pdf`,
      'application/pdf'
    )
  } catch (error) {
    console.error('Batch processing error:', error)
    const msg = error instanceof Error ? error.message : 'Неизвестная ошибка'
    await sendMessage(chatId, `❌ Ошибка: ${msg}`)
  }
}

/**
 * Обработка одиночного фото.
 */
async function processPhoto(
  chatId: number,
  photos: { file_id: string }[],
  caption?: string
): Promise<void> {
  const photo = photos[photos.length - 1]

  await sendMessage(chatId, '📥 Получил фото, обрабатываю...')

  try {
    const fileInfo = await getFile(photo.file_id)
    if (!fileInfo.file_path) throw new Error('File path not available')

    const fileBuffer = await downloadFile(fileInfo.file_path)
    const timestamp = Date.now()
    const blobName = `documents/tg-${timestamp}.jpg`

    const blob = await put(blobName, fileBuffer, {
      access: 'public',
      contentType: 'image/jpeg',
    })

    await sendMessage(chatId, '🤖 AI анализирует...')

    const analysis = await analyzeDocument(blob.url, 'image/jpeg')

    await checkDuplicatesAndSave(chatId, analysis, blob.url, 1, caption)
  } catch (error) {
    console.error('Photo processing error:', error)
    const msg = error instanceof Error ? error.message : 'Неизвестная ошибка'
    await sendMessage(chatId, `❌ Ошибка: ${msg}`)
  }
}

/**
 * Обработка PDF документа.
 */
async function processDocument(
  chatId: number,
  doc: { file_id: string; file_name?: string; mime_type?: string },
  caption?: string
): Promise<void> {
  const mimeType = doc.mime_type || 'application/octet-stream'
  const fileName = doc.file_name || 'document'

  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  const isAllowed = allowedTypes.some((t) => mimeType.includes(t.split('/')[1]))

  if (!isAllowed) {
    await sendMessage(chatId, `❌ Неподдерживаемый тип: ${mimeType}`)
    return
  }

  await sendMessage(chatId, `📥 Получил "${fileName}", обрабатываю...`)

  try {
    const fileInfo = await getFile(doc.file_id)
    if (!fileInfo.file_path) throw new Error('File path not available')

    const fileBuffer = await downloadFile(fileInfo.file_path)
    const timestamp = Date.now()
    const ext = fileName.split('.').pop() || 'pdf'
    const blobName = `documents/tg-${timestamp}.${ext}`

    const blob = await put(blobName, fileBuffer, {
      access: 'public',
      contentType: mimeType,
    })

    await sendMessage(chatId, '🤖 AI анализирует...')

    const analysis = await analyzeDocument(blob.url, mimeType)

    await checkDuplicatesAndSave(chatId, analysis, blob.url, 1, caption, fileName, mimeType)
  } catch (error) {
    console.error('Document processing error:', error)
    const msg = error instanceof Error ? error.message : 'Неизвестная ошибка'
    await sendMessage(chatId, `❌ Ошибка: ${msg}`)
  }
}

/**
 * Проверить дубликаты и сохранить документ.
 */
async function checkDuplicatesAndSave(
  chatId: number,
  analysis: AnalysisResult,
  fileUrl: string,
  pageCount: number,
  caption?: string,
  fileName?: string,
  fileType?: string
): Promise<void> {
  // Нормализуем категорию и подтип
  const { category, subtype } = normalizeDocumentType(
    analysis.category || '',
    analysis.subtype || ''
  )
  const docDate = analysis.date ? new Date(analysis.date) : new Date()

  // Ищем похожие документы (та же дата ±7 дней)
  const startDate = new Date(docDate)
  startDate.setDate(startDate.getDate() - 7)
  const endDate = new Date(docDate)
  endDate.setDate(endDate.getDate() + 7)

  const similar = await prisma.document.findMany({
    where: {
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { date: 'desc' },
    take: 20,
  })

  // Улучшенная проверка дубликатов: врач+дата, fuzzy заключение, keyValues
  const duplicateResult = findDuplicate(
    similar.map(doc => ({
      id: doc.id,
      date: doc.date,
      title: doc.title,
      doctor: doc.doctor,
      conclusion: doc.conclusion,
      keyValues: doc.keyValues as Record<string, string> | null,
    })),
    {
      date: docDate.toISOString(),
      title: analysis.title,
      doctor: analysis.doctor,
      conclusion: analysis.conclusion,
      keyValues: analysis.keyValues,
    }
  )
  const duplicate = duplicateResult?.document
  const duplicateReason = duplicateResult?.reason

  // Подготавливаем данные документа
  const documentData = {
    date: docDate.toISOString(),
    category,
    subtype,
    title: analysis.title || 'Документ из Telegram',
    doctor: analysis.doctor,
    specialty: analysis.specialty,
    clinic: analysis.clinic,
    summary: analysis.summary,
    conclusion: analysis.conclusion,
    recommendations: analysis.recommendations || [],
    content: caption || (pageCount > 1 ? `Документ из ${pageCount} страниц` : null),
    fileUrl,
    // Если нет оригинального имени (фото), создаём понятное имя с датой/временем
    fileName: fileName || formatUploadFileName(new Date()),
    fileType: fileType || 'image/jpeg',
    tags: analysis.tags || [],
    keyValues: analysis.keyValues || null,
  }

  if (duplicate) {
    // Найден похожий документ — спрашиваем пользователя
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 1)

    const pending = await prisma.pendingDocument.create({
      data: {
        chatId: BigInt(chatId),
        documentData,
        duplicateId: duplicate.id,
        expiresAt,
      },
    })

    const dupDate = new Date(duplicate.date).toLocaleDateString('ru-RU')
    const dupUrl = `${process.env.NEXT_PUBLIC_APP_URL}/documents/${duplicate.id}`

    const { message_id } = await sendMessage(
      chatId,
      `⚠️ Найден похожий документ!\n\n` +
        `📋 Новый: ${analysis.title}\n` +
        `📅 ${analysis.date}\n\n` +
        `📋 Существующий: ${duplicate.title}\n` +
        `📅 ${dupDate}\n` +
        `🔗 ${dupUrl}\n\n` +
        `🔍 Причина: ${duplicateReason || 'Схожее название'}\n\n` +
        `Что делать?`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '➕ Добавить как новый', callback_data: `add:${pending.id}` },
            ],
            [
              { text: '🔄 Заменить существующий', callback_data: `replace:${pending.id}` },
            ],
            [
              { text: '❌ Отмена', callback_data: `cancel:${pending.id}` },
            ],
          ],
        },
      }
    )

    // Сохраняем message_id для последующего редактирования
    await prisma.pendingDocument.update({
      where: { id: pending.id },
      data: { messageId: message_id },
    })
  } else {
    // Дубликатов нет — сохраняем сразу
    // Извлекаем измерения из keyValues
    const measurements = extractMeasurements(documentData.keyValues as Record<string, string> | null)
    
    const document = await prisma.document.create({
      data: {
        date: docDate,
        category: documentData.category,
        subtype: documentData.subtype,
        title: documentData.title,
        doctor: documentData.doctor,
        specialty: documentData.specialty,
        clinic: documentData.clinic,
        summary: documentData.summary,
        conclusion: documentData.conclusion,
        recommendations: documentData.recommendations,
        content: documentData.content,
        fileUrl: documentData.fileUrl,
        fileName: documentData.fileName,
        fileType: documentData.fileType,
        tags: documentData.tags,
        keyValues: documentData.keyValues,
        // Создаём связанные измерения
        measurements: {
          create: measurements.map(m => ({
            name: m.name,
            value: m.value,
            unit: m.unit,
            date: docDate,
          })),
        },
      },
    })

    await sendSuccessMessage(chatId, analysis, document.id, pageCount)
  }
}

/**
 * Обработка нажатия на inline кнопку.
 */
async function handleCallbackQuery(
  callback: {
    id: string
    from: { id: number }
    message?: { message_id: number; chat: { id: number } }
    data?: string
  }
): Promise<void> {
  console.log('Callback received:', callback.data)
  
  await answerCallbackQuery(callback.id)

  if (!callback.data || !callback.message) {
    console.log('No callback data or message')
    return
  }

  const chatId = callback.message.chat.id
  const messageId = callback.message.message_id

  // === ОБРАБОТКА СИМПТОМОВ ===
  if (callback.data.startsWith('symptom:')) {
    const symptomName = callback.data.replace('symptom:', '')
    
    if (symptomName === 'custom') {
      // Пользователь хочет ввести свой симптом
      await setUserState(chatId, 'awaiting_symptom:custom')
      await sendMessage(chatId, '✏️ Напишите, что вас беспокоит:', { reply_markup: DIARY_KEYBOARD })
    } else {
      // Записываем выбранный симптом
      await prisma.symptom.create({
        data: {
          datetime: new Date(),
          name: symptomName,
        },
      })
      
      await editMessage(chatId, messageId, `✅ Симптом "${symptomName}" записан!`)
    }
    return
  }

  // === ОБРАБОТКА ДУБЛИКАТОВ ===
  const [action, pendingId] = callback.data.split(':')

  console.log('Processing action:', action, 'pendingId:', pendingId)

  try {
    const pending = await prisma.pendingDocument.findUnique({
      where: { id: pendingId },
    })

    if (!pending) {
      console.log('Pending document not found')
      await editMessage(chatId, messageId, '⏰ Время действия истекло.')
      return
    }
    
    console.log('Found pending document, duplicateId:', pending.duplicateId)

  const docData = pending.documentData as {
    date: string
    category: string
    subtype: string
    title: string
    doctor?: string | null
    specialty?: string | null
    clinic?: string | null
    summary?: string | null
    conclusion?: string | null
    recommendations?: string[]
    content?: string | null
    fileUrl: string
    fileName: string
    fileType: string
    tags?: string[]
    keyValues?: Record<string, string> | null
  }

  if (action === 'cancel') {
    await prisma.pendingDocument.delete({ where: { id: pendingId } })
    await editMessage(chatId, messageId, '❌ Добавление отменено.')
    // Отправляем сообщение с клавиатурой
    await sendMessage(chatId, '📂 Готов к новым документам!', { reply_markup: MAIN_KEYBOARD })
    return
  }

  if (action === 'add') {
    // Добавить как новый
    // Извлекаем измерения из keyValues
    const docDate = new Date(docData.date)
    const measurements = extractMeasurements(docData.keyValues as Record<string, string> | null)
    
    const document = await prisma.document.create({
      data: {
        date: docDate,
        category: docData.category,
        subtype: docData.subtype,
        title: docData.title,
        doctor: docData.doctor,
        specialty: docData.specialty,
        clinic: docData.clinic,
        summary: docData.summary,
        conclusion: docData.conclusion,
        recommendations: docData.recommendations || [],
        content: docData.content,
        fileUrl: docData.fileUrl,
        fileName: docData.fileName,
        fileType: docData.fileType,
        tags: docData.tags || [],
        keyValues: docData.keyValues || undefined,
        // Создаём связанные измерения
        measurements: {
          create: measurements.map(m => ({
            name: m.name,
            value: m.value,
            unit: m.unit,
            date: docDate,
          })),
        },
      },
    })

    await prisma.pendingDocument.delete({ where: { id: pendingId } })

    await editMessage(
      chatId,
      messageId,
      `✅ Документ добавлен!\n\n` +
        `📋 ${docData.title}\n` +
        `📅 ${docData.date?.split('T')[0]}\n\n` +
        `🔗 ${process.env.NEXT_PUBLIC_APP_URL}/documents/${document.id}`
    )
    // Отправляем сообщение с клавиатурой
    await sendMessage(chatId, '📂 Готов к новым документам!', { reply_markup: MAIN_KEYBOARD })
    return
  }

  if (action === 'replace') {
    // Заменить существующий
    console.log('Replace action started, duplicateId:', pending.duplicateId)
    
    if (!pending.duplicateId) {
      await editMessage(chatId, messageId, '❌ Ошибка: дубликат не найден.')
      return
    }

    // Проверяем, существует ли документ для замены
    const existingDoc = await prisma.document.findUnique({
      where: { id: pending.duplicateId },
    })
    
    if (!existingDoc) {
      console.log('Document to replace not found:', pending.duplicateId)
      await editMessage(chatId, messageId, '❌ Документ для замены уже удалён.')
      await prisma.pendingDocument.delete({ where: { id: pendingId } })
      return
    }

    console.log('Updating document:', pending.duplicateId)
    
    await prisma.document.update({
      where: { id: pending.duplicateId },
      data: {
        date: new Date(docData.date),
        category: docData.category,
        subtype: docData.subtype,
        title: docData.title,
        doctor: docData.doctor,
        specialty: docData.specialty,
        clinic: docData.clinic,
        summary: docData.summary,
        conclusion: docData.conclusion,
        recommendations: docData.recommendations || [],
        content: docData.content,
        fileUrl: docData.fileUrl,
        fileName: docData.fileName,
        fileType: docData.fileType,
        tags: docData.tags || [],
        keyValues: docData.keyValues || undefined,
      },
    })

    console.log('Document updated, deleting pending')
    await prisma.pendingDocument.delete({ where: { id: pendingId } })

    console.log('Sending success message')
    await editMessage(
      chatId,
      messageId,
      `🔄 Документ обновлён!\n\n` +
        `📋 ${docData.title}\n` +
        `📅 ${docData.date?.split('T')[0]}\n\n` +
        `🔗 ${process.env.NEXT_PUBLIC_APP_URL}/documents/${pending.duplicateId}`
    )
    
    // Отправляем сообщение с клавиатурой
    await sendMessage(chatId, '📂 Готов к новым документам!', { reply_markup: MAIN_KEYBOARD })
    console.log('Replace completed successfully')
    return
  }
  } catch (error) {
    console.error('Callback query error:', error)
    // Пытаемся отправить сообщение об ошибке пользователю
    try {
      await editMessage(chatId, messageId, `❌ Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`)
    } catch (editError) {
      console.error('Failed to edit message with error:', editError)
    }
    // Также отправляем новое сообщение, если edit не сработал
    try {
      await sendMessage(chatId, `❌ Произошла ошибка при обработке. Попробуйте ещё раз.`, { reply_markup: MAIN_KEYBOARD })
    } catch {
      // ignore
    }
  }
}

/**
 * Отправить сообщение об успехе.
 */
async function sendSuccessMessage(
  chatId: number,
  analysis: AnalysisResult,
  documentId: string,
  pageCount?: number
): Promise<void> {
  let response = `✅ Документ добавлен!\n\n`
  response += `📋 ${analysis.title || 'Документ'}\n`
  response += `📅 ${analysis.date || 'Дата не определена'}\n`

  if (pageCount && pageCount > 1) {
    response += `📄 Страниц: ${pageCount}\n`
  }

  if (analysis.category && analysis.subtype) {
    response += `📁 ${analysis.category} / ${analysis.subtype}\n`
  }
  if (analysis.doctor) response += `👨‍⚕️ Врач: ${analysis.doctor}\n`

  if (analysis.conclusion) {
    const shortConclusion = analysis.conclusion.length > 200
      ? analysis.conclusion.substring(0, 200) + '...'
      : analysis.conclusion
    response += `\n📜 Заключение:\n${shortConclusion}\n`
  }

  if (analysis.recommendations && analysis.recommendations.length > 0) {
    response += `\n✅ Рекомендации:\n`
    for (let i = 0; i < Math.min(analysis.recommendations.length, 5); i++) {
      response += `${i + 1}. ${analysis.recommendations[i]}\n`
    }
    if (analysis.recommendations.length > 5) {
      response += `... и ещё ${analysis.recommendations.length - 5}\n`
    }
  }

  if (analysis.summary) {
    const shortSummary = analysis.summary.length > 150
      ? analysis.summary.substring(0, 150) + '...'
      : analysis.summary
    response += `\n🤖 AI: ${shortSummary}\n`
  }

  response += `\n🔗 ${process.env.NEXT_PUBLIC_APP_URL}/documents/${documentId}`

  await sendMessage(chatId, response, { reply_markup: MAIN_KEYBOARD })
}

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 19) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

/**
 * Генерация выписки 027/у.
 */
async function generateExtract(chatId: number): Promise<void> {
  try {
    await sendMessage(chatId, '📋 Генерирую выписку 027/у...\nЭто может занять минуту.')

    // Определяем период: последний год
    const today = new Date()
    const yearAgo = new Date(today)
    yearAgo.setFullYear(yearAgo.getFullYear() - 1)

    const fromDate = yearAgo.toISOString().split('T')[0]
    const toDate = today.toISOString().split('T')[0]

    // Вызываем API
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const response = await fetch(`${baseUrl}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromDate, toDate }),
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Ошибка генерации')
    }

    const extract = await response.json()

    // Формируем текст выписки для Telegram
    let text = `📋 *ВЫПИСКА 027/у*\n\n`
    text += `👤 Пациент: ${extract.patient.fullName}\n`
    text += `📅 Период: ${extract.period.from} — ${extract.period.to}\n`
    text += `📄 Документов: ${extract.documentsCount}\n\n`

    text += `*🏥 Диагноз:*\n${extract.diagnosis.main}\n`
    if (extract.diagnosis.secondary && extract.diagnosis.secondary.length > 0) {
      text += `Сопутствующие: ${extract.diagnosis.secondary.join('; ')}\n`
    }
    text += '\n'

    // Сокращаем длинные секции для Telegram
    const maxLen = 400

    if (extract.anamnesis && extract.anamnesis !== 'Данные отсутствуют') {
      const anamnesis = extract.anamnesis.length > maxLen 
        ? extract.anamnesis.substring(0, maxLen) + '...' 
        : extract.anamnesis
      text += `*📜 Анамнез:*\n${anamnesis}\n\n`
    }

    if (extract.currentState && extract.currentState !== 'Данные отсутствуют') {
      text += `*❤️ Текущее состояние:*\n${extract.currentState}\n\n`
    }

    if (extract.recommendations && extract.recommendations !== 'Данные отсутствуют') {
      const recs = extract.recommendations.length > maxLen 
        ? extract.recommendations.substring(0, maxLen) + '...' 
        : extract.recommendations
      text += `*✅ Рекомендации:*\n${recs}\n\n`
    }

    text += `🔗 Полная версия: ${baseUrl}/extract`

    await sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      reply_markup: MAIN_KEYBOARD,
    })
  } catch (error) {
    console.error('Extract generation error:', error)
    const msg = error instanceof Error ? error.message : 'Неизвестная ошибка'
    await sendMessage(
      chatId,
      `❌ Ошибка генерации выписки: ${msg}\n\nПопробуйте на сайте: ${process.env.NEXT_PUBLIC_APP_URL}/extract`,
      { reply_markup: MAIN_KEYBOARD }
    )
  }
}

// ============================================
// СОСТОЯНИЕ ПОЛЬЗОВАТЕЛЯ (для ввода данных)
// ============================================

// Используем BatchPending с особым маркером для хранения состояния
const STATE_PREFIX = '__state__:'

async function setUserState(chatId: number, state: string): Promise<void> {
  // Удаляем старое состояние
  await prisma.batchPending.deleteMany({
    where: {
      chatId: BigInt(chatId),
      fileUrl: { startsWith: STATE_PREFIX },
    },
  })
  
  // Создаём новое
  await prisma.batchPending.create({
    data: {
      chatId: BigInt(chatId),
      fileUrl: `${STATE_PREFIX}${state}`,
      fileType: 'state',
    },
  })
}

async function getUserState(chatId: number): Promise<string | null> {
  const record = await prisma.batchPending.findFirst({
    where: {
      chatId: BigInt(chatId),
      fileUrl: { startsWith: STATE_PREFIX },
    },
  })
  
  if (!record) return null
  return record.fileUrl.replace(STATE_PREFIX, '')
}

async function clearUserState(chatId: number): Promise<void> {
  await prisma.batchPending.deleteMany({
    where: {
      chatId: BigInt(chatId),
      fileUrl: { startsWith: STATE_PREFIX },
    },
  })
}

// ============================================
// ЛЕКАРСТВА
// ============================================

async function showMedications(chatId: number): Promise<void> {
  const medications = await prisma.medication.findMany({
    where: { isActive: true },
    orderBy: { startDate: 'desc' },
  })
  
  if (medications.length === 0) {
    await sendMessage(
      chatId,
      `💊 Список препаратов пуст.\n\n` +
        `Чтобы добавить препарат, напишите:\n` +
        `\`/med Название, дозировка, сколько раз в день\`\n\n` +
        `Например:\n` +
        `\`/med Преднизолон, 5 мг, 2 раза в день\``,
      { 
        parse_mode: 'Markdown',
        reply_markup: DIARY_KEYBOARD,
      }
    )
    return
  }
  
  let text = `💊 Текущие препараты:\n\n`
  
  for (const med of medications) {
    const startDate = new Date(med.startDate).toLocaleDateString('ru-RU')
    text += `• *${med.name}*`
    if (med.dosage) text += ` — ${med.dosage}`
    if (med.frequency) text += `, ${med.frequency}`
    text += `\n  (с ${startDate})\n`
  }
  
  text += `\n➕ Добавить: \`/med Название, дозировка, частота\``
  
  await sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: DIARY_KEYBOARD,
  })
}
