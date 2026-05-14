'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { X, Plus, Loader2 } from 'lucide-react'

// Типы событий
const EVENT_TYPES = {
  hemotransfusion: {
    label: 'Гемотрансфузия',
    color: '#9333ea',
    icon: '💉',
  },
  hormone_injection: {
    label: 'Гормональная терапия',
    color: '#3b82f6',
    icon: '💊',
  },
  surgery: {
    label: 'Операция',
    color: '#ef4444',
    icon: '🔪',
  },
  hospitalization: {
    label: 'Госпитализация',
    color: '#6b7280',
    icon: '🏥',
  },
  medication_start: {
    label: 'Начало препарата',
    color: '#22c55e',
    icon: '💊',
  },
  medication_end: {
    label: 'Отмена препарата',
    color: '#f97316',
    icon: '⏹️',
  },
  other: {
    label: 'Другое',
    color: '#8b5cf6',
    icon: '📌',
  },
}

interface AddEventModalProps {
  metricName: string
  isOpen: boolean
  onClose: () => void
  onEventAdded: () => void
}

export function AddEventModal({ metricName, isOpen, onClose, onEventAdded }: AddEventModalProps) {
  const [eventType, setEventType] = useState<string>('other')
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState<string>('')
  const [label, setLabel] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  if (!isOpen) return null
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/metric-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metricName,
          date,
          eventType,
          label: label || EVENT_TYPES[eventType as keyof typeof EVENT_TYPES]?.label || 'Событие',
          color: EVENT_TYPES[eventType as keyof typeof EVENT_TYPES]?.color || '#8b5cf6',
          endDate: endDate || null,
          notes: notes || null,
        }),
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Ошибка сохранения')
      }
      
      onEventAdded()
      onClose()
      
      // Сбрасываем форму
      setEventType('other')
      setDate(new Date().toISOString().split('T')[0])
      setEndDate('')
      setLabel('')
      setNotes('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка')
    } finally {
      setLoading(false)
    }
  }
  
  const selectedType = EVENT_TYPES[eventType as keyof typeof EVENT_TYPES]
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md bg-[#060f1c] border border-[rgba(0,210,170,0.15)] rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg text-[#cce8e1]">
            Добавить событие на график
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-[rgba(204,232,225,0.5)] hover:text-[rgba(204,232,225,0.8)]">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Метрика */}
            <div>
              <label className="text-sm font-medium text-[rgba(204,232,225,0.6)]">График</label>
              <p className="text-sm text-[rgba(204,232,225,0.4)]">{metricName}</p>
            </div>

            {/* Тип события */}
            <div>
              <label className="block text-sm font-medium text-[rgba(204,232,225,0.6)] mb-2">
                Тип события
              </label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(EVENT_TYPES).map(([key, value]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setEventType(key)
                      if (!label) setLabel(value.label)
                    }}
                    className={`p-2 text-left rounded-lg border text-sm flex items-center gap-2 transition-colors ${
                      eventType === key
                        ? 'border-[rgba(0,210,170,0.3)] bg-[rgba(0,210,170,0.1)] text-[#00d2aa]'
                        : 'border-[rgba(0,210,170,0.09)] bg-[#0a1525] text-[rgba(204,232,225,0.5)] hover:border-[rgba(0,210,170,0.2)]'
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: value.color }}
                    />
                    <span>{value.icon}</span>
                    <span className="truncate">{value.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Дата */}
            <div>
              <label className="block text-sm font-medium text-[rgba(204,232,225,0.6)] mb-1">
                Дата события
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-[rgba(0,210,170,0.12)] rounded-lg text-sm bg-[#0a1525] text-[rgba(204,232,225,0.8)]"
                required
              />
            </div>

            {/* Дата окончания (для госпитализации) */}
            {eventType === 'hospitalization' && (
              <div>
                <label className="block text-sm font-medium text-[rgba(204,232,225,0.6)] mb-1">
                  Дата выписки (опционально)
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-[rgba(0,210,170,0.12)] rounded-lg text-sm bg-[#0a1525] text-[rgba(204,232,225,0.8)]"
                />
              </div>
            )}

            {/* Название */}
            <div>
              <label className="block text-sm font-medium text-[rgba(204,232,225,0.6)] mb-1">
                Описание
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={selectedType?.label || 'Краткое описание'}
                className="w-full px-3 py-2 border border-[rgba(0,210,170,0.12)] rounded-lg text-sm bg-[#0a1525] text-[rgba(204,232,225,0.8)] placeholder:text-[rgba(204,232,225,0.25)]"
              />
            </div>

            {/* Заметки */}
            <div>
              <label className="block text-sm font-medium text-[rgba(204,232,225,0.6)] mb-1">
                Заметки (опционально)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Дополнительные детали..."
                className="w-full px-3 py-2 border border-[rgba(0,210,170,0.12)] rounded-lg text-sm bg-[#0a1525] text-[rgba(204,232,225,0.8)] placeholder:text-[rgba(204,232,225,0.25)] resize-none"
                rows={2}
              />
            </div>

            {/* Ошибка */}
            {error && (
              <p className="text-sm text-[#ff6b6b]">{error}</p>
            )}

            {/* Кнопки */}
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1 border-[rgba(0,210,170,0.12)] bg-[#0a1525] text-[rgba(204,232,225,0.6)] hover:border-[rgba(0,210,170,0.3)]"
              >
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="flex-1 bg-[#00d2aa] text-[#030b14] hover:bg-[#00f0c6]"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Добавить
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
