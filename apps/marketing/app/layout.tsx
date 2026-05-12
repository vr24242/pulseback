import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "D2C OS — The Operating System for D2C Brands",
  description:
    "Replace Klaviyo, Gorgias, Bitespeed, and 5 other tools. One AI-powered OS for your entire customer lifecycle — from checkout to retention.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0a0a0a", color: "#fff" }}>
        {children}
      </body>
    </html>
  )
}
