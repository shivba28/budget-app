import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTellerConnect } from 'teller-connect-react'
import type { TellerConnectEnrollment } from 'teller-connect-react'
import { CATEGORIES } from '../constants/categories'
import { MONTHLY_BUDGET_DEFAULTS_BY_CATEGORY } from '../constants/monthlyBudgetDefaults'
import type { Account } from '../lib/domain'
import { ErrorRetry } from '../components/ErrorRetry'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { useRegisterNavScrollRoot } from '@/contexts/NavScrollContext'
import { collectLocalBackup } from '@/lib/cloudBackup/collect'
import { registerPasskeyFlow } from '@/lib/passkeyFlow'
import * as storage from '../lib/storage'
import {
  changePinRequest,
  logoutSync,
  pushBackupToServer,
  startGoogleSignIn,
  webAuthnDeleteCredential,
  webAuthnListCredentials,
  type WebAuthnCredentialRow,
} from '@/lib/syncApi'
import { webAuthnSupported } from '@/lib/webauthnClient'
import { Input } from '@/components/ui/input'
import {
  disconnectEnrollment,
  formatCurrencyAmount,
  getTellerApplicationId,
  handleTellerConnectSuccess,
  loadLinkedAccounts,
  syncAccountsNow,
} from '../lib/api'
import './Page.css'
import './Settings.css'

type FailedOp = 'connect' | 'sync' | 'disconnect' | null

type SettingsTab = 'drive' | 'banks' | 'budgets'

type BudgetFormState = {
  readonly categoryInputs: Record<string, string>
  readonly useCustomTotal: boolean
  readonly totalInput: string
}

type ParsedUsd = 'empty' | 'invalid' | number

function parseUsdBudgetInput(raw: string): ParsedUsd {
  const t = raw.trim().replace(/[$,]/g, '')
  if (t === '') return 'empty'
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0) return 'invalid'
  return Math.round(n * 100) / 100
}

function budgetFormFromStorage(): BudgetFormState {
  const s = storage.getMonthlyBudgetsStored()
  const categoryInputs: Record<string, string> = {}
  for (const c of CATEGORIES) {
    const v = s.categories[c.id]
    categoryInputs[c.id] = v !== undefined ? String(v) : ''
  }
  return {
    categoryInputs,
    useCustomTotal: s.totalMonthly !== null,
    totalInput: s.totalMonthly !== null ? String(s.totalMonthly) : '',
  }
}

type EnrollmentGroup = {
  readonly enrollmentId: string
  readonly institution: string
  readonly accounts: Account[]
}

function institutionLabel(account: Account): string {
  return account.institution?.name ?? 'Unknown institution'
}

function groupAccountsByEnrollment(accounts: Account[]): EnrollmentGroup[] {
  const map = new Map<string, Account[]>()
  for (const a of accounts) {
    const list = map.get(a.enrollmentId)
    if (list) list.push(a)
    else map.set(a.enrollmentId, [a])
  }
  return Array.from(map.entries())
    .map(([enrollmentId, accs]) => ({
      enrollmentId,
      institution: institutionLabel(accs[0]),
      accounts: [...accs].sort((x, y) => x.name.localeCompare(y.name)),
    }))
    .sort((a, b) => a.institution.localeCompare(b.institution))
}

const PIN4 = /^\d{4}$/

export function Settings(): ReactElement {
  const navigate = useNavigate()
  const { email, lastSyncMessage, clearSyncMessage, hasPin, refresh } = useAuth()
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('drive')
  const [accountUiTick, setAccountUiTick] = useState(0)
  const [syncBusy, setSyncBusy] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [curPin, setCurPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [newPin2, setNewPin2] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [passkeys, setPasskeys] = useState<WebAuthnCredentialRow[]>([])
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)
  const [budgetForm, setBudgetForm] = useState<BudgetFormState>(budgetFormFromStorage)
  const [budgetSaveError, setBudgetSaveError] = useState<string | null>(null)

  const [accounts, setAccounts] = useState<Account[]>(() => loadLinkedAccounts())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedOp, setFailedOp] = useState<FailedOp>(null)
  const [failedDisconnectEnrollmentId, setFailedDisconnectEnrollmentId] =
    useState<string | null>(null)

  const settingsScrollRef = useRef<HTMLDivElement | null>(null)
  useRegisterNavScrollRoot(settingsScrollRef)

  const applicationId =
    import.meta.env.VITE_TELLER_APP_ID || getTellerApplicationId()

  useEffect(() => {
    setAccounts(loadLinkedAccounts())
  }, [])

  const loadPasskeys = useCallback(async () => {
    setPasskeyError(null)
    try {
      const rows = await webAuthnListCredentials()
      setPasskeys(rows)
    } catch (e) {
      setPasskeys([])
      setPasskeyError(e instanceof Error ? e.message : 'Could not load passkeys')
    }
  }, [])

  useEffect(() => {
    void loadPasskeys()
  }, [loadPasskeys])

  const refreshAccounts = useCallback(() => {
    setAccounts(loadLinkedAccounts())
  }, [])

  const onSuccess = useCallback(
    async (enrollment: TellerConnectEnrollment) => {
      setBusy(true)
      setError(null)
      setFailedOp(null)
      try {
        await handleTellerConnectSuccess(enrollment)
        refreshAccounts()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to finish linking')
        setFailedOp('connect')
      } finally {
        setBusy(false)
      }
    },
    [refreshAccounts],
  )

  const { open, ready } = useTellerConnect({
    applicationId,
    environment: 'development',
    products: ['transactions'],
    onSuccess,
  })

  const canConnect = applicationId.length > 0

  async function onSyncNow(): Promise<void> {
    setBusy(true)
    setError(null)
    setFailedOp(null)
    setFailedDisconnectEnrollmentId(null)
    try {
      await syncAccountsNow()
      refreshAccounts()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed')
      setFailedOp('sync')
    } finally {
      setBusy(false)
    }
  }

  async function onDisconnectEnrollment(enrollmentId: string): Promise<void> {
    setBusy(true)
    setError(null)
    setFailedOp(null)
    setFailedDisconnectEnrollmentId(null)
    try {
      await disconnectEnrollment(enrollmentId)
      refreshAccounts()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Disconnect failed')
      setFailedOp('disconnect')
      setFailedDisconnectEnrollmentId(enrollmentId)
    } finally {
      setBusy(false)
    }
  }

  function onRetry(): void {
    if (failedOp === 'sync') {
      void onSyncNow()
    } else if (
      failedOp === 'disconnect' &&
      failedDisconnectEnrollmentId !== null
    ) {
      void onDisconnectEnrollment(failedDisconnectEnrollmentId)
    } else {
      setError(null)
      setFailedOp(null)
      setFailedDisconnectEnrollmentId(null)
      open()
    }
  }

  const retryLabel =
    failedOp === 'connect'
      ? 'Try connecting again'
      : failedOp === 'sync'
        ? 'Retry sync'
        : failedOp === 'disconnect'
          ? 'Retry disconnect'
          : 'Try again'

  const hasLinkedAccounts = accounts.length > 0
  const enrollmentGroups = groupAccountsByEnrollment(accounts)

  const excludedIds = useMemo(
    () => storage.getExcludedAccountIds(),
    [accountUiTick, accounts],
  )

  async function onDriveSyncNow(): Promise<void> {
    setAccountError(null)
    setSyncBusy(true)
    try {
      const payload = await collectLocalBackup()
      await pushBackupToServer(payload)
    } catch (e) {
      setAccountError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncBusy(false)
    }
  }

  async function onCloudSignOut(): Promise<void> {
    await logoutSync()
    navigate('/login', { replace: true })
  }

  async function onForgotPinFromSettings(): Promise<void> {
    await logoutSync()
    startGoogleSignIn('pin_reset')
  }

  async function onAddPasskey(): Promise<void> {
    setPasskeyError(null)
    setPasskeyBusy(true)
    try {
      await registerPasskeyFlow('This device')
      await loadPasskeys()
      await refresh()
    } catch (e) {
      setPasskeyError(e instanceof Error ? e.message : 'Could not add passkey')
    } finally {
      setPasskeyBusy(false)
    }
  }

  async function onRemovePasskey(id: string): Promise<void> {
    setPasskeyError(null)
    setPasskeyBusy(true)
    try {
      await webAuthnDeleteCredential(id)
      await loadPasskeys()
      await refresh()
    } catch (e) {
      setPasskeyError(e instanceof Error ? e.message : 'Could not remove passkey')
    } finally {
      setPasskeyBusy(false)
    }
  }

  async function onChangePin(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setAccountError(null)
    if (!PIN4.test(curPin) || !PIN4.test(newPin) || newPin !== newPin2) {
      setAccountError('Use matching 4-digit codes.')
      return
    }
    setPinBusy(true)
    try {
      await changePinRequest(curPin, newPin, newPin2)
      setCurPin('')
      setNewPin('')
      setNewPin2('')
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : 'Could not change code')
    } finally {
      setPinBusy(false)
    }
  }

  function onToggleAccountVisible(accountId: string, includeInReports: boolean): void {
    storage.setAccountExcludedFromReports(accountId, !includeInReports)
    setAccountUiTick((t) => t + 1)
  }

  function onSaveMonthlyBudgets(): void {
    setBudgetSaveError(null)
    const categories: Partial<Record<string, number>> = {}
    for (const c of CATEGORIES) {
      const r = parseUsdBudgetInput(budgetForm.categoryInputs[c.id] ?? '')
      if (r === 'invalid') {
        setBudgetSaveError(`Invalid amount for ${c.label}.`)
        return
      }
      if (r !== 'empty') categories[c.id] = r
    }
    let totalMonthly: number | null = null
    if (budgetForm.useCustomTotal) {
      const r = parseUsdBudgetInput(budgetForm.totalInput)
      if (r === 'empty' || r === 'invalid') {
        setBudgetSaveError(
          'Enter a valid overall monthly budget, or turn off “Set overall monthly cap”.',
        )
        return
      }
      totalMonthly = r
    }
    storage.saveMonthlyBudgets({ v: 1, categories, totalMonthly })
  }

  function onResetMonthlyBudgets(): void {
    setBudgetSaveError(null)
    storage.saveMonthlyBudgets({ v: 1, categories: {}, totalMonthly: null })
    setBudgetForm(budgetFormFromStorage())
  }

  return (
    <main className="page page--fill settings-page settings-scroll-root">
      <div className="settings-view-head">
        <h1 className="page__title">Settings</h1>
      </div>

      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        <button
          type="button"
          role="tab"
          id="settings-tab-drive"
          aria-selected={settingsTab === 'drive'}
          aria-controls="settings-panel-drive"
          className={
            settingsTab === 'drive'
              ? 'settings-tab settings-tab--active'
              : 'settings-tab'
          }
          onClick={() => setSettingsTab('drive')}
        >
          Google Drive &amp; passkeys
        </button>
        <button
          type="button"
          role="tab"
          id="settings-tab-banks"
          aria-selected={settingsTab === 'banks'}
          aria-controls="settings-panel-banks"
          className={
            settingsTab === 'banks'
              ? 'settings-tab settings-tab--active'
              : 'settings-tab'
          }
          onClick={() => setSettingsTab('banks')}
        >
          Bank accounts
        </button>
        <button
          type="button"
          role="tab"
          id="settings-tab-budgets"
          aria-selected={settingsTab === 'budgets'}
          aria-controls="settings-panel-budgets"
          className={
            settingsTab === 'budgets'
              ? 'settings-tab settings-tab--active'
              : 'settings-tab'
          }
          onClick={() => setSettingsTab('budgets')}
        >
          Budgets
        </button>
      </div>

      <div ref={settingsScrollRef} className="settings-scroll">
      {settingsTab === 'drive' ? (
        <section
          id="settings-panel-drive"
          role="tabpanel"
          aria-labelledby="settings-tab-drive"
          className="settings-block settings-panel"
        >
          <h2 className="page__subtitle">Account &amp; Google Drive</h2>
          <Card className="shadow-xs">
            <CardContent className="flex flex-col gap-4 py-4">
              <p className="text-sm text-muted-foreground">
                Signed in as{' '}
                <strong className="text-foreground">{email ?? '—'}</strong>
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Transactions, accounts, categories, monthly budgets, and UI state sync to your
                Drive
                app data folder. Bank link tokens are not uploaded—connect your bank
                again on each device you trust.
              </p>
              {lastSyncMessage ? (
                <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  {lastSyncMessage}{' '}
                  <button
                    type="button"
                    className="text-foreground underline"
                    onClick={clearSyncMessage}
                  >
                    Dismiss
                  </button>
                </p>
              ) : null}
              {accountError ? (
                <p className="text-sm text-destructive">{accountError}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={syncBusy}
                  onClick={() => void onDriveSyncNow()}
                >
                  {syncBusy ? 'Syncing…' : 'Sync now'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void onCloudSignOut()}
                >
                  Sign out
                </Button>
              </div>
              <div className="flex flex-col gap-3 border-t border-border pt-4">
                <p className="text-sm font-medium text-foreground">Passkeys</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Passkeys unlock the app on this account. Removing one does not sign
                  you out of Google.
                </p>
                {passkeyError ? (
                  <p className="text-sm text-destructive">{passkeyError}</p>
                ) : null}
                {passkeys.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No passkeys yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {passkeys.map((p) => (
                      <li
                        key={p.credentialId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                      >
                        <span>
                          <span className="font-medium text-foreground">
                            {p.device || 'Passkey'}
                          </span>
                          {p.lastUsedAt ? (
                            <span className="block text-xs text-muted-foreground">
                              Last used {new Date(p.lastUsedAt).toLocaleString()}
                            </span>
                          ) : null}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={passkeyBusy}
                          onClick={() => void onRemovePasskey(p.credentialId)}
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {webAuthnSupported() ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={passkeyBusy}
                    onClick={() => void onAddPasskey()}
                  >
                    {passkeyBusy ? 'Working…' : 'Add passkey'}
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    This browser does not support registering passkeys.
                  </p>
                )}
              </div>
              {hasPin ? (
                <form
                  className="flex flex-col gap-3 border-t border-border pt-4"
                  onSubmit={(e) => void onChangePin(e)}
                >
                  <p className="text-sm font-medium text-foreground">Change app code</p>
                  <Input
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="Current code"
                    className="tracking-widest"
                    value={curPin}
                    onChange={(e) =>
                      setCurPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                    }
                  />
                  <Input
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="New code"
                    className="tracking-widest"
                    value={newPin}
                    onChange={(e) =>
                      setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                    }
                  />
                  <Input
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="Confirm new code"
                    className="tracking-widest"
                    value={newPin2}
                    onChange={(e) =>
                      setNewPin2(e.target.value.replace(/\D/g, '').slice(0, 4))
                    }
                  />
                  <Button type="submit" disabled={pinBusy}>
                    {pinBusy ? 'Saving…' : 'Update code'}
                  </Button>
                </form>
              ) : null}
              {hasPin ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => void onForgotPinFromSettings()}
                >
                  Forgot code — reset with Google
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </section>
      ) : settingsTab === 'banks' ? (
        <section
          id="settings-panel-banks"
          role="tabpanel"
          aria-labelledby="settings-tab-banks"
          className="settings-bank-panel settings-panel"
        >
          <h2 className="page__subtitle">Bank accounts</h2>

          {error !== null ? (
            <ErrorRetry
              message={error}
              onRetry={onRetry}
              retryLabel={retryLabel}
            />
          ) : null}

          {!canConnect ? (
            <p className="page__muted">
              Set <code className="inline-code">VITE_TELLER_APP_ID</code> in{' '}
              <code className="inline-code">.env</code> (see{' '}
              <code className="inline-code">.env.example</code>).
            </p>
          ) : null}

          {hasLinkedAccounts ? (
            <>
              <ul className="settings-bank-list">
                {enrollmentGroups.map((group) => (
                  <li key={group.enrollmentId}>
                    <Card className="settings-bank-card gap-0 px-4 py-4 shadow-xs">
                      <div className="settings-bank-card__row settings-bank-card__row--header">
                        <div className="settings-bank-card__body">
                          <p className="settings-connected__label">Bank</p>
                          <p className="settings-connected__value">
                            {group.institution}
                          </p>
                        </div>
                        <div className="settings-bank-card__actions">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => void onSyncNow()}
                          >
                            Sync now
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={busy}
                            onClick={() =>
                              void onDisconnectEnrollment(group.enrollmentId)
                            }
                          >
                            Disconnect
                          </Button>
                        </div>
                      </div>
                      <p className="settings-accounts-hint text-xs text-muted-foreground mt-3 mb-2">
                        Checked accounts appear on Transactions and Insights.
                      </p>
                      <ul className="settings-account-list">
                        {group.accounts.map((acc, index) => (
                          <li key={acc.id}>
                            {index > 0 ? (
                              <hr
                                className="settings-bank-card__divider"
                                aria-hidden
                              />
                            ) : null}
                            <label className="settings-account-include">
                              <input
                                type="checkbox"
                                className="settings-account-include__input"
                                checked={!excludedIds.has(acc.id)}
                                onChange={(e) =>
                                  onToggleAccountVisible(acc.id, e.target.checked)
                                }
                              />
                              <span className="settings-account-include__body">
                                <span className="settings-connected__label">
                                  Account
                                </span>
                                <span className="settings-connected__value">
                                  {acc.name}
                                </span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  </li>
                ))}
              </ul>
              <div className="settings-bank-tab__cta">
                <Button
                  type="button"
                  disabled={!ready || !canConnect || busy}
                  onClick={() => open()}
                >
                  Connect additional bank
                </Button>
              </div>
            </>
          ) : (
            <div className="settings-bank-tab__empty">
              <Card className="border-dashed shadow-none" role="status">
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  No bank linked yet. Connect to pull accounts and transactions.
                </CardContent>
              </Card>
              <div className="settings-bank-tab__cta settings-bank-tab__cta--solo">
                <Button
                  type="button"
                  disabled={!ready || !canConnect || busy}
                  onClick={() => open()}
                >
                  Connect bank
                </Button>
              </div>
            </div>
          )}
        </section>
      ) : (
        <section
          id="settings-panel-budgets"
          role="tabpanel"
          aria-labelledby="settings-tab-budgets"
          className="settings-block settings-panel"
        >
          <h2 className="page__subtitle">Monthly budgets</h2>
          <p className="text-sm text-muted-foreground mb-4 max-w-xl">
            These caps drive the Budget health section on Insights. Leave a category blank to
            use the built-in default. Sync saves this with your other app data in Google Drive.
          </p>
          <Card className="shadow-xs">
            <CardContent className="flex flex-col gap-4 py-4">
              {budgetSaveError ? (
                <p className="text-sm text-destructive">{budgetSaveError}</p>
              ) : null}
              <ul className="flex flex-col gap-3">
                {CATEGORIES.map((c) => (
                  <li key={c.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                    <label
                      htmlFor={`budget-cat-${c.id}`}
                      className="text-sm font-medium text-foreground shrink-0 sm:w-40"
                    >
                      {c.label}
                    </label>
                    <Input
                      id={`budget-cat-${c.id}`}
                      inputMode="decimal"
                      className="sm:max-w-xs"
                      placeholder={`Default ${formatCurrencyAmount(
                        MONTHLY_BUDGET_DEFAULTS_BY_CATEGORY[c.id] ??
                          MONTHLY_BUDGET_DEFAULTS_BY_CATEGORY.other,
                      )}`}
                      value={budgetForm.categoryInputs[c.id] ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        setBudgetForm((f) => ({
                          ...f,
                          categoryInputs: { ...f.categoryInputs, [c.id]: v },
                        }))
                      }}
                    />
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-3 border-t border-border pt-4">
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={budgetForm.useCustomTotal}
                    onChange={(e) =>
                      setBudgetForm((f) => ({ ...f, useCustomTotal: e.target.checked }))
                    }
                  />
                  <span>
                    Set overall monthly cap (instead of the sum of the category budgets above)
                  </span>
                </label>
                <Input
                  inputMode="decimal"
                  className="max-w-xs"
                  disabled={!budgetForm.useCustomTotal}
                  placeholder="e.g. 4500"
                  value={budgetForm.totalInput}
                  onChange={(e) =>
                    setBudgetForm((f) => ({ ...f, totalInput: e.target.value }))
                  }
                  aria-label="Overall monthly budget cap"
                />
              </div>
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <Button type="button" variant="secondary" onClick={onSaveMonthlyBudgets}>
                  Save budgets
                </Button>
                <Button type="button" variant="outline" onClick={onResetMonthlyBudgets}>
                  Reset to defaults
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      )}
      </div>
    </main>
  )
}
