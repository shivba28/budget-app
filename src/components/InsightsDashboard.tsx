import type { ReactElement } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  formatCurrencyAmount,
  getCategoryPillColor,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import type {
  BudgetVerdict,
  TransactionInsights,
} from '@/utils/analyzeTransactions'
import '../pages/Summary.css'
import './InsightsDashboard.css'

type Props = {
  readonly insights: TransactionInsights
  readonly monthLabel: string
  readonly transactionCountMonth: number
}

function VerdictBadge({ verdict }: { readonly verdict: BudgetVerdict }): ReactElement {
  const label =
    verdict === 'on_track'
      ? 'On track'
      : verdict === 'close'
        ? 'Close to limit'
        : 'Over budget'
  return (
    <span
      className={cn(
        'insights-verdict inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        verdict === 'on_track' && 'insights-verdict--ok',
        verdict === 'close' && 'insights-verdict--warn',
        verdict === 'over' && 'insights-verdict--bad',
      )}
    >
      <span className="insights-verdict__dot" aria-hidden />
      {label}
    </span>
  )
}

function SectionTitle({
  id,
  children,
}: {
  readonly id: string
  readonly children: string
}): ReactElement {
  return (
    <CardTitle id={id} className="text-base font-semibold tracking-tight">
      {children}
    </CardTitle>
  )
}

export function InsightsDashboard({
  insights,
  monthLabel,
  transactionCountMonth,
}: Props): ReactElement {
  const { spending, cashFlow, anomalies, duplicateCharges, recurring, budgetHealth } =
    insights

  const pieData = spending.categoryTotalsDesc.map((c) => ({
    name: c.label,
    categoryId: c.categoryId,
    value: c.totalSpend,
    fill: getCategoryPillColor(c.categoryId),
  }))

  const momData = spending.categoryMoM.map((c) => ({
    name:
      c.label.length > 12 ? `${c.label.slice(0, 10)}…` : c.label,
    fullName: c.label,
    categoryId: c.categoryId,
    change: c.absoluteChange,
    percentChange: c.percentChange,
    fill: getCategoryPillColor(c.categoryId),
  }))

  const flowData = cashFlow.lastSixMonths.map((m) => ({
    label: m.label,
    income: m.income,
    expenses: m.expenses,
  }))

  const trendLabel =
    cashFlow.expenseTrend3m === 'up'
      ? 'Expenses are trending up over the last three months.'
      : cashFlow.expenseTrend3m === 'down'
        ? 'Expenses are trending down over the last three months.'
        : 'Expense levels are relatively flat over the last three months.'

  const bh = budgetHealth.summary

  return (
    <div className="insights-dashboard">
      {spending.focusMonthTotalSpend <= 0 ? (
        <p className="summary-empty text-left text-sm">
          No spending outflows for <strong>{monthLabel}</strong>. Deposits and refunds (negative
          amounts) are not counted as spend. Spending-focused sections may be empty; cash flow
          and history still reflect linked data.
        </p>
      ) : null}
      <Card className="shadow-xs">
        <CardHeader className="pb-2">
          <SectionTitle id="spending-heading">Spending</SectionTitle>
          <p className="text-muted-foreground text-sm">
            {monthLabel} · {transactionCountMonth} transaction
            {transactionCountMonth === 1 ? '' : 's'} this month
          </p>
        </CardHeader>
        <CardContent className="insights-card-stack">
          {pieData.length > 0 ? (
            <div className="summary-chart-card gap-0 py-0">
              <div className="px-1 pt-1">
                <div className="chart-wrap summary-chart summary-chart--with-center">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={56}
                        outerRadius={88}
                        paddingAngle={2}
                      >
                        {pieData.map((entry) => (
                          <Cell key={entry.categoryId} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [
                          formatCurrencyAmount(
                            typeof value === 'number' ? value : Number(value),
                          ),
                          'Spend',
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="summary-chart__center" aria-hidden="true">
                    <span className="summary-chart__center-label">Total spent</span>
                    <span className="summary-chart__center-amount">
                      {formatCurrencyAmount(spending.focusMonthTotalSpend)}
                    </span>
                  </div>
                </div>
              </div>
              <ul
                className="summary-legend px-4 pb-4 pt-0"
                aria-label="Spending by category"
              >
                {pieData.map((row) => (
                  <li key={row.categoryId} className="summary-legend__row">
                    <span
                      className="summary-legend__swatch"
                      style={{ backgroundColor: row.fill }}
                    />
                    <span className="summary-legend__name">{row.name}</span>
                    <span className="summary-legend__amount">
                      {formatCurrencyAmount(row.value)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No spending this month.</p>
          )}

          <div className="summary-stats__grid insights-stats-block">
            <div className="summary-stats__item">
              <dt>Total spend</dt>
              <dd>{formatCurrencyAmount(spending.focusMonthTotalSpend)}</dd>
            </div>
            <div className="summary-stats__item">
              <dt>Average daily spend</dt>
              <dd>{formatCurrencyAmount(spending.averageDailySpendFocusMonth)}</dd>
            </div>
            <div className="summary-stats__item">
              <dt>Top category</dt>
              <dd>
                {spending.categoryTotalsDesc[0]
                  ? spending.categoryTotalsDesc[0].label
                  : '—'}
                {spending.categoryTotalsDesc[0] ? (
                  <span className="summary-stats__sub">
                    {formatCurrencyAmount(spending.categoryTotalsDesc[0].totalSpend)}
                  </span>
                ) : null}
              </dd>
            </div>
          </div>

          {spending.topMerchants.length > 0 ? (
            <div className="insights-top-merchants">
              <h3 className="insights-inner-heading mb-2">
                Top merchants
              </h3>
              <ul className="space-y-1.5 text-sm">
                {spending.topMerchants.map((m) => (
                  <li
                    key={m.merchantKey}
                    className="flex justify-between gap-2 border-b border-border/60 py-1.5 last:border-0"
                  >
                    <span className="truncate text-foreground">{m.displayName}</span>
                    <span className="font-mono text-xs font-semibold tabular-nums">
                      {formatCurrencyAmount(m.totalSpend)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {spending.biggestThree.length > 0 ? (
            <div className="insights-largest-block">
              <h3 className="insights-inner-heading mb-2">
                Largest purchases
              </h3>
              <ul className="space-y-2 text-sm">
                {spending.biggestThree.map((t) => (
                  <li key={t.id} className="summary-stats__item py-3">
                    <div className="flex items-start gap-2">
                      <span
                        className="insights-cat-swatch mt-1 shrink-0 rounded-full"
                        style={{
                          backgroundColor: getCategoryPillColor(t.categoryId),
                        }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <span className="summary-stats__desc">{t.description}</span>
                        <span className="summary-stats__sub">
                          {formatCurrencyAmount(t.amount)} · {t.date}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {momData.length > 0 ? (
        <Card className="shadow-xs">
          <CardHeader className="pb-2">
            <SectionTitle id="mom-heading">Month-over-month by category</SectionTitle>
            <p className="text-muted-foreground text-sm">
              Change vs previous month (absolute dollars). Bar colors match category colors.
            </p>
          </CardHeader>
          <CardContent className="pt-1">
            <div className="chart-wrap h-[min(320px,50vh)] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={momData}
                  margin={{ left: 4, right: 8, top: 8, bottom: 48 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    interval={0}
                    angle={-32}
                    textAnchor="end"
                    height={56}
                  />
                  <YAxis tickFormatter={(v) => `$${v}`} fontSize={11} />
                  <Tooltip
                    formatter={(value, _name, item) => {
                      const row = item?.payload as
                        | { percentChange?: number | null }
                        | undefined
                      const amt = typeof value === 'number' ? value : Number(value)
                      const pct = row?.percentChange
                      const extra =
                        pct !== null && pct !== undefined && Number.isFinite(pct)
                          ? ` (${pct >= 0 ? '+' : ''}${pct.toFixed(0)}% vs prior)`
                          : ''
                      return [`${formatCurrencyAmount(amt)}${extra}`, 'Change']
                    }}
                    labelFormatter={(_, payload) => {
                      const p = payload?.[0]?.payload as { fullName?: string } | undefined
                      return p?.fullName ?? ''
                    }}
                  />
                  <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="4 4" />
                  <Bar dataKey="change" name="Δ Spend" radius={[4, 4, 0, 0]}>
                    {momData.map((e) => (
                      <Cell key={e.categoryId} fill={e.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="shadow-xs">
        <CardHeader className="pb-2">
          <SectionTitle id="cashflow-heading">Cash flow</SectionTitle>
          <p className="text-muted-foreground text-sm">{trendLabel}</p>
        </CardHeader>
        <CardContent className="insights-card-stack insights-card-stack--tight">
          <div className="chart-wrap h-[260px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={flowData} margin={{ left: 4, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(v) => `$${v}`} fontSize={11} width={52} />
                <Tooltip
                  formatter={(value) =>
                    formatCurrencyAmount(typeof value === 'number' ? value : Number(value))
                  }
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="income"
                  name="Income"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  name="Expenses"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 pr-2 font-medium">Month</th>
                  <th className="py-2 pr-2 font-medium">Income</th>
                  <th className="py-2 pr-2 font-medium">Expenses</th>
                  <th className="py-2 pr-2 font-medium">Net</th>
                  <th className="py-2 font-medium">Savings rate</th>
                </tr>
              </thead>
              <tbody>
                {cashFlow.lastSixMonths.map((m) => (
                  <tr key={m.key} className="border-b border-border/50">
                    <td className="py-2 pr-2">{m.label}</td>
                    <td className="py-2 pr-2 font-mono tabular-nums">
                      {formatCurrencyAmount(m.income)}
                    </td>
                    <td className="py-2 pr-2 font-mono tabular-nums">
                      {formatCurrencyAmount(m.expenses)}
                    </td>
                    <td className="py-2 pr-2 font-mono tabular-nums">
                      {formatCurrencyAmount(m.net)}
                    </td>
                    <td className="py-2 font-mono tabular-nums">
                      {m.savingsRatePercent !== null
                        ? `${m.savingsRatePercent.toFixed(1)}%`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card
        className={cn(
          'shadow-xs',
          (anomalies.length > 0 || duplicateCharges.length > 0) &&
            'insights-card--alert',
        )}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            {(anomalies.length > 0 || duplicateCharges.length > 0) ? (
              <AlertTriangle
                className="text-destructive size-5 shrink-0"
                aria-hidden
              />
            ) : null}
            <SectionTitle id="anomalies-heading">Anomalies & duplicates</SectionTitle>
          </div>
        </CardHeader>
        <CardContent className="insights-card-stack insights-card-stack--tight">
          {anomalies.length === 0 && duplicateCharges.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No unusual spends or duplicate pairs detected with the current rules.
            </p>
          ) : null}

          {anomalies.length > 0 ? (
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <AlertTriangle className="text-destructive size-4" aria-hidden />
                Unusual for category (&gt;2σ above mean)
              </h3>
              <ul className="max-h-[320px] space-y-2 overflow-y-auto overscroll-contain text-sm [-webkit-overflow-scrolling:touch]">
                {anomalies.map((a) => (
                  <li
                    key={a.transaction.id}
                    className="insights-warning-item rounded-lg border p-3 text-sm"
                  >
                    <div className="font-medium">{a.transaction.description}</div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      {formatCurrencyAmount(a.transaction.amount)} · {a.transaction.date} ·{' '}
                      {a.categoryLabel}
                    </div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      Category avg {formatCurrencyAmount(a.categoryAverage)} (z ≈{' '}
                      {a.zScore.toFixed(1)})
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {duplicateCharges.length > 0 ? (
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <AlertTriangle className="text-destructive size-4" aria-hidden />
                Possible duplicate charges
              </h3>
              <ul className="max-h-[320px] space-y-2 overflow-y-auto overscroll-contain text-sm [-webkit-overflow-scrolling:touch]">
                {duplicateCharges.map((d, idx) => (
                  <li
                    key={`${d.merchantKey}-${d.amount}-${idx}`}
                    className="insights-warning-item rounded-lg border p-3 text-sm"
                  >
                    <div className="font-medium">{d.displayName}</div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      {formatCurrencyAmount(d.amount)} · {d.daysApart.toFixed(1)} days apart
                    </div>
                    <div className="text-muted-foreground mt-0.5 text-xs">
                      {d.transactions.map((t) => `${t.date} (${t.id.slice(0, 8)}…)`).join(' · ')}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="shadow-xs">
        <CardHeader className="pb-2">
          <SectionTitle id="recurring-heading">Recurring charges</SectionTitle>
          <p className="text-muted-foreground text-sm">
            Same merchant and similar amount (within $1) in at least two consecutive months.
          </p>
        </CardHeader>
        <CardContent>
          {recurring.patterns.length === 0 ? (
            <p className="text-muted-foreground text-sm">No recurring patterns detected.</p>
          ) : (
            <>
              <div className="summary-stats__item mb-4">
                <dt>Estimated monthly recurring</dt>
                <dd>{formatCurrencyAmount(recurring.estimatedMonthlyRecurringTotal)}</dd>
              </div>
              <ul className="max-h-[320px] space-y-2 overflow-y-auto overscroll-contain text-sm [-webkit-overflow-scrolling:touch]">
                {recurring.patterns.map((p) => (
                  <li
                    key={`${p.merchantKey}-${p.typicalAmount}`}
                    className="flex justify-between gap-2 border-b border-border/60 py-2 last:border-0"
                  >
                    <div>
                      <div className="font-medium capitalize">{p.displayName}</div>
                      <div className="text-muted-foreground text-xs">
                        ~{p.monthsActive} active months · last {p.lastDate}
                      </div>
                    </div>
                    <span className="font-mono text-xs font-semibold tabular-nums">
                      {formatCurrencyAmount(p.typicalAmount)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-xs">
        <CardHeader className="pb-2">
          <SectionTitle id="budget-heading">Budget health</SectionTitle>
          <p className="text-muted-foreground text-sm">
            Caps come from Settings → Budgets (or built-in defaults). The overall verdict uses
            your total cap or the sum of category caps. Projection uses average daily spend so
            far this month.
          </p>
        </CardHeader>
        <CardContent className="insights-card-stack insights-card-stack--tight">
          <div className="summary-stats__grid">
            <div className="summary-stats__item">
              <dt>Projected total spend</dt>
              <dd className="flex flex-wrap items-center gap-2">
                {formatCurrencyAmount(bh.projectedTotalSpend)}
                <VerdictBadge verdict={bh.verdict} />
              </dd>
            </div>
            <div className="summary-stats__item">
              <dt>Spent so far</dt>
              <dd>{formatCurrencyAmount(bh.spentSoFarTotal)}</dd>
            </div>
            <div className="summary-stats__item">
              <dt>Monthly budget cap</dt>
              <dd>{formatCurrencyAmount(bh.totalBudgetCap)}</dd>
            </div>
            <div className="summary-stats__item">
              <dt>Days left in month</dt>
              <dd>{bh.daysRemainingInFocusMonth}</dd>
            </div>
          </div>

          <div className="insights-budget-by-cat">
            <h3 className="insights-inner-heading mb-2">By category</h3>
            <ul className="space-y-2 text-sm">
              {budgetHealth.rows.map((row) => (
                <li
                  key={row.categoryId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <span
                      className="insights-cat-swatch mt-1.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: getCategoryPillColor(row.categoryId),
                      }}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <div className="font-medium">{row.label}</div>
                      <div className="text-muted-foreground text-xs">
                        Projected {formatCurrencyAmount(row.projectedSpend)} vs budget{' '}
                        {formatCurrencyAmount(row.budget)}
                      </div>
                    </div>
                  </div>
                  <VerdictBadge verdict={row.verdict} />
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
