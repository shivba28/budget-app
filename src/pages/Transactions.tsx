import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { CATEGORIES } from '../constants/categories'
import { ErrorRetry } from '../components/ErrorRetry'
import { LoadingSpinner } from '../components/LoadingSpinner'
import {
  filterTransactionsByVisibleAccounts,
  formatCurrencyAmount,
  formatTransactionAccountLabel,
  getCategoryLabel,
  getCategoryPillColor,
  loadTransactionsFromCacheOrFetch,
  persistCategoryOverride,
  refreshTransactionsFromBackend,
  resolveDisplayCategory,
  type Transaction,
} from '../lib/api'
import {
  formatMonthHeading,
  groupTransactionsByMonth,
  type DatePreset,
  transactionMatchesDatePreset,
} from '../lib/transactionGrouping'
import * as storage from '../lib/storage'
import { DriveSyncIndicator } from '@/components/DriveSyncIndicator'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useRegisterNavScrollRoot } from '@/contexts/NavScrollContext'
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
    const on = (): void => {
      setExclusionRev((n) => n + 1)
    }
    window.addEventListener(storage.ACCOUNTS_EXCLUSIONS_CHANGED_EVENT, on)
    return () =>
      window.removeEventListener(storage.ACCOUNTS_EXCLUSIONS_CHANGED_EVENT, on)
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
    setError(null)
    setFailedOp(null)
    try {
      const next = await refreshTransactionsFromBackend({
        throwOnFailure: true,
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
            <DriveSyncIndicator variant="header" />
            <Button
              type="button"
              className="tx-sync-btn"
              size="sm"
              disabled={syncing}
              onClick={() => void doSync()}
            >
              {syncing ? 'Syncing…' : 'Sync'}
            </Button>
          </div>
        </div>

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
              No transactions yet. Link your bank in Settings, then tap{' '}
              <strong className="text-foreground">Sync</strong> to pull activity.
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
              Expand a month, then tap a row for account and category.
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
                        className={
                          pickerOpen
                            ? 'tx-acc__item tx-acc__item--picker-open'
                            : 'tx-acc__item'
                        }
                        style={{
                          boxShadow: `inset 3px 0 0 ${categoryAccentRgba(pillColor, 0.35)}`,
                        }}
                      >
                        <button
                          type="button"
                          className="tx-acc__header"
                          aria-expanded={expanded}
                          aria-controls={panelId}
                          id={triggerId}
                          onClick={() => toggleExpanded(rowKey)}
                        >
                          <IconChevron expanded={expanded} />
                          <span className="tx-acc__date">{tx.date}</span>
                          <span className="tx-acc__desc">{tx.description}</span>
                          <span className={amountClass(tx.amount)}>
                            {formatCurrencyAmount(displayAmount(tx.amount))}
                          </span>
                        </button>
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
    </main>
  )
}
