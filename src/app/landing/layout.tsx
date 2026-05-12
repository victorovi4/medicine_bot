import type { Metadata } from "next"
import { Cormorant_Garamond, Onest, JetBrains_Mono } from "next/font/google"

const cormorant = Cormorant_Garamond({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
})

const onest = Onest({
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-body",
  display: "swap",
})

const mono = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
  variable: "--font-mono-custom",
  display: "swap",
})

export const metadata: Metadata = {
  title: "МедКарта — Персональная ЭМК с интеллектом ИИ",
  description:
    "Храните, анализируйте и понимайте свою медицинскую историю. ИИ-чат со всей историей болезни в контексте, анализ документов, Telegram-бот.",
}

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      className={`${cormorant.variable} ${onest.variable} ${mono.variable}`}
    >
      {children}
    </div>
  )
}
