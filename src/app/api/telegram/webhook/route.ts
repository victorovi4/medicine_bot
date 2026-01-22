import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { PDFDocument } from 'pdf-lib'
import { prisma } from '@/lib/db'
import { analyzeDocument, analyzeMultipleImages, AnalysisResult } from '@/lib/claude'
import { normalizeDocumentType } from '@/lib/types'
import {
  TelegramUpdate,
  sendMessage,
  editMessage,
  answerCallbackQuery,
  getFile,
  downloadFile,
  isUserAllowed,
} from '@/lib/telegram'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
          `Я помогаю добавлять документы в медицинскую карту.\n\n` +
          `📄 Просто отправьте фото или PDF документа.\n\n` +
          `📎 Если документ на нескольких фото — нажмите кнопку "📎 Много фото" внизу.\n\n` +
          `🔗 Карта: ${process.env.NEXT_PUBLIC_APP_URL}`,
        {
          reply_markup: {
            keyboard: [
              [{ text: '📎 Много фото' }],
              [{ text: '📊 Статистика' }, { text: '📋 Последние' }],
            ],
            resize_keyboard: true,
          },
        }
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
          `Команды: /status, /last, /cancel`
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
          {
            reply_markup: {
              keyboard: [
                [{ text: '📎 Много фото' }],
                [{ text: '📊 Статистика' }, { text: '📋 Последние' }],
              ],
              resize_keyboard: true,
            },
          }
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
  const normalizedType = normalizeDocumentType(analysis.type || '')
  const docDate = analysis.date ? new Date(analysis.date) : new Date()

  // Ищем похожие документы (та же дата ±3 дня и похожий тип)
  const startDate = new Date(docDate)
  startDate.setDate(startDate.getDate() - 3)
  const endDate = new Date(docDate)
  endDate.setDate(endDate.getDate() + 3)

  const similar = await prisma.document.findMany({
    where: {
      date: {
        gte: startDate,
        lte: endDate,
      },
      type: normalizedType,
    },
    orderBy: { date: 'desc' },
    take: 5,
  })

  // Проверяем схожесть названий
  const duplicate = similar.find((doc) => {
    const titleWords = (analysis.title || '').toLowerCase().split(/\s+/)
    const docWords = doc.title.toLowerCase().split(/\s+/)
    const commonWords = titleWords.filter((w) => w.length > 3 && docWords.includes(w))
    return commonWords.length >= 2 // Минимум 2 общих слова длиннее 3 символов
  })

  // Подготавливаем данные документа
  const documentData = {
    date: docDate.toISOString(),
    type: normalizedType,
    title: analysis.title || 'Документ из Telegram',
    doctor: analysis.doctor,
    specialty: analysis.specialty,
    clinic: analysis.clinic,
    summary: analysis.summary,
    conclusion: analysis.conclusion,
    recommendations: analysis.recommendations || [],
    content: caption || (pageCount > 1 ? `Документ из ${pageCount} страниц` : null),
    fileUrl,
    fileName: fileName || `telegram-${Date.now()}.jpg`,
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
    const document = await prisma.document.create({
      data: {
        date: docDate,
        type: documentData.type,
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

  const [action, pendingId] = callback.data.split(':')
  const chatId = callback.message.chat.id
  const messageId = callback.message.message_id

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
    type: string
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
    await sendMessage(chatId, '📂 Готов к новым документам!', {
      reply_markup: {
        keyboard: [
          [{ text: '📎 Много фото' }],
          [{ text: '📊 Статистика' }, { text: '📋 Последние' }],
        ],
        resize_keyboard: true,
      },
    })
    return
  }

  if (action === 'add') {
    // Добавить как новый
    const document = await prisma.document.create({
      data: {
        date: new Date(docData.date),
        type: docData.type,
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
    await sendMessage(chatId, '📂 Готов к новым документам!', {
      reply_markup: {
        keyboard: [
          [{ text: '📎 Много фото' }],
          [{ text: '📊 Статистика' }, { text: '📋 Последние' }],
        ],
        resize_keyboard: true,
      },
    })
    return
  }

  if (action === 'replace') {
    // Заменить существующий
    if (!pending.duplicateId) {
      await editMessage(chatId, messageId, '❌ Ошибка: дубликат не найден.')
      return
    }

    await prisma.document.update({
      where: { id: pending.duplicateId },
      data: {
        date: new Date(docData.date),
        type: docData.type,
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

    await prisma.pendingDocument.delete({ where: { id: pendingId } })

    await editMessage(
      chatId,
      messageId,
      `🔄 Документ обновлён!\n\n` +
        `📋 ${docData.title}\n` +
        `📅 ${docData.date?.split('T')[0]}\n\n` +
        `🔗 ${process.env.NEXT_PUBLIC_APP_URL}/documents/${pending.duplicateId}`
    )
    // Отправляем сообщение с клавиатурой
    await sendMessage(chatId, '📂 Готов к новым документам!', {
      reply_markup: {
        keyboard: [
          [{ text: '📎 Много фото' }],
          [{ text: '📊 Статистика' }, { text: '📋 Последние' }],
        ],
        resize_keyboard: true,
      },
    })
  }
  } catch (error) {
    console.error('Callback query error:', error)
    try {
      await editMessage(chatId, messageId, `❌ Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`)
    } catch {
      // ignore edit error
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

  if (analysis.type) response += `📁 Тип: ${analysis.type}\n`
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

  await sendMessage(chatId, response, {
    reply_markup: {
      keyboard: [
        [{ text: '📎 Много фото' }],
        [{ text: '📊 Статистика' }, { text: '📋 Последние' }],
      ],
      resize_keyboard: true,
    },
  })
}

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 19) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}
