import type { Account, ConnectedAccountInfo, Transaction } from './domain'

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
} as const

/** Fired when account visibility toggles or exclusions list is pruned */
export const ACCOUNTS_EXCLUSIONS_CHANGED_EVENT = 'budget-app-accounts-exclusions-changed'

/** Fired after a successful bank transaction refresh (manual or background). */
export const BANK_SYNC_COMPLETED_EVENT = 'budget-app-bank-sync-completed'

/** Fired when monthly budget settings are saved or cleared. */
export const MONTHLY_BUDGETS_CHANGED_EVENT = 'budget-app-monthly-budgets-changed'

/** Fired when the user clears the “already shown this month” budget toast flag. */
export const BUDGET_ALERT_ACK_RESET_EVENT = 'budget-app-budget-alert-ack-reset'

export type MonthlyBudgetsStoredV1 = {
  readonly v: 1
  readonly categories: Partial<Record<string, number>>
  /** `null` = overall cap is the sum of per-category budgets (default + overrides). */
  readonly totalMonthly: number | null
}

function isValidMonthlyBudgetsStored(x: unknown): x is MonthlyBudgetsStoredV1 {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  if (o.v !== 1) return false
  if (
    o.totalMonthly !== null &&
    (typeof o.totalMonthly !== 'number' ||
      !Number.isFinite(o.totalMonthly) ||
      o.totalMonthly < 0)
  ) {
    return false
  }
  if (!o.categories || typeof o.categories !== 'object' || Array.isArray(o.categories)) {
    return false
  }
  for (const v of Object.values(o.categories as Record<string, unknown>)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return false
  }
  return true
}

export function getMonthlyBudgetsStored(): MonthlyBudgetsStoredV1 {
  const data = readJson(KEYS.monthlyBudgets)
  if (!isValidMonthlyBudgetsStored(data)) {
    return { v: 1, categories: {}, totalMonthly: null }
  }
  return data
}

function dispatchMonthlyBudgetsChanged(): void {
  window.dispatchEvent(new CustomEvent(MONTHLY_BUDGETS_CHANGED_EVENT))
}

export function saveMonthlyBudgets(next: MonthlyBudgetsStoredV1): void {
  writeJson(KEYS.monthlyBudgets, next)
  dispatchMonthlyBudgetsChanged()
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

function isValidEnrollment(x: unknown): x is StoredEnrollment {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    typeof o.enrollmentId === 'string' &&
    typeof o.accessToken === 'string' &&
    typeof o.institutionName === 'string'
  )
}

/** Reads enrollments; migrates legacy single `access-token` once if needed. */
export function getEnrollments(): StoredEnrollment[] {
  const legacy = localStorage.getItem(KEYS.accessToken)
  const data = readJson(KEYS.enrollments)
  let list: StoredEnrollment[] = Array.isArray(data)
    ? data.filter(isValidEnrollment)
    : []
  if (list.length === 0 && legacy && legacy.trim()) {
    list = [
      {
        enrollmentId: 'legacy',
        accessToken: legacy.trim(),
        institutionName: 'Connected account',
      },
    ]
    saveEnrollments(list)
    localStorage.removeItem(KEYS.accessToken)
  }
  return list
}

export function saveEnrollments(list: StoredEnrollment[]): void {
  writeJson(KEYS.enrollments, list)
}

export function upsertEnrollment(entry: StoredEnrollment): void {
  const list = getEnrollments().filter((e) => e.enrollmentId !== entry.enrollmentId)
  list.push(entry)
  saveEnrollments(list)
}

export function removeEnrollment(enrollmentId: string): void {
  saveEnrollments(
    getEnrollments().filter((e) => e.enrollmentId !== enrollmentId),
  )
}

export function saveAccounts(accounts: Account[]): void {
  writeJson(KEYS.accounts, accounts)
  if (pruneExcludedAccountIds(new Set(accounts.map((a) => a.id)))) {
    dispatchAccountsExclusionsChanged()
  }
}

function normalizeStoredAccount(raw: unknown): Account | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id : null
  const name = typeof r.name === 'string' ? r.name : null
  if (!id || !name) return null
  const enrollmentId =
    typeof r.enrollmentId === 'string' ? r.enrollmentId : 'legacy'
  let institution: { name: string } | undefined
  if (r.institution && typeof r.institution === 'object' && r.institution !== null) {
    const ins = r.institution as Record<string, unknown>
    if (typeof ins.name === 'string') institution = { name: ins.name }
  }
  const base: Account = institution
    ? { id, name, enrollmentId, institution }
    : { id, name, enrollmentId }
  return base
}

export function getAccounts(): Account[] | null {
  const data = readJson(KEYS.accounts)
  if (!Array.isArray(data)) return null
  const out = data
    .map(normalizeStoredAccount)
    .filter((a): a is Account => a !== null)
  return out.length > 0 ? out : null
}

export function hasSeenLanding(): boolean {
  return localStorage.getItem(KEYS.seenLanding) === '1'
}

export function markLandingAsSeen(): void {
  localStorage.setItem(KEYS.seenLanding, '1')
}

export function saveTransactions(transactions: Transaction[]): void {
  writeJson(KEYS.transactions, transactions)
}

export function getTransactions(): Transaction[] | null {
  const data = readJson(KEYS.transactions)
  return Array.isArray(data) ? (data as Transaction[]) : null
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
  localStorage.removeItem(KEYS.transactions)
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
  if (getEnrollments().length > 0) return true
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
}
