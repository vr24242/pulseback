import React, { ReactNode } from "react"

export interface CardProps {
  padding?: "compact" | "default" | "feature"
  hover?: boolean
  children: ReactNode
  className?: string
}

export const Card: React.FC<CardProps> = ({
  padding = "default",
  hover = false,
  children,
  className = "",
}) => {
  const paddingClass = `pb-card-${padding}`
  const hoverClass = hover ? "" : ""
  const classes = `pb-card ${paddingClass} ${hoverClass} ${className}`

  return <div className={classes}>{children}</div>
}
