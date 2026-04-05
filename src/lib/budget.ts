import { CATEGORIES } from '@/constants/categories'
import { MONTHLY_BUDGET_DEFAULTS_BY_CATEGORY } from '@/constants/monthlyBudgetDefaults'
import {
  filterTransactionsForCalendarMonth,
  formatCurrencyAmount,
} from '@/lib/api'
import type { Transaction } from '@/lib/domain'
import {
  BUDGET_ALERT_ACK_RESET_EVENT,
  getMonthlyBudgetsStored,
  KEYS,
  type MonthlyBudgetsStoredV1,
} from '@/lib/storage'

const ALERT_THRESHOLD = 0.8

function currentYearMonth(): { year: number; month: number } {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function categoryBudgetUsd(
  stored: MonthlyBudgetsStoredV1,
  categoryId: string,
): number {
  const v = stored.categories[categoryId]
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v
  return (
    MONTHLY_BUDGET_DEFAULTS_BY_CATEGORY[categoryId] ??
    MONTHLY_BUDGET_DEFAULTS_BY_CATEGORY.other
  )
}

/**
 * Effective monthly spend cap (USD), or `null` if the user has never saved budget settings
 * (empty storage — we do not alert on implicit defaults alone).
 */
export function getBudget(): number | null {
  const s = getMonthlyBudgetsStored()
  const hasUserBudget =
    s.totalMonthly !== null || Object.keys(s.categories).length > 0
  if (!hasUserBudget) return null

  const sumCategoryBudgets = CATEGORIES.reduce(
    (acc, c) => acc + categoryBudgetUsd(s, c.id),
    0,
  )

  if (
    s.totalMonthly !== null &&
    Number.isFinite(s.totalMonthly) &&
    s.totalMonthly >= 0
  ) {
    return s.totalMonthly
  }

  return sumCategoryBudgets
}

export function checkBudgetAlert(transactions: readonly Transaction[]): {
  readonly percentage: number
  readonly shouldAlert: boolean
  readonly spent: number
  readonly budget: number
} | null {
  const budget = getBudget()
  if (budget === null || budget <= 0) return null

  const { year, month } = currentYearMonth()
  const monthTxs = filterTransactionsForCalendarMonth(
    transactions,
    year,
    month,
  )
  let spent = 0
  for (const tx of monthTxs) {
    if (tx.amount > 0) spent += tx.amount
  }

  const percentage = Math.min(100, (spent / budget) * 100)
  const shouldAlert = spent >= budget * ALERT_THRESHOLD

  return {
    percentage,
    shouldAlert,
    spent,
    budget,
  }
}

/** `true` if we already showed the 80% alert for the current calendar month. */
export function hasShownAlertThisMonth(): boolean {
  const raw = localStorage.getItem(KEYS.budgetAlertShownMonth)
  if (raw === null || raw === '') return false
  return raw === monthKey(currentYearMonth().year, currentYearMonth().month)
}

export function markAlertShownThisMonth(): void {
  const { year, month } = currentYearMonth()
  localStorage.setItem(KEYS.budgetAlertShownMonth, monthKey(year, month))
}

/** Clears the “shown this month” flag so the 80% toast can appear again (same calendar month). */
export function clearBudgetAlertShownMonth(): void {
  try {
    localStorage.removeItem(KEYS.budgetAlertShownMonth)
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BUDGET_ALERT_ACK_RESET_EVENT))
  }
}

export function getNotificationsEnabled(): boolean {
  return localStorage.getItem(KEYS.budgetNotificationsEnabled) === '1'
}

export function setNotificationsEnabled(enabled: boolean): void {
  localStorage.setItem(KEYS.budgetNotificationsEnabled, enabled ? '1' : '0')
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

export function sendBudgetBrowserNotification(
  percentage: number,
  _spent: number,
  budget: number,
): void {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return

  const title = 'Budget Alert ⚠️'
  const body = `You've used ${Math.round(percentage)}% of your ${formatCurrencyAmount(budget)} budget this month`
  try {
    new Notification(title, { body })
  } catch {
    /* ignore */
  }
}

