import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { listCategoriesForTransactionFilters } from '@/lib/categoryCanonical'
import { ErrorRetry } from '../components/ErrorRetry'
import {
  filterTransactionsByVisibleAccounts,
  formatCurrencyAmount,
  formatTransactionAccountLabel,
  getCategoryLabel,
  getCategoryPillColor,
  isDeferredOutOfViewMonth,
  isBankTransactionSyncInFlight,
  loadTransactionsFromCacheOrFetch,
  refreshTransactionsFromBackend,
  resolveCanonicalDisplayCategory,
  resolveMyShare,
  tripsMapFromList,
  type Transaction,
} from '../lib/api'
import {
  formatMonthHeading,
  groupTransactionsByMonth,
  type DatePreset,
  transactionMatchesDatePreset,
} from '../lib/transactionGrouping'
import * as storage from '../lib/storage'
import { TransactionAllocateSheet } from '@/components/TransactionAllocateSheet'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useRegisterNavScrollRoot } from '@/contexts/NavScrollContext'
import { cn } from '@/lib/utils'
import './Page.css'
import './Transactions.css'

function TransactionsSkeleton({ label }: { readonly label?: string }): ReactElement {
  return (
    <div className="py-6" role="status" aria-live="polite">
      {label ? (
        <p className="mb-4 text-center text-sm font-medium text-foreground">
          {label}
        </p>
      ) : null}
      <div className="animate-pulse space-y-3">
        <div className="h-10 rounded-xl border border-border bg-muted/30" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            className="rounded-xl border border-border bg-background px-4 py-3 shadow-xs"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3 w-24 rounded bg-muted/60" />
                <div className="h-4 w-3/4 rounded bg-muted" />
              </div>
              <div className="h-4 w-20 rounded bg-muted/70" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Muted left accent for table rows (matches static budget-tracker.html). */
function categoryAccentRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return `rgba(0,0,0,${alpha})`
  const r = Number.parseInt(m[1], 16)
  const g = Number.parseInt(m[2], 16)
  const b = Number.parseInt(m[3], 16)
  return `rgba(${r},${g},${b},${alpha})`
}

type DirectionFilter = 'all' | 'debit' | 'credit'

type FailedOp = 'initial' | 'sync' | null

function txRowKey(tx: Transaction): string {
  return `${tx.accountId}:${tx.id}`
}

type VisibleRow =
  | {
      type: 'month'
      monthKey: string
      label: string
      count: number
      expanded: boolean
    }
  | { type: 'tx'; monthKey: string; tx: Transaction }

/** Stable virtual keys so TanStack Virtual does not reuse wrong heights when rows are inserted/removed. */
function virtualItemKeyForRow(row: VisibleRow): string {
  if (row.type === 'month') return `m:${row.monthKey}`
  return `t:${txRowKey(row.tx)}`
}

function IconChevron({ expanded }: { readonly expanded: boolean }): ReactElement {
  return (
    <svg
      className={
        expanded
          ? 'tx-acc__chevron tx-acc__chevron--open'
          : 'tx-acc__chevron'
      }
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'all', label: 'All dates' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'last_90', label: 'Last 90 days' },
  { id: 'ytd', label: 'Year to date' },
  { id: 'custom', label: 'Custom range' },
]

export function Transactions(): ReactElement {
  const navigate = useNavigate()
  const [accountsTick, setAccountsTick] = useState(0)
  const [rows, setRows] = useState<Transaction[]>(
    () => storage.getTransactions() ?? [],
  )
  const [bootstrapLoading, setBootstrapLoading] = useState(
    () => storage.getTransactions() === null,
  )
  const [error, setError] = useState<string | null>(null)
  const [failedOp, setFailedOp] = useState<FailedOp>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all')
  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncHint, setSyncHint] = useState<'full' | 'refresh' | null>(null)
  const [syncProgress, setSyncProgress] = useState<{
    done: number
    total: number
    phase:
      | 'rehydrate'
      | 'accounts'
      | 'account_transactions'
      | 'server_merge'
      | 'finalize'
    accountName?: string
  } | null>(null)
  const [expandedMonthKeys, setExpandedMonthKeys] = useState<Set<string>>(
    () => new Set(),
  )
  const [categoryOverrides, setCategoryOverrides] = useState<
    Record<string, string>
  >(() => storage.getCategoryOverrides())
  const [exclusionRev, setExclusionRev] = useState(0)
  const [tripsRev, setTripsRev] = useState(0)
  const [sheetTx, setSheetTx] = useState<Transaction | null>(null)
  const [sheetPanel, setSheetPanel] = useState<'menu' | 'defer' | 'trip' | 'category'>('menu')

  const scrollRef = useRef<HTMLDivElement>(null)
  useRegisterNavScrollRoot(scrollRef)

  const doInitialLoad = useCallback(async () => {
    const hadCache = storage.getTransactions() !== null
    if (!hadCache) setBootstrapLoading(true)
    setError(null)
    setFailedOp(null)
    try {
      const data = await loadTransactionsFromCacheOrFetch({
        throwOnFailure: true,
      })
      setRows(data)
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not load transactions.',
      )
      setFailedOp('initial')
    } finally {
      setBootstrapLoading(false)
    }
  }, [])

  useEffect(() => {
    void doInitialLoad()
  }, [doInitialLoad])

  useEffect(() => {
    const on = (): void => setAccountsTick((n) => n + 1)
    window.addEventListener(storage.ACCOUNTS_CHANGED_EVENT, on)
    return () => window.removeEventListener(storage.ACCOUNTS_CHANGED_EVENT, on)
  }, [])

  useEffect(() => {
    const onStart = (): void => setSyncing(true)
    const onEnd = (): void => setSyncing(false)
    window.addEventListener(storage.BANK_SYNC_STARTED_EVENT, onStart)
    window.addEventListener(storage.BANK_SYNC_ENDED_EVENT, onEnd)
    return () => {
      window.removeEventListener(storage.BANK_SYNC_STARTED_EVENT, onStart)
      window.removeEventListener(storage.BANK_SYNC_ENDED_EVENT, onEnd)
    }
  }, [])

  /** Sync may have started on the unlock screen; join in-flight run for progress + row updates. */
  useEffect(() => {
    if (!isBankTransactionSyncInFlight()) return
    setSyncing(true)
    setSyncHint(storage.getLastBankSyncAt() === null ? 'full' : 'refresh')
    void refreshTransactionsFromBackend({
      throwOnFailure: false,
      onProgress: (p) => {
        setSyncProgress({
          done: p.done,
          total: p.total,
          phase: p.phase,
          accountName: p.accountName,
        })
      },
    })
      .then(() => {
        setRows(storage.getTransactions() ?? [])
        setCategoryOverrides({ ...storage.getCategoryOverrides() })
      })
      .catch(() => {
        /* same as background sync: keep cache */
      })
  }, [])

  useEffect(() => {
    const on = (): void => {
      setExclusionRev((n) => n + 1)
    }
    window.addEventListener(storage.ACCOUNTS_EXCLUSIONS_CHANGED_EVENT, on)
    return () =>
      window.removeEventListener(storage.ACCOUNTS_EXCLUSIONS_CHANGED_EVENT, on)
  }, [])

  useEffect(() => {
    const on = (): void => setTripsRev((n) => n + 1)
    window.addEventListener(storage.TRIPS_CHANGED_EVENT, on)
    return () =>
      window.removeEventListener(storage.TRIPS_CHANGED_EVENT, on)
  }, [])

  useEffect(() => {
    const on = (): void => {
      setRows(storage.getTransactions() ?? [])
      setCategoryOverrides({ ...storage.getCategoryOverrides() })
    }
    window.addEventListener(storage.BANK_SYNC_COMPLETED_EVENT, on)
    return () =>
      window.removeEventListener(storage.BANK_SYNC_COMPLETED_EVENT, on)
  }, [])

  // Category changes happen in the bottom sheet now.

  const doSync = useCallback(async () => {
    setSyncing(true)
    setSyncHint(storage.getLastBankSyncAt() === null ? 'full' : 'refresh')
    setSyncProgress({ done: 0, total: 1, phase: 'rehydrate' })
    setError(null)
    setFailedOp(null)
    try {
      const next = await refreshTransactionsFromBackend({
        throwOnFailure: true,
        onProgress: (p) => {
          setSyncProgress({
            done: p.done,
            total: p.total,
            phase: p.phase,
            accountName: p.accountName,
          })
        },
      })
      setRows(next)
      setCategoryOverrides({ ...storage.getCategoryOverrides() })
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not sync from the bank.',
      )
      setFailedOp('sync')
    } finally {
      setSyncing(false)
      setSyncHint(null)
      setSyncProgress(null)
    }
  }, [])

  function onRetry(): void {
    if (failedOp === 'sync') {
      void doSync()
    } else {
      void doInitialLoad()
    }
  }

  const filtersActive = useMemo(
    () =>
      searchQuery.trim() !== '' ||
      categoryFilter !== 'all' ||
      directionFilter !== 'all' ||
      datePreset !== 'all',
    [searchQuery, categoryFilter, directionFilter, datePreset],
  )

  const hasLinkedBanks = useMemo(() => {
    void accountsTick
    return (storage.getAccounts() ?? []).length > 0
  }, [accountsTick])

  /** Pending charges are kept in cache but omitted from this page until they post. */
  const rowsForTable = useMemo(
    () => rows.filter((tx) => tx.pending !== true),
    [rows],
  )

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const accounts = storage.getAccounts() ?? []
    const visible = filterTransactionsByVisibleAccounts(rowsForTable)
    return visible.filter((tx) => {
      if (
        !transactionMatchesDatePreset(
          tx,
          datePreset,
          customDateFrom,
          customDateTo,
        )
      ) {
        return false
      }
      if (q) {
        const inDesc = tx.description.toLowerCase().includes(q)
        const acctLabel = formatTransactionAccountLabel(
          tx.accountId,
          accounts,
        ).toLowerCase()
        const inAcct = acctLabel.includes(q)
        if (!inDesc && !inAcct) return false
      }
      const effective = resolveCanonicalDisplayCategory(tx, categoryOverrides)
      if (categoryFilter !== 'all' && effective !== categoryFilter) return false
      if (directionFilter === 'debit' && tx.amount <= 0) return false
      if (directionFilter === 'credit' && tx.amount >= 0) return false
      return true
    })
  }, [
    rowsForTable,
    searchQuery,
    categoryFilter,
    directionFilter,
    categoryOverrides,
    datePreset,
    customDateFrom,
    customDateTo,
    exclusionRev,
    accountsTick,
  ])

  const monthGroups = useMemo(
    () => groupTransactionsByMonth(filteredRows),
    [filteredRows],
  )

  const monthKeysSig = useMemo(
    () => monthGroups.map((g) => g.monthKey).join('|'),
    [monthGroups],
  )

  const latestMonthKey = monthGroups[0]?.monthKey ?? null

  useEffect(() => {
    if (latestMonthKey === null) {
      setExpandedMonthKeys(new Set())
      return
    }
    setExpandedMonthKeys(new Set([latestMonthKey]))
  }, [latestMonthKey, monthKeysSig])

  const visibleRows = useMemo((): VisibleRow[] => {
    const out: VisibleRow[] = []
    for (const g of monthGroups) {
      const expanded = expandedMonthKeys.has(g.monthKey)
      out.push({
        type: 'month',
        monthKey: g.monthKey,
        label: formatMonthHeading(g.monthKey),
        count: g.transactions.length,
        expanded,
      })
      if (expanded) {
        for (const tx of g.transactions) {
          out.push({ type: 'tx', monthKey: g.monthKey, tx })
        }
      }
    }
    return out
  }, [monthGroups, expandedMonthKeys])

  const rowVirtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (visibleRows[index]?.type === 'month' ? 52 : 62),
    getItemKey: (index) => {
      const row = visibleRows[index]
      return row ? virtualItemKeyForRow(row) : index
    },
    overscan: 10,
    measureElement:
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      !navigator.userAgent.includes('Firefox')
        ? (el) => el.getBoundingClientRect().height
        : undefined,
  })

  const accountsForTable = storage.getAccounts() ?? []

  const tripsById = useMemo(
    () => tripsMapFromList(storage.getTrips()),
    [tripsRev],
  )

  const showDeferredChrome = datePreset === 'this_month'
  const viewNow = new Date()
  const viewYear = viewNow.getFullYear()
  const viewMonth = viewNow.getMonth() + 1

  function openTxSheet(tx: Transaction, panel: 'menu' | 'defer' | 'trip' | 'category' = 'menu'): void {
    setSheetPanel(panel)
    setSheetTx(tx)
  }

  function toggleMonth(monthKey: string): void {
    setExpandedMonthKeys((prev) => {
      const next = new Set(prev)
      if (next.has(monthKey)) next.delete(monthKey)
      else next.add(monthKey)
      return next
    })
  }

  function amountClass(tellerAmount: number): string {
    if (tellerAmount > 0) return 'tx-table__amount tx-amount-debit'
    if (tellerAmount < 0) return 'tx-table__amount tx-amount-credit'
    return 'tx-table__amount'
  }

  function displayAmount(tellerAmount: number): number {
    if (tellerAmount > 0) return -tellerAmount
    if (tellerAmount < 0) return Math.abs(tellerAmount)
    return 0
  }

  const showInitialError =
    error !== null && failedOp === 'initial' && rows.length === 0

  return (
    <main className="page page--fill page--transactions tx-page">
      <div className="tx-sticky">
        <div className="tx-screen-head">
          <h1 className="page__title">Transactions</h1>
          <div className="tx-screen-head__trailing">
            {hasLinkedBanks ? (
              <Button
                type="button"
                className="tx-sync-btn"
                size="sm"
                disabled={syncing}
                onClick={() => void doSync()}
              >
                {syncing ? 'Syncing…' : 'Sync'}
              </Button>
            ) : (
              <Button
                type="button"
                className="tx-sync-btn"
                size="sm"
                onClick={() =>
                  navigate('/app/settings', {
                    state: { openSettingsTab: 'banks' },
                  })
                }
              >
                Add bank
              </Button>
            )}
          </div>
        </div>
        {syncing ? (
          <p className="tx-sync-status" role="status">
            {syncProgress?.phase === 'server_merge'
              ? 'Merging transactions…'
              : syncProgress?.phase === 'finalize'
                ? 'Finalizing…'
                : syncHint === 'full'
                  ? 'Performing a sync...'
                  : 'Syncing latest transactions…'}{' '}
            {syncProgress && syncProgress.total > 0 ? (
              <span className="tx-sync-status__detail">
                {syncProgress.phase === 'account_transactions' &&
                syncProgress.accountName
                  ? `(${Math.min(syncProgress.total, syncProgress.done + 1)} of ${syncProgress.total} • ${syncProgress.accountName})`
                  : `(${Math.min(syncProgress.total, syncProgress.done)} of ${syncProgress.total})`}
              </span>
            ) : null}
          </p>
        ) : null}
        {syncing && syncProgress ? (
          <div
            className="tx-sync-progress"
            role="progressbar"
            aria-label="Bank sync progress"
            aria-valuemin={0}
            aria-valuemax={syncProgress.total}
            aria-valuenow={Math.min(syncProgress.total, syncProgress.done)}
          >
            <div
              className="tx-sync-progress__bar"
              style={{
                width: `${Math.max(
                  6,
                  Math.min(
                    100,
                    (Math.min(syncProgress.total, syncProgress.done) /
                      Math.max(1, syncProgress.total)) *
                      100,
                  ),
                )}%`,
              }}
            />
          </div>
        ) : null}

        <div className="tx-toolbar">
          <div className="tx-toolbar__search-row">
            <label className="tx-toolbar__field tx-toolbar__field--search">
              <span className="tx-toolbar__label">Search</span>
              <Input
                type="search"
                className="tx-toolbar__input h-9 border-border bg-background"
                placeholder="Filter by description…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoComplete="off"
              />
            </label>
            <button
              type="button"
              className="tx-toolbar__advanced-toggle"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              <span className="tx-toolbar__advanced-label">Advanced</span>
              <svg
                className={advancedOpen ? 'tx-toolbar__chev tx-toolbar__chev--open' : 'tx-toolbar__chev'}
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>

          <div
            className={
              advancedOpen
                ? 'tx-toolbar__advanced tx-toolbar__advanced--open'
                : 'tx-toolbar__advanced'
            }
            aria-hidden={!advancedOpen}
          >
            <div className="tx-toolbar__advanced-inner">
              <label className="tx-toolbar__field">
                <span className="tx-toolbar__label">Date range</span>
                <select
                  className="tx-toolbar__select"
                  value={datePreset}
                  onChange={(e) => setDatePreset(e.target.value as DatePreset)}
                >
                  {DATE_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              {datePreset === 'custom' ? (
                <div className="tx-toolbar__dates-custom">
                  <label className="tx-toolbar__field tx-toolbar__field--narrow">
                    <span className="tx-toolbar__label">From</span>
                    <Input
                      type="date"
                      className="tx-toolbar__input h-9 border-border bg-background"
                      value={customDateFrom}
                      onChange={(e) => setCustomDateFrom(e.target.value)}
                    />
                  </label>
                  <label className="tx-toolbar__field tx-toolbar__field--narrow">
                    <span className="tx-toolbar__label">To</span>
                    <Input
                      type="date"
                      className="tx-toolbar__input h-9 border-border bg-background"
                      value={customDateTo}
                      onChange={(e) => setCustomDateTo(e.target.value)}
                    />
                  </label>
                </div>
              ) : null}
              <label className="tx-toolbar__field">
                <span className="tx-toolbar__label">Category</span>
                <select
                  className="tx-toolbar__select"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="all">All categories</option>
                  {listCategoriesForTransactionFilters().map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="tx-toolbar__fieldset">
                <legend className="tx-toolbar__label mb-2">Cash flow</legend>
                <div
                  className="tx-toggle-group tx-toggle-group--spaced"
                  role="group"
                  aria-label="Filter: outflows shown as negative amounts, inflows as positive with no plus sign"
                >
                  {(
                    [
                      ['all', 'All'],
                      ['debit', 'Out'],
                      ['credit', 'In'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={
                        directionFilter === value
                          ? 'tx-toggle tx-toggle--active'
                          : 'tx-toggle'
                      }
                      onClick={() => setDirectionFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="tx-scroll">
        {bootstrapLoading && rows.length === 0 ? <TransactionsSkeleton /> : null}

        {syncing ? <TransactionsSkeleton /> : null}

        {showInitialError ? (
          <div className="tx-screen-head tx-screen-head--embedded">
            <ErrorRetry message={error} onRetry={onRetry} />
          </div>
        ) : null}

        {error !== null && failedOp === 'sync' ? (
          <div className="tx-sync-error">
            <ErrorRetry message={error} onRetry={onRetry} />
          </div>
        ) : null}

        {!filtersActive && rowsForTable.length === 0 && !bootstrapLoading ? (
          <Card className="border-dashed shadow-none" role="status">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              {hasLinkedBanks ? (
                <>
                  No transactions yet. Tap{' '}
                  <strong className="text-foreground">Sync</strong> to pull
                  activity.
                </>
              ) : (
                <>
                  No transactions yet. Use{' '}
                  <strong className="text-foreground">Add bank</strong> above to
                  link an institution; after that, use{' '}
                  <strong className="text-foreground">Sync</strong> to pull
                  activity.
                </>
              )}
            </CardContent>
          </Card>
        ) : null}

        {filtersActive && filteredRows.length === 0 && !bootstrapLoading ? (
          <Card className="border-dashed shadow-none" role="status">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No transactions match your filters. Try clearing search or filters.
            </CardContent>
          </Card>
        ) : null}

        {filteredRows.length > 0 && !bootstrapLoading && !syncing ? (
          <div className="tx-accordion-wrap">
            <p className="tx-accordion-hint">
              Tap a transaction for allocation and details.
            </p>
            <div
              className="tx-virtual-anchor"
              style={{ height: rowVirtualizer.getTotalSize() }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = visibleRows[virtualRow.index]
                if (!row) return null
                if (row.type === 'month') {
                  return (
                    <div
                      key={`m-${row.monthKey}`}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      className="tx-virtual-row tx-virtual-row--month"
                      style={{
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <button
                        type="button"
                        className="tx-month-header"
                        aria-expanded={row.expanded}
                        onClick={() => toggleMonth(row.monthKey)}
                      >
                        <IconChevron expanded={row.expanded} />
                        <span className="tx-month-header__title">
                          {row.label}
                        </span>
                        <span className="tx-month-header__count">
                          {row.count}{' '}
                          {row.count === 1 ? 'transaction' : 'transactions'}
                        </span>
                      </button>
                    </div>
                  )
                }

                const tx = row.tx
                const rowKey = txRowKey(tx)
                const effectiveId = resolveCanonicalDisplayCategory(
                  tx,
                  categoryOverrides,
                )
                const pillColor = getCategoryPillColor(effectiveId)
                const deferred =
                  showDeferredChrome &&
                  isDeferredOutOfViewMonth(tx, tripsById, viewYear, viewMonth)

                return (
                  <div
                    key={`t-${rowKey}`}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    className="tx-virtual-row tx-virtual-row--tx"
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className="tx-acc__virtual-item">
                      <button
                        type="button"
                        className={cn(
                          'tx-acc__item w-full text-left',
                          deferred && 'tx-acc__item--deferred',
                        )}
                        style={{
                          boxShadow: `inset 3px 0 0 ${categoryAccentRgba(pillColor, 0.35)}`,
                        }}
                        onClick={() => openTxSheet(tx, 'menu')}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                            {tx.description}
                          </span>
                          <span className="max-w-[44%] shrink-0 truncate text-xs text-muted-foreground">
                            {formatTransactionAccountLabel(tx.accountId, accountsForTable)}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <div className="min-w-0 flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="shrink-0">{tx.date}</span>
                            <span
                              className="category-pill max-w-[9.5rem] truncate"
                              style={{ backgroundColor: pillColor }}
                              title={getCategoryLabel(effectiveId)}
                            >
                              {getCategoryLabel(effectiveId)}
                            </span>
                            {tx.myShare != null ? (
                              <span className="shrink-0">
                                · My share {formatCurrencyAmount(resolveMyShare(tx))}
                              </span>
                            ) : null}
                          </div>
                          <span
                            className={cn(
                              amountClass(tx.amount),
                              deferred && 'tx-acc__amount--deferred',
                            )}
                          >
                            {formatCurrencyAmount(displayAmount(tx.amount))}
                          </span>
                        </div>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>

      <TransactionAllocateSheet
        tx={sheetTx}
        open={sheetTx !== null}
        initialPanel={sheetPanel}
        onClose={() => setSheetTx(null)}
        onApplied={() => {
          setRows(storage.getTransactions() ?? [])
          setCategoryOverrides({ ...storage.getCategoryOverrides() })
        }}
      />
    </main>
  )
}
