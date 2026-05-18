import React from "react"
import { Button } from "../ui/Button"

export interface FinalCTAProps {
  title?: string
  subtitle?: string
}

export const FinalCTA: React.FC<FinalCTAProps> = ({
  title = "Ready to automate your operations?",
  subtitle = "Join 100+ D2C brands running on Pulseback.",
}) => {
  return (
    <section className="bg-[var(--ink-panel)] text-[var(--canvas)] py-20">
      <div className="pb-container text-center">
        <h2 className="pb-h2 mb-6">
          <span className="pb-italic text-[var(--lime)]">{title}</span>
        </h2>
        <p className="pb-lead text-[var(--lime-soft)] mx-auto mb-8">{subtitle}</p>
        <div className="flex gap-4 justify-center">
          <Button variant="primary" size="lg" href="/contact" className="bg-[var(--lime)] text-[var(--forest)]">
            Schedule a demo
          </Button>
          <Button variant="ghost" size="lg" href="/docs">
            Read the docs
          </Button>
        </div>
      </div>
    </section>
  )
}
