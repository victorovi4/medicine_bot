/**
 * Утилиты для работы с Telegram Bot API.
 * Включает отправку сообщений, работу с файлами и управление webhook.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
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
  media_group_id?: string // Присутствует когда несколько фото отправлены вместе
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

/**
 * Отправить текстовое сообщение в чат.
 * Args:
 *   chatId (number): ID чата.
 *   text (string): Текст сообщения.
 *   options (object): Дополнительные опции (parse_mode, reply_to_message_id).
 */
export async function sendMessage(
  chatId: number,
  text: string,
  options?: {
    parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2'
    reply_to_message_id?: number
    disable_notification?: boolean
  }
): Promise<void> {
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
}

/**
 * Получить информацию о файле по file_id.
 * Args:
 *   fileId (string): ID файла из Telegram.
 * Returns:
 *   TelegramFile: Информация о файле включая file_path.
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
 * Args:
 *   filePath (string): Путь к файлу (из getFile).
 * Returns:
 *   Buffer: Содержимое файла.
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
 * Args:
 *   url (string): URL webhook endpoint.
 */
export async function setWebhook(url: string): Promise<void> {
  const response = await fetch(`${TELEGRAM_API}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      allowed_updates: ['message'],
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
 * Args:
 *   userId (number): Telegram ID пользователя.
 * Returns:
 *   boolean: true если пользователь разрешён.
 */
export function isUserAllowed(userId: number): boolean {
  const allowedUsers = process.env.TELEGRAM_ALLOWED_USERS

  // Если список не задан, разрешаем всем
  if (!allowedUsers) return true

  const allowedIds = allowedUsers.split(',').map((id) => parseInt(id.trim(), 10))
  return allowedIds.includes(userId)
}
