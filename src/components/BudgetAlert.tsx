import type { ReactElement } from 'react'
import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { formatCurrencyAmount } from '@/lib/api'

type Props = {
  readonly percentage: number
  readonly spent: number
  readonly budget: number
  readonly onDismiss: () => void
}

const AUTO_DISMISS_MS = 6000

export function BudgetAlert({
  percentage,
  spent,
  budget,
  onDismiss,
}: Props): ReactElement {
  useEffect(() => {
    const id = window.setTimeout(() => onDismiss(), AUTO_DISMISS_MS)
    return () => window.clearTimeout(id)
  }, [onDismiss, percentage, spent, budget])

  const pctRounded = Math.min(100, Math.round(percentage * 10) / 10)

  return (
    <motion.div
      role="alert"
      aria-live="polite"
      className="pointer-events-auto fixed left-1/2 top-0 z-[500] w-[min(100%,24rem)] max-w-[calc(100%-1.5rem)] -translate-x-1/2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))]"
      initial={{ y: -120, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -80, opacity: 0 }}
      transition={{ type: 'tween', duration: 0.28, ease: [0, 0, 0.2, 1] }}
      style={{ willChange: 'transform, opacity' }}
    >
      <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 shadow-lg shadow-amber-950/15 dark:border-amber-600 dark:bg-amber-950">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-50">
            ⚠️ You&apos;ve used {pctRounded}% of your monthly budget
          </p>
          <p className="mt-1 text-xs text-amber-900 dark:text-amber-100/95">
            You&apos;ve spent {formatCurrencyAmount(spent)} of your{' '}
            {formatCurrencyAmount(budget)} budget
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg p-1 text-amber-800 transition hover:bg-amber-200/80 hover:text-amber-950 dark:text-amber-200 dark:hover:bg-amber-800/80 dark:hover:text-amber-50"
          aria-label="Dismiss budget alert"
          onClick={onDismiss}
        >
          <X className="size-4" strokeWidth={2.5} />
        </button>
      </div>
    </motion.div>
  )
}
