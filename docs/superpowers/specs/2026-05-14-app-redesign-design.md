# App Redesign — Design Spec
**Date:** 2026-05-14  
**Status:** Approved by user

---

## Decisions

| Dimension | Decision |
|---|---|
| Scope | All pages and components |
| Theme | Dark navy `#030b14` + teal `#00d2aa` (same as landing) |
| Typography | Geist (keep current, already loaded) |
| Navigation | PatientHeader with nav-links (current structure, dark styled) |
| Approach | **Hybrid** — CSS token override in `globals.css` + targeted component rewrites |

---

## Design Tokens

Overwrite the CSS custom properties in `src/app/globals.css` (`:root` block). Replace the current light values:

```css
:root {
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
  --radius: 0.625rem;
}
```

Remove the `.dark { … }` block — it's unused (no theme toggle).

Add app-level utility classes to `globals.css`:

```css
/* Subtle grid overlay (shared with landing) */
.app-grid-bg {
  background-image:
    linear-gradient(rgba(0,210,170,0.022) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,210,170,0.022) 1px, transparent 1px);
  background-size: 56px 56px;
}

/* Section label — mono uppercase */
.section-label {
  font-family: var(--font-geist-mono);
  font-size: 11px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: #00d2aa;
  opacity: 0.75;
}

/* Teal accent badge */
.badge-teal {
  background: rgba(0,210,170,0.1);
  color: #00d2aa;
  border: 1px solid rgba(0,210,170,0.25);
}
```

---

## Root Layout (`src/app/layout.tsx`)

- Remove `bg-gray-50` from `<body>` className.
- Add `app-grid-bg` class.
- Body: `min-h-screen bg-[#030b14] app-grid-bg`.

---

## Component Rewrites

### 1. `PatientHeader.tsx`

**Current:** `bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200`, blue text.  
**New design:**
- Outer wrapper: `bg-[#060f1c] border border-[rgba(0,210,170,0.12)] rounded-xl p-5 mb-6`
- Left accent line: `border-l-2 border-[#00d2aa] pl-4`
- Patient name: `text-[#cce8e1] text-2xl font-bold` (link hover → `text-[#00d2aa]`)
- Birth/age: `text-[rgba(204,232,225,0.55)] text-sm font-[var(--font-geist-mono)]`
- Main diagnosis badge: `bg-[rgba(255,107,107,0.12)] text-[#ff8888] border border-[rgba(255,107,107,0.25)]`
- Comorbidities badges: `bg-[#0a1525] text-[rgba(204,232,225,0.6)] border border-[rgba(0,210,170,0.09)]`
- Nav links row (Карта / Чат / Заключение / Метрики / Выписка):
  - Default: `text-[rgba(204,232,225,0.45)] border border-[rgba(0,210,170,0.1)] rounded-lg px-3 py-1.5 text-sm`
  - Active/hover: `bg-[rgba(0,210,170,0.1)] text-[#00d2aa] border-[rgba(0,210,170,0.3)]`
- "Добавить документ" button: primary teal button

### 2. `DocumentCard.tsx`

**Current:** white Card, pastel category badges.  
**New design:**
- Card: `bg-[#060f1c] border border-[rgba(0,210,170,0.09)] rounded-xl hover:border-[rgba(0,210,170,0.25)] hover:bg-[#0a1525] transition-all`
- Left border accent on hover: `border-l-2 border-[#00d2aa]`
- Title: `text-[rgba(204,232,225,0.9)] font-semibold`
- Date: `font-[var(--font-geist-mono)] text-xs text-[rgba(204,232,225,0.4)]`
- Doctor/clinic: `text-[rgba(204,232,225,0.5)] text-sm`
- Category badge colors:
  - `заключения` → `bg-[rgba(180,0,255,0.1)] text-[#c084fc] border border-[rgba(180,0,255,0.2)]`
  - `анализы` → `bg-[rgba(0,210,170,0.1)] text-[#00d2aa] border border-[rgba(0,210,170,0.2)]`
  - `исследования` → `bg-[rgba(59,130,246,0.1)] text-[#93c5fd] border border-[rgba(59,130,246,0.2)]`
  - `другое` → `bg-[#0a1525] text-[rgba(204,232,225,0.5)] border border-[rgba(0,210,170,0.09)]`
- Summary text: `text-[rgba(204,232,225,0.5)] text-sm`

### 3. `Timeline.tsx`

- Timeline vertical line: `bg-[rgba(0,210,170,0.15)]` (1px wide)
- Year/month separators: `font-[var(--font-geist-mono)] text-[#00d2aa] text-xs opacity-60`
- Timeline dot: `bg-[#00d2aa] border-2 border-[#030b14]`

### 4. `CategoryFilter.tsx`

- Filter pill default: `bg-[#0a1525] text-[rgba(204,232,225,0.5)] border border-[rgba(0,210,170,0.09)]`
- Active: `bg-[rgba(0,210,170,0.12)] text-[#00d2aa] border-[rgba(0,210,170,0.3)]`

### 5. `SearchBar.tsx`

- Input: `bg-[#0a1525] border border-[rgba(0,210,170,0.12)] text-[#cce8e1] placeholder:text-[rgba(204,232,225,0.3)] focus:border-[rgba(0,210,170,0.4)] focus:ring-[rgba(0,210,170,0.15)]`
- Search icon: teal-tinted

### 6. `ChatMessage.tsx`

- User bubble: `bg-[#00d2aa] text-[#030b14] font-medium rounded-xl rounded-br-sm`
- Bot bubble: `bg-[#060f1c] border border-[rgba(0,210,170,0.1)] text-[rgba(204,232,225,0.9)] rounded-xl rounded-bl-sm`
- Bot avatar: teal gradient circle
- Timestamp: `font-[var(--font-geist-mono)] text-[10px] text-[rgba(204,232,225,0.3)]`

### 7. `ChatInput.tsx`

- Container: `bg-[#060f1c] border-t border-[rgba(0,210,170,0.09)]`
- Textarea: `bg-[#0a1525] border border-[rgba(0,210,170,0.12)] text-[#cce8e1] placeholder:text-[rgba(204,232,225,0.3)] focus:border-[rgba(0,210,170,0.35)]`
- Send button: teal primary `bg-[#00d2aa] text-[#030b14]`

### 8. `MetricsChart.tsx`

- Recharts `<CartesianGrid>`: `stroke="rgba(0,210,170,0.06)"`
- Axes tick: `fill="rgba(204,232,225,0.4)"`
- Main line: `stroke="#00d2aa"`
- Reference lines (normal range): `stroke="rgba(0,210,170,0.2)"`
- Tooltip: `bg="#0a1525" border="rgba(0,210,170,0.2)" text="#cce8e1"`
- Abnormal dots: `fill="#ff6b6b"`
- Normal dots: `fill="#00d2aa"`

### 9. `DiaryCard.tsx`, `AddEventModal.tsx`, `KrCheckCard.tsx`

Same card pattern as DocumentCard — dark surface, teal borders, mono metadata.

---

## Page-level Changes

### `src/app/page.tsx` (Timeline / Main)
- Section label "Хронология" → `.section-label` class
- Document count badge → `badge-teal`
- "Добавить документ" FAB or button → teal primary
- Empty state illustration → teal-tinted

### `src/app/chat/page.tsx` + `layout.tsx`
- Page background: `#030b14` (inherits from tokens)
- Chat header (in layout): same PatientHeader style, compact
- Message list container: `bg-transparent`
- Scrollbar: thin, teal-tinted on webkit

### `src/app/assessment/page.tsx` + `layout.tsx`
- Section cards: `bg-[#060f1c] border border-[rgba(0,210,170,0.09)]`
- Section icons: keep, but against dark background
- "Сформировать заключение" button → teal primary
- Streaming markdown: `prose-invert` equivalent — `text-[rgba(204,232,225,0.85)]`
- Disclaimer: `bg-[#0a1525] border border-[rgba(0,210,170,0.09)] text-[rgba(204,232,225,0.5)]`

### `src/app/metrics/page.tsx`
- Metric selector pills: CategoryFilter dark style
- Chart container: `bg-[#060f1c] border border-[rgba(0,210,170,0.09)] rounded-xl`
- No-data state: teal-tinted empty message

### `src/app/add/page.tsx`
- Form card: `bg-[#060f1c] border border-[rgba(0,210,170,0.09)]`
- Form labels: `text-[rgba(204,232,225,0.7)] text-sm`
- Inputs/selects: dark input token (handled by globals.css)
- Dropzone: `border-2 border-dashed border-[rgba(0,210,170,0.15)] bg-[#0a1525] hover:border-[#00d2aa]`
- AI-analysis result block: `bg-[rgba(0,210,170,0.05)] border border-[rgba(0,210,170,0.15)]`

### `src/app/documents/[id]/page.tsx`
- Document header: same dark card
- Metadata rows: mono font for dates/values, dim teal labels
- File preview embed: dark bg wrapper

### `src/app/documents/[id]/edit/page.tsx`
- Same as `/add` form treatment

### `src/app/extract/page.tsx`
- Print-preview card: `bg-[#060f1c] border` (screen), white bg for print (already handled by print styles)
- Buttons: teal primary / secondary

---

## Files Affected (25 total)

| # | File | Change type |
|---|---|---|
| 1 | `src/app/globals.css` | Token override + utility classes |
| 2 | `src/app/layout.tsx` | Remove `bg-gray-50`, add dark body |
| 3 | `src/components/PatientHeader.tsx` | Full rewrite |
| 4 | `src/components/DocumentCard.tsx` | Full rewrite |
| 5 | `src/components/Timeline.tsx` | Color updates |
| 6 | `src/components/CategoryFilter.tsx` | Color updates |
| 7 | `src/components/SearchBar.tsx` | Color updates |
| 8 | `src/components/ChatMessage.tsx` | Full rewrite |
| 9 | `src/components/ChatInput.tsx` | Color updates |
| 10 | `src/components/MetricsChart.tsx` | Recharts color props |
| 11 | `src/components/DiaryCard.tsx` | Card style update |
| 12 | `src/components/AddEventModal.tsx` | Modal dark style |
| 13 | `src/components/KrCheckCard.tsx` | Card style update |
| 14 | `src/app/page.tsx` | Section labels, layout |
| 15 | `src/app/chat/page.tsx` | Chat background, streaming |
| 16 | `src/app/chat/layout.tsx` | Header dark |
| 17 | `src/app/assessment/page.tsx` | Section cards, markdown |
| 18 | `src/app/assessment/layout.tsx` | Header dark |
| 19 | `src/app/metrics/page.tsx` | Chart container |
| 20 | `src/app/add/page.tsx` | Form, dropzone |
| 21 | `src/app/documents/[id]/page.tsx` | Document view dark |
| 22 | `src/app/documents/[id]/edit/page.tsx` | Edit form dark |
| 23 | `src/app/extract/page.tsx` | Print-preview card |
| 24 | `src/app/metrics/layout.tsx` | Header dark |
| 25 | `src/app/extract/layout.tsx` | Header dark |

---

## Implementation Order

1. **globals.css tokens** — unlocks automatic dark for all shadcn primitives
2. **layout.tsx body class** — removes white flash
3. **PatientHeader + DocumentCard** — most visible, sets the visual tone
4. **Timeline + CategoryFilter + SearchBar** — complete the main page
5. **Chat page + components** — second most-used screen
6. **Assessment page** — third most-used
7. **Metrics + remaining pages** — complete the set

---

## Out of Scope

- Dark/light theme toggle (single dark theme only)
- Font changes (keep Geist)
- Functional changes to any component
- Print styles (already white, keep as-is)
