import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getShortName } from "@/lib/patient";
import "./globals.css";

export const dynamic = 'force-dynamic'

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
});

export function generateMetadata(): Metadata {
  return {
    title: `Медицинская карта — ${getShortName()}`,
    description: "Электронная медицинская карта пациента",
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-gray-50`}
      >
        {children}
      </body>
    </html>
  );
}
