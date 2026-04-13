import type { ReactElement } from 'react'
import { PhantomUiBlock } from '@/components/PhantomUiBlock'
import { cn } from '@/lib/utils'

type LoadingSpinnerProps = {
  readonly label?: string
  readonly className?: string
}

export function LoadingSpinner({
  label = '',
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
        <PhantomUiBlock loading reveal={0.25} className="block">
          <div className="space-y-3 py-1">
            <span className="block text-base font-medium text-foreground">
              Preparing your account
            </span>
            <span className="block text-sm leading-snug text-muted-foreground">
              Loading budgets, trips, and transaction data from the server.
            </span>
            <span className="block text-sm text-muted-foreground">
              This usually takes just a moment.
            </span>
          </div>
        </PhantomUiBlock>
        {label ? (
          <span className="mt-4 block text-center text-sm font-medium text-foreground">
            {label}
          </span>
        ) : null}
      </div>
    </div>
  )
}
