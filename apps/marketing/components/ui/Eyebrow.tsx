import React, { ReactNode } from "react"

export interface EyebrowProps {
  children: ReactNode
  className?: string
}

export const Eyebrow: React.FC<EyebrowProps> = ({ children, className = "" }) => {
  return (
    <div className={`pb-eyebrow ${className}`}>
      {children}
    </div>
  )
}
