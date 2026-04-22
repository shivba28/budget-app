import type { TransactionRow } from '@/src/db/queries/transactions'

export type BudgetVerdict = 'on_track' | 'close' | 'over'

export type SpendingCategoryRow = {
  readonly category: string
  readonly totalSpend: number
}

export type MerchantSpendRow = {
  readonly merchantKey: string
  readonly displayName: string
  readonly totalSpend: number
}

export type BiggestTransaction = {
  readonly id: string
  readonly date: string
  readonly description: string
  readonly amount: number
  readonly category: string
}

export type CategoryMoMChange = {
  readonly category: string
  readonly currentSpend: number
  readonly previousSpend: number
  readonly absoluteChange: number
  readonly percentChange: number | null
}

export type CashFlowMonth = {
  readonly key: string // YYYY-MM
  readonly label: string
  readonly income: number
  readonly expenses: number
  readonly net: number
}

export type AnomalyFlag = {
  readonly transaction: TransactionRow
  readonly category: string
  readonly zScore: number
  readonly categoryAverage: number
  readonly categoryStdDev: number
}

export type DuplicateCharge = {
  readonly merchantKey: string
  readonly displayName: string
  readonly amount: number
  readonly transactions: readonly TransactionRow[]
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
  readonly category: string
  readonly budget: number
  readonly spentSoFar: number
  readonly projectedSpend: number
  readonly verdict: BudgetVerdict
}

export type BudgetHealthSummary = {
  readonly projectedTotalSpend: number
  readonly spentSoFarTotal: number
  readonly totalBudgetCap: number
  readonly verdict: BudgetVerdict
}

export type InsightsResult = {
  readonly focusMonthKey: string
  /** Total spend in the focused calendar month (budget / MoM context). */
  readonly focusMonthTotalSpend: number
  /** Total spend (positive my_share/amount) inside the selected spend range (donut / merchants / alerts). */
  readonly periodTotalSpend: number
  /** Human-readable selected spend range, e.g. "Apr 1–30, 2026". */
  readonly periodLabel: string
  readonly categoryTotalsDesc: SpendingCategoryRow[]
  readonly topMerchants: MerchantSpendRow[]
  readonly categoryMoM: CategoryMoMChange[]
  readonly biggestThree: BiggestTransaction[]
  readonly cashFlowLastSixMonths: CashFlowMonth[]
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

