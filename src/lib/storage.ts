import type { Account, ConnectedAccountInfo, Transaction, Trip } from './domain'

export const KEYS = {
  accounts: 'budget-app:accounts',
  transactions: 'budget-app:transactions',
  categoryOverrides: 'budget-app:category-overrides',
  /** @deprecated migrated into enrollments */
  accessToken: 'budget-app:access-token',
  enrollments: 'budget-app:enrollments',
  connectedAccount: 'budget-app:connected-account',
  legacyTellerToken: 'budget-app:teller-token',
  /** Account ids excluded from Transactions / Insights (string[]) */
  accountsExcludedFromReports: 'budget-app:accounts-excluded-reports',
  /** Unix ms of last successful Teller/transaction pull (not demo fallback) */
  lastBankSyncAt: 'budget-app:last-bank-sync-at',
  /** User monthly budget caps (JSON: MonthlyBudgetsStoredV1) */
  monthlyBudgets: 'budget-app:monthly-budgets',
  /** User finished the pre-account marketing carousel (`'1'` or absent) */
  seenLanding: 'budget-app:seen-landing',
  /** YYYY-MM when the 80% budget toast was last acknowledged */
  budgetAlertShownMonth: 'budget-app:budget-alert-shown-month',
  /** Budget browser notifications (`'1'` / absent) */
  budgetNotificationsEnabled: 'budget-app:budget-notifications-enabled',
  /** Last signed-in Google email on this device — used to detect account switch and clear local data */
  lastAuthEmail: 'budget-app:last-auth-email',
  /** Named trips (allocation targets); JSON Trip[] — unused; trips live on the server. */
  trips: 'budget-app:trips',
  /** User-selected theme preference: 'light' | 'dark' */
  theme: 'budget-app:theme',
  /** Custom categories (JSON: {id,label}[]) */
  customCategories: 'budget-app:custom-categories',
  /** Server-backed categories cache (JSON: {id,label,color,source}[]) */
  categories: 'budget-app:categories',
} as const

let serverMem: {
  accounts: Account[] | null
  transactions: Transaction[] | null
  trips: Trip[] | null
  categories: CategoryRow[] | null
  monthlyBudgets: MonthlyBudgetsStoredV1 | null
} = {
  accounts: null,
  transactions: null,
  trips: null,
  categories: null,
  monthlyBudgets: null,
}

/** Fired when account visibility toggles or exclusions list is pruned */
export const ACCOUNTS_EXCLUSIONS_CHANGED_EVENT = 'budget-app-accounts-exclusions-changed'

/** Fired when the stored accounts list changes. */
export const ACCOUNTS_CHANGED_EVENT = 'budget-app-accounts-changed'

/** Fired after a successful bank transaction refresh (manual or background). */
export const BANK_SYNC_COMPLETED_EVENT = 'budget-app-bank-sync-completed'

/** Fired when a bank sync begins (manual or background). */
export const BANK_SYNC_STARTED_EVENT = 'budget-app-bank-sync-started'

/** Fired when a bank sync ends (manual or background). */
export const BANK_SYNC_ENDED_EVENT = 'budget-app-bank-sync-ended'

/** Fired when monthly budget settings are saved or cleared. */
export const MONTHLY_BUDGETS_CHANGED_EVENT = 'budget-app-monthly-budgets-changed'

/** Fired when the user clears the “already shown this month” budget toast flag. */
export const BUDGET_ALERT_ACK_RESET_EVENT = 'budget-app-budget-alert-ack-reset'

export const TRIPS_CHANGED_EVENT = 'budget-app-trips-changed'

/** Fired when custom categories are added/removed. */
export const CUSTOM_CATEGORIES_CHANGED_EVENT = 'budget-app-custom-categories-changed'

/** Fired when server-backed categories list is updated. */
export const CATEGORIES_CHANGED_EVENT = 'budget-app-categories-changed'

export type CategoryRow = {
  readonly id: string
  readonly label: string
  readonly color: string
  readonly source: 'teller' | 'user'
}

export function getCategories(): CategoryRow[] | null {
  return serverMem.categories
}

export function saveCategories(next: CategoryRow[]): void {
  serverMem.categories = next
  try {
    writeJson(KEYS.categories, next)
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(CATEGORIES_CHANGED_EVENT))
  } catch {
    /* ignore */
  }
}

export function loadCategoriesFromDisk(): CategoryRow[] | null {
  const raw = readJson(KEYS.categories)
  if (!Array.isArray(raw)) return null
  const out: CategoryRow[] = []
  for (const v of raw) {
    if (!v || typeof v !== 'object') continue
    const r = v as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id : ''
    const label = typeof r.label === 'string' ? r.label : ''
    const color = typeof r.color === 'string' ? r.color : '#94a3b8'
    const source = r.source === 'user' ? 'user' : 'teller'
    if (!id || !label) continue
    out.push({ id, label, color, source })
  }
  return out
}

export type MonthlyBudgetsStoredV1 = {
  readonly v: 1
  readonly categories: Partial<Record<string, number>>
  /** `null` = overall cap is the sum of per-category budgets (default + overrides). */
  readonly totalMonthly: number | null
}

export function getMonthlyBudgetsStored(): MonthlyBudgetsStoredV1 {
  return serverMem.monthlyBudgets ?? { v: 1, categories: {}, totalMonthly: null }
}

function dispatchMonthlyBudgetsChanged(): void {
  window.dispatchEvent(new CustomEvent(MONTHLY_BUDGETS_CHANGED_EVENT))
}

export function saveMonthlyBudgets(
  next: MonthlyBudgetsStoredV1,
  opts?: { readonly skipRemote?: boolean },
): void {
  serverMem.monthlyBudgets = next
  dispatchMonthlyBudgetsChanged()
  if (opts?.skipRemote !== true) {
    void import('@/lib/serverData').then(({ putBudgetsToServer }) =>
      putBudgetsToServer(next),
    )
  }
}

function dispatchAccountsExclusionsChanged(): void {
  window.dispatchEvent(new CustomEvent(ACCOUNTS_EXCLUSIONS_CHANGED_EVENT))
}

export function getExcludedAccountIds(): Set<string> {
  const data = readJson(KEYS.accountsExcludedFromReports)
  if (!Array.isArray(data)) return new Set()
  return new Set(data.filter((x): x is string => typeof x === 'string'))
}

/** @param excluded — when true, hide this account on Transactions and Insights */
export function setAccountExcludedFromReports(
  accountId: string,
  excluded: boolean,
): void {
  const s = getExcludedAccountIds()
  if (excluded) s.add(accountId)
  else s.delete(accountId)
  writeJson(KEYS.accountsExcludedFromReports, [...s])
  dispatchAccountsExclusionsChanged()
}

function pruneExcludedAccountIds(validAccountIds: ReadonlySet<string>): boolean {
  const s = getExcludedAccountIds()
  const next = new Set([...s].filter((id) => validAccountIds.has(id)))
  if (next.size === s.size && [...s].every((id) => next.has(id))) return false
  writeJson(KEYS.accountsExcludedFromReports, [...next])
  return true
}

export interface StoredEnrollment {
  readonly enrollmentId: string
  readonly accessToken: string
  readonly institutionName: string
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return null
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function writeJson<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

function dispatchCustomCategoriesChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent(CUSTOM_CATEGORIES_CHANGED_EVENT))
  } catch {
    /* ignore */
  }
}

export type CustomCategory = {
  readonly id: string
  readonly label: string
  /** Hex color (e.g. #22c55e) used for category pills. */
  readonly color: string
}

function normalizeHexColor(input: string): string | null {
  const s = input.trim()
  if (!s) return null
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase()
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toLowerCase()}`
  return null
}

export function getCustomCategories(): CustomCategory[] {
  const raw = readJson(KEYS.customCategories)
  if (!Array.isArray(raw)) return []
  const out: CustomCategory[] = []
  for (const v of raw) {
    if (!v || typeof v !== 'object') continue
    const r = v as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id.trim() : ''
    const label = typeof r.label === 'string' ? r.label.trim() : ''
    const color = normalizeHexColor(typeof r.color === 'string' ? r.color : '') ?? '#94a3b8'
    if (!id || !label) continue
    out.push({ id, label, color })
  }
  // stable sort for UI
  return out.sort((a, b) => a.label.localeCompare(b.label))
}

export function saveCustomCategories(next: CustomCategory[]): void {
  writeJson(KEYS.customCategories, next)
  dispatchCustomCategoriesChanged()
}

export function addCustomCategory(input: { id: string; label: string }): boolean {
  const id = input.id.trim()
  const label = input.label.trim()
  if (!id || !label) return false
  const next = getCustomCategories()
  if (next.some((c) => c.id === id)) return false
  saveCustomCategories([...next, { id, label, color: '#94a3b8' }])
  return true
}

export function addCustomCategoryWithColor(input: {
  id: string
  label: string
  color: string
}): boolean {
  const id = input.id.trim()
  const label = input.label.trim()
  const color = normalizeHexColor(input.color) ?? '#94a3b8'
  if (!id || !label) return false
  const next = getCustomCategories()
  if (next.some((c) => c.id === id)) return false
  saveCustomCategories([...next, { id, label, color }])
  return true
}

export function updateCustomCategoryColor(id: string, color: string): void {
  const hex = normalizeHexColor(color)
  if (!hex) return
  const next = getCustomCategories().map((c) => (c.id === id ? { ...c, color: hex } : c))
  saveCustomCategories(next)
}

export function removeCustomCategory(id: string): void {
  const next = getCustomCategories().filter((c) => c.id !== id)
  saveCustomCategories(next)
}

export type ThemePreference = 'light' | 'dark'

export function getThemePreference(): ThemePreference | null {
  const raw = localStorage.getItem(KEYS.theme)
  if (raw === 'light' || raw === 'dark') return raw
  return null
}

export function setThemePreference(next: ThemePreference): void {
  localStorage.setItem(KEYS.theme, next)
}

/** Teller tokens live on the server; always empty locally. */
export function getEnrollments(): StoredEnrollment[] {
  return []
}

export function saveEnrollments(_list: StoredEnrollment[]): void {}

export function upsertEnrollment(_entry: StoredEnrollment): void {}

export function removeEnrollment(_enrollmentId: string): void {}

export function saveAccounts(accounts: Account[]): void {
  serverMem.accounts = accounts
  if (pruneExcludedAccountIds(new Set(accounts.map((a) => a.id)))) {
    dispatchAccountsExclusionsChanged()
  }
  try {
    window.dispatchEvent(new CustomEvent(ACCOUNTS_CHANGED_EVENT))
  } catch {
    /* ignore */
  }
}

export function getAccounts(): Account[] | null {
  return serverMem.accounts
}

export function hasSeenLanding(): boolean {
  return localStorage.getItem(KEYS.seenLanding) === '1'
}

export function markLandingAsSeen(): void {
  localStorage.setItem(KEYS.seenLanding, '1')
}

export function saveTransactions(transactions: Transaction[]): void {
  serverMem.transactions = transactions
  window.dispatchEvent(new CustomEvent(BANK_SYNC_COMPLETED_EVENT))
}

export function getTransactions(): Transaction[] | null {
  const m = serverMem.transactions
  return m !== null ? m : null
}

export function getTrips(): Trip[] {
  return serverMem.trips ?? []
}

function dispatchTripsChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent(TRIPS_CHANGED_EVENT))
  } catch {
    /* ignore */
  }
}

export function saveTrips(trips: Trip[]): void {
  serverMem.trips = trips
  dispatchTripsChanged()
}

/** @deprecated Use getEnrollments */
export function saveAccessToken(token: string): void {
  localStorage.setItem(KEYS.accessToken, token)
}

/** @deprecated Use getEnrollments */
export function getAccessToken(): string | null {
  return localStorage.getItem(KEYS.accessToken)
}

export function saveConnectedAccountSummary(info: ConnectedAccountInfo): void {
  writeJson(KEYS.connectedAccount, info)
}

export function clearConnectedAccountSummary(): void {
  localStorage.removeItem(KEYS.connectedAccount)
}

export function getConnectedAccountSummary(): ConnectedAccountInfo | null {
  const data = readJson(KEYS.connectedAccount)
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  const accountId = typeof o.accountId === 'string' ? o.accountId : null
  const accountName = typeof o.accountName === 'string' ? o.accountName : null
  const institutionName =
    typeof o.institutionName === 'string' ? o.institutionName : null
  if (!accountId || !accountName || !institutionName) return null
  return { accountId, accountName, institutionName }
}

export function clearTransactions(): void {
  serverMem.transactions = null
  localStorage.removeItem(KEYS.lastBankSyncAt)
}

export function getLastBankSyncAt(): number | null {
  const raw = localStorage.getItem(KEYS.lastBankSyncAt)
  if (raw === null) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** Call after a successful pull from Teller (real accounts), not demo/cache fallback. */
export function recordSuccessfulBankTransactionFetch(): void {
  localStorage.setItem(KEYS.lastBankSyncAt, String(Date.now()))
  window.dispatchEvent(new CustomEvent(BANK_SYNC_COMPLETED_EVENT))
}

/**
 * True if user has a linked bank (enrollment or non-demo accounts), so background sync is meaningful.
 */
export function hasLinkedBankAccountsForSync(): boolean {
  const accounts = getAccounts()
  if (!accounts?.length) return false
  return accounts.some((a) => a.enrollmentId !== 'demo' && a.id !== 'demo-acct')
}

function readOverrides(): Record<string, string> {
  const data = readJson(KEYS.categoryOverrides)
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}

export function getCategoryOverrides(): Record<string, string> {
  return readOverrides()
}

export function setCategoryOverride(transactionId: string, categoryId: string): void {
  const next = { ...readOverrides(), [transactionId]: categoryId }
  writeJson(KEYS.categoryOverrides, next)
}

export function clearAll(): void {
  localStorage.removeItem(KEYS.accounts)
  localStorage.removeItem(KEYS.transactions)
  localStorage.removeItem(KEYS.categoryOverrides)
  localStorage.removeItem(KEYS.accessToken)
  localStorage.removeItem(KEYS.enrollments)
  localStorage.removeItem(KEYS.connectedAccount)
  localStorage.removeItem(KEYS.legacyTellerToken)
  localStorage.removeItem(KEYS.accountsExcludedFromReports)
  localStorage.removeItem(KEYS.lastBankSyncAt)
  localStorage.removeItem(KEYS.monthlyBudgets)
  localStorage.removeItem(KEYS.seenLanding)
  localStorage.removeItem(KEYS.budgetAlertShownMonth)
  localStorage.removeItem(KEYS.budgetNotificationsEnabled)
  localStorage.removeItem(KEYS.lastAuthEmail)
  localStorage.removeItem(KEYS.trips)
  localStorage.removeItem(KEYS.customCategories)
  localStorage.removeItem(KEYS.categories)
  serverMem = {
    accounts: null,
    transactions: null,
    trips: null,
    categories: null,
    monthlyBudgets: null,
  }
}
