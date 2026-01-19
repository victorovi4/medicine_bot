import { test, expect } from '@playwright/test'

test.describe('Главная страница', () => {
  test('должна отображать заголовок с данными пациента', async ({ page }) => {
    await page.goto('/')

    // Проверяем title страницы
    await expect(page).toHaveTitle(/Медицинская карта/)

    // Проверяем наличие данных пациента
    await expect(page.getByText('Иоффе Виктор Борисович')).toBeVisible()
    await expect(page.getByText('15.03.1947')).toBeVisible()
  })

  test('должна отображать кнопку добавления документа', async ({ page }) => {
    await page.goto('/')

    const addButton = page.getByRole('link', { name: /добавить/i })
    await expect(addButton).toBeVisible()
  })

  test('должна переходить на страницу добавления по клику', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('link', { name: /добавить/i }).click()

    await expect(page).toHaveURL('/add')
  })
})

test.describe('Страница добавления документа', () => {
  test('должна отображать форму добавления', async ({ page }) => {
    await page.goto('/add')

    // Проверяем наличие полей формы
    await expect(page.getByLabel(/дата/i)).toBeVisible()
    await expect(page.getByLabel(/название/i)).toBeVisible()
    await expect(page.getByText(/тип документа/i)).toBeVisible()
  })

  test('должна иметь кнопку сохранения изначально неактивной', async ({
    page,
  }) => {
    await page.goto('/add')

    const saveButton = page.getByRole('button', { name: /сохранить/i })
    await expect(saveButton).toBeDisabled()
  })

  test('должна активировать кнопку после заполнения обязательных полей', async ({
    page,
  }) => {
    await page.goto('/add')

    // Заполняем обязательные поля
    await page.getByLabel(/название/i).fill('Тестовый анализ')

    // Выбираем тип документа
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: /анализ/i }).first().click()

    const saveButton = page.getByRole('button', { name: /сохранить/i })
    await expect(saveButton).toBeEnabled()
  })

  test('должна возвращаться назад по кнопке Отмена', async ({ page }) => {
    await page.goto('/add')

    await page.getByRole('button', { name: /отмена/i }).click()

    await expect(page).toHaveURL('/')
  })
})
