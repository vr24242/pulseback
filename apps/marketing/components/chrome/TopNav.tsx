"use client"

import React, { useState } from "react"
import Link from "next/link"
import { Button } from "../ui/Button"

export interface TopNavProps {
  active?: string
}

export const TopNav: React.FC<TopNavProps> = ({ active = "/" }) => {
  const [platformOpen, setPlatformOpen] = useState(false)

  return (
    <nav
      className="fixed top-0 left-0 right-0 bg-[var(--paper)] border-b border-[var(--line)] z-50"
      style={{
        height: "var(--topbar-h)",
        scrollMarginTop: "var(--topbar-h)",
      }}
    >
      <div className="pb-container h-full flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="text-lg font-bold text-[var(--forest)] hover:text-[var(--forest-2)]">
          Pulseback
        </Link>

        {/* Nav items */}
        <div className="hidden md:flex gap-8 items-center">
          <Link
            href="/how-it-works"
            className={`text-sm transition ${
              active === "/how-it-works" ? "text-[var(--forest)]" : "text-[var(--text-2)] hover:text-[var(--forest)]"
            }`}
          >
            How it works
          </Link>
          <Link
            href="/pricing"
            className={`text-sm transition ${
              active === "/pricing" ? "text-[var(--forest)]" : "text-[var(--text-2)] hover:text-[var(--forest)]"
            }`}
          >
            Pricing
          </Link>
          <Link
            href="/docs"
            className={`text-sm transition ${
              active === "/docs" ? "text-[var(--forest)]" : "text-[var(--text-2)] hover:text-[var(--forest)]"
            }`}
          >
            Docs
          </Link>
          <Link
            href="/about"
            className={`text-sm transition ${
              active === "/about" ? "text-[var(--forest)]" : "text-[var(--text-2)] hover:text-[var(--forest)]"
            }`}
          >
            About
          </Link>
        </div>

        {/* Right side buttons */}
        <div className="flex gap-3 items-center">
          <Button variant="ghost" size="sm" href="/">
            Sign in
          </Button>
          <Button variant="primary" size="sm" href="/contact">
            Book demo →
          </Button>
        </div>
      </div>
    </nav>
  )
}
