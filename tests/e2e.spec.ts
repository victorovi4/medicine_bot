import { test as base, expect } from '@playwright/test'

type DocumentPayload = {
  date: string
  category: string
  subtype: string
  title: string
  doctor?: string | null
  specialty?: string | null
  clinic?: string | null
  summary?: string | null
  conclusion?: string | null
  recommendations?: string[]
  content?: string | null
  fileUrl?: string | null
  fileName?: string | null
  fileType?: string | null
  tags?: string[]
  keyValues?: Record<string, string> | null
}

type DocumentResponse = DocumentPayload & {
  id: string
  createdAt: string
  updatedAt: string
}

// Генерируем уникальный ID для каждого теста
function uniqueId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}

const useTestMode = process.env.E2E_TEST_MODE === 'true'

type TestFixtures = {
  createdDocuments: string[]
  createDocument: (overrides?: Partial<DocumentPayload>) => Promise<DocumentResponse>
}

const test = base.extend<TestFixtures>({
  createdDocuments: async ({}, use) => {
    const ids: string[] = []
    await use(ids)
  },
  createDocument: async ({ request, createdDocuments }, use) => {
    await use(async (overrides: Partial<DocumentPayload> = {}) => {
      const uid = uniqueId()
      const payload: DocumentPayload = {
        date: '2024-01-15',
        category: 'анализы',
        subtype: 'кровь',
        title: `E2E-${uid}`,
        doctor: 'Иванов И.И.',
        specialty: 'терапевт',
        clinic: 'Тестовая клиника',
        summary: 'Краткое резюме для e2e теста.',
        conclusion: 'Заключение врача для e2e теста.',
        recommendations: ['Рекомендация 1', 'Рекомендация 2'],
        content: 'Полный текст документа для e2e теста.',
        tags: ['e2e', 'test'],
        keyValues: { Гемоглобин: '130 г/л' },
        ...overrides,
      }

      const response = await request.post('/api/documents', {
        data: payload,
      })

      expect(response.status()).toBe(201)

      const json = (await response.json()) as DocumentResponse
      expect(json.id).toBeTruthy()
      createdDocuments.push(json.id)

      return json
    })
  },
})

test.beforeEach(async ({ context }) => {
  // Устанавливаем cookie для test-mode при навигации
  if (useTestMode) {
    const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000'
    const url = new URL(baseURL)
    await context.addCookies([
      {
        name: 'test_mode',
        value: '1',
        domain: url.hostname,
        path: '/',
      },
    ])
  }
})

test.afterEach(async ({ request, createdDocuments }) => {
  for (const id of createdDocuments) {
    const response = await request.delete(`/api/documents/${id}`)
    const status = response.status()
    if (![200, 404].includes(status)) {
      console.error(`Cleanup failed for ${id}, status: ${status}`)
    }
  }
})

test.describe('Документы — детерминированные e2e', () => {
  test('GET /api/documents возвращает массив и содержит созданный документ', async ({
    request,
    createDocument,
  }) => {
    const created = await createDocument()

    const response = await request.get('/api/documents')
    expect(response.status()).toBe(200)

    const documents = (await response.json()) as DocumentResponse[]
    expect(Array.isArray(documents)).toBe(true)
    expect(documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.id, title: created.title }),
      ])
    )
  })

  test('клик на документ в списке открывает страницу документа', async ({
    page,
    createDocument,
  }) => {
    const created = await createDocument()

    await page.goto('/')
    // Используем точное совпадение по ID документа через href
    const docLink = page.locator(`a[href="/documents/${created.id}"]`)
    await expect(docLink).toBeVisible({ timeout: 10000 })

    await docLink.click()
    await expect(page).toHaveURL(new RegExp(`/documents/${created.id}$`))
    await expect(page.getByText(created.title, { exact: true })).toBeVisible({ timeout: 10000 })
  })

  test('фильтр по категориям скрывает документы других категорий', async ({
    page,
    createDocument,
  }) => {
    const docAnalyses = await createDocument({
      category: 'анализы',
      subtype: 'биохимия',
      title: `E2E-analyses-${uniqueId()}`,
    })
    const docStudies = await createDocument({
      category: 'исследования',
      subtype: 'узи',
      title: `E2E-studies-${uniqueId()}`,
    })

    await page.goto('/')

    await expect(page.locator(`a[href="/documents/${docAnalyses.id}"]`)).toBeVisible()
    await expect(page.locator(`a[href="/documents/${docStudies.id}"]`)).toBeVisible()

    await page.getByRole('button', { name: /Анализы/i }).click()
    await expect(page.locator(`a[href="/documents/${docAnalyses.id}"]`)).toBeVisible()
    await expect(page.locator(`a[href="/documents/${docStudies.id}"]`)).toHaveCount(0)

    await page.getByRole('button', { name: /Исследования/i }).click()
    await expect(page.locator(`a[href="/documents/${docStudies.id}"]`)).toBeVisible()
    await expect(page.locator(`a[href="/documents/${docAnalyses.id}"]`)).toHaveCount(0)
  })

  test('кнопка редактирования ведёт на страницу edit и сохраняет изменения', async ({
    page,
    createDocument,
  }) => {
    const created = await createDocument()
    const updatedTitle = `${created.title}-updated`

    await page.goto(`/documents/${created.id}`)
    await expect(page.getByText(created.title, { exact: true })).toBeVisible({ timeout: 10000 })
    
    await page.getByRole('link', { name: /редактировать/i }).click()

    await expect(page).toHaveURL(`/documents/${created.id}/edit`)

    const titleInput = page.getByLabel(/название/i)
    await titleInput.clear()
    await titleInput.fill(updatedTitle)

    const saveButton = page.getByRole('button', { name: /сохранить изменения/i })
    await expect(saveButton).toBeEnabled()
    await saveButton.click()

    // Ждём редиректа
    await expect(page).toHaveURL(new RegExp(`/documents/${created.id}$`), { timeout: 15000 })
    
    // Проверяем обновлённый заголовок
    await expect(page.getByText(updatedTitle, { exact: true })).toBeVisible({ timeout: 10000 })
  })

  test('детальная страница показывает заключение и рекомендации', async ({
    page,
    createDocument,
  }) => {
    const created = await createDocument({
      title: `E2E-detail-${uniqueId()}`,
      conclusion: 'Дословное заключение для проверки.',
      recommendations: ['Сдать анализ крови', 'Повторить УЗИ'],
    })

    await page.goto(`/documents/${created.id}`)
    await expect(page.getByText(created.title, { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Заключение врача', { exact: true })).toBeVisible()
    await expect(page.getByText('Дословное заключение для проверки.')).toBeVisible()
    await expect(page.getByText('Рекомендации', { exact: true })).toBeVisible()
    await expect(page.getByText('Сдать анализ крови')).toBeVisible()
    await expect(page.getByText('Повторить УЗИ')).toBeVisible()
  })

  test('удаление документа удаляет его из базы и скрывает из списка', async ({
    page,
    request,
    createDocument,
    createdDocuments,
  }) => {
    const created = await createDocument()

    await page.goto(`/documents/${created.id}`)
    await expect(page.getByText(created.title, { exact: true })).toBeVisible({ timeout: 10000 })
    
    await page.getByRole('button', { name: /^удалить$/i }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /^удалить$/i }).click()

    await expect(page).toHaveURL('/')

    const getResponse = await request.get(`/api/documents/${created.id}`)
    expect(getResponse.status()).toBe(404)

    await page.goto('/')
    await expect(page.locator(`a[href="/documents/${created.id}"]`)).toHaveCount(0)

    const index = createdDocuments.indexOf(created.id)
    if (index >= 0) {
      createdDocuments.splice(index, 1)
    }
  })

  test('GET /api/documents/[id] возвращает 404 для невалидного id', async ({
    request,
  }) => {
    const response = await request.get('/api/documents/00000-invalid-id')
    expect(response.status()).toBe(404)
  })
})
