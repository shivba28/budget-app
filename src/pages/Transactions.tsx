import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Calendar, Plane } from 'lucide-react'
import { CATEGORIES } from '../constants/categories'
import { ErrorRetry } from '../components/ErrorRetry'
import { LoadingSpinner } from '../components/LoadingSpinner'
import {
  filterTransactionsByVisibleAccounts,
  formatCurrencyAmount,
  formatTransactionAccountLabel,
  getCategoryLabel,
  getCategoryPillColor,
  isDeferredOutOfViewMonth,
  loadTransactionsFromCacheOrFetch,
  persistCategoryOverride,
  refreshTransactionsFromBackend,
  resolveDisplayCategory,
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
  | { type: 'tx'; tx: Transaction }

/** Stable virtual keys so TanStack Virtual does not reuse wrong heights when rows are inserted/removed. */
function virtualItemKeyForRow(row: VisibleRow): string {
  if (row.type === 'month') return `m:${row.monthKey}`
  return `t:${txRowKey(row.tx)}`
}

function formatShortCalendarDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`)
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(d)
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
  const [openPickerKey, setOpenPickerKey] = useState<string | null>(null)
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    () => new Set(),
  )
  const [expandedMonthKeys, setExpandedMonthKeys] = useState<Set<string>>(
    () => new Set(),
  )
  const [categoryOverrides, setCategoryOverrides] = useState<
    Record<string, string>
  >(() => storage.getCategoryOverrides())
  const [exclusionRev, setExclusionRev] = useState(0)
  const [tripsRev, setTripsRev] = useState(0)
  const [sheetTx, setSheetTx] = useState<Transaction | null>(null)
  const [sheetPanel, setSheetPanel] = useState<'menu' | 'defer' | 'trip'>('menu')

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

  useEffect(() => {
    if (openPickerKey === null) return
    function onDocMouseDown(e: MouseEvent): void {
      const t = e.target as HTMLElement
      if (t.closest('.tx-cat-cell')) return
      setOpenPickerKey(null)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [openPickerKey])

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

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const accounts = storage.getAccounts() ?? []
    const visible = filterTransactionsByVisibleAccounts(rows)
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
      const effective = resolveDisplayCategory(tx, categoryOverrides)
      if (categoryFilter !== 'all' && effective !== categoryFilter) return false
      if (directionFilter === 'debit' && tx.amount <= 0) return false
      if (directionFilter === 'credit' && tx.amount >= 0) return false
      return true
    })
  }, [
    rows,
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
          out.push({ type: 'tx', tx })
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

  function pickCategory(txId: string, categoryId: string): void {
    persistCategoryOverride(txId, categoryId)
    setCategoryOverrides({ ...storage.getCategoryOverrides() })
    setOpenPickerKey(null)
  }

  function toggleExpanded(key: string): void {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
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
          <label className="tx-toolbar__field">
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
          <label className="tx-toolbar__field">
            <span className="tx-toolbar__label">Date range</span>
            <select
              className="tx-toolbar__select"
              value={datePreset}
              onChange={(e) =>
                setDatePreset(e.target.value as DatePreset)
              }
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
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="tx-toolbar__fieldset">
            <legend className="tx-toolbar__label">Cash flow</legend>
            <div
              className="tx-toggle-group"
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

      <div ref={scrollRef} className="tx-scroll">
        {bootstrapLoading && rows.length === 0 ? (
          <LoadingSpinner label="Loading transactions…" />
        ) : null}

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

        {!filtersActive && rows.length === 0 && !bootstrapLoading ? (
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

        {filteredRows.length > 0 && !bootstrapLoading ? (
          <div className="tx-accordion-wrap">
            <p className="tx-accordion-hint">
              Expand a row for account, category, and allocation.
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
                const domSafeId = rowKey.replace(/[^a-zA-Z0-9_-]/g, '_')
                const expanded = expandedKeys.has(rowKey)
                const panelId = `tx-panel-${domSafeId}`
                const triggerId = `tx-trigger-${domSafeId}`
                const effectiveId = resolveDisplayCategory(
                  tx,
                  categoryOverrides,
                )
                const pillColor = getCategoryPillColor(effectiveId)
                const pickerOpen = openPickerKey === rowKey
                const deferred =
                  showDeferredChrome &&
                  isDeferredOutOfViewMonth(tx, tripsById, viewYear, viewMonth)
                const trip = tx.tripId != null ? tripsById.get(tx.tripId) : undefined
                let allocChip: ReactElement | null = null
                if (trip) {
                  const tn =
                    trip.name.length > 16
                      ? `${trip.name.slice(0, 15)}…`
                      : trip.name
                  allocChip = (
                    <span className="tx-alloc-chip tx-alloc-chip--trip" title={trip.name}>
                      <span aria-hidden>✈</span> {tn}
                    </span>
                  )
                } else if (
                  typeof tx.effectiveDate === 'string' &&
                  tx.effectiveDate.length >= 10
                ) {
                  allocChip = (
                    <span className="tx-alloc-chip tx-alloc-chip--defer">
                      → {formatShortCalendarDay(tx.effectiveDate)}
                    </span>
                  )
                }

                return (
                  <div
                    key={`t-${rowKey}`}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    className={
                      pickerOpen
                        ? 'tx-virtual-row tx-virtual-row--tx tx-virtual-row--picker-open'
                        : 'tx-virtual-row tx-virtual-row--tx'
                    }
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className="tx-acc__virtual-item">
                      <div
                        role="listitem"
                        className={cn(
                          pickerOpen
                            ? 'tx-acc__item tx-acc__item--picker-open'
                            : 'tx-acc__item',
                          deferred && 'tx-acc__item--deferred',
                        )}
                        style={{
                          boxShadow: `inset 3px 0 0 ${categoryAccentRgba(pillColor, 0.35)}`,
                        }}
                      >
                        <div className="tx-acc__header-row">
                          <button
                            type="button"
                            className="tx-acc__chevron-hit"
                            aria-expanded={expanded}
                            aria-controls={panelId}
                            id={triggerId}
                            onClick={() => toggleExpanded(rowKey)}
                          >
                            <IconChevron expanded={expanded} />
                          </button>
                          <button
                            type="button"
                            className="tx-acc__main"
                            onClick={() => toggleExpanded(rowKey)}
                          >
                            <span className="tx-acc__date">{tx.date}</span>
                            <span className="tx-acc__desc">{tx.description}</span>
                            <span
                              className={cn(
                                amountClass(tx.amount),
                                deferred && 'tx-acc__amount--deferred',
                              )}
                            >
                              {formatCurrencyAmount(displayAmount(tx.amount))}
                            </span>
                            {allocChip ? (
                              <span className="tx-acc__meta-row">{allocChip}</span>
                            ) : null}
                          </button>
                        </div>
                        <div
                          className={
                            expanded
                              ? 'tx-acc__panel-outer tx-acc__panel-outer--open'
                              : 'tx-acc__panel-outer'
                          }
                          id={panelId}
                          role="region"
                          aria-labelledby={triggerId}
                          aria-hidden={!expanded}
                          inert={!expanded}
                        >
                          <div className="tx-acc__panel-inner">
                            <div className="tx-acc__panel">
                              <div className="tx-acc__row">
                                <span className="tx-acc__label">Account</span>
                                <span className="tx-acc__value">
                                  {formatTransactionAccountLabel(
                                    tx.accountId,
                                    accountsForTable,
                                  )}
                                </span>
                              </div>
                              <div className="tx-acc__row tx-acc__row--category">
                                <span className="tx-acc__label">Category</span>
                                <div className="tx-cat-cell">
                                  <button
                                    type="button"
                                    className="category-pill category-pill--button"
                                    style={{ backgroundColor: pillColor }}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setOpenPickerKey(
                                        pickerOpen ? null : rowKey,
                                      )
                                    }}
                                    aria-expanded={pickerOpen}
                                    aria-haspopup="listbox"
                                  >
                                    {getCategoryLabel(effectiveId)}
                                  </button>
                                  {pickerOpen ? (
                                    <ul
                                      className="tx-cat-picker"
                                      role="listbox"
                                      aria-label="Choose category"
                                    >
                                      {CATEGORIES.map((c) => (
                                        <li key={c.id} role="none">
                                          <button
                                            type="button"
                                            role="option"
                                            className="tx-cat-picker__opt"
                                            onClick={() =>
                                              pickCategory(tx.id, c.id)
                                            }
                                          >
                                            <span
                                              className="tx-cat-picker__swatch"
                                              style={{
                                                backgroundColor:
                                                  getCategoryPillColor(c.id),
                                              }}
                                            />
                                            {c.label}
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : null}
                                </div>
                              </div>
                              <div className="tx-acc__row">
                                <span className="tx-acc__label">Allocation</span>
                                <span className="tx-acc__value">
                                  <span className="tx-acc__alloc">
                                    <span className="tx-acc__alloc-actions">
                                      <button
                                        type="button"
                                        className="tx-acc__link"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setSheetPanel('defer')
                                          setSheetTx(tx)
                                        }}
                                      >
                                        <Calendar
                                          className="mr-2 inline-block size-4 align-[-2px] text-muted-foreground"
                                          aria-hidden
                                        />
                                        Defer to date
                                      </button>
                                      <button
                                        type="button"
                                        className="tx-acc__link"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setSheetPanel('trip')
                                          setSheetTx(tx)
                                        }}
                                      >
                                        <Plane
                                          className="mr-2 inline-block size-4 align-[-2px] text-muted-foreground"
                                          aria-hidden
                                        />
                                        Add to trip
                                      </button>
                                    </span>
                                    {allocChip ? (
                                      <span className="tx-acc__alloc-chip-row">
                                        {allocChip}
                                      </span>
                                    ) : null}
                                  </span>
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
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
