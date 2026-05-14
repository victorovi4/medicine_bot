# App Dark Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current light gray/blue UI with a dark navy (#030b14) + teal (#00d2aa) theme across all 25 files, matching the landing page aesthetic.

**Architecture:** CSS custom properties in `globals.css` are overridden to dark values so shadcn primitives (Button, Input, Badge, Card) go dark automatically. The five most-visible components (PatientHeader, DocumentCard, ChatMessage, CategoryFilter, SearchBar) are explicitly rewritten. Page layouts remove `bg-gray-50` and Recharts gets dark color props.

**Tech Stack:** Next.js 16 App Router, Tailwind CSS v4, shadcn/ui, Geist font (unchanged), Recharts

---

## Colour reference (used throughout)

| Token | Value | Usage |
|---|---|---|
| `bg-navy` | `#030b14` | Page background |
| `bg-card` | `#060f1c` | Card / panel surface |
| `bg-surface` | `#0a1525` | Inputs, secondary surface |
| `fg` | `#cce8e1` | Primary text |
| `fg-dim` | `rgba(204,232,225,0.55)` | Secondary text |
| `fg-muted` | `rgba(204,232,225,0.3)` | Placeholder / meta |
| `teal` | `#00d2aa` | Accent / primary action |
| `border` | `rgba(0,210,170,0.09)` | Default border |
| `border-hover` | `rgba(0,210,170,0.25)` | Hover border |

---

## Task 1 — CSS Design Tokens + Root Layout

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Replace CSS custom properties in `globals.css`**

Replace the entire `:root { … }` block and delete the `.dark { … }` block. Also add utility classes at the end of the file:

```css
/* src/app/globals.css — replace :root block */
:root {
  --radius: 0.625rem;
  --background: #030b14;
  --foreground: #cce8e1;
  --card: #060f1c;
  --card-foreground: #cce8e1;
  --popover: #0a1525;
  --popover-foreground: #cce8e1;
  --primary: #00d2aa;
  --primary-foreground: #030b14;
  --secondary: #0a1525;
  --secondary-foreground: #cce8e1;
  --muted: #0a1525;
  --muted-foreground: rgba(204, 232, 225, 0.5);
  --accent: rgba(0, 210, 170, 0.1);
  --accent-foreground: #00d2aa;
  --destructive: #ff6b6b;
  --border: rgba(0, 210, 170, 0.09);
  --input: #0a1525;
  --ring: rgba(0, 210, 170, 0.3);
  --chart-1: #00d2aa;
  --chart-2: #60a5fa;
  --chart-3: #f5a623;
  --chart-4: #c084fc;
  --chart-5: #ff6b6b;
  --sidebar: #060f1c;
  --sidebar-foreground: #cce8e1;
  --sidebar-primary: #00d2aa;
  --sidebar-primary-foreground: #030b14;
  --sidebar-accent: rgba(0, 210, 170, 0.1);
  --sidebar-accent-foreground: #00d2aa;
  --sidebar-border: rgba(0, 210, 170, 0.09);
  --sidebar-ring: rgba(0, 210, 170, 0.3);
}

/* Delete the entire .dark { … } block — no theme toggle */
```

Add at the end of `globals.css` (after existing @layer base):

```css
/* App-level utilities */
.app-grid-bg {
  background-image:
    linear-gradient(rgba(0, 210, 170, 0.022) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 210, 170, 0.022) 1px, transparent 1px);
  background-size: 56px 56px;
}

.section-label {
  font-family: var(--font-geist-mono);
  font-size: 11px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: #00d2aa;
  opacity: 0.75;
}
```

- [ ] **Step 2: Update `src/app/layout.tsx` — remove `bg-gray-50`, add dark body**

Change the `<body>` className from:
```tsx
className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-gray-50`}
```
to:
```tsx
className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-[#030b14] app-grid-bg`}
```

- [ ] **Step 3: Verify build passes**

```bash
cd medical-card && npm run build 2>&1 | tail -20
```
Expected: `✓ Compiled successfully` with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat: dark theme CSS tokens and body background"
```

---

## Task 2 — PatientHeader

**Files:**
- Modify: `src/components/PatientHeader.tsx`

- [ ] **Step 1: Rewrite `PatientHeader.tsx`**

Replace the entire file content:

```tsx
import Link from 'next/link'
import {
  PATIENT,
  getFullName,
  getAge,
  getFormattedBirthDate,
  getFormattedTreatmentStartDate,
} from '@/lib/patient'

const NAV_LINKS = [
  { href: '/', label: 'Карта' },
  { href: '/chat', label: 'Чат' },
  { href: '/assessment', label: 'Заключение' },
  { href: '/metrics', label: 'Метрики' },
  { href: '/extract', label: 'Выписка' },
]

export function PatientHeader() {
  const hasComorbidities = PATIENT.comorbidities.length > 0

  return (
    <div className="mb-6 rounded-xl border border-[rgba(0,210,170,0.12)] bg-[#060f1c] p-5 pl-6 border-l-2 border-l-[#00d2aa]">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        {/* Left — patient info */}
        <div className="space-y-1.5">
          <h1 className="text-xl font-bold text-[#cce8e1]">
            <Link href="/" className="hover:text-[#00d2aa] transition-colors">
              {getFullName()}
            </Link>
          </h1>

          <p className="font-[var(--font-geist-mono)] text-xs text-[rgba(204,232,225,0.45)] tracking-wide">
            {getFormattedBirthDate()} · {getAge()} лет · лечение с {getFormattedTreatmentStartDate()}
          </p>

          {PATIENT.mainDiagnosis && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-[rgba(204,232,225,0.4)]">Диагноз:</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(255,107,107,0.3)] bg-[rgba(255,107,107,0.1)] px-2.5 py-0.5 text-xs font-medium text-[#ff8888]">
                {PATIENT.mainDiagnosis}
                {PATIENT.mainDiagnosisCode && (
                  <span className="opacity-60">({PATIENT.mainDiagnosisCode})</span>
                )}
              </span>
            </div>
          )}

          {hasComorbidities && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-xs text-[rgba(204,232,225,0.4)]">Сопутствующие:</span>
              {PATIENT.comorbidities.map((d) => (
                <span
                  key={d}
                  className="rounded-full border border-[rgba(0,210,170,0.12)] bg-[#0a1525] px-2 py-0.5 text-[10px] text-[rgba(204,232,225,0.55)]"
                >
                  {d}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right — nav links */}
        <div className="flex flex-wrap gap-1.5 md:justify-end">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="rounded-lg border border-[rgba(0,210,170,0.12)] bg-[#0a1525] px-3 py-1.5 text-xs font-medium text-[rgba(204,232,225,0.55)] transition-all hover:border-[rgba(0,210,170,0.35)] hover:bg-[rgba(0,210,170,0.08)] hover:text-[#00d2aa]"
            >
              {label}
            </Link>
          ))}
          <Link
            href="/add"
            className="rounded-lg bg-[#00d2aa] px-3 py-1.5 text-xs font-semibold text-[#030b14] transition-all hover:bg-[#00f0c6]"
          >
            + Добавить
          </Link>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -10
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/PatientHeader.tsx
git commit -m "feat: PatientHeader dark redesign with nav links"
```

---

## Task 3 — DocumentCard

**Files:**
- Modify: `src/components/DocumentCard.tsx`

- [ ] **Step 1: Rewrite `DocumentCard.tsx`**

Replace the entire file:

```tsx
import Link from 'next/link'
import { FileText } from 'lucide-react'
import { getCategoryLabel, getSubtypeLabel } from '@/lib/types'

interface DocumentCardProps {
  id: string
  date: Date
  category: string
  subtype: string
  title: string
  doctor?: string | null
  specialty?: string | null
  clinic?: string | null
  summary?: string | null
  tags?: string[]
  fileUrl?: string | null
  fileName?: string | null
}

const CATEGORY_STYLES: Record<string, string> = {
  заключения: 'bg-[rgba(180,0,255,0.1)] text-[#c084fc] border-[rgba(180,0,255,0.25)]',
  анализы:    'bg-[rgba(0,210,170,0.1)] text-[#00d2aa] border-[rgba(0,210,170,0.25)]',
  исследования: 'bg-[rgba(59,130,246,0.1)] text-[#93c5fd] border-[rgba(59,130,246,0.25)]',
  другое:     'bg-[#0a1525] text-[rgba(204,232,225,0.5)] border-[rgba(0,210,170,0.09)]',
}

export function DocumentCard({
  id, date, category, subtype, title,
  doctor, specialty, clinic, summary, fileUrl,
}: DocumentCardProps) {
  const docDate = new Date(date)
  const formatted = docDate.toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  const isToday = docDate.toDateString() === new Date().toDateString()
  const categoryStyle = CATEGORY_STYLES[category] ?? CATEGORY_STYLES['другое']

  return (
    <Link href={`/documents/${id}`}>
      <div className="group rounded-xl border border-[rgba(0,210,170,0.09)] bg-[#060f1c] p-4 transition-all duration-200 hover:border-[rgba(0,210,170,0.28)] hover:bg-[#0a1525] cursor-pointer">
        {/* Top row — badges + date */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex flex-wrap gap-1.5">
            <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${categoryStyle}`}>
              {getCategoryLabel(category)}
            </span>
            <span className="inline-flex rounded-md border border-[rgba(0,210,170,0.09)] bg-[#0a1525] px-2 py-0.5 text-xs text-[rgba(204,232,225,0.45)]">
              {getSubtypeLabel(subtype)}
            </span>
            {fileUrl && <FileText className="h-3.5 w-3.5 text-[rgba(204,232,225,0.3)] mt-0.5" />}
          </div>
          <span className={`font-[var(--font-geist-mono)] text-xs whitespace-nowrap ${isToday ? 'text-[#f5a623]' : 'text-[rgba(204,232,225,0.35)]'}`}>
            {formatted}{isToday && ' ⚠'}
          </span>
        </div>

        {/* Title */}
        <p className="text-sm font-semibold text-[rgba(204,232,225,0.9)] mb-1.5 group-hover:text-[#cce8e1]">
          {title}
        </p>

        {/* Meta */}
        {(doctor || clinic) && (
          <p className="font-[var(--font-geist-mono)] text-[10px] text-[rgba(204,232,225,0.35)]">
            {[doctor, specialty, clinic].filter(Boolean).join(' · ')}
          </p>
        )}

        {/* Summary */}
        {summary && (
          <p className="mt-1.5 text-xs text-[rgba(204,232,225,0.45)] line-clamp-2">
            {summary}
          </p>
        )}
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -10
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/DocumentCard.tsx
git commit -m "feat: DocumentCard dark redesign with category colour system"
```

---

## Task 4 — Main Page (Timeline, CategoryFilter, SearchBar, page.tsx)

**Files:**
- Modify: `src/components/Timeline.tsx`
- Modify: `src/components/CategoryFilter.tsx`
- Modify: `src/components/SearchBar.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update `Timeline.tsx` — dark month headers and empty state**

In the `return` block replace all Tailwind colour classes:

```tsx
// Empty state — replace className:
<div className="text-center py-12 text-[rgba(204,232,225,0.4)]">
  <p className="text-base">Документов пока нет</p>
  <p className="text-sm mt-2 text-[rgba(204,232,225,0.3)]">Добавьте первый документ через кнопку выше</p>
</div>

// Month header — replace className:
<h2 className="section-label mb-4 capitalize">
  {label}
</h2>
```

- [ ] **Step 2: Update `CategoryFilter.tsx` — dark filter pills and wrapper**

In `CategoryFilter`, find the filter button rendering. Replace colour classes on buttons:

Default pill:
```tsx
// before: className="... text-gray-600 bg-white border-gray-200 ..."
// after:
className="rounded-full border border-[rgba(0,210,170,0.09)] bg-[#0a1525] px-3 py-1 text-xs text-[rgba(204,232,225,0.5)] transition-all hover:border-[rgba(0,210,170,0.25)] hover:text-[rgba(204,232,225,0.8)]"
```

Active pill:
```tsx
// before: className="... bg-blue-600 text-white ..."
// after:
className="rounded-full border border-[rgba(0,210,170,0.3)] bg-[rgba(0,210,170,0.1)] px-3 py-1 text-xs text-[#00d2aa]"
```

Also find any outer wrapper with `bg-white` or `bg-gray-50` and replace with `bg-transparent`.

- [ ] **Step 3: Update `SearchBar.tsx` — dark input and results dropdown**

Replace the `<Input>` className:
```tsx
// Search input
className="border-[rgba(0,210,170,0.12)] bg-[#0a1525] text-[#cce8e1] placeholder:text-[rgba(204,232,225,0.3)] focus-visible:border-[rgba(0,210,170,0.4)] focus-visible:ring-[rgba(0,210,170,0.15)]"
```

Replace the results dropdown container className:
```tsx
// Dropdown wrapper (div with absolute positioning)
className="absolute top-full mt-1 w-full rounded-xl border border-[rgba(0,210,170,0.15)] bg-[#060f1c] shadow-2xl z-50 overflow-hidden"
```

Replace result item className:
```tsx
// Each result row
className="px-4 py-3 border-b border-[rgba(0,210,170,0.06)] hover:bg-[#0a1525] transition-colors"
```

Result title: `className="text-sm font-medium text-[rgba(204,232,225,0.9)]"`
Result meta: `className="font-[var(--font-geist-mono)] text-[10px] text-[rgba(204,232,225,0.4)] mt-0.5"`

Replace highlight `<mark>` styling — add to `globals.css`:
```css
.search-highlight mark {
  background: rgba(0, 210, 170, 0.2);
  color: #00d2aa;
  border-radius: 2px;
  padding: 0 2px;
}
```

Add `search-highlight` class to the element wrapping highlighted text in SearchBar.

- [ ] **Step 4: Update `src/app/page.tsx` — remove light container classes**

Find `<main>` or outer `<div>` with `bg-gray-50` / `bg-white` / `container` padding and replace:
```tsx
// outer wrapper
<main className="max-w-4xl mx-auto px-4 py-6">
```

Find the "Добавить документ" Link/Button and ensure it uses teal — if it has `bg-blue-600` or similar replace with:
```tsx
className="inline-flex items-center gap-2 rounded-lg bg-[#00d2aa] px-4 py-2 text-sm font-semibold text-[#030b14] hover:bg-[#00f0c6] transition-colors"
```

- [ ] **Step 5: Verify build**

```bash
npm run build 2>&1 | tail -15
```

- [ ] **Step 6: Commit**

```bash
git add src/components/Timeline.tsx src/components/CategoryFilter.tsx src/components/SearchBar.tsx src/app/page.tsx
git commit -m "feat: main page dark — timeline, filter, search, page wrapper"
```

---

## Task 5 — Chat (ChatMessage, ChatInput, layout, page)

**Files:**
- Modify: `src/components/ChatMessage.tsx`
- Modify: `src/components/ChatInput.tsx` (if exists as separate file; otherwise changes are in chat/page.tsx)
- Modify: `src/app/chat/layout.tsx`
- Modify: `src/app/chat/page.tsx`

- [ ] **Step 1: Rewrite `ChatMessage.tsx`**

Replace entire file:

```tsx
'use client'

import { Bot, User } from 'lucide-react'

interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

export function ChatMessage({ role, content, isStreaming }: ChatMessageProps) {
  const isUser = role === 'user'

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser
          ? 'bg-[rgba(0,210,170,0.15)] text-[#00d2aa]'
          : 'bg-[rgba(180,0,255,0.12)] text-[#c084fc]'
      }`}>
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Bubble */}
      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
        isUser
          ? 'bg-[#00d2aa] text-[#030b14] font-medium rounded-br-sm'
          : 'bg-[#060f1c] border border-[rgba(0,210,170,0.1)] text-[rgba(204,232,225,0.9)] rounded-bl-sm'
      }`}>
        <div className="whitespace-pre-wrap break-words">
          {content}
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-current animate-pulse ml-0.5 align-text-bottom rounded-sm" />
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update `src/app/chat/layout.tsx`**

Replace className values:

```tsx
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen flex flex-col bg-[#030b14]">
      <div className="max-w-4xl mx-auto px-4 pt-4 w-full">
        <PatientHeader />
      </div>
      <div className="flex-1 overflow-hidden max-w-4xl mx-auto px-4 w-full">
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update `src/app/chat/page.tsx` — dark chat chrome**

Find and replace colour classes throughout the file:

Chat container background:
```tsx
// outer chat div
className="flex flex-col h-full bg-transparent"
```

Message list area:
```tsx
// scrollable messages div
className="flex-1 overflow-y-auto py-4 space-y-4 scrollbar-thin scrollbar-track-[#030b14] scrollbar-thumb-[rgba(0,210,170,0.2)]"
```

Input area at the bottom:
```tsx
// bottom input wrapper
className="border-t border-[rgba(0,210,170,0.09)] bg-[#060f1c] px-4 py-3"
```

Textarea / input element:
```tsx
className="w-full resize-none rounded-lg border border-[rgba(0,210,170,0.12)] bg-[#0a1525] px-3 py-2 text-sm text-[#cce8e1] placeholder:text-[rgba(204,232,225,0.3)] focus:border-[rgba(0,210,170,0.35)] focus:outline-none"
```

Send button:
```tsx
className="rounded-lg bg-[#00d2aa] px-4 py-2 text-sm font-semibold text-[#030b14] hover:bg-[#00f0c6] disabled:opacity-40 transition-colors"
```

Example questions chips:
```tsx
className="rounded-full border border-[rgba(0,210,170,0.12)] bg-[#0a1525] px-3 py-1.5 text-xs text-[rgba(204,232,225,0.55)] hover:border-[rgba(0,210,170,0.3)] hover:text-[rgba(204,232,225,0.9)] transition-all cursor-pointer"
```

Conversation history sidebar (if any): `bg-[#060f1c] border-[rgba(0,210,170,0.09)]`

- [ ] **Step 4: Verify build**

```bash
npm run build 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ChatMessage.tsx src/app/chat/layout.tsx src/app/chat/page.tsx
git commit -m "feat: chat dark redesign — bubbles, layout, input"
```

---

## Task 6 — Assessment Page

**Files:**
- Modify: `src/app/assessment/layout.tsx`
- Modify: `src/app/assessment/page.tsx`

- [ ] **Step 1: Update `assessment/layout.tsx`**

```tsx
export default function AssessmentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#030b14]">
      <div className="max-w-4xl mx-auto px-4 pt-4">
        <PatientHeader />
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update `assessment/page.tsx` — section cards and markdown**

Outer page wrapper: remove `bg-gray-50`, use `bg-transparent`.

"Сформировать заключение" button:
```tsx
className="rounded-lg bg-[#00d2aa] px-5 py-2.5 text-sm font-semibold text-[#030b14] hover:bg-[#00f0c6] disabled:opacity-50 transition-colors"
```

Each assessment section card:
```tsx
className="rounded-xl border border-[rgba(0,210,170,0.09)] bg-[#060f1c] p-5 mb-4"
```

Section heading:
```tsx
className="flex items-center gap-2 text-sm font-semibold text-[#00d2aa] mb-3 section-label"
```

Markdown prose text (the streamed content):
```tsx
// Wrap rendered markdown in:
className="text-sm text-[rgba(204,232,225,0.85)] leading-relaxed [&_strong]:text-[#cce8e1] [&_ul]:list-disc [&_ul]:pl-4 [&_li]:mb-1"
```

Disclaimer banner:
```tsx
className="rounded-lg border border-[rgba(0,210,170,0.09)] bg-[#0a1525] p-3 text-xs text-[rgba(204,232,225,0.4)]"
```

Loading spinner colour: replace `text-blue-500` / `text-emerald-500` with `text-[#00d2aa]`.

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add src/app/assessment/layout.tsx src/app/assessment/page.tsx
git commit -m "feat: assessment page dark redesign"
```

---

## Task 7 — Metrics, Remaining Pages, Supporting Components

**Files:**
- Modify: `src/components/MetricsChart.tsx`
- Modify: `src/app/metrics/layout.tsx`
- Modify: `src/app/metrics/page.tsx`
- Modify: `src/app/add/page.tsx`
- Modify: `src/app/documents/[id]/page.tsx`
- Modify: `src/app/documents/[id]/edit/page.tsx`
- Modify: `src/app/extract/layout.tsx`
- Modify: `src/app/extract/page.tsx`
- Modify: `src/components/DiaryCard.tsx`
- Modify: `src/components/AddEventModal.tsx`
- Modify: `src/components/KrCheckCard.tsx`

- [ ] **Step 1: `MetricsChart.tsx` — Recharts dark colours**

Find each Recharts component and update props:

```tsx
// CartesianGrid
<CartesianGrid strokeDasharray="3 3" stroke="rgba(0,210,170,0.06)" />

// XAxis and YAxis ticks
<XAxis tick={{ fill: 'rgba(204,232,225,0.4)', fontSize: 11 }} ... />
<YAxis tick={{ fill: 'rgba(204,232,225,0.4)', fontSize: 11 }} ... />

// Main Line (normal values)
<Line stroke="#00d2aa" dot={{ fill: '#00d2aa', strokeWidth: 0 }} activeDot={{ fill: '#00f0c6' }} />

// Reference lines for normal range
<ReferenceLine stroke="rgba(0,210,170,0.2)" strokeDasharray="4 4" />

// Tooltip — override contentStyle
<Tooltip
  contentStyle={{
    background: '#0a1525',
    border: '1px solid rgba(0,210,170,0.2)',
    borderRadius: '8px',
    color: '#cce8e1',
    fontSize: 12,
  }}
  labelStyle={{ color: 'rgba(204,232,225,0.6)' }}
/>

// Abnormal dots — if you have a custom dot renderer, use fill="#ff6b6b"
```

Chart wrapper card (if any `bg-white` wrapper in MetricsChart):
```tsx
className="rounded-xl border border-[rgba(0,210,170,0.09)] bg-[#060f1c] p-4"
```

- [ ] **Step 2: `metrics/layout.tsx`**

```tsx
export default function MetricsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="container mx-auto px-4 pt-8 max-w-6xl">
        <PatientHeader />
      </div>
      {children}
    </>
  )
}
```

- [ ] **Step 3: `metrics/page.tsx` — chart containers**

Outer wrapper: remove `bg-gray-50`, use `bg-transparent`.

Metric selector area: same dark filter pills as CategoryFilter (Task 4 Step 2 pattern).

No-data state:
```tsx
className="py-16 text-center text-[rgba(204,232,225,0.4)]"
```

- [ ] **Step 4: `add/page.tsx` — form page**

Outer `<main>`:
```tsx
className="container mx-auto px-4 py-8 max-w-4xl"
```

Page heading:
```tsx
className="text-xl font-semibold text-[#cce8e1] mb-6"
```

Back link button: replace `variant="ghost"` text colour — add `className="text-[rgba(204,232,225,0.5)] hover:text-[#cce8e1]"`.

`DocumentForm` is a shadcn form — tokens from Task 1 handle most of it. Check for any hardcoded `bg-white` / `bg-gray-` inside `DocumentForm.tsx` and replace with `bg-[#060f1c]` / `bg-[#0a1525]` respectively.

File dropzone area (in `DocumentForm.tsx`):
```tsx
className="rounded-xl border-2 border-dashed border-[rgba(0,210,170,0.15)] bg-[#0a1525] p-8 text-center hover:border-[rgba(0,210,170,0.35)] transition-colors cursor-pointer"
```

Dropzone text: `text-[rgba(204,232,225,0.4)]`

AI-analysis result block:
```tsx
className="rounded-lg border border-[rgba(0,210,170,0.15)] bg-[rgba(0,210,170,0.05)] p-4"
```

- [ ] **Step 5: `documents/[id]/page.tsx` — document view**

Outer wrapper: `className="container mx-auto px-4 py-6 max-w-4xl"`

Document header card: same dark card as DocumentCard (Task 3 pattern):
```tsx
className="rounded-xl border border-[rgba(0,210,170,0.09)] bg-[#060f1c] p-5 mb-6"
```

Metadata labels: `className="text-xs text-[rgba(204,232,225,0.4)] font-[var(--font-geist-mono)] uppercase tracking-wide"`
Metadata values: `className="text-sm text-[rgba(204,232,225,0.8)]"`

File embed / preview container: `className="rounded-lg border border-[rgba(0,210,170,0.09)] bg-[#0a1525] overflow-hidden"`

- [ ] **Step 6: `documents/[id]/edit/page.tsx`**

Apply same pattern as `add/page.tsx` (Step 4 above) — same form wrapper, same heading, same back link.

- [ ] **Step 7: `extract/layout.tsx` and `extract/page.tsx`**

`extract/layout.tsx` — same pattern as assessment layout:
```tsx
<div className="min-h-screen bg-[#030b14]">
  <div className="max-w-4xl mx-auto px-4 pt-4">
    <PatientHeader />
    {children}
  </div>
</div>
```

`extract/page.tsx` — the print-preview card stays light (it's printed):
- Screen wrapper: `bg-transparent`
- Action buttons area: teal primary button
- Print-preview card keeps its white styles (print CSS already handles it — don't change `#extract-document`)

- [ ] **Step 8: `DiaryCard.tsx`, `AddEventModal.tsx`, `KrCheckCard.tsx` — apply dark card pattern**

For each file, replace any `bg-white` / `bg-gray-50` card container with:
```tsx
className="rounded-xl border border-[rgba(0,210,170,0.09)] bg-[#060f1c] p-4"
```

Replace `text-gray-*` colours:
- `text-gray-900` / `text-gray-800` → `text-[rgba(204,232,225,0.9)]`
- `text-gray-600` / `text-gray-500` → `text-[rgba(204,232,225,0.5)]`
- `text-gray-400` → `text-[rgba(204,232,225,0.3)]`

Replace `bg-gray-100` badge/chip backgrounds → `bg-[#0a1525]`

For `AddEventModal.tsx`: modal overlay `bg-black/50` → `bg-black/70`. Dialog panel: `bg-[#060f1c] border border-[rgba(0,210,170,0.15)]`.

For `KrCheckCard.tsx`: status icon colours — keep green/amber/red semantics but ensure background is dark card.

- [ ] **Step 9: Verify full build**

```bash
npm run build 2>&1 | tail -20
```
Expected: `✓ Compiled successfully`, exit 0.

- [ ] **Step 10: Commit**

```bash
git add \
  src/components/MetricsChart.tsx \
  src/components/DiaryCard.tsx \
  src/components/AddEventModal.tsx \
  src/components/KrCheckCard.tsx \
  src/app/metrics/layout.tsx \
  src/app/metrics/page.tsx \
  src/app/add/page.tsx \
  src/app/documents/\[id\]/page.tsx \
  src/app/documents/\[id\]/edit/page.tsx \
  src/app/extract/layout.tsx \
  src/app/extract/page.tsx
git commit -m "feat: metrics, forms, doc pages, diary components dark redesign"
```

---

## Task 8 — Final Push to Vercel

- [ ] **Step 1: Final build check**

```bash
npm run build 2>&1 | grep -E "error|warning|✓" | tail -20
```

- [ ] **Step 2: Push to GitHub**

```bash
git push --no-thin origin main
```

Expected: Vercel auto-deploys in ~60 seconds.

- [ ] **Step 3: Verify production**

Open `https://medicine-bot-4xqt.vercel.app` and visually confirm:
- Dark navy background on every page
- Teal accents on badges, active elements, borders
- No white or gray-50 backgrounds visible
- Chat bubbles: teal user / dark bot
- MetricsChart lines in teal

---

## Self-Review Checklist

- [x] All 25 files from spec covered across 8 tasks
- [x] No "TBD" or "TODO" in any step
- [x] Complete code shown for full rewrites (PatientHeader, DocumentCard, ChatMessage)
- [x] Colour tokens consistent throughout (all use values from the reference table)
- [x] Print styles explicitly excluded from changes (extract page)
- [x] Build verification at every task
- [x] Commit at every task
