'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  Loader2,
  Send,
  Plus,
  History,
  X,
  MessageSquare,
  Shield,
} from 'lucide-react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

interface ConversationSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messageCount: number
}

const EXAMPLE_QUESTIONS = [
  'Какая динамика ПСА за последний год?',
  'Когда была последняя гемотрансфузия?',
  'Какие лекарства принимает пациент?',
  'Есть ли связь между СРБ и гемоглобином?',
]

/** Simple markdown to HTML: bold, italic, lists, line breaks */
function renderMarkdown(md: string): string {
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
    .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul class="list-disc list-inside space-y-1 my-2">$1</ul>')
    .replace(/\n\n/g, '</p><p class="mb-2">')
    .replace(/\n/g, '<br />')

  return `<p class="mb-2">${html}</p>`
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [input, setInput] = useState('')
  const [showSidebar, setShowSidebar] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const streamRef = useRef<string>('')

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px'
    }
  }, [input])

  // Load conversations list
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

  // Load a specific conversation
  const loadConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/chat?conversationId=${id}`)
      if (res.ok) {
        const data = await res.json()
        setConversationId(data.id)
        setMessages(
          data.messages.map((m: { role: string; content: string }) => ({
            role: m.role,
            content: m.content,
          }))
        )
        setShowSidebar(false)
      }
    } catch (err) {
      console.error('Failed to load conversation:', err)
    }
  }, [])

  // Load conversations on mount
  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  // Send message
  const sendMessage = async (text?: string) => {
    const messageText = (text || input).trim()
    if (!messageText || isLoading) return

    setInput('')
    setError(null)
    setIsLoading(true)
    streamRef.current = ''

    // Add user message to UI
    setMessages((prev) => [...prev, { role: 'user', content: messageText }])
    // Add placeholder for assistant
    setMessages((prev) => [...prev, { role: 'assistant', content: '', isStreaming: true }])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          conversationId,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка отправки')
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6)

          try {
            const event = JSON.parse(jsonStr)

            if (event.type === 'meta') {
              setConversationId(event.conversationId)
            } else if (event.type === 'text') {
              streamRef.current += event.text
              const currentText = streamRef.current
              setMessages((prev) => {
                const updated = [...prev]
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: currentText,
                  isStreaming: true,
                }
                return updated
              })
            } else if (event.type === 'done') {
              setMessages((prev) => {
                const updated = [...prev]
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: streamRef.current,
                  isStreaming: false,
                }
                return updated
              })
            } else if (event.type === 'error') {
              throw new Error(event.error)
            }
          } catch (e) {
            if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
              throw e
            }
          }
        }
      }
    } catch (err) {
      console.error('Chat error:', err)
      setError(err instanceof Error ? err.message : 'Произошла ошибка')
      // Remove the placeholder assistant message on error
      setMessages((prev) => {
        const updated = [...prev]
        if (updated.length > 0 && updated[updated.length - 1].role === 'assistant' && !updated[updated.length - 1].content) {
          updated.pop()
        }
        return updated
      })
    } finally {
      setIsLoading(false)
      // Refresh conversations list
      loadConversations()
    }
  }

  // New conversation
  const startNewConversation = () => {
    setConversationId(null)
    setMessages([])
    setError(null)
    setShowSidebar(false)
    textareaRef.current?.focus()
  }

  // Handle keyboard
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const conversationTitle = conversations.find((c) => c.id === conversationId)?.title || null

  return (
    <div className="flex flex-col h-full pb-4">
      {/* Chat header */}
      <div className="flex items-center justify-between py-3 border-b border-[rgba(0,210,170,0.09)] mb-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-[#00d2aa]" />
          <h2 className="font-semibold text-[rgba(204,232,225,0.9)] truncate">
            {conversationTitle || 'Консультация ИИ'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={startNewConversation}
            className="bg-[#0a1525] border border-[rgba(0,210,170,0.12)] text-[rgba(204,232,225,0.7)] hover:border-[rgba(0,210,170,0.3)] hover:bg-[#0a1525]"
          >
            <Plus className="h-4 w-4 mr-1" />
            Новый
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setShowSidebar(!showSidebar)
              if (!showSidebar) loadConversations()
            }}
            className="bg-[#0a1525] border border-[rgba(0,210,170,0.12)] text-[rgba(204,232,225,0.7)] hover:border-[rgba(0,210,170,0.3)] hover:bg-[#0a1525]"
          >
            <History className="h-4 w-4 mr-1" />
            История
          </Button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar */}
        {showSidebar && (
          <div className="absolute inset-0 z-10 flex">
            <div className="w-80 bg-[#060f1c] border-r border-[rgba(0,210,170,0.09)] flex flex-col shadow-lg">
              <div className="flex items-center justify-between p-3 border-b border-[rgba(0,210,170,0.09)]">
                <h3 className="font-medium text-sm text-[rgba(204,232,225,0.7)]">История разговоров</h3>
                <button onClick={() => setShowSidebar(false)}>
                  <X className="h-4 w-4 text-[rgba(204,232,225,0.5)]" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {conversations.length === 0 ? (
                  <p className="text-sm text-[rgba(204,232,225,0.45)] p-4 text-center">
                    Пока нет разговоров
                  </p>
                ) : (
                  conversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => loadConversation(conv.id)}
                      className={`w-full text-left p-3 border-b border-[rgba(0,210,170,0.06)] hover:bg-[#0a1525] transition-colors ${
                        conv.id === conversationId ? 'bg-[rgba(0,210,170,0.06)] border-l-2 border-l-[#00d2aa]' : ''
                      }`}
                    >
                      <p className="text-sm font-medium text-[rgba(204,232,225,0.8)] truncate">
                        {conv.title}
                      </p>
                      <p className="text-xs text-[rgba(204,232,225,0.4)] mt-1">
                        {new Date(conv.updatedAt).toLocaleDateString('ru-RU')}{' '}
                        &middot; {conv.messageCount} сообщ.
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="flex-1 bg-black/20" onClick={() => setShowSidebar(false)} />
          </div>
        )}

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 px-1">
          {/* Empty state */}
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full">
              <MessageSquare className="h-12 w-12 text-[rgba(0,210,170,0.3)] mb-4" />
              <h3 className="text-lg font-medium text-[rgba(204,232,225,0.7)] mb-2">
                Задайте вопрос по медицинской карте
              </h3>
              <p className="text-sm text-[rgba(204,232,225,0.45)] mb-6 text-center max-w-md">
                ИИ-ассистент видит все документы, анализы, лекарства и процедуры пациента.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                {EXAMPLE_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="rounded-full border border-[rgba(0,210,170,0.12)] bg-[#0a1525] px-3 py-1.5 text-xs text-[rgba(204,232,225,0.55)] hover:border-[rgba(0,210,170,0.3)] hover:text-[rgba(204,232,225,0.9)] transition-all cursor-pointer text-left"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex mb-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-[#00d2aa] text-[#030b14] font-medium rounded-br-sm'
                    : 'bg-[#060f1c] border border-[rgba(0,210,170,0.1)] text-[rgba(204,232,225,0.9)] rounded-bl-sm'
                }`}
              >
                {msg.role === 'user' ? (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                ) : msg.content ? (
                  <div className="relative">
                    <div
                      className="prose prose-sm max-w-none text-[rgba(204,232,225,0.9)] prose-strong:text-[rgba(204,232,225,1)] prose-headings:text-[rgba(204,232,225,0.9)]"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                    />
                    {msg.isStreaming && (
                      <span className="inline-block w-1.5 h-4 bg-[#00d2aa] animate-pulse ml-0.5 align-text-bottom" />
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-[rgba(204,232,225,0.4)]">
                    <Loader2 className="h-4 w-4 animate-spin text-[#00d2aa]" />
                    <span className="text-sm">Думаю...</span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Error */}
          {error && (
            <div className="flex justify-center mb-4">
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-600">
                {error}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Disclaimer */}
      {messages.length > 0 && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 bg-[#0a1525] border border-[rgba(0,210,170,0.09)] rounded mt-2">
          <Shield className="h-3.5 w-3.5 flex-shrink-0 text-[rgba(204,232,225,0.35)]" />
          <span className="text-xs text-[rgba(204,232,225,0.45)]">ИИ-ассистент не заменяет врача. Все решения принимайте с лечащим специалистом.</span>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-[rgba(0,210,170,0.09)] bg-[#060f1c] px-4 py-3 mt-2 flex gap-2 items-end -mx-0 rounded-b-lg">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Задайте вопрос..."
          rows={1}
          disabled={isLoading}
          className="w-full resize-none rounded-lg border border-[rgba(0,210,170,0.12)] bg-[#0a1525] px-3 py-2 text-sm text-[#cce8e1] placeholder:text-[rgba(204,232,225,0.3)] focus:border-[rgba(0,210,170,0.35)] focus:outline-none focus:ring-0 disabled:opacity-50 flex-1"
        />
        <Button
          onClick={() => sendMessage()}
          disabled={isLoading || !input.trim()}
          className="rounded-lg bg-[#00d2aa] px-4 py-2 text-sm font-semibold text-[#030b14] hover:bg-[#00f0c6] disabled:opacity-40 transition-colors flex-shrink-0 h-auto"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
