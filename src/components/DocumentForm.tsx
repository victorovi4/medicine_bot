'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { DOCUMENT_TYPES, SPECIALTIES } from '@/lib/types'
import { AlertCircle, CheckCircle2, Loader2, Sparkles, Upload } from 'lucide-react'

interface AnalysisResult {
  type: string
  title: string
  date: string | null
  doctor: string | null
  specialty: string | null
  clinic: string | null
  summary: string
  keyValues: Record<string, string>
  tags: string[]
  confidence: number
}

export function DocumentForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [analysisSuccess, setAnalysisSuccess] = useState(false)

  const [fileData, setFileData] = useState<{
    url: string
    fileName: string
    fileType: string
  } | null>(null)

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    type: '',
    title: '',
    doctor: '',
    specialty: '',
    clinic: '',
    summary: '',
    content: '',
    tags: '',
    keyValues: {} as Record<string, string>,
  })

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingFile(true)
    setAnalysisError(null)
    setAnalysisSuccess(false)

    try {
      const uploadFormData = new FormData()
      uploadFormData.append('file', file)

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: uploadFormData,
      })

      if (!uploadResponse.ok) throw new Error('Upload failed')

      const uploadData = await uploadResponse.json()
      setFileData(uploadData)
      setUploadingFile(false)

      setAnalyzing(true)

      const analyzeResponse = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileUrl: uploadData.url,
          fileType: uploadData.fileType,
        }),
      })

      const analyzeText = await analyzeResponse.text()
      const analyzeData = analyzeText ? JSON.parse(analyzeText) : null

      if (!analyzeResponse.ok) {
        const errorMessage =
          analyzeData && typeof analyzeData === 'object' && 'error' in analyzeData
            ? String((analyzeData as { error?: string }).error)
            : 'Analysis failed'
        throw new Error(errorMessage)
      }

      if (!analyzeData) {
        throw new Error('Empty analysis response')
      }

      const analysis: AnalysisResult = analyzeData as AnalysisResult

      setFormData({
        date: analysis.date || new Date().toISOString().split('T')[0],
        type: analysis.type || '',
        title: analysis.title || '',
        doctor: analysis.doctor || '',
        specialty: analysis.specialty || '',
        clinic: analysis.clinic || '',
        summary: analysis.summary || '',
        content: '',
        tags: analysis.tags?.join(', ') || '',
        keyValues: analysis.keyValues || {},
      })

      setAnalysisSuccess(true)
    } catch (error) {
      console.error('Error:', error)
      const message =
        error instanceof Error ? error.message : 'Ошибка при обработке файла'
      setAnalysisError(message)
    } finally {
      setUploadingFile(false)
      setAnalyzing(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          tags: formData.tags.split(',').map((t) => t.trim()).filter(Boolean),
          keyValues:
            Object.keys(formData.keyValues).length > 0
              ? formData.keyValues
              : null,
          fileUrl: fileData?.url,
          fileName: fileData?.fileName,
          fileType: fileData?.fileType,
        }),
      })

      if (!response.ok) throw new Error('Failed to create document')

      router.push('/')
      router.refresh()
    } catch (error) {
      console.error('Error creating document:', error)
      alert('Ошибка при сохранении документа')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyValueChange = (key: string, value: string) => {
    setFormData({
      ...formData,
      keyValues: {
        ...formData.keyValues,
        [key]: value,
      },
    })
  }

  const handleRemoveKeyValue = (key: string) => {
    const newKeyValues = { ...formData.keyValues }
    delete newKeyValues[key]
    setFormData({ ...formData, keyValues: newKeyValues })
  }

  const handleAddKeyValue = () => {
    const key = prompt('Название показателя:')
    if (!key) return
    const value = prompt('Значение:')
    if (!value) return
    handleKeyValueChange(key, value)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div className="space-y-2">
        <Label>Файл документа (скан, фото, PDF)</Label>
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center">
          <Input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.heic,.webp"
            onChange={handleFileUpload}
            disabled={uploadingFile || analyzing}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className="cursor-pointer flex flex-col items-center gap-2"
          >
            {uploadingFile ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                <span className="text-sm text-gray-500">Загрузка файла...</span>
              </>
            ) : analyzing ? (
              <>
                <Sparkles className="h-8 w-8 animate-pulse text-blue-500" />
                <span className="text-sm text-blue-600">
                  AI анализирует документ...
                </span>
              </>
            ) : fileData ? (
              <>
                <CheckCircle2 className="h-8 w-8 text-green-500" />
                <span className="text-sm text-green-600">{fileData.fileName}</span>
                <span className="text-xs text-gray-400">
                  Нажмите, чтобы заменить
                </span>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-gray-400" />
                <span className="text-sm text-gray-600">
                  Нажмите или перетащите файл
                </span>
                <span className="text-xs text-gray-400">
                  PDF, JPG, PNG • AI автоматически извлечёт данные
                </span>
              </>
            )}
          </label>
        </div>

        {analysisError && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{analysisError}</span>
          </div>
        )}

        {analysisSuccess && (
          <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 p-3 rounded">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            <span>Документ проанализирован! Проверьте данные ниже.</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="date">Дата документа *</Label>
          <Input
            id="date"
            type="date"
            required
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="type">Тип документа *</Label>
          <Select
            required
            value={formData.type}
            onValueChange={(value) => setFormData({ ...formData, type: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Выберите тип" />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Название *</Label>
        <Input
          id="title"
          required
          placeholder="Например: Биохимия крови, КТ брюшной полости"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="doctor">Врач</Label>
          <Input
            id="doctor"
            placeholder="ФИО врача"
            value={formData.doctor}
            onChange={(e) => setFormData({ ...formData, doctor: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="specialty">Специальность</Label>
          <Select
            value={formData.specialty}
            onValueChange={(value) => setFormData({ ...formData, specialty: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Выберите специальность" />
            </SelectTrigger>
            <SelectContent>
              {SPECIALTIES.map((spec) => (
                <SelectItem key={spec} value={spec}>
                  {spec}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="clinic">Медицинское учреждение</Label>
        <Input
          id="clinic"
          placeholder="Название клиники или больницы"
          value={formData.clinic}
          onChange={(e) => setFormData({ ...formData, clinic: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="summary">
          Краткое резюме
          {analysisSuccess && (
            <Badge variant="secondary" className="ml-2">
              <Sparkles className="h-3 w-3 mr-1" />
              AI
            </Badge>
          )}
        </Label>
        <Textarea
          id="summary"
          rows={3}
          placeholder="Краткое описание результатов (2-3 предложения)"
          value={formData.summary}
          onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
        />
      </div>

      {Object.keys(formData.keyValues).length > 0 && (
        <div className="space-y-2">
          <Label>
            Ключевые показатели
            <Badge variant="secondary" className="ml-2">
              <Sparkles className="h-3 w-3 mr-1" />
              AI
            </Badge>
          </Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(formData.keyValues).map(([key, value]) => (
              <div key={key} className="bg-gray-50 p-3 rounded relative group">
                <button
                  type="button"
                  onClick={() => handleRemoveKeyValue(key)}
                  className="absolute top-1 right-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
                <p className="text-xs text-gray-500">{key}</p>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => handleKeyValueChange(key, e.target.value)}
                  className="font-semibold bg-transparent border-none p-0 w-full focus:outline-none focus:ring-1 focus:ring-blue-300 rounded"
                />
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleAddKeyValue}>
            + Добавить показатель
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="content">Полный текст заключения (опционально)</Label>
        <Textarea
          id="content"
          rows={5}
          placeholder="Полный текст документа, если нужно сохранить"
          value={formData.content}
          onChange={(e) => setFormData({ ...formData, content: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tags">
          Теги (через запятую)
          {analysisSuccess && formData.tags && (
            <Badge variant="secondary" className="ml-2">
              <Sparkles className="h-3 w-3 mr-1" />
              AI
            </Badge>
          )}
        </Label>
        <Input
          id="tags"
          placeholder="онкология, ПСА, простата"
          value={formData.tags}
          onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
        />
        {formData.tags && (
          <div className="flex flex-wrap gap-1 mt-1">
            {formData.tags
              .split(',')
              .map((tag: string) => tag.trim())
              .filter(Boolean)
              .map((tag: string) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
          </div>
        )}
      </div>

      <div className="flex gap-4 pt-4">
        <Button type="submit" disabled={loading || !formData.type || !formData.title}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Сохранение...
            </>
          ) : (
            'Сохранить документ'
          )}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Отмена
        </Button>
      </div>
    </form>
  )
}
