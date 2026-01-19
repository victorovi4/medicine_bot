import { test, expect } from '@playwright/test'

test.describe('API документов', () => {
  test('GET /api/documents должен возвращать массив', async ({ request }) => {
    const response = await request.get('/api/documents')

    expect(response.ok()).toBeTruthy()

    const documents = await response.json()
    expect(Array.isArray(documents)).toBe(true)
  })

  test('GET /api/documents/[id] должен возвращать 404 для несуществующего ID', async ({
    request,
  }) => {
    const response = await request.get('/api/documents/non-existent-id')

    expect(response.status()).toBe(404)
  })
})

test.describe('Навигация по документам', () => {
  test('клик на документ должен открывать страницу просмотра', async ({
    page,
  }) => {
    await page.goto('/')

    // Ждём загрузки документов
    await page.waitForLoadState('networkidle')

    // Проверяем наличие карточек документов (если есть)
    const documentCards = page.locator('[data-testid="document-card"]')
    const count = await documentCards.count()

    if (count > 0) {
      // Кликаем на первый документ
      await documentCards.first().click()

      // Проверяем что URL изменился
      await expect(page).toHaveURL(/\/documents\//)
    }
  })
})

test.describe('Страница просмотра документа', () => {
  test('должна отображать кнопки редактирования и удаления', async ({
    page,
    request,
  }) => {
    // Получаем список документов
    const response = await request.get('/api/documents')
    const documents = await response.json()

    if (documents.length > 0) {
      const firstDoc = documents[0]
      await page.goto(`/documents/${firstDoc.id}`)

      // Проверяем наличие кнопок
      await expect(
        page.getByRole('button', { name: /редактировать/i })
      ).toBeVisible()
      await expect(page.getByRole('button', { name: /удалить/i })).toBeVisible()

      // Проверяем кнопку "Назад"
      await expect(page.getByRole('link', { name: /назад/i })).toBeVisible()
    }
  })

  test('кнопка редактирования должна вести на страницу edit', async ({
    page,
    request,
  }) => {
    const response = await request.get('/api/documents')
    const documents = await response.json()

    if (documents.length > 0) {
      const firstDoc = documents[0]
      await page.goto(`/documents/${firstDoc.id}`)

      await page.getByRole('link', { name: /редактировать/i }).click()

      await expect(page).toHaveURL(`/documents/${firstDoc.id}/edit`)
    }
  })
})

test.describe('Удаление документа', () => {
  test('должен показывать диалог подтверждения при удалении', async ({
    page,
    request,
  }) => {
    const response = await request.get('/api/documents')
    const documents = await response.json()

    if (documents.length > 0) {
      const firstDoc = documents[0]
      await page.goto(`/documents/${firstDoc.id}`)

      // Кликаем на кнопку удаления
      await page.getByRole('button', { name: /удалить/i }).click()

      // Должен появиться диалог подтверждения
      await expect(page.getByText(/вы уверены/i)).toBeVisible()
      await expect(page.getByRole('button', { name: /отмена/i })).toBeVisible()
    }
  })
})
