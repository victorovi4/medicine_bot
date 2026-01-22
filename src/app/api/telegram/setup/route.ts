import { NextRequest, NextResponse } from 'next/server'
import { setWebhook, deleteWebhook } from '@/lib/telegram'

/**
 * API для управления Telegram webhook.
 * GET — показать информацию о webhook.
 * POST — установить webhook.
 * DELETE — удалить webhook.
 */

// GET — показать текущий статус или установить с ?set=true
export async function GET(request: NextRequest) {
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/telegram/webhook`
  const { searchParams } = new URL(request.url)
  
  // Если ?set=true — устанавливаем webhook
  if (searchParams.get('set') === 'true') {
    try {
      await setWebhook(webhookUrl)
      return NextResponse.json({
        success: true,
        message: '✅ Webhook установлен!',
        webhookUrl,
        allowedUpdates: ['message', 'callback_query'],
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Setup failed'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  return NextResponse.json({
    message: 'Telegram webhook setup',
    webhookUrl,
    instructions: {
      set: 'GET /api/telegram/setup?set=true — установить webhook',
      delete: 'DELETE /api/telegram/setup — удалить webhook',
    },
  })
}

// POST — установить webhook
export async function POST(request: NextRequest) {
  try {
    // Опционально: проверка секретного ключа
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')

    if (process.env.SETUP_SECRET && secret !== process.env.SETUP_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/telegram/webhook`

    await setWebhook(webhookUrl)

    return NextResponse.json({
      success: true,
      message: 'Webhook set successfully',
      webhookUrl,
    })
  } catch (error) {
    console.error('Setup error:', error)
    const message = error instanceof Error ? error.message : 'Setup failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE — удалить webhook
export async function DELETE() {
  try {
    await deleteWebhook()

    return NextResponse.json({
      success: true,
      message: 'Webhook deleted',
    })
  } catch (error) {
    console.error('Delete webhook error:', error)
    const message = error instanceof Error ? error.message : 'Delete failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
