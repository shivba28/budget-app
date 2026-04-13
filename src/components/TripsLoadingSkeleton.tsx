import type { ReactElement, RefObject } from 'react'
import { PhantomUiBlock } from '@/components/PhantomUiBlock'
import { Card, CardContent } from '@/components/ui/card'

type Props = {
  readonly scrollRef?: RefObject<HTMLDivElement | null>
}

/** Shown until the first trips fetch from the server finishes. */
export function TripsLoadingSkeleton({ scrollRef }: Props): ReactElement {
  return (
    <main className="page page--fill page--summary summary-root">
      <div className="summary-top">
        <div className="summary-head">
          <span className="page__title block">Trips</span>
        </div>
      </div>

      <div ref={scrollRef} className="summary-scroll space-y-3 py-1">
        <PhantomUiBlock loading count={4} countGap={12} className="block" reveal={0.2}>
          <Card className="shadow-xs">
            <CardContent className="space-y-2 pt-4">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 size-4 shrink-0 rounded bg-muted/50">·</span>
                <div className="min-w-0 flex-1 space-y-1">
                  <span className="block font-medium leading-tight">Summer trip placeholder</span>
                  <span className="block text-xs text-muted-foreground">
                    2026-06-01 → 2026-06-14
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="text-muted-foreground">12 transactions</span>
                <span className="font-medium tabular-nums">$1,234.56</span>
              </div>
            </CardContent>
          </Card>
        </PhantomUiBlock>
      </div>
    </main>
  )
}
