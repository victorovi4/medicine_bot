/**
 * Утилиты для работы с Telegram Bot API.
 * Включает отправку сообщений, работу с файлами и управление webhook.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

export interface TelegramMessage {
  message_id: number
  from: {
    id: number
    first_name: string
    last_name?: string
    username?: string
  }
  chat: {
    id: number
    type: string
  }
  date: number
  text?: string
  photo?: TelegramPhotoSize[]
  document?: TelegramDocument
  caption?: string
}

export interface TelegramCallbackQuery {
  id: string
  from: {
    id: number
    first_name: string
  }
  message?: {
    message_id: number
    chat: {
      id: number
    }
  }
  data?: string
}

export interface TelegramPhotoSize {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  file_size?: number
}

export interface TelegramDocument {
  file_id: string
  file_unique_id: string
  file_name?: string
  mime_type?: string
  file_size?: number
}

export interface TelegramFile {
  file_id: string
  file_unique_id: string
  file_size?: number
  file_path?: string
}

export interface InlineKeyboardButton {
  text: string
  callback_data: string
}

export interface ReplyKeyboardButton {
  text: string
}

export interface ReplyKeyboardMarkup {
  keyboard: ReplyKeyboardButton[][]
  resize_keyboard?: boolean
  one_time_keyboard?: boolean
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][]
}

/**
 * Отправить текстовое сообщение в чат.
 */
export async function sendMessage(
  chatId: number,
  text: string,
  options?: {
    parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2'
    reply_to_message_id?: number
    disable_notification?: boolean
    reply_markup?: InlineKeyboardMarkup | ReplyKeyboardMarkup
  }
): Promise<{ message_id: number }> {
  const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...options,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error('Telegram sendMessage error:', error)
    throw new Error(`Failed to send message: ${error.description}`)
  }

  const data = await response.json()
  return { message_id: data.result.message_id }
}

/**
 * Редактировать существующее сообщение.
 */
export async function editMessage(
  chatId: number,
  messageId: number,
  text: string,
  options?: {
    parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2'
    reply_markup?: InlineKeyboardMarkup
  }
): Promise<void> {
  const response = await fetch(`${TELEGRAM_API}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      ...options,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error('Telegram editMessage error:', error)
  }
}

/**
 * Ответить на callback_query (убрать "часики" у кнопки).
 */
export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<void> {
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
    }),
  })
}

/**
 * Получить информацию о файле по file_id.
 */
export async function getFile(fileId: string): Promise<TelegramFile> {
  const response = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`)

  if (!response.ok) {
    throw new Error('Failed to get file info')
  }

  const data = await response.json()
  return data.result
}

/**
 * Скачать файл из Telegram.
 */
export async function downloadFile(filePath: string): Promise<Buffer> {
  const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('Failed to download file')
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * Установить webhook для бота.
 */
export async function setWebhook(url: string): Promise<void> {
  const response = await fetch(`${TELEGRAM_API}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      allowed_updates: ['message', 'callback_query'],
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Failed to set webhook: ${error.description}`)
  }
}

/**
 * Удалить webhook.
 */
export async function deleteWebhook(): Promise<void> {
  await fetch(`${TELEGRAM_API}/deleteWebhook`)
}

/**
 * Проверить, разрешён ли пользователь.
 */
export function isUserAllowed(userId: number): boolean {
  const allowedUsers = process.env.TELEGRAM_ALLOWED_USERS

  // Если список не задан, разрешаем всем
  if (!allowedUsers) return true

  const allowedIds = allowedUsers.split(',').map((id) => parseInt(id.trim(), 10))
  return allowedIds.includes(userId)
}

// ============================================
// КЛАВИАТУРЫ
// ============================================

/**
 * Основная клавиатура бота.
 */
export const MAIN_KEYBOARD: ReplyKeyboardMarkup = {
  keyboard: [
    [{ text: '📎 Много фото' }, { text: '📋 Дневник' }],
    [{ text: '📊 Статистика' }, { text: '📋 Последние' }],
  ],
  resize_keyboard: true,
}

/**
 * Клавиатура дневника.
 */
export const DIARY_KEYBOARD: ReplyKeyboardMarkup = {
  keyboard: [
    [{ text: '🩺 Симптом' }, { text: '🌡 Показатели' }],
    [{ text: '💊 Лекарства' }, { text: '◀️ Назад' }],
  ],
  resize_keyboard: true,
}

/**
 * Клавиатура режима batch.
 */
export const BATCH_KEYBOARD: ReplyKeyboardMarkup = {
  keyboard: [[{ text: '✅ Готово' }, { text: '❌ Отмена' }]],
  resize_keyboard: true,
}

/**
 * Клавиатура выбора показателя.
 */
export const VITALS_KEYBOARD: ReplyKeyboardMarkup = {
  keyboard: [
    [{ text: '🌡 Температура' }, { text: '💓 Давление' }],
    [{ text: '❤️ Пульс' }, { text: '🫁 Сатурация' }],
    [{ text: '◀️ Назад' }],
  ],
  resize_keyboard: true,
}

/**
 * Клавиатура подтверждения интенсивности симптома.
 */
export const INTENSITY_KEYBOARD: ReplyKeyboardMarkup = {
  keyboard: [
    [{ text: '1' }, { text: '2' }, { text: '3' }, { text: '4' }, { text: '5' }],
    [{ text: '6' }, { text: '7' }, { text: '8' }, { text: '9' }, { text: '10' }],
    [{ text: '⏭ Пропустить' }],
  ],
  resize_keyboard: true,
}
