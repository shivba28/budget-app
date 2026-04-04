/**
 * Single-pass friendly analytics over transactions (Teller: amount > 0 = spend, < 0 = income).
 */
import { CATEGORIES } from '../constants/categories'
import { MONTHLY_BUDGET_DEFAULTS_BY_CATEGORY } from '../constants/monthlyBudgetDefaults'
import { isKnownCategoryId } from '../lib/categories'
import type { Transaction } from '../lib/domain'

export function categoryLabelForId(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id
}

function effCategory(
  tx: Transaction,
  overrides: Readonly<Record<string, string>>,
): string {
  const o = overrides[tx.id]
  if (o !== undefined && isKnownCategoryId(o)) return o
  return tx.categoryId
}

function monthKeyFromParts(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}`
}

function monthKeyFromDateStr(iso: string): string | null {
  if (typeof iso !== 'string' || iso.length < 7) return null
  return iso.slice(0, 7)
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate()
}

/** Normalize merchant key for grouping */
export function normalizeMerchant(description: string): string {
  return description.trim().toLowerCase().slice(0, 120) || '(unknown)'
}

export type BudgetVerdict = 'on_track' | 'close' | 'over'

export type SpendingCategoryRow = {
  readonly categoryId: string
  readonly label: string
  readonly totalSpend: number
}

export type MerchantSpendRow = {
  readonly merchantKey: string
  readonly displayName: string
  readonly totalSpend: number
}

export type CategoryMoMChange = {
  readonly categoryId: string
  readonly label: string
  readonly currentSpend: number
  readonly previousSpend: number
  readonly absoluteChange: number
  readonly percentChange: number | null
}

export type BiggestTransaction = {
  readonly id: string
  readonly date: string
  readonly description: string
  readonly amount: number
  readonly categoryId: string
}

export type CashFlowMonth = {
  readonly key: string
  readonly label: string
  readonly year: number
  readonly month: number
  readonly income: number
  readonly expenses: number
  readonly net: number
  readonly savingsRatePercent: number | null
}

export type ExpenseTrend3m = 'up' | 'down' | 'flat'

export type AnomalyFlag = {
  readonly transaction: Transaction
  readonly categoryId: string
  readonly categoryLabel: string
  readonly zScore: number
  readonly categoryAverage: number
  readonly categoryStdDev: number
}

export type DuplicateCharge = {
  readonly merchantKey: string
  readonly displayName: string
  readonly amount: number
  readonly transactions: readonly Transaction[]
  readonly daysApart: number
}

export type RecurringPattern = {
  readonly merchantKey: string
  readonly displayName: string
  readonly typicalAmount: number
  readonly monthsActive: number
  readonly lastDate: string
}

export type BudgetHealthRow = {
  readonly categoryId: string
  readonly label: string
  readonly budget: number
  readonly spentSoFar: number
  readonly projectedSpend: number
  readonly verdict: BudgetVerdict
}

export type BudgetHealthSummary = {
  readonly daysElapsedInFocusMonth: number
  readonly daysRemainingInFocusMonth: number
  readonly daysInFocusMonth: number
  readonly projectedTotalSpend: number
  readonly spentSoFarTotal: number
  /** Cap used for overall verdict (custom total or sum of category budgets). */
  readonly totalBudgetCap: number
  readonly verdict: BudgetVerdict
}

export type TransactionInsights = {
  readonly spending: {
    readonly categoryTotalsDesc: SpendingCategoryRow[]
    readonly topMerchants: MerchantSpendRow[]
    readonly categoryMoM: CategoryMoMChange[]
    readonly averageDailySpendFocusMonth: number
    readonly biggestThree: BiggestTransaction[]
    readonly focusMonthTotalSpend: number
  }
  readonly cashFlow: {
    readonly lastSixMonths: CashFlowMonth[]
    readonly expenseTrend3m: ExpenseTrend3m
  }
  readonly anomalies: AnomalyFlag[]
  readonly duplicateCharges: DuplicateCharge[]
  readonly recurring: {
    readonly patterns: RecurringPattern[]
    readonly estimatedMonthlyRecurringTotal: number
  }
  readonly budgetHealth: {
    readonly rows: BudgetHealthRow[]
    readonly summary: BudgetHealthSummary
  }
}

export type AnalyzeTransactionsOptions = {
  readonly transactions: readonly Transaction[]
  readonly categoryOverrides: Readonly<Record<string, string>>
  /** Calendar month for focus (spending section, budget health) */
  readonly focusYear: number
  readonly focusMonth: number
  /** Defaults to "today" in local time */
  readonly referenceDate?: Date
  /**
   * Custom monthly cap per category id (USD). Omitted keys use
   * {@link MONTHLY_BUDGET_DEFAULTS_BY_CATEGORY}.
   */
  readonly monthlyCategoryBudgetOverrides?: Readonly<
    Partial<Record<string, number>>
  >
  /**
   * Explicit overall monthly budget cap. When `null` or omitted, uses the sum of
   * effective category budgets.
   */
  readonly monthlyTotalBudgetCap?: number | null
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function stdDev(nums: number[]): number {
  if (nums.length < 2) return 0
  const m = mean(nums)
  const v = mean(nums.map((x) => (x - m) ** 2))
  return Math.sqrt(v)
}

function shiftMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const d = new Date(y, m - 1 + delta, 1)
  return { y: d.getFullYear(), m: d.getMonth() + 1 }
}

export function analyzeTransactions(
  opts: AnalyzeTransactionsOptions,
): TransactionInsights {
  const { transactions, categoryOverrides, focusYear, focusMonth } = opts
  const ref = opts.referenceDate ?? new Date()
  const refY = ref.getFullYear()
  const refM = ref.getMonth() + 1
  const refDay = ref.getDate()

  const focusKey = monthKeyFromParts(focusYear, focusMonth)
  const prev = shiftMonth(focusYear, focusMonth, -1)
  const prevKey = monthKeyFromParts(prev.y, prev.m)

  const isFocusCurrentMonth = focusYear === refY && focusMonth === refM
  const dim = daysInMonth(focusYear, focusMonth)
  const daysElapsed = isFocusCurrentMonth ? Math.min(refDay, dim) : dim
  const daysRemaining = Math.max(0, dim - daysElapsed)

  // —— Single pass: bucket by month, collect spends per category per month, merchants, etc.
  type MonthRoll = {
    income: number
    expenses: number
    spendByCat: Map<string, number>
    spendByMerchant: Map<string, number>
    merchantSampleDesc: Map<string, string>
    spendTxs: Transaction[]
    allTxs: Transaction[]
  }

  const byMonth = new Map<string, MonthRoll>()
  const spendAmountsByCategory = new Map<string, number[]>()
  const allSpendTxs: Transaction[] = []

  function roll(key: string): MonthRoll {
    let r = byMonth.get(key)
    if (!r) {
      r = {
        income: 0,
        expenses: 0,
        spendByCat: new Map(),
        spendByMerchant: new Map(),
        merchantSampleDesc: new Map(),
        spendTxs: [],
        allTxs: [],
      }
      byMonth.set(key, r)
    }
    return r
  }

  for (const tx of transactions) {
    const mk = monthKeyFromDateStr(tx.date)
    if (!mk) continue
    const r = roll(mk)
    r.allTxs.push(tx)
    if (tx.amount > 0) {
      r.expenses += tx.amount
      r.spendTxs.push(tx)
      allSpendTxs.push(tx)
      const cat = effCategory(tx, categoryOverrides)
      r.spendByCat.set(cat, (r.spendByCat.get(cat) ?? 0) + tx.amount)
      const mer = normalizeMerchant(tx.description)
      r.spendByMerchant.set(mer, (r.spendByMerchant.get(mer) ?? 0) + tx.amount)
      if (!r.merchantSampleDesc.has(mer)) {
        const raw = tx.description.trim()
        r.merchantSampleDesc.set(mer, raw.length > 0 ? raw : mer)
      }
      const list = spendAmountsByCategory.get(cat)
      if (list) list.push(tx.amount)
      else spendAmountsByCategory.set(cat, [tx.amount])
    } else if (tx.amount < 0) {
      r.income += Math.abs(tx.amount)
    }
  }

  const focusRoll = byMonth.get(focusKey)
  const prevRoll = byMonth.get(prevKey)

  const focusMonthTotalSpend = focusRoll?.expenses ?? 0

  const categoryTotalsDesc: SpendingCategoryRow[] = focusRoll
    ? [...focusRoll.spendByCat.entries()]
        .map(([categoryId, totalSpend]) => ({
          categoryId,
          label: categoryLabelForId(categoryId),
          totalSpend,
        }))
        .sort((a, b) => b.totalSpend - a.totalSpend)
    : []

  const topMerchants: MerchantSpendRow[] = focusRoll
    ? [...focusRoll.spendByMerchant.entries()]
        .map(([merchantKey, totalSpend]) => ({
          merchantKey,
          displayName:
            merchantKey === '(unknown)'
              ? 'Unknown'
              : (focusRoll.merchantSampleDesc.get(merchantKey) ?? merchantKey),
          totalSpend,
        }))
        .sort((a, b) => b.totalSpend - a.totalSpend)
        .slice(0, 5)
    : []

  const categoryMoM: CategoryMoMChange[] = []
  const catIds = new Set<string>()
  if (focusRoll) for (const k of focusRoll.spendByCat.keys()) catIds.add(k)
  if (prevRoll) for (const k of prevRoll.spendByCat.keys()) catIds.add(k)
  for (const categoryId of catIds) {
    const cur = focusRoll?.spendByCat.get(categoryId) ?? 0
    const pr = prevRoll?.spendByCat.get(categoryId) ?? 0
    const absoluteChange = cur - pr
    let percentChange: number | null = null
    if (pr > 0) percentChange = (absoluteChange / pr) * 100
    else if (cur > 0 && pr === 0) percentChange = null
    categoryMoM.push({
      categoryId,
      label: categoryLabelForId(categoryId),
      currentSpend: cur,
      previousSpend: pr,
      absoluteChange,
      percentChange,
    })
  }
  categoryMoM.sort((a, b) => Math.abs(b.absoluteChange) - Math.abs(a.absoluteChange))

  const averageDailySpendFocusMonth =
    daysElapsed > 0 ? focusMonthTotalSpend / daysElapsed : 0

  const biggestThree: BiggestTransaction[] = focusRoll
    ? [...focusRoll.spendTxs]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3)
        .map((t) => ({
          id: t.id,
          date: t.date,
          description: t.description,
          amount: t.amount,
          categoryId: effCategory(t, categoryOverrides),
        }))
    : []

  // —— Last 6 calendar months ending at focus month
  const lastSixMonths: CashFlowMonth[] = []
  for (let i = 5; i >= 0; i--) {
    const { y, m } = shiftMonth(focusYear, focusMonth, -i)
    const key = monthKeyFromParts(y, m)
    const r = byMonth.get(key)
    const income = r?.income ?? 0
    const expenses = r?.expenses ?? 0
    const net = income - expenses
    const savingsRatePercent =
      income > 0 ? (net / income) * 100 : null
    lastSixMonths.push({
      key,
      label: new Intl.DateTimeFormat(undefined, {
        month: 'short',
        year: 'numeric',
      }).format(new Date(y, m - 1, 1)),
      year: y,
      month: m,
      income,
      expenses,
      net,
      savingsRatePercent,
    })
  }

  const exp3 = lastSixMonths.slice(-3).map((x) => x.expenses)
  let expenseTrend3m: ExpenseTrend3m = 'flat'
  if (exp3.length === 3) {
    const [e0, e1, e2] = exp3
    if (e2 > e1 * 1.03 && e1 >= e0 * 0.97) expenseTrend3m = 'up'
    else if (e2 < e1 * 0.97 && e1 <= e0 * 1.03) expenseTrend3m = 'down'
  }

  // —— Anomalies: > 2σ above category mean (need ≥ 4 samples in category)
  const anomalies: AnomalyFlag[] = []
  for (const [categoryId, amounts] of spendAmountsByCategory) {
    if (amounts.length < 4) continue
    const m = mean(amounts)
    const sd = stdDev(amounts)
    if (sd === 0) continue
    const threshold = m + 2 * sd
    for (const tx of transactions) {
      if (tx.amount <= 0) continue
      if (effCategory(tx, categoryOverrides) !== categoryId) continue
      if (tx.amount > threshold) {
        anomalies.push({
          transaction: tx,
          categoryId,
          categoryLabel: categoryLabelForId(categoryId),
          zScore: (tx.amount - m) / sd,
          categoryAverage: m,
          categoryStdDev: sd,
        })
      }
    }
  }
  anomalies.sort((a, b) => b.transaction.amount - a.transaction.amount)
  const anomaliesCap = anomalies.slice(0, 25)

  function parseUtcDay(iso: string): number {
    const s = iso.length >= 10 ? iso.slice(0, 10) : iso
    const t = Date.parse(s)
    return Number.isFinite(t) ? t : NaN
  }

  // —— Duplicates: same merchant + same amount, within 3 days
  const spendSorted = [...allSpendTxs].sort((a, b) => a.date.localeCompare(b.date))
  const duplicateCharges: DuplicateCharge[] = []
  const dupSeen = new Set<string>()
  for (let i = 0; i < spendSorted.length; i++) {
    const a = spendSorted[i]
    if (!a) continue
    const ma = normalizeMerchant(a.description)
    const da = parseUtcDay(a.date)
    if (!Number.isFinite(da)) continue
    for (let j = i + 1; j < spendSorted.length; j++) {
      const b = spendSorted[j]
      if (!b) break
      const db = parseUtcDay(b.date)
      if (!Number.isFinite(db)) continue
      if ((db - da) / 86_400_000 > 3) break
      if (normalizeMerchant(b.description) !== ma) continue
      if (Math.abs(a.amount - b.amount) > 0.005) continue
      const apart = Math.abs(db - da) / 86_400_000
      const key = [a.id, b.id].sort().join('|')
      if (dupSeen.has(key)) continue
      dupSeen.add(key)
      duplicateCharges.push({
        merchantKey: ma,
        displayName: a.description.trim() || b.description.trim(),
        amount: a.amount,
        transactions: [a, b],
        daysApart: apart,
      })
    }
  }

  /** Greedy clusters: all amounts within `maxSpread` dollars of each other. */
  function clusterByAmountBand(
    txs: Transaction[],
    maxSpread: number,
  ): Transaction[][] {
    const sorted = [...txs].sort((x, y) => x.amount - y.amount)
    const clusters: Transaction[][] = []
    for (const tx of sorted) {
      let placed = false
      for (const cl of clusters) {
        const amts = cl.map((t) => t.amount)
        const lo = Math.min(...amts, tx.amount)
        const hi = Math.max(...amts, tx.amount)
        if (hi - lo <= maxSpread) {
          cl.push(tx)
          placed = true
          break
        }
      }
      if (!placed) clusters.push([tx])
    }
    return clusters
  }

  function hasConsecutiveMonthPair(monthKeys: readonly string[]): boolean {
    const u = [...new Set(monthKeys)].sort()
    for (let k = 0; k < u.length - 1; k++) {
      const a = u[k]
      const b = u[k + 1]
      if (a === undefined || b === undefined) continue
      const [ya, ma] = a.split('-').map(Number)
      const next = new Date(ya, ma, 1)
      const expect = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
      if (b === expect) return true
    }
    return false
  }

  // —— Recurring: same merchant, amount within $1, ≥2 consecutive calendar months
  const byMerchant = new Map<string, Transaction[]>()
  for (const tx of allSpendTxs) {
    const mer = normalizeMerchant(tx.description)
    const arr = byMerchant.get(mer) ?? []
    arr.push(tx)
    byMerchant.set(mer, arr)
  }
  const patterns: RecurringPattern[] = []
  let estimatedMonthlyRecurringTotal = 0
  for (const [merKey, mtxs] of byMerchant) {
    for (const cluster of clusterByAmountBand(mtxs, 1)) {
      const monthKeys = cluster
        .map((t) => monthKeyFromDateStr(t.date))
        .filter((k): k is string => k !== null)
      const distinctMonths = [...new Set(monthKeys)]
      if (distinctMonths.length < 2) continue
      if (!hasConsecutiveMonthPair(distinctMonths)) continue
      const first = cluster[0]
      if (!first) continue
      const typicalAmount = mean(cluster.map((t) => t.amount))
      const lastDate = cluster.reduce((best, t) => (t.date > best ? t.date : best), first.date)
      patterns.push({
        merchantKey: merKey,
        displayName: merKey === '(unknown)' ? 'Unknown' : merKey,
        typicalAmount,
        monthsActive: distinctMonths.length,
        lastDate,
      })
      estimatedMonthlyRecurringTotal += typicalAmount
    }
  }
  patterns.sort((a, b) => b.typicalAmount - a.typicalAmount)

  function categoryBudgetAmount(categoryId: string): number {
    const o = opts.monthlyCategoryBudgetOverrides
    if (
      o &&
      Object.prototype.hasOwnProperty.call(o, categoryId) &&
      typeof o[categoryId] === 'number' &&
      Number.isFinite(o[categoryId]) &&
      o[categoryId]! >= 0
    ) {
      return o[categoryId]!
    }
    return (
      MONTHLY_BUDGET_DEFAULTS_BY_CATEGORY[categoryId] ??
      MONTHLY_BUDGET_DEFAULTS_BY_CATEGORY.other
    )
  }

  // —— Budget health (focus month, partial if current month)
  const budgetRows: BudgetHealthRow[] = []
  for (const cat of CATEGORIES) {
    const budget = categoryBudgetAmount(cat.id)
    const spentSoFar = focusRoll?.spendByCat.get(cat.id) ?? 0
    const projectedSpend =
      daysElapsed > 0 ? (spentSoFar / daysElapsed) * dim : spentSoFar
    let verdict: BudgetVerdict = 'on_track'
    if (projectedSpend > budget) verdict = 'over'
    else if (projectedSpend > budget * 0.92) verdict = 'close'
    else verdict = 'on_track'
    budgetRows.push({
      categoryId: cat.id,
      label: cat.label,
      budget,
      spentSoFar,
      projectedSpend,
      verdict,
    })
  }
  budgetRows.sort((a, b) => b.projectedSpend - a.projectedSpend)

  const spentSoFarTotal = focusMonthTotalSpend
  const projectedTotalSpend =
    daysElapsed > 0 ? (spentSoFarTotal / daysElapsed) * dim : spentSoFarTotal
  const sumCategoryBudgets = CATEGORIES.reduce(
    (s, c) => s + categoryBudgetAmount(c.id),
    0,
  )
  const capOpt = opts.monthlyTotalBudgetCap
  const totalBudgetCap =
    capOpt !== null &&
    capOpt !== undefined &&
    Number.isFinite(capOpt) &&
    capOpt >= 0
      ? capOpt
      : sumCategoryBudgets
  let summaryVerdict: BudgetVerdict = 'on_track'
  if (projectedTotalSpend > totalBudgetCap) summaryVerdict = 'over'
  else if (projectedTotalSpend > totalBudgetCap * 0.92) summaryVerdict = 'close'

  return {
    spending: {
      categoryTotalsDesc,
      topMerchants,
      categoryMoM,
      averageDailySpendFocusMonth: averageDailySpendFocusMonth,
      biggestThree,
      focusMonthTotalSpend,
    },
    cashFlow: {
      lastSixMonths,
      expenseTrend3m,
    },
    anomalies: anomaliesCap,
    duplicateCharges,
    recurring: {
      patterns,
      estimatedMonthlyRecurringTotal,
    },
    budgetHealth: {
      rows: budgetRows,
      summary: {
        daysElapsedInFocusMonth: daysElapsed,
        daysRemainingInFocusMonth: daysRemaining,
        daysInFocusMonth: dim,
        projectedTotalSpend,
        spentSoFarTotal,
        totalBudgetCap,
        verdict: summaryVerdict,
      },
    },
  }
}
