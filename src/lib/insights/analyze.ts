import type { TransactionRow } from '@/src/db/queries/transactions'

import type { InsightsResult } from '@/src/lib/insights/types'
import {
  daysInMonth,
  effectiveDayKey,
  mean,
  monthKeyFromIsoDate,
  monthKeyFromParts,
  normalizeMerchant,
  parseUtcDay,
  shiftMonth,
  stdDev,
} from '@/src/lib/insights/utils'

function resolveSpend(tx: TransactionRow): number {
  if (typeof tx.my_share === 'number' && Number.isFinite(tx.my_share)) {
    return tx.my_share
  }
  return tx.amount
}

/** True when the transaction is an expense (negative = money going out). */
function isExpense(tx: TransactionRow): boolean {
  return resolveSpend(tx) < 0
}

/** Positive expense magnitude (always >= 0). */
function expenseAmount(tx: TransactionRow): number {
  return Math.abs(resolveSpend(tx))
}

function resolveBudgetMonthKey(tx: TransactionRow): string | null {
  // Phase 5 requirement: effective_date drives month grouping when present.
  const eff = monthKeyFromIsoDate(tx.effective_date ?? null)
  if (eff) return eff
  return monthKeyFromIsoDate(tx.date)
}

function safeCategory(tx: TransactionRow): string {
  const c = typeof tx.category === 'string' ? tx.category.trim() : ''
  return c || 'Other'
}

function txEffectiveDay(tx: TransactionRow): string | null {
  return effectiveDayKey(tx.effective_date ?? tx.date)
}

function inSpendRange(day: string | null, start: string, end: string): boolean {
  if (!day) return false
  return day >= start && day <= end
}

export type AnalyzeLocalOptions = {
  readonly transactions: readonly TransactionRow[]
  readonly focusYear: number
  readonly focusMonth: number
  /** Inclusive YYYY-MM-DD bounds for donut, merchants, biggest, anomalies, duplicates. */
  readonly spendRange: { start: string; end: string }
  /** Preformatted label for the spend range (shown in UI). */
  readonly spendRangeLabel: string
  /** Map category -> budget amount (USD) for focus month */
  readonly budgetsByCategory: ReadonlyMap<string, number>
  /** Optional overall monthly cap */
  readonly totalBudgetCap?: number | null
  readonly referenceDate?: Date
}

export function analyzeLocalTransactions(opts: AnalyzeLocalOptions): InsightsResult {
  const ref = opts.referenceDate ?? new Date()
  const refY = ref.getFullYear()
  const refM = ref.getMonth() + 1
  const refDay = ref.getDate()

  const focusKey = monthKeyFromParts(opts.focusYear, opts.focusMonth)
  const prev = shiftMonth(opts.focusYear, opts.focusMonth, -1)
  const prevKey = monthKeyFromParts(prev.y, prev.m)

  const dim = daysInMonth(opts.focusYear, opts.focusMonth)
  const isFocusCurrentMonth = opts.focusYear === refY && opts.focusMonth === refM
  const daysElapsed = isFocusCurrentMonth ? Math.min(refDay, dim) : dim

  type MonthRoll = {
    income: number
    expenses: number
    spendByCat: Map<string, number>
    spendByMerchant: Map<string, number>
    merchantSampleDesc: Map<string, string>
    spendTxs: TransactionRow[]
  }

  const byMonth = new Map<string, MonthRoll>()
  const allSpendTxs: TransactionRow[] = []

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
      }
      byMonth.set(key, r)
    }
    return r
  }

  for (const tx of opts.transactions) {
    // Hide pending unless confirmed (Phase note).
    if (tx.pending === 1 && tx.user_confirmed !== 1) continue

    const mk = resolveBudgetMonthKey(tx)
    if (!mk) continue
    const r = roll(mk)

    const spend = resolveSpend(tx)
    if (isExpense(tx)) {
      const amt = expenseAmount(tx)
      r.expenses += amt
      r.spendTxs.push(tx)
      allSpendTxs.push(tx)

      const cat = safeCategory(tx)
      r.spendByCat.set(cat, (r.spendByCat.get(cat) ?? 0) + amt)

      const mer = normalizeMerchant(tx.description)
      r.spendByMerchant.set(mer, (r.spendByMerchant.get(mer) ?? 0) + amt)
      if (!r.merchantSampleDesc.has(mer)) {
        const raw = tx.description.trim()
        r.merchantSampleDesc.set(mer, raw.length > 0 ? raw : mer)
      }
    } else if (spend > 0) {
      r.income += spend
    }
  }

  const focusRoll = byMonth.get(focusKey)
  const prevRoll = byMonth.get(prevKey)
  const focusMonthTotalSpend = focusRoll?.expenses ?? 0

  const { start: rangeStart, end: rangeEnd } = opts.spendRange

  const rangeSpendTxs: TransactionRow[] = []
  for (const tx of opts.transactions) {
    if (tx.pending === 1 && tx.user_confirmed !== 1) continue
    const day = txEffectiveDay(tx)
    if (!inSpendRange(day, rangeStart, rangeEnd)) continue
    if (isExpense(tx)) rangeSpendTxs.push(tx)
  }

  const rangeSpendByCat = new Map<string, number>()
  const rangeSpendByMerchant = new Map<string, number>()
  const rangeMerchantSampleDesc = new Map<string, string>()
  for (const tx of rangeSpendTxs) {
    const amt = expenseAmount(tx)
    const cat = safeCategory(tx)
    rangeSpendByCat.set(cat, (rangeSpendByCat.get(cat) ?? 0) + amt)
    const mer = normalizeMerchant(tx.description)
    rangeSpendByMerchant.set(mer, (rangeSpendByMerchant.get(mer) ?? 0) + amt)
    if (!rangeMerchantSampleDesc.has(mer)) {
      const raw = tx.description.trim()
      rangeMerchantSampleDesc.set(mer, raw.length > 0 ? raw : mer)
    }
  }

  const periodTotalSpend = rangeSpendTxs.reduce((s, tx) => s + expenseAmount(tx), 0)

  const categoryTotalsDesc = [...rangeSpendByCat.entries()]
    .map(([category, totalSpend]) => ({ category, totalSpend }))
    .sort((a, b) => b.totalSpend - a.totalSpend)

  const categoryMoM = (() => {
    const out: {
      category: string
      currentSpend: number
      previousSpend: number
      absoluteChange: number
      percentChange: number | null
    }[] = []
    const cats = new Set<string>()
    if (focusRoll) for (const k of focusRoll.spendByCat.keys()) cats.add(k)
    if (prevRoll) for (const k of prevRoll.spendByCat.keys()) cats.add(k)
    for (const category of cats) {
      const cur = focusRoll?.spendByCat.get(category) ?? 0
      const pr = prevRoll?.spendByCat.get(category) ?? 0
      const absoluteChange = cur - pr
      let percentChange: number | null = null
      if (pr > 0) percentChange = (absoluteChange / pr) * 100
      out.push({
        category,
        currentSpend: cur,
        previousSpend: pr,
        absoluteChange,
        percentChange,
      })
    }
    out.sort((a, b) => Math.abs(b.absoluteChange) - Math.abs(a.absoluteChange))
    return out.slice(0, 8)
  })()

  const topMerchants = [...rangeSpendByMerchant.entries()]
    .map(([merchantKey, totalSpend]) => ({
      merchantKey,
      displayName:
        merchantKey === '(unknown)'
          ? 'Unknown'
          : (rangeMerchantSampleDesc.get(merchantKey) ?? merchantKey),
      totalSpend,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, 5)

  const biggestThree = [...rangeSpendTxs]
    .sort((a, b) => expenseAmount(b) - expenseAmount(a))
    .slice(0, 3)
    .map((t) => ({
      id: t.id,
      date: t.date,
      description: t.description,
      amount: expenseAmount(t),
      category: safeCategory(t),
    }))

  const cashFlowLastSixMonths = (() => {
    const out = []
    for (let i = 5; i >= 0; i--) {
      const { y, m } = shiftMonth(opts.focusYear, opts.focusMonth, -i)
      const key = monthKeyFromParts(y, m)
      const r = byMonth.get(key)
      const income = r?.income ?? 0
      const expenses = r?.expenses ?? 0
      const net = income - expenses
      out.push({
        key,
        label: new Date(y, m - 1, 1).toLocaleString(undefined, {
          month: 'short',
          year: 'numeric',
        }),
        income,
        expenses,
        net,
      })
    }
    // Newest month (focus) first, then older months — matches typical statement / review order.
    return out.reverse()
  })()

  // Anomalies: > 2σ above category mean within the spend range (need >=4 samples in-range).
  const rangeSpendAmountsByCategory = new Map<string, number[]>()
  for (const tx of rangeSpendTxs) {
    const cat = safeCategory(tx)
    const amt = expenseAmount(tx)
    const list = rangeSpendAmountsByCategory.get(cat)
    if (list) list.push(amt)
    else rangeSpendAmountsByCategory.set(cat, [amt])
  }

  const anomalies = (() => {
    const out = []
    for (const [category, amounts] of rangeSpendAmountsByCategory) {
      if (amounts.length < 4) continue
      const m = mean(amounts)
      const sd = stdDev(amounts)
      if (sd === 0) continue
      const threshold = m + 2 * sd
      for (const tx of rangeSpendTxs) {
        const spend = expenseAmount(tx)
        if (spend === 0) continue
        if (safeCategory(tx) !== category) continue
        if (spend > threshold) {
          out.push({
            transaction: tx,
            category,
            zScore: (expenseAmount(tx) - m) / sd,
            categoryAverage: m,
            categoryStdDev: sd,
          })
        }
      }
    }
    out.sort((a, b) => expenseAmount(b.transaction) - expenseAmount(a.transaction))
    return out.slice(0, 25)
  })()

  // Duplicates: same merchant + same amount, within 3 days
  const duplicateCharges = (() => {
    const spendSorted = [...allSpendTxs].sort((a, b) => a.date.localeCompare(b.date))
    const out = []
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
        if (Math.abs(expenseAmount(a) - expenseAmount(b)) > 0.005) continue
        const key = [a.id, b.id].sort().join('|')
        if (dupSeen.has(key)) continue
        dupSeen.add(key)
        out.push({
          merchantKey: ma,
          displayName: a.description.trim() || b.description.trim(),
          amount: expenseAmount(a),
          transactions: [a, b],
          daysApart: Math.abs(db - da) / 86_400_000,
        })
      }
    }
    return out.filter((dup) =>
      dup.transactions.every((t) => {
        const day = txEffectiveDay(t)
        return inSpendRange(day, rangeStart, rangeEnd)
      }),
    )
  })()

  // Recurring: same merchant, amount within $1, >=2 consecutive months
  function clusterByAmountBand(txs: TransactionRow[], maxSpread: number): TransactionRow[][] {
    const sorted = [...txs].sort((x, y) => expenseAmount(x) - expenseAmount(y))
    const clusters: TransactionRow[][] = []
    for (const tx of sorted) {
      let placed = false
      for (const cl of clusters) {
        const amts = cl.map((t) => expenseAmount(t))
        const lo = Math.min(...amts, expenseAmount(tx))
        const hi = Math.max(...amts, expenseAmount(tx))
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
      if (!a || !b) continue
      const [ya, ma] = a.split('-').map(Number)
      const next = new Date(ya, ma, 1)
      const expect = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
      if (b === expect) return true
    }
    return false
  }

  const recurring = (() => {
    const byMerchant = new Map<string, TransactionRow[]>()
    for (const tx of allSpendTxs) {
      const mer = normalizeMerchant(tx.description)
      const arr = byMerchant.get(mer) ?? []
      arr.push(tx)
      byMerchant.set(mer, arr)
    }
    const patterns = []
    let estimatedMonthlyRecurringTotal = 0
    for (const [merKey, mtxs] of byMerchant) {
      for (const cluster of clusterByAmountBand(mtxs, 1)) {
        const monthKeys = cluster
          .map((t) => monthKeyFromIsoDate(t.date))
          .filter((k): k is string => k !== null)
        const distinctMonths = [...new Set(monthKeys)]
        if (distinctMonths.length < 2) continue
        if (!hasConsecutiveMonthPair(distinctMonths)) continue
        const first = cluster[0]
        if (!first) continue
        const typicalAmount = mean(cluster.map((t) => expenseAmount(t)))
        const lastDate = cluster.reduce(
          (best, t) => (t.date > best ? t.date : best),
          first.date,
        )
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
    return { patterns, estimatedMonthlyRecurringTotal }
  })()

  // Budget health: focus month
  function categoryBudgetAmount(category: string): number {
    const v = opts.budgetsByCategory.get(category)
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v
    return 0
  }

  const budgetRows = (() => {
    const cats = new Set<string>()
    for (const tx of opts.transactions) cats.add(safeCategory(tx))
    for (const k of opts.budgetsByCategory.keys()) cats.add(k)
    const rows = []
    for (const cat of cats) {
      const budget = categoryBudgetAmount(cat)
      const spentSoFar = focusRoll?.spendByCat.get(cat) ?? 0
      const projectedSpend = daysElapsed > 0 ? (spentSoFar / daysElapsed) * dim : spentSoFar
      let verdict: 'on_track' | 'close' | 'over' = 'on_track'
      if (budget > 0 && projectedSpend > budget) verdict = 'over'
      else if (budget > 0 && projectedSpend > budget * 0.92) verdict = 'close'
      rows.push({ category: cat, budget, spentSoFar, projectedSpend, verdict })
    }
    rows.sort((a, b) => b.projectedSpend - a.projectedSpend)
    return rows
  })()

  const spentSoFarTotal = focusMonthTotalSpend
  const projectedTotalSpend = daysElapsed > 0 ? (spentSoFarTotal / daysElapsed) * dim : spentSoFarTotal
  const sumCategoryBudgets = [...opts.budgetsByCategory.values()].reduce((s, n) => s + n, 0)
  const capOpt = opts.totalBudgetCap
  const totalBudgetCap =
    capOpt !== null && capOpt !== undefined && Number.isFinite(capOpt) && capOpt >= 0
      ? capOpt
      : sumCategoryBudgets
  let summaryVerdict: 'on_track' | 'close' | 'over' = 'on_track'
  if (totalBudgetCap > 0 && projectedTotalSpend > totalBudgetCap) summaryVerdict = 'over'
  else if (totalBudgetCap > 0 && projectedTotalSpend > totalBudgetCap * 0.92) summaryVerdict = 'close'

  return {
    focusMonthKey: focusKey,
    focusMonthTotalSpend,
    periodTotalSpend,
    periodLabel: opts.spendRangeLabel,
    categoryTotalsDesc,
    topMerchants,
    categoryMoM,
    biggestThree,
    cashFlowLastSixMonths,
    anomalies,
    duplicateCharges,
    recurring,
    budgetHealth: {
      rows: budgetRows,
      summary: {
        projectedTotalSpend,
        spentSoFarTotal,
        totalBudgetCap,
        verdict: summaryVerdict,
      },
    },
  }
}

