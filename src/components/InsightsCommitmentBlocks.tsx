import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { Plane } from 'lucide-react'
import { formatCurrencyAmount } from '@/lib/api'
import type { TripSummaryRow } from '@/lib/insightsCommitments'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import './InsightsDashboard.css'

type MonthBucket = {
  readonly monthKey: string
  readonly label: string
  readonly total: number
}

type Props = {
  readonly upcomingCommitted: readonly MonthBucket[]
  readonly monthTimeline: readonly MonthBucket[]
  readonly tripSummaries: readonly TripSummaryRow[]
}

export function InsightsCommitmentBlocks({
  upcomingCommitted,
  monthTimeline,
  tripSummaries,
}: Props): ReactElement {
  const maxUpcoming = Math.max(0, ...upcomingCommitted.map((u) => u.total))
  const maxBar = Math.max(1, ...monthTimeline.map((x) => x.total))

  return (
    <div className="insights-dashboard mt-6">
      <Card className="shadow-xs">
        <CardHeader className="pb-2">
          <CardTitle id="upcoming-committed-heading" className="text-base font-semibold tracking-tight">
            Upcoming committed spend
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            Totals already assigned to future budget months (deferred or trip-based).
          </p>
        </CardHeader>
        <CardContent>
          <div className="insights-commit-grid flex gap-2 overflow-x-auto pb-1">
            {upcomingCommitted.map((u) => {
              const heavy =
                u.total > 0 &&
                (u.total >= 300 ||
                  (maxUpcoming > 0 && u.total === maxUpcoming))
              return (
                <div
                  key={u.monthKey}
                  className={cn(
                    'min-w-[7.5rem] flex-1 rounded-xl border px-3 py-2.5 text-sm',
                    heavy
                      ? 'border-amber-500/50 bg-amber-500/8'
                      : 'border-border bg-card',
                  )}
                >
                  <div className="text-muted-foreground text-xs leading-tight">{u.label}</div>
                  <div className="mt-1 font-semibold tabular-nums">
                    {formatCurrencyAmount(u.total)}
                  </div>
                  {heavy && u.total > 0 ? (
                    <div className="mt-1 text-[0.65rem] font-medium text-amber-700 dark:text-amber-400">
                      Heavy load
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-xs">
        <CardHeader className="pb-2">
          <CardTitle id="trips-strip-heading" className="text-base font-semibold tracking-tight">
            Trips
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            Active and upcoming trips with spend assigned to them.
          </p>
        </CardHeader>
        <CardContent>
          {tripSummaries.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No trips yet. Create one from the Trips tab or when assigning a transaction.
            </p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {tripSummaries.map(({ trip, totalSpent, txCount }) => {
                const cap = trip.budgetLimit
                const pct =
                  cap !== null && cap > 0
                    ? Math.min(100, (totalSpent / cap) * 100)
                    : null
                return (
                  <Link
                    key={trip.id}
                    to={`/app/trips/${trip.id}`}
                    className="min-w-[11rem] flex-shrink-0 rounded-xl border border-border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-muted/40"
                  >
                    <div className="flex items-start gap-1.5">
                      <Plane className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="line-clamp-2 min-w-0 font-medium leading-snug">
                        {trip.name}
                      </span>
                    </div>
                    <div className="mt-1 text-muted-foreground text-xs">
                      {txCount} tx · {formatCurrencyAmount(totalSpent)}
                    </div>
                    {pct !== null ? (
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-foreground/65"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    ) : null}
                  </Link>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-xs">
        <CardHeader className="pb-2">
          <CardTitle id="timeline-heading" className="text-base font-semibold tracking-tight">
            Month timeline
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            This month and the next three: committed spend already on the books.
          </p>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {monthTimeline.map((m) => {
              const w = (m.total / maxBar) * 100
              return (
                <li key={m.monthKey} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 text-muted-foreground">{m.label}</span>
                  <div className="min-w-0 flex-1">
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-foreground/55"
                        style={{ width: `${w}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-20 shrink-0 text-right tabular-nums">
                    {formatCurrencyAmount(m.total)}
                  </span>
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
