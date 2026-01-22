import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { prisma } from '@/lib/db'
import { analyzeDocument, analyzeMultipleImages } from '@/lib/claude'
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

// Время ожидания для сбора фото из media group (в мс)
const MEDIA_GROUP_WAIT_TIME = 4000

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
          `📎 Многостраничный документ: выберите несколько фото в галерее и отправьте разом — я объединю их в один документ.\n\n` +
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
          `📎 Многостраничный документ:\n` +
          `Выберите несколько фото в галерее и отправьте их разом — они будут объединены в один документ.\n\n` +
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
      // Проверяем, является ли это частью media group
      if (message.media_group_id) {
        await handleMediaGroupPhoto(
          chatId,
          message.media_group_id,
          message.photo,
          message.caption
        )
      } else {
        // Одиночное фото — обрабатываем сразу
        await processPhoto(chatId, message.photo, message.caption)
      }
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
 * Обработка фото из media group.
 * Сохраняет фото в pending таблицу, первый запрос ждёт и обрабатывает всю группу.
 */
async function handleMediaGroupPhoto(
  chatId: number,
  mediaGroupId: string,
  photos: { file_id: string; width: number; height: number }[],
  caption?: string
): Promise<void> {
  // Берём фото максимального размера
  const photo = photos[photos.length - 1]

  // Сохраняем в pending таблицу
  await prisma.mediaGroupPending.create({
    data: {
      mediaGroupId,
      chatId: BigInt(chatId),
      fileId: photo.file_id,
      fileType: 'image/jpeg',
    },
  })

  // Проверяем, сколько уже есть фото в этой группе
  const existingCount = await prisma.mediaGroupPending.count({
    where: { mediaGroupId },
  })

  // Если это первое фото — мы "лидер", будем ждать и обрабатывать
  if (existingCount === 1) {
    await sendMessage(chatId, '📥 Получаю страницы документа...')

    // Ждём, пока придут остальные фото группы
    await new Promise((resolve) => setTimeout(resolve, MEDIA_GROUP_WAIT_TIME))

    // Забираем все фото из группы
    const pendingPhotos = await prisma.mediaGroupPending.findMany({
      where: { mediaGroupId },
      orderBy: { receivedAt: 'asc' },
    })

    if (pendingPhotos.length === 0) {
      // Кто-то уже обработал (race condition) — выходим
      return
    }

    // Удаляем из pending сразу, чтобы другие запросы не пытались обработать
    await prisma.mediaGroupPending.deleteMany({
      where: { mediaGroupId },
    })

    const photoCount = pendingPhotos.length
    await sendMessage(
      chatId,
      `📄 Получено ${photoCount} ${pluralize(photoCount, 'страница', 'страницы', 'страниц')}. Обрабатываю...`
    )

    try {
      // Скачиваем и загружаем все фото
      const uploadedImages: { url: string; mediaType: string }[] = []
      const timestamp = Date.now()

      for (let i = 0; i < pendingPhotos.length; i++) {
        const pending = pendingPhotos[i]
        const fileInfo = await getFile(pending.fileId)
        if (!fileInfo.file_path) continue

        const fileBuffer = await downloadFile(fileInfo.file_path)
        const blobName = `documents/tg-${timestamp}-page${i + 1}.jpg`

        const blob = await put(blobName, fileBuffer, {
          access: 'public',
          contentType: 'image/jpeg',
        })

        uploadedImages.push({
          url: blob.url,
          mediaType: 'image/jpeg',
        })
      }

      if (uploadedImages.length === 0) {
        throw new Error('Не удалось загрузить ни одно фото')
      }

      await sendMessage(chatId, '🤖 Анализирую документ с помощью AI...')

      // AI-анализ всех страниц как одного документа
      const analysis = await analyzeMultipleImages(uploadedImages)

      // Нормализуем тип документа
      const normalizedType = normalizeDocumentType(analysis.type || '')

      // Сохраняем в базу (используем URL первой страницы как основной файл)
      const document = await prisma.document.create({
        data: {
          date: analysis.date ? new Date(analysis.date) : new Date(),
          type: normalizedType,
          title: analysis.title || 'Многостраничный документ из Telegram',
          doctor: analysis.doctor,
          specialty: analysis.specialty,
          clinic: analysis.clinic,
          summary: analysis.summary,
          conclusion: analysis.conclusion,
          recommendations: analysis.recommendations || [],
          content: caption || `Документ из ${photoCount} страниц`,
          fileUrl: uploadedImages[0].url,
          fileName: `telegram-${timestamp}-multipage.jpg`,
          fileType: 'image/jpeg',
          tags: analysis.tags || [],
          keyValues: analysis.keyValues || null,
        },
      })

      // Формируем ответ
      await sendSuccessMessage(chatId, analysis, document.id, photoCount)
    } catch (error) {
      console.error('Media group processing error:', error)
      const errorMessage =
        error instanceof Error ? error.message : 'Неизвестная ошибка'
      await sendMessage(
        chatId,
        `❌ Ошибка при обработке документа:\n${errorMessage}\n\n` +
          `Попробуйте отправить страницы по одной или объединить в PDF.`
      )
    }
  }
  // Если это не первое фото — просто выходим, лидер обработает всё
}

/**
 * Обработка одиночного фото из Telegram.
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
        conclusion: analysis.conclusion,
        recommendations: analysis.recommendations || [],
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
        conclusion: analysis.conclusion,
        recommendations: analysis.recommendations || [],
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
    conclusion?: string | null
    recommendations?: string[]
    keyValues?: Record<string, string>
  },
  documentId: string,
  pageCount?: number
): Promise<void> {
  let response = `✅ Документ добавлен в карту!\n\n`
  response += `📋 ${analysis.title || 'Документ'}\n`
  response += `📅 ${analysis.date || 'Дата не определена'}\n`

  if (pageCount && pageCount > 1) {
    response += `📄 Страниц: ${pageCount}\n`
  }

  if (analysis.type) {
    response += `📁 Тип: ${analysis.type}\n`
  }

  if (analysis.doctor) {
    response += `👨‍⚕️ Врач: ${analysis.doctor}\n`
  }

  // Заключение врача (дословное)
  if (analysis.conclusion) {
    response += `\n📜 Заключение врача:\n${analysis.conclusion}\n`
  }

  // Рекомендации
  if (analysis.recommendations && analysis.recommendations.length > 0) {
    response += `\n✅ Рекомендации:\n`
    for (let i = 0; i < analysis.recommendations.length; i++) {
      response += `${i + 1}. ${analysis.recommendations[i]}\n`
    }
  }

  // AI-резюме
  if (analysis.summary) {
    response += `\n🤖 AI-резюме:\n${analysis.summary}\n`
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

/**
 * Склонение слова в зависимости от числа.
 */
function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100

  if (mod100 >= 11 && mod100 <= 19) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}
