import React, { ReactNode } from "react"
import { Eyebrow } from "../ui/Eyebrow"
import { Button } from "../ui/Button"

export interface PageHeroProps {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  cta?: string
  ctaHref?: string
  centered?: boolean
}

export const PageHero: React.FC<PageHeroProps> = ({
  eyebrow,
  title,
  subtitle,
  cta,
  ctaHref,
  centered = true,
}) => {
  return (
    <section
      className={`pb-section-large ${centered ? "text-center" : ""}`}
      style={{
        marginTop: "var(--topbar-h)",
        paddingTop: "var(--s-10)",
      }}
    >
      <div className="pb-container">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}

        <h1 className="pb-h1 mb-6 max-w-3xl mx-auto">{title}</h1>

        {subtitle && (
          <p className="pb-lead text-[var(--text-2)] mx-auto mb-8 max-w-2xl">{subtitle}</p>
        )}

        {cta && (
          <Button variant="primary" size="lg" href={ctaHref || "#"}>
            {cta}
          </Button>
        )}
      </div>
    </section>
  )
}
