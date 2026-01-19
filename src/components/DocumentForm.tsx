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
import { DOCUMENT_TYPES, SPECIALTIES } from '@/lib/types'
import { Loader2 } from 'lucide-react'

export function DocumentForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
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
    content: '',
    tags: '',
  })
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setUploadingFile(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      
      if (!response.ok) throw new Error('Upload failed')
      
      const data = await response.json()
      setFileData(data)
    } catch (error) {
      console.error('Error uploading file:', error)
      alert('Ошибка при загрузке файла')
    } finally {
      setUploadingFile(false)
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
  
  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
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
        <Label htmlFor="content">Содержимое / заключение</Label>
        <Textarea
          id="content"
          rows={5}
          placeholder="Текст заключения или описание результатов"
          value={formData.content}
          onChange={(e) => setFormData({ ...formData, content: e.target.value })}
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="tags">Теги (через запятую)</Label>
        <Input
          id="tags"
          placeholder="онкология, ПСА, простата"
          value={formData.tags}
          onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
        />
      </div>
      
      <div className="space-y-2">
        <Label>Файл (скан, PDF)</Label>
        <div className="flex items-center gap-4">
          <Input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.heic"
            onChange={handleFileUpload}
            disabled={uploadingFile}
            className="flex-1"
          />
          {uploadingFile && <Loader2 className="h-5 w-5 animate-spin" />}
        </div>
        {fileData && (
          <p className="text-sm text-green-600">
            ✓ Файл загружен: {fileData.fileName}
          </p>
        )}
      </div>
      
      <div className="flex gap-4">
        <Button type="submit" disabled={loading}>
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
