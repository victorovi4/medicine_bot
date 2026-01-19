# Задачи — Медицинская карта

## Выполненные задачи

### 2026-01-19 — Этап 1: MVP

- [x] Шаг 1: Инициализация проекта (Next.js, Prisma, shadcn)
- [x] Шаг 2: Схема базы данных (prisma/schema.prisma)
- [x] Шаг 3: Конфигурация Prisma (lib/db.ts)
- [x] Шаг 4: Типы данных (lib/types.ts)
- [x] Шаг 5: API роуты (documents, upload)
- [x] Шаг 6: Компоненты (PatientHeader, DocumentCard, Timeline, DocumentForm)
- [x] Шаг 7: Страницы (главная, добавление, просмотр)
- [x] Шаг 8: Глобальные стили
- [x] Шаг 9: Layout
- [x] Шаг 10: Переменные окружения

## Текущие задачи

- [x] Настройка Vercel Postgres и Blob
- [x] Деплой на Vercel
- [ ] Тестирование функциональности
- [ ] Настроить переменную ANTHROPIC_API_KEY в Vercel
- [ ] Проверить AI-анализ на реальных документах

## Следующие этапы

### Этап 2: AI-анализ
- [x] Интеграция Claude API
- [ ] OCR для изображений
- [x] Автозаполнение полей

### Этап 3: Telegram-бот
- [ ] Создание бота
- [ ] Webhook интеграция
- [ ] Приём документов

## Обнаружено в процессе работы

- Prisma генерирует предупреждение о `--no-engine` в production — можно игнорировать для MVP
- Vercel сборка требует `prisma generate` — добавлен `postinstall`
- Добавлен fallback для Prisma URL на `PRISMA_DATABASE_URL`/`POSTGRES_URL`
- Добавлен `vercel-build` со `prisma db push` для создания таблиц
- Убрана обязательная `DIRECT_URL`, чтобы сборка проходила без неё
- Нужно подтвердить формат тестов для TS-проекта (pytest vs JS)
- Принудительно выставлен node runtime для `/api/analyze` (pdf-parse)
