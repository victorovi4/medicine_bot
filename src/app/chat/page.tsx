'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { ChatMessage } from '@/components/ChatMessage'
import { ChatInput } from '@/components/ChatInput'
import { MessageSquare, Plus, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

interface ConversationSummary {
  id: string
  title: string | null
  updatedAt: string
  _count: { messages: number }
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Автоскролл к последнему сообщению
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Загрузить список разговоров
  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/chat')
      if (res.ok) {
        const data = await res.json()
        setConversations(data)
      }
    } catch (err) {
      console.error('Failed to load conversations:', err)
    }
  }, [])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  // Загрузить конкретный разговор
  const loadConversation = async (id: string) => {
    try {
      const res = await fetch(`/api/chat?conversationId=${id}`)
      if (res.ok) {
        const data = await res.json()
        setConversationId(id)
        setMessages(data.messages.map((m: { id: string; role: string; content: string }) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })))
        setShowSidebar(false)
      }
    } catch (err) {
      console.error('Failed to load conversation:', err)
    }
  }

  // Новый разговор
  const startNewConversation = () => {
    setConversationId(null)
    setMessages([])
    setShowSidebar(false)
  }

  // Отправить сообщение
  const handleSend = async (text: string) => {
    if (isLoading) return

    // Добавляем user message
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    }
    setMessages(prev => [...prev, userMsg])

    // Добавляем пустое assistant message (для streaming)
    const assistantId = `assistant-${Date.now()}`
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    }
    setMessages(prev => [...prev, assistantMsg])
    setIsLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationId,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Ошибка API')
      }

      // Парсим SSE stream
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Оставляем незавершённую строку

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6)

          try {
            const event = JSON.parse(jsonStr)

            if (event.type === 'meta') {
              setConversationId(event.conversationId)
            } else if (event.type === 'text') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, content: m.content + event.text }
                    : m
                )
              )
            } else if (event.type === 'done') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, isStreaming: false }
                    : m
                )
              )
            } else if (event.type === 'error') {
              throw new Error(event.error)
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }

      // Обновить список разговоров
      loadConversations()
    } catch (err) {
      console.error('Chat error:', err)
      const errorMsg = err instanceof Error ? err.message : 'Произошла ошибка'
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: `Ошибка: ${errorMsg}`, isStreaming: false }
            : m
        )
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Верхняя панель */}
      <div className="flex-shrink-0 border-b bg-white px-4 py-2.5">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-purple-600" />
              <h2 className="font-semibold text-gray-900">Консультация ИИ</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
            >
              История ({conversations.length})
            </button>
            <button
              onClick={startNewConversation}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50"
            >
              <Plus className="h-4 w-4" />
              Новый
            </button>
          </div>
        </div>
      </div>

      {/* Основная область */}
      <div className="flex-1 overflow-hidden flex">
        {/* Сайдбар с историей */}
        {showSidebar && (
          <div className="w-64 border-r bg-gray-50 overflow-y-auto flex-shrink-0">
            <div className="p-3">
              <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Разговоры</h3>
              {conversations.length === 0 ? (
                <p className="text-sm text-gray-400">Нет разговоров</p>
              ) : (
                <div className="space-y-1">
                  {conversations.map(conv => (
                    <button
                      key={conv.id}
                      onClick={() => loadConversation(conv.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate
                        ${conv.id === conversationId
                          ? 'bg-blue-100 text-blue-800'
                          : 'hover:bg-gray-100 text-gray-700'
                        }`}
                    >
                      {conv.title || 'Без названия'}
                      <span className="block text-xs text-gray-400">
                        {new Date(conv.updatedAt).toLocaleDateString('ru-RU')} · {conv._count.messages} сообщ.
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Сообщения */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-20">
                  <MessageSquare className="h-12 w-12 text-purple-300 mb-4" />
                  <h3 className="text-lg font-medium text-gray-700 mb-2">
                    Консультация ИИ
                  </h3>
                  <p className="text-sm text-gray-500 max-w-md">
                    Задайте вопрос о медицинской истории. ИИ проанализирует все документы
                    и найдёт нужную информацию.
                  </p>
                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      'Какой уровень гемоглобина?',
                      'Какие анализы были за последний месяц?',
                      'Есть ли динамика ПСА?',
                      'Какие рекомендации от врачей?',
                    ].map(suggestion => (
                      <button
                        key={suggestion}
                        onClick={() => handleSend(suggestion)}
                        className="text-sm text-left px-3 py-2 rounded-lg border border-gray-200
                                 hover:bg-gray-50 hover:border-gray-300 text-gray-600"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map(msg => (
                  <ChatMessage
                    key={msg.id}
                    role={msg.role}
                    content={msg.content}
                    isStreaming={msg.isStreaming}
                  />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Поле ввода */}
          <ChatInput onSend={handleSend} disabled={isLoading} />
        </div>
      </div>
    </div>
  )
}
