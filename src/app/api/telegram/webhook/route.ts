import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { prisma } from '@/lib/db'
import { analyzeDocument } from '@/lib/claude'
import { normalizeDocumentType } from '@/lib/types'
import {
  TelegramUpdate,
  sendMessage,
  getFile,
  downloadFile,
  isUserAllowed,
} from '@/lib/telegram'

// Используем Node.js runtime для работы с файлами
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Webhook endpoint для Telegram бота.
 * Обрабатывает входящие сообщения и добавляет документы в медкарту.
 */
export async function POST(request: NextRequest) {
  try {
    const update: TelegramUpdate = await request.json()

    // Обрабатываем только сообщения
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
          'Если вы член семьи, попросите администратора добавить ваш Telegram ID в список разрешённых.\n' +
          `Ваш ID: ${userId}`
      )
      return NextResponse.json({ ok: true })
    }

    // Команда /start
    if (message.text === '/start') {
      await sendMessage(
        chatId,
        `👋 Привет, ${userName}!\n\n` +
          `Я помогаю добавлять документы в медицинскую карту Виктора Борисовича.\n\n` +
          `📄 Отправьте мне фото или PDF медицинского документа (анализ, заключение, выписка), и я:\n` +
          `1. Проанализирую его с помощью AI\n` +
          `2. Извлеку ключевую информацию\n` +
          `3. Добавлю в медицинскую карту\n\n` +
          `🔗 Посмотреть карту: ${process.env.NEXT_PUBLIC_APP_URL}\n\n` +
          `Команды:\n` +
          `/start — это сообщение\n` +
          `/status — статистика карты\n` +
          `/last — последние 5 документов\n` +
          `/help — справка`
      )
      return NextResponse.json({ ok: true })
    }

    // Команда /status
    if (message.text === '/status') {
      const count = await prisma.document.count()
      const lastDoc = await prisma.document.findFirst({
        orderBy: { createdAt: 'desc' },
      })

      let statusText = `📊 Статистика медицинской карты:\n\n`
      statusText += `📄 Всего документов: ${count}\n`

      if (lastDoc) {
        const lastDate = new Date(lastDoc.createdAt).toLocaleDateString('ru-RU')
        statusText += `📅 Последний добавлен: ${lastDate}\n`
        statusText += `   "${lastDoc.title}"`
      }

      statusText += `\n\n🔗 ${process.env.NEXT_PUBLIC_APP_URL}`

      await sendMessage(chatId, statusText)
      return NextResponse.json({ ok: true })
    }

    // Команда /last
    if (message.text === '/last') {
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

    // Команда /help
    if (message.text === '/help') {
      await sendMessage(
        chatId,
        `📖 Справка по боту\n\n` +
          `Отправьте мне фото или PDF документа, и я добавлю его в медицинскую карту.\n\n` +
          `Команды:\n` +
          `/start — приветствие\n` +
          `/status — статистика\n` +
          `/last — последние 5 документов\n` +
          `/help — эта справка\n\n` +
          `💡 Совет: для лучшего распознавания отправляйте документы как файлы (📎), а не сжатые фото.`
      )
      return NextResponse.json({ ok: true })
    }

    // Обработка фото
    if (message.photo && message.photo.length > 0) {
      await processPhoto(chatId, message.photo, message.caption)
      return NextResponse.json({ ok: true })
    }

    // Обработка документа (PDF)
    if (message.document) {
      await processDocument(chatId, message.document, message.caption)
      return NextResponse.json({ ok: true })
    }

    // Неизвестное сообщение
    if (message.text && !message.text.startsWith('/')) {
      await sendMessage(
        chatId,
        '🤔 Отправьте мне фото или PDF медицинского документа, чтобы я добавил его в карту.\n\n' +
          'Просто текстовые сообщения я пока не обрабатываю.'
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Webhook error:', error)
    // Всегда возвращаем 200 для Telegram, иначе он будет повторять запросы
    return NextResponse.json({ ok: true })
  }
}

/**
 * Обработка фото из Telegram.
 * Args:
 *   chatId (number): ID чата для ответа.
 *   photos (array): Массив фото разных размеров.
 *   caption (string): Подпись к фото.
 */
async function processPhoto(
  chatId: number,
  photos: { file_id: string; width: number; height: number }[],
  caption?: string
): Promise<void> {
  // Берём фото максимального размера (последнее в массиве)
  const photo = photos[photos.length - 1]

  await sendMessage(chatId, '📥 Получил фото, начинаю обработку...')

  try {
    // 1. Скачиваем файл из Telegram
    const fileInfo = await getFile(photo.file_id)
    if (!fileInfo.file_path) {
      throw new Error('File path not available')
    }

    const fileBuffer = await downloadFile(fileInfo.file_path)

    // 2. Загружаем в Vercel Blob
    const timestamp = Date.now()
    const blobName = `documents/tg-${timestamp}.jpg`

    const blob = await put(blobName, fileBuffer, {
      access: 'public',
      contentType: 'image/jpeg',
    })

    await sendMessage(chatId, '🤖 Анализирую документ с помощью AI...')

    // 3. AI-анализ
    const analysis = await analyzeDocument(blob.url, 'image/jpeg')

    // Нормализуем тип документа
    const normalizedType = normalizeDocumentType(analysis.type || '')

    // 4. Сохраняем в базу
    const document = await prisma.document.create({
      data: {
        date: analysis.date ? new Date(analysis.date) : new Date(),
        type: normalizedType,
        title: analysis.title || 'Документ из Telegram',
        doctor: analysis.doctor,
        specialty: analysis.specialty,
        clinic: analysis.clinic,
        summary: analysis.summary,
        content: caption || null,
        fileUrl: blob.url,
        fileName: `telegram-${timestamp}.jpg`,
        fileType: 'image/jpeg',
        tags: analysis.tags || [],
        keyValues: analysis.keyValues || null,
      },
    })

    // 5. Формируем ответ
    await sendSuccessMessage(chatId, analysis, document.id)
  } catch (error) {
    console.error('Photo processing error:', error)
    const errorMessage =
      error instanceof Error ? error.message : 'Неизвестная ошибка'
    await sendMessage(
      chatId,
      `❌ Ошибка при обработке фото:\n${errorMessage}\n\n` +
        `Попробуйте отправить в лучшем качестве или как файл (не сжатое фото).`
    )
  }
}

/**
 * Обработка документа (PDF) из Telegram.
 * Args:
 *   chatId (number): ID чата для ответа.
 *   doc (object): Информация о документе.
 *   caption (string): Подпись к документу.
 */
async function processDocument(
  chatId: number,
  doc: { file_id: string; file_name?: string; mime_type?: string },
  caption?: string
): Promise<void> {
  const mimeType = doc.mime_type || 'application/octet-stream'
  const fileName = doc.file_name || 'document'

  // Проверяем тип файла
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
  ]

  const isAllowed = allowedTypes.some((t) => {
    const typePart = t.split('/')[1]
    return mimeType.includes(typePart)
  })

  if (!isAllowed) {
    await sendMessage(
      chatId,
      `❌ Неподдерживаемый тип файла: ${mimeType}\n\nПоддерживаются: PDF, JPG, PNG, WebP`
    )
    return
  }

  await sendMessage(chatId, `📥 Получил "${fileName}", начинаю обработку...`)

  try {
    // 1. Скачиваем файл
    const fileInfo = await getFile(doc.file_id)
    if (!fileInfo.file_path) {
      throw new Error('File path not available')
    }

    const fileBuffer = await downloadFile(fileInfo.file_path)

    // 2. Загружаем в Vercel Blob
    const timestamp = Date.now()
    const extension = fileName.split('.').pop() || 'pdf'
    const blobName = `documents/tg-${timestamp}.${extension}`

    const blob = await put(blobName, fileBuffer, {
      access: 'public',
      contentType: mimeType,
    })

    await sendMessage(chatId, '🤖 Анализирую документ с помощью AI...')

    // 3. AI-анализ
    const analysis = await analyzeDocument(blob.url, mimeType)

    // Нормализуем тип документа
    const normalizedType = normalizeDocumentType(analysis.type || '')

    // 4. Сохраняем в базу
    const document = await prisma.document.create({
      data: {
        date: analysis.date ? new Date(analysis.date) : new Date(),
        type: normalizedType,
        title: analysis.title || fileName,
        doctor: analysis.doctor,
        specialty: analysis.specialty,
        clinic: analysis.clinic,
        summary: analysis.summary,
        content: caption || null,
        fileUrl: blob.url,
        fileName: fileName,
        fileType: mimeType,
        tags: analysis.tags || [],
        keyValues: analysis.keyValues || null,
      },
    })

    // 5. Формируем ответ
    await sendSuccessMessage(chatId, analysis, document.id)
  } catch (error) {
    console.error('Document processing error:', error)
    const errorMessage =
      error instanceof Error ? error.message : 'Неизвестная ошибка'
    await sendMessage(chatId, `❌ Ошибка при обработке документа:\n${errorMessage}`)
  }
}

/**
 * Отправить сообщение об успешном добавлении документа.
 */
async function sendSuccessMessage(
  chatId: number,
  analysis: {
    title?: string
    date?: string | null
    type?: string
    doctor?: string | null
    summary?: string
    keyValues?: Record<string, string>
  },
  documentId: string
): Promise<void> {
  let response = `✅ Документ добавлен в карту!\n\n`
  response += `📋 ${analysis.title || 'Документ'}\n`
  response += `📅 ${analysis.date || 'Дата не определена'}\n`

  if (analysis.type) {
    response += `📁 Тип: ${analysis.type}\n`
  }

  if (analysis.doctor) {
    response += `👨‍⚕️ Врач: ${analysis.doctor}\n`
  }

  if (analysis.summary) {
    response += `\n📝 Резюме:\n${analysis.summary}\n`
  }

  // Ключевые показатели
  if (analysis.keyValues && Object.keys(analysis.keyValues).length > 0) {
    response += `\n📊 Показатели:\n`
    for (const [key, value] of Object.entries(analysis.keyValues)) {
      response += `• ${key}: ${value}\n`
    }
  }

  response += `\n🔗 Открыть: ${process.env.NEXT_PUBLIC_APP_URL}/documents/${documentId}`

  await sendMessage(chatId, response)
}
