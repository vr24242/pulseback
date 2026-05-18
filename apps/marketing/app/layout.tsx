import type { Metadata } from "next"
import "./styles.css"

export const metadata: Metadata = {
  title: "Pulseback — AI Operating System for D2C Brands",
  description:
    "Autonomous operations platform that handles checkout scoring, customer support, returns, retention, analytics, and more. Replace 7 tools with one intelligent OS.",
  icons: {
    icon: "/favicon.ico",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#f2efe0" />
      </head>
      <body>
        <div className="pb-frame"></div>
        {children}
      </body>
    </html>
  )
}
