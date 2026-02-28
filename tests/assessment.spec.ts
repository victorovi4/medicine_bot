import { test as base, expect } from '@playwright/test'

const useTestMode = process.env.E2E_TEST_MODE === 'true'

const test = base.extend({})

test.beforeEach(async ({ context }) => {
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

test.describe('ИИ-заключение — страница /assessment', () => {
  test('страница /assessment загружается и показывает заголовок', async ({ page }) => {
    await page.goto('/assessment')
    await expect(page.getByText('ИИ-заключение')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Комплексный анализ медицинской карты')).toBeVisible()
  })

  test('страница /assessment содержит кнопку генерации', async ({ page }) => {
    await page.goto('/assessment')
    // Кнопка может быть "Сгенерировать ИИ-заключение" или "Обновить" (если уже есть кэш)
    const generateButton = page.getByRole('button', { name: /сгенерировать|обновить/i })
    await expect(generateButton).toBeVisible({ timeout: 15000 })
  })

  test('страница /assessment показывает информацию о пациенте', async ({ page }) => {
    await page.goto('/assessment')
    // PatientHeader рендерится через layout
    await expect(page.getByText('Иоффе Виктор Борисович')).toBeVisible({ timeout: 15000 })
  })

  test('PatientHeader содержит ссылку на /assessment', async ({ page }) => {
    await page.goto('/')
    const assessmentLink = page.getByRole('link', { name: /ИИ-заключение/i })
    await expect(assessmentLink).toBeVisible({ timeout: 10000 })

    await assessmentLink.click()
    await expect(page).toHaveURL(/\/assessment$/)
  })

  test('GET /api/assessment возвращает JSON ответ', async ({ request }) => {
    const response = await request.get('/api/assessment')
    expect(response.status()).toBe(200)

    const data = await response.json()
    // Должно быть поле exists (true/false)
    expect(typeof data.exists).toBe('boolean')

    if (data.exists) {
      expect(data.id).toBeTruthy()
      expect(data.content).toBeTruthy()
      expect(data.createdAt).toBeTruthy()
    }
  })

  test('страница показывает дисклеймер при наличии заключения', async ({ page, request }) => {
    // Проверяем, есть ли сохранённое заключение
    const response = await request.get('/api/assessment')
    const data = await response.json()

    await page.goto('/assessment')

    if (data.exists) {
      // Если заключение есть, дисклеймер должен быть виден
      await expect(
        page.getByText(/не является медицинским диагнозом/i)
      ).toBeVisible({ timeout: 15000 })
    } else {
      // Если заключения нет, должен быть пустой стейт
      await expect(
        page.getByText(/заключение ещё не сгенерировано/i)
      ).toBeVisible({ timeout: 15000 })
    }
  })
})
