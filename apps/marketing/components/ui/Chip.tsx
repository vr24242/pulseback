import React, { ReactNode } from "react"

export interface ChipProps {
  color?: "lime" | "blue" | "green" | "purple"
  children: ReactNode
  className?: string
}

export const Chip: React.FC<ChipProps> = ({ color = "lime", children, className = "" }) => {
  const colorClass = `pb-chip-${color}`
  return (
    <span className={`pb-chip ${colorClass} ${className}`}>
      {children}
    </span>
  )
}
