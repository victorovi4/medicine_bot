# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Обзор проекта

Персональная электронная медицинская карта. Один инстанс = один пациент. Профиль пациента параметризован через env vars (см. `src/lib/patient.ts`), дефолт — Иоффе В.Б. Построена на Next.js 16 (App Router), TypeScript, Prisma, деплоится на Vercel. Интерфейс и медицинский контент — на русском языке.

## Команды

```bash
npm run dev              # Dev-сервер Next.js (порт 3000)
npm run build            # Продакшн-сборка
npm run lint             # ESLint
npm run test             # Unit-тесты Vitest (однократный запуск)
npm run test:watch       # Vitest в режиме отслеживания
npm run test:coverage    # Vitest с покрытием (v8)
npm run test:e2e         # Playwright E2E (поднимает локальный dev-сервер)
npm run test:e2e:ui      # Playwright в UI-режиме
npm run test:e2e:prod    # E2E на продакшне с test-mode заголовком
npm run test:all         # Unit + E2E вместе
npx prisma studio        # GUI для базы данных
npx prisma db push       # Применить изменения схемы к БД
```

Запуск одного unit-теста: `npx vitest run src/tests/duplicates.test.ts`
Запуск одного E2E-теста: `npx playwright test tests/homepage.spec.ts`

## Архитектура

### Стек технологий
- **Фреймворк**: Next.js 16 (App Router), React 19, TypeScript 5
- **БД**: Vercel Postgres через Prisma 6 ORM (13 моделей в `prisma/schema.prisma`)
- **Хранилище файлов**: Vercel Blob
- **AI**: Anthropic SDK (Claude Sonnet 4.6) для анализа документов и чата
- **UI**: shadcn/ui (Radix UI) + Tailwind CSS 4
- **Telegram**: Webhook-бот для загрузки документов

### Ключевые директории
- `src/app/api/` — API-роуты Next.js (REST-эндпоинты)
- `src/app/chat/` — Страница чата с ИИ
- `src/components/` — React-компоненты; `ui/` — примитивы shadcn
- `src/lib/` — Бизнес-логика (AI-анализ, БД, поиск, Telegram, типы)
- `src/tests/` — Unit-тесты Vitest
- `tests/` — E2E-тесты Playwright
- `prisma/schema.prisma` — Схема БД (13 моделей)

### Важные паттерны

**Конвенция API-роутов**: каждый роут использует Prisma-клиент с учётом test-mode:
```typescript
import { getPrismaClient } from '@/lib/db'
import { isTestModeRequest } from '@/lib/test-mode'

const prisma = getPrismaClient({ testMode: isTestModeRequest(request) })
```

**Test-mode на продакшне**: заголовок `x-test-mode: true` направляет операции БД на `TEST_DATABASE_URL`, позволяя E2E-тестам работать на проде без загрязнения реальных данных. См. `src/lib/test-mode.ts`.

**Пайплайн AI-анализа** (`src/lib/claude.ts`): Файл → Anthropic API (Claude Vision для изображений, извлечение текста для PDF) → структурированный JSON → автозаполнение полей документа, извлечение измерений, детекция процедур, извлечение fullText. Также экспортирует `generateWithClaude()` для произвольных промптов.

**ИИ-чат** (`src/app/api/chat/route.ts` + `src/app/chat/page.tsx`):
- ВСЯ медицинская история пациента грузится в контекст Claude (документы, лекарства, процедуры, показатели, симптомы)
- Streaming SSE для realtime-ответов
- Модели: `Conversation`, `Message`

**Telegram-бот** (`src/app/api/telegram/webhook/route.ts`): Принимает фото/PDF, запускает AI-анализ, сохраняет в БД с fullText. Поддерживает пакетный режим (много фото → один PDF через pdf-lib) и обнаружение дубликатов с подтверждением через inline-кнопки.

**Обнаружение дубликатов** (`src/lib/duplicates.ts`): Нечёткое сопоставление по заголовку, близости дат, категории и типу документа. Использует модель `PendingDocument` с TTL 1 час для флоу подтверждения.

**Иерархия типов документов** (`src/lib/types.ts`): Категории ("заключения", "анализы", "исследования") с подтипами, используются в формах и фильтрах.

**Система метрик** (`src/lib/metrics.ts`): Настроенные метрики (ПСА, Гемоглобин, СРБ) с алиасами для нечёткого сопоставления, нормальными диапазонами, автоизвлечением из документов. `parseValueWithUnit()` парсит формат с референсными нормами `"130 г/л [130-160]"`. Measurement хранит normalMin/normalMax/isAbnormal. Визуализация через Recharts в `src/components/MetricsChart.tsx`.

### Переменные окружения
Обязательные: `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `NEXT_PUBLIC_APP_URL`. Опциональные: `TEST_DATABASE_URL`, `TELEGRAM_ALLOWED_USERS`.

**Профиль пациента** (все опциональные, дефолт — Иоффе В.Б.):
`PATIENT_FIRST_NAME`, `PATIENT_LAST_NAME`, `PATIENT_PATRONYMIC`, `PATIENT_BIRTH_DATE`, `PATIENT_GENDER`, `PATIENT_OCCUPATION`, `PATIENT_TREATMENT_START`, `PATIENT_DIAGNOSIS`, `PATIENT_DIAGNOSIS_CODE`, `PATIENT_COMORBIDITIES` (через запятую), `PATIENT_TRACKING_METRICS` (через запятую), `PATIENT_ALLERGIES` (через запятую).

### Деплой
Vercel. Скрипт `vercel-build` выполняет `prisma generate && prisma db push --skip-generate && next build`. Таймаут функций — 60с для `/api/analyze` и `/api/telegram/webhook` (настроено в `vercel.json`).
