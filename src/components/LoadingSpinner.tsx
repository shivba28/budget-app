import type { ReactElement } from 'react'
import { cn } from '@/lib/utils'

type LoadingSpinnerProps = {
  readonly label?: string
  readonly className?: string
}

export function LoadingSpinner({
  label = 'Loading…',
  className,
}: LoadingSpinnerProps): ReactElement {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 py-12 text-muted-foreground',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div
        className="size-9 animate-spin rounded-full border-2 border-muted border-t-foreground"
        aria-hidden
      />
      <span className="text-sm font-medium text-foreground">{label}</span>
    </div>
  )
}
