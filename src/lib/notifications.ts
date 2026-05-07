import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'

import {
  META_BUDGET_ALERT_SETTINGS,
  META_BUDGET_ALERT_STATE,
  META_NOTIFICATIONS_PERMISSION_ASKED,
  META_RECURRING_REMINDERS_LAST_RUN,
} from '@/src/db/constants'
import * as budgetsQ from '@/src/db/queries/budgets'
import * as categoriesQ from '@/src/db/queries/categories'
import * as metaQ from '@/src/db/queries/appMeta'
import * as txq from '@/src/db/queries/transactions'
import * as recurringQ from '@/src/db/queries/recurringRules'
import { nextOccurrenceDate, type ManualRecurrenceCadence } from './transactions/manualRecurring'

type QuietHours = { startHour: number; endHour: number }

export type BudgetAlertSettings = {
  enabled: boolean
  threshold80: number // 0-1
  threshold100: number // 0-1
  quietHours: QuietHours | null
  perCategoryEnabled: Record<string, boolean>
}

type BudgetAlertState = {
  /** key: `${month}\0${category}` → last threshold fired (0 | 0.8 | 1) */
  lastFired: Record<string, number>
}

const DEFAULT_SETTINGS: BudgetAlertSettings = {
  enabled: true,
  threshold80: 0.8,
  threshold100: 1,
  quietHours: { startHour: 22, endHour: 8 },
  perCategoryEnabled: {},
}

const DEFAULT_STATE: BudgetAlertState = { lastFired: {} }

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function normalizeHour(n: number): number {
  if (!Number.isFinite(n)) return 0
  const h = Math.floor(n)
  return ((h % 24) + 24) % 24
}

function nowMonthKey(): string {
  return new Date().toISOString().slice(0, 7)
}

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    const v = JSON.parse(raw) as T
    return v ?? fallback
  } catch {
    return fallback
  }
}

export function getBudgetAlertSettings(): BudgetAlertSettings {
  const raw = metaQ.getMeta(META_BUDGET_ALERT_SETTINGS)
  const parsed = parseJson<Partial<BudgetAlertSettings>>(raw, {})
  return {
    enabled: Boolean(parsed.enabled ?? DEFAULT_SETTINGS.enabled),
    threshold80: clamp01(Number(parsed.threshold80 ?? DEFAULT_SETTINGS.threshold80)),
    threshold100: clamp01(Number(parsed.threshold100 ?? DEFAULT_SETTINGS.threshold100)),
    quietHours:
      parsed.quietHours == null
        ? DEFAULT_SETTINGS.quietHours
        : {
            startHour: normalizeHour(Number(parsed.quietHours.startHour)),
            endHour: normalizeHour(Number(parsed.quietHours.endHour)),
          },
    perCategoryEnabled: typeof parsed.perCategoryEnabled === 'object' && parsed.perCategoryEnabled
      ? (parsed.perCategoryEnabled as Record<string, boolean>)
      : {},
  }
}

export function setBudgetAlertSettings(next: BudgetAlertSettings): void {
  metaQ.setMeta(META_BUDGET_ALERT_SETTINGS, JSON.stringify(next))
}

function getBudgetAlertState(): BudgetAlertState {
  const raw = metaQ.getMeta(META_BUDGET_ALERT_STATE)
  const parsed = parseJson<BudgetAlertState>(raw, DEFAULT_STATE)
  return parsed && typeof parsed === 'object' && parsed.lastFired ? parsed : DEFAULT_STATE
}

function setBudgetAlertState(next: BudgetAlertState): void {
  metaQ.setMeta(META_BUDGET_ALERT_STATE, JSON.stringify(next))
}

function isInQuietHours(q: QuietHours | null, d = new Date()): boolean {
  if (!q) return false
  const h = d.getHours()
  const start = normalizeHour(q.startHour)
  const end = normalizeHour(q.endHour)
  // Same hour means "disabled" (no quiet period).
  if (start === end) return false
  // Overnight window (e.g. 22 → 8)
  if (start > end) return h >= start || h < end
  return h >= start && h < end
}

function resolveSpendAmount(tx: txq.TransactionRow): number {
  // Match other screens: treat spend as positive.
  if (typeof tx.my_share === 'number' && Number.isFinite(tx.my_share) && tx.my_share > 0) {
    return tx.my_share
  }
  if (typeof tx.amount === 'number' && Number.isFinite(tx.amount) && tx.amount < 0) {
    return Math.abs(tx.amount)
  }
  return 0
}

function resolveBudgetMonth(tx: txq.TransactionRow): string {
  const iso = (tx.effective_date ?? tx.date) || ''
  return iso.slice(0, 7)
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync('budget-alerts', {
    name: 'Budget alerts',
    importance: Notifications.AndroidImportance.DEFAULT,
  })
  await Notifications.setNotificationChannelAsync('bill-reminders', {
    name: 'Bill reminders',
    importance: Notifications.AndroidImportance.HIGH,
  })
}

export async function ensureNotificationPermissionsOnce(): Promise<void> {
  // Configure handler once: show alerts but don’t play sound by default.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  })

  await ensureAndroidChannel()

  const asked = metaQ.getMeta(META_NOTIFICATIONS_PERMISSION_ASKED) === '1'
  if (asked) return

  const perms = await Notifications.getPermissionsAsync()
  const isGranted =
    // Newer Expo types
    (typeof (perms as any).granted === 'boolean' && (perms as any).granted) ||
    // Standard field
    (typeof (perms as any).status === 'string' && (perms as any).status === 'granted')
  if (isGranted) {
    metaQ.setMeta(META_NOTIFICATIONS_PERMISSION_ASKED, '1')
    return
  }

  // Ask once on first run; user can re-enable in system settings.
  await Notifications.requestPermissionsAsync()
  metaQ.setMeta(META_NOTIFICATIONS_PERMISSION_ASKED, '1')
}

export async function runBudgetAlertCheck(reason: 'sync' | 'budget_change' | 'manual'): Promise<void> {
  const settings = getBudgetAlertSettings()
  if (!settings.enabled) return
  if (isInQuietHours(settings.quietHours)) return

  const monthKey = nowMonthKey()
  const specific = budgetsQ.listBudgets(monthKey)
  const budgets = specific.length > 0 ? specific : budgetsQ.listBudgets('default')
  if (budgets.length === 0) return

  const enabledByCat = settings.perCategoryEnabled

  const budgetsByCat = new Map<string, number>()
  for (const b of budgets) {
    const c = (b.category ?? '').trim()
    if (!c) continue
    budgetsByCat.set(c, b.amount)
  }

  const txs = txq.listTransactions()
    .filter((t) => (t.pending === 1 && t.user_confirmed !== 1 ? false : true))
    .filter((t) => resolveBudgetMonth(t) === monthKey)

  const spendByCat = new Map<string, number>()
  for (const t of txs) {
    const cat = typeof t.category === 'string' ? t.category.trim() : ''
    const key = cat || 'Other'
    const spend = resolveSpendAmount(t)
    if (spend <= 0) continue
    spendByCat.set(key, (spendByCat.get(key) ?? 0) + spend)
  }

  const state = getBudgetAlertState()
  const lastFired = { ...state.lastFired }

  // If user hasn’t explicitly set a toggle for a category, default to enabled.
  const isCatEnabled = (cat: string) => enabledByCat[cat] !== false

  const cats = categoriesQ.listCategories().map((c) => c.label)
  // Include budget categories even if not in categories table.
  for (const c of budgetsByCat.keys()) if (!cats.includes(c)) cats.push(c)

  const threshold80 = Math.min(settings.threshold80, settings.threshold100)
  const threshold100 = Math.max(settings.threshold100, threshold80)

  for (const cat of cats) {
    const limit = budgetsByCat.get(cat)
    if (limit == null || !Number.isFinite(limit) || limit <= 0) continue
    if (!isCatEnabled(cat)) continue

    const spent = spendByCat.get(cat) ?? 0
    const ratio = spent / limit
    const key = `${monthKey}\u0000${cat}`
    const prev = Number(lastFired[key] ?? 0)

    const shouldFire100 = ratio >= threshold100 && prev < threshold100
    const shouldFire80 = ratio >= threshold80 && prev < threshold80

    const fireAt = shouldFire100 ? threshold100 : shouldFire80 ? threshold80 : null
    if (fireAt == null) continue

    const pct = Math.round(ratio * 100)
    const title = fireAt >= threshold100 ? 'Budget cap hit' : 'Budget nearing cap'
    const body =
      fireAt >= threshold100
        ? `${cat}: ${pct}% · $${spent.toFixed(2)} / $${limit.toFixed(2)}`
        : `${cat}: ${pct}% · $${spent.toFixed(2)} / $${limit.toFixed(2)}`

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: 'budget_alert', month: monthKey, category: cat, reason },
      },
      trigger: null, // fire immediately
    })

    lastFired[key] = fireAt
  }

  setBudgetAlertState({ lastFired })
}

// ── Upcoming recurring bill reminders ───────────────────────────────────────

function addDaysToIso(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n))
}

/**
 * Schedule local push notifications for recurring rules whose next occurrence
 * falls exactly 1 day from today.  Should be called once per day (e.g. after
 * a sync or when the app comes to foreground).
 *
 * We gate on a "last run" meta key so we don't spam on every app launch.
 */
export async function scheduleRecurringBillReminders(): Promise<void> {
  const today = todayIso()
  const lastRun = metaQ.getMeta(META_RECURRING_REMINDERS_LAST_RUN)
  if (lastRun === today) return // already ran today

  const rules = recurringQ.listActiveRecurringRules()
  const tomorrow = addDaysToIso(today, 1)

  for (const rule of rules) {
    // Compute the next occurrence from last_generated_date or start_date
    const base = rule.last_generated_date ?? rule.start_date
    const next = nextOccurrenceDate(base, rule.cadence as ManualRecurrenceCadence)
    if (!next) continue
    // Only notify if it lands tomorrow
    if (next !== tomorrow) continue
    // Skip rules that have already passed their until date
    if (rule.until_date && tomorrow > rule.until_date) continue

    const amtStr = formatCurrency(rule.amount)
    const sign = rule.amount < 0 ? '-' : '+'

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '📅 Bill due tomorrow',
        body: `${rule.description} · ${sign}${amtStr}`,
        data: { type: 'bill_reminder', ruleId: rule.id, date: tomorrow },
        ...(Platform.OS === 'android' ? { channelId: 'bill-reminders' } : {}),
      },
      trigger: null, // fire immediately (background-safe)
    })
  }

  metaQ.setMeta(META_RECURRING_REMINDERS_LAST_RUN, today)
}

// ── Upcoming bills list (sync-safe, returns plain data) ──────────────────────

export type UpcomingBill = {
  ruleId: string
  description: string
  amount: number
  dueDate: string  // YYYY-MM-DD
  cadence: ManualRecurrenceCadence
  category: string | null
  daysUntilDue: number
}

/**
 * Return all upcoming bill occurrences within the next `horizonDays` days
 * (default 30), sorted by dueDate ascending.
 */
export function getUpcomingBills(horizonDays = 30): UpcomingBill[] {
  const today = todayIso()
  const cutoff = addDaysToIso(today, horizonDays)
  const rules = recurringQ.listActiveRecurringRules()
  const bills: UpcomingBill[] = []

  for (const rule of rules) {
    const cadence = rule.cadence as ManualRecurrenceCadence
    // Find the next occurrence after today
    const base = rule.last_generated_date ?? rule.start_date
    let candidate = nextOccurrenceDate(base, cadence)
    // The base might already be in the future (e.g. rule just created)
    if (!candidate) continue

    // If candidate is in the past, advance until it's today or later
    let safety = 0
    while (candidate < today && safety < 400) {
      const n = nextOccurrenceDate(candidate, cadence)
      if (!n) break
      candidate = n
      safety++
    }

    if (candidate < today || candidate > cutoff) continue
    if (rule.until_date && candidate > rule.until_date) continue

    const dueDateMs = new Date(`${candidate}T12:00:00`).getTime()
    const todayMs = new Date(`${today}T12:00:00`).getTime()
    const daysUntilDue = Math.round((dueDateMs - todayMs) / 86_400_000)

    bills.push({
      ruleId: rule.id,
      description: rule.description,
      amount: rule.amount,
      dueDate: candidate,
      cadence,
      category: rule.category ?? null,
      daysUntilDue,
    })
  }

  return bills.sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
}

