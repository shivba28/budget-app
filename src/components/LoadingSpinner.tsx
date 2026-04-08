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
      <div className="w-full max-w-sm px-4">
        <div className="animate-pulse space-y-3" aria-hidden>
          <div className="h-4 w-2/3 rounded bg-muted" />
          <div className="h-4 w-full rounded bg-muted/70" />
          <div className="h-4 w-5/6 rounded bg-muted/60" />
        </div>
        {label ? (
          <span className="mt-4 block text-center text-sm font-medium text-foreground">
            {label}
          </span>
        ) : null}
      </div>
    </div>
  )
}
