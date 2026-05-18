import React, { ReactNode } from "react"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "lime" | "secondary" | "ghost"
  size?: "sm" | "md" | "lg"
  pulse?: boolean
  href?: string
  children: ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", pulse = false, href, className = "", ...props }, ref) => {
    const baseClasses = "pb-btn"
    const variantClass = `pb-btn-${variant}`
    const sizeClass = `pb-btn-${size}`
    const pulseClass = pulse ? "pb-btn-pulse" : ""
    const classes = `${baseClasses} ${variantClass} ${sizeClass} ${pulseClass} ${className}`

    if (href) {
      return (
        <a href={href} className={classes}>
          {props.children}
        </a>
      )
    }

    return (
      <button ref={ref} className={classes} {...props}>
        {props.children}
      </button>
    )
  }
)

Button.displayName = "Button"
