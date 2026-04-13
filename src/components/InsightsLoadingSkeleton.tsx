import type { ReactElement, RefObject } from 'react'
import { PhantomUiBlock } from '@/components/PhantomUiBlock'
import { Card, CardContent } from '@/components/ui/card'

type Props = {
  readonly scrollRef?: RefObject<HTMLDivElement | null>
}

/** Full-page placeholder while transaction cache has not hydrated yet. */
export function InsightsLoadingSkeleton({
  scrollRef,
}: Props): ReactElement {
  return (
    <main className="page page--fill page--summary summary-root">
      <PhantomUiBlock loading className="flex min-h-0 flex-1 flex-col" reveal={0.25}>
        <div className="summary-top">
          <div className="summary-head summary-head--insights">
            <div className="summary-head__title-row">
              <span className="page__title mb-0 block">Insights</span>
            </div>
            <div className="summary-head__month-row">
              <div className="summary-month-nav flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-lg border border-border text-lg">
                  ‹
                </span>
                <span className="summary-month-nav__label min-w-[10rem] text-center font-medium">
                  September 2026
                </span>
                <span className="flex size-9 items-center justify-center rounded-lg border border-border text-lg">
                  ›
                </span>
              </div>
            </div>
          </div>
        </div>

        <div ref={scrollRef} className="summary-scroll space-y-3">
          <Card className="shadow-xs">
            <CardContent className="space-y-4 pt-6">
              <span className="block text-sm font-medium">Spending overview</span>
              <div className="mx-auto aspect-square w-full max-w-[220px] rounded-full border border-dashed border-border bg-muted/20" />
              <span className="block text-center text-sm text-muted-foreground">
                Category breakdown for the selected month
              </span>
            </CardContent>
          </Card>

          <Card className="shadow-xs">
            <CardContent className="space-y-2 pt-4">
              <span className="block font-medium">Upcoming commitments</span>
              <span className="block text-sm text-muted-foreground">
                Month totals and trip spend placeholder
              </span>
            </CardContent>
          </Card>

          <Card className="shadow-xs">
            <CardContent className="space-y-2 pt-4">
              <span className="block font-medium">Trips</span>
              <span className="block text-sm text-muted-foreground">
                Trip summary row placeholder
              </span>
            </CardContent>
          </Card>
        </div>
      </PhantomUiBlock>
    </main>
  )
}
