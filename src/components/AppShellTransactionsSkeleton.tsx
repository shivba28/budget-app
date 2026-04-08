import type { ReactElement } from 'react'

export function AppShellTransactionsSkeleton(): ReactElement {
  return (
    <div className="app-shell">
      <div className="page page--fill page--transactions tx-page">
        <div className="tx-sticky">
          <div className="tx-screen-head">
            <div className="min-w-0">
              <div className="h-6 w-36 animate-pulse rounded bg-muted/70" />
            </div>
            <div className="tx-screen-head__trailing">
              <div className="h-9 w-20 animate-pulse rounded-md bg-muted/60" />
            </div>
          </div>

          <div className="tx-toolbar">
            <div className="tx-toolbar__search-row">
              <div className="tx-toolbar__field tx-toolbar__field--search">
                <div className="mb-1 h-3 w-16 animate-pulse rounded bg-muted/60" />
                <div className="h-9 w-full animate-pulse rounded-xl border border-border bg-muted/30" />
              </div>
              <div className="h-9 w-24 animate-pulse rounded-xl border border-border bg-muted/30" />
            </div>
          </div>
        </div>

        <div className="tx-scroll">
          <div className="animate-pulse space-y-3 py-4">
            <div className="mx-2 h-10 rounded-xl border border-border bg-muted/20" />
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                // eslint-disable-next-line react/no-array-index-key
                key={i}
                className="mx-2 rounded-xl border border-border bg-background px-4 py-3 shadow-xs"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3 w-32 rounded bg-muted/60" />
                    <div className="h-4 w-4/5 rounded bg-muted" />
                  </div>
                  <div className="h-4 w-20 rounded bg-muted/70" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

