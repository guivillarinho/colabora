import type { ReactNode } from 'react'

import { cn } from 'cn'

type TypographyProps = {
  children: ReactNode
  className?: string
}

export function PageTitle({ children, className }: TypographyProps) {
  return (
    <h1 className={cn('text-3xl font-semibold tracking-tight', className)}>
      {children}
    </h1>
  )
}

export function SectionTitle({ children, className }: TypographyProps) {
  return (
    <h2 className={cn('text-lg font-semibold tracking-tight', className)}>
      {children}
    </h2>
  )
}

export function MutedText({ children, className }: TypographyProps) {
  return (
    <p className={cn('text-sm text-muted-foreground', className)}>{children}</p>
  )
}
