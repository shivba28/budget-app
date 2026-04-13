import type { ReactElement } from 'react'
import { PhantomUiBlock } from '@/components/PhantomUiBlock'

export function AppShellTransactionsSkeleton(): ReactElement {
  return (
    <div className="app-shell">
      <div className="page page--fill page--transactions tx-page">
        <PhantomUiBlock loading className="block" reveal={0.25}>
          <div className="tx-sticky">
            <div className="tx-screen-head">
              <div className="min-w-0">
                <span className="block text-lg font-semibold">Transactions</span>
              </div>
              <div className="tx-screen-head__trailing">
                <span className="inline-flex h-9 min-w-[5rem] items-center justify-center rounded-md border border-border bg-secondary px-3 text-sm font-medium">
                  Sync
                </span>
              </div>
            </div>

            <div className="tx-toolbar">
              <div className="tx-toolbar__search-row">
                <div className="tx-toolbar__field tx-toolbar__field--search">
                  <span className="tx-toolbar__label mb-1 block">Search</span>
                  <span className="flex h-9 w-full items-center rounded-xl border border-border bg-background px-3 text-sm text-muted-foreground">
                    Search transactions
                  </span>
                </div>
                <span className="flex h-9 min-w-[6rem] items-center justify-center rounded-xl border border-border bg-background text-sm">
                  Filters
                </span>
              </div>
            </div>
          </div>
        </PhantomUiBlock>

        <div className="tx-scroll">
          <PhantomUiBlock
            loading
            count={10}
            countGap={10}
            className="block py-4"
            reveal={0.2}
          >
            <div className="mx-2 flex items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3 shadow-xs">
              <div className="min-w-0 flex-1 space-y-2">
                <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  March 2026
                </span>
                <span className="block font-medium leading-snug">
                  Merchant name placeholder
                </span>
                <span className="block text-xs text-muted-foreground">
                  2026-03-15 · Food & dining
                </span>
              </div>
              <span className="shrink-0 tabular-nums font-medium">$123.45</span>
            </div>
          </PhantomUiBlock>
        </div>
      </div>
    </div>
  )
}
