import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Calendar, Plane, Tag } from 'lucide-react'
import type { Transaction, Trip } from '@/lib/domain'
import * as storage from '@/lib/storage'
import {
  allocateTransaction,
  clearTransactionAllocation,
} from '@/lib/transactionAllocation'
import {
  formatCurrencyAmount,
  formatTransactionAccountLabel,
  getCategoryLabel,
  getCategoryPillColor,
  persistCategoryOverride,
  resolveDisplayCategory,
} from '@/lib/api'
import { CATEGORIES } from '@/constants/categories'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type Props = {
  readonly tx: Transaction | null
  readonly open: boolean
  readonly initialPanel?: 'menu' | 'defer' | 'trip'
  readonly onClose: () => void
  readonly onApplied: () => void
}

type Panel = 'menu' | 'defer' | 'trip' | 'newTrip' | 'category'

function truncate(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(0, max - 1))}…`
}

export function TransactionAllocateSheet({
  tx,
  open,
  initialPanel,
  onClose,
  onApplied,
}: Props): ReactElement | null {
  const [panel, setPanel] = useState<Panel>('menu')
  const [trips, setTrips] = useState<Trip[]>(() => storage.getTrips())
  const [deferDate, setDeferDate] = useState('')
  const [newName, setNewName] = useState('')
  const [newStart, setNewStart] = useState('')
  const [newEnd, setNewEnd] = useState('')
  const [newBudget, setNewBudget] = useState('')

  useEffect(() => {
    const onTrips = (): void => setTrips(storage.getTrips())
    window.addEventListener(storage.TRIPS_CHANGED_EVENT, onTrips)
    return () =>
      window.removeEventListener(storage.TRIPS_CHANGED_EVENT, onTrips)
  }, [])

  useEffect(() => {
    if (!open || !tx) return
    setPanel(initialPanel ?? 'menu')
    setDeferDate(
      typeof tx.effectiveDate === 'string' && tx.effectiveDate.length >= 10
        ? tx.effectiveDate.slice(0, 10)
        : tx.date.slice(0, 10),
    )
    setNewName('')
    setNewStart(tx.date.slice(0, 10))
    setNewEnd('')
    setNewBudget('')
  }, [open, tx, initialPanel])

  const canSubmitDefer = useMemo(() => deferDate.length >= 10, [deferDate])

  if (!open || !tx) return null

  const row = tx
  const accounts = storage.getAccounts() ?? []
  const accountLabel = formatTransactionAccountLabel(row.accountId, accounts)
  const effectiveCategoryId = resolveDisplayCategory(
    row,
    storage.getCategoryOverrides(),
  )
  const pillColor = getCategoryPillColor(effectiveCategoryId)

  function displayAmount(tellerAmount: number): number {
    if (tellerAmount > 0) return -tellerAmount
    if (tellerAmount < 0) return Math.abs(tellerAmount)
    return 0
  }

  function amountClass(tellerAmount: number): string {
    if (tellerAmount > 0) return 'tx-table__amount tx-amount-debit'
    if (tellerAmount < 0) return 'tx-table__amount tx-amount-credit'
    return 'tx-table__amount'
  }

  async function applyDefer(): Promise<void> {
    if (!canSubmitDefer) return
    const ok = await allocateTransaction(row.id, {
      mode: 'effective',
      effectiveDate: deferDate,
    })
    if (!ok) return
    onApplied()
    onClose()
  }

  async function pickTrip(tripId: number): Promise<void> {
    const ok = await allocateTransaction(row.id, { mode: 'trip', tripId })
    if (!ok) return
    onApplied()
    onClose()
  }

  async function submitNewTrip(): Promise<void> {
    const name = newName.trim()
    if (!name || newStart.length < 10) return
    let budgetLimit: number | null = null
    const b = newBudget.trim().replace(/[$,]/g, '')
    if (b !== '') {
      const n = Number(b)
      if (!Number.isFinite(n) || n < 0) return
      budgetLimit = Math.round(n * 100) / 100
    }
    const { createTripOnServer } = await import('@/lib/serverData')
    const trip = await createTripOnServer({
      name,
      startDate: newStart,
      endDate: newEnd.trim().length >= 10 ? newEnd.slice(0, 10) : null,
      budgetLimit,
      color: null,
    })
    if (!trip) return
    const ok = await allocateTransaction(row.id, { mode: 'trip', tripId: trip.id })
    if (!ok) return
    onApplied()
    onClose()
  }

  async function clearAlloc(): Promise<void> {
    const ok = await clearTransactionAllocation(row.id)
    if (!ok) return
    onApplied()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[250] flex flex-col justify-end bg-black/45 p-0"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="max-h-[min(85vh,520px)] w-full overflow-y-auto rounded-t-2xl border border-border bg-background p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-label="Allocate transaction"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-muted" />

        <div className="mb-4 rounded-xl border border-border bg-muted/20 px-3 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              {row.description}
            </p>
            <p className="max-w-[44%] shrink-0 truncate text-xs text-muted-foreground">
              {accountLabel}
            </p>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="shrink-0">{row.date}</span>
              <span
                className="category-pill max-w-[9.5rem] truncate"
                style={{ backgroundColor: pillColor }}
                title={getCategoryLabel(effectiveCategoryId)}
              >
                {getCategoryLabel(effectiveCategoryId)}
              </span>
            </div>
            <span className={amountClass(row.amount)}>
              {formatCurrencyAmount(displayAmount(row.amount))}
            </span>
          </div>
        </div>

        {panel === 'menu' ? (
          <div className="space-y-3">
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-start"
              onClick={() => setPanel('defer')}
            >
              <Calendar className="mr-2 size-4 shrink-0" aria-hidden />
              Defer to date
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-start"
              onClick={() => setPanel('trip')}
            >
              <Plane className="mr-2 size-4 shrink-0" aria-hidden />
              Add to trip
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-start"
              onClick={() => setPanel('category' as Panel)}
            >
              <Tag className="mr-2 size-4 shrink-0" aria-hidden />
              Change category
            </Button>
            {(row.tripId != null ||
              (typeof row.effectiveDate === 'string' &&
                row.effectiveDate.length >= 7)) && (
              <Button
                type="button"
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => void clearAlloc()}
              >
                Clear allocation
              </Button>
            )}
          </div>
        ) : null}

        {(panel as string) === 'category' ? (
          <div className="space-y-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 mb-1"
              onClick={() => setPanel('menu')}
            >
              ← Back
            </Button>
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {CATEGORIES.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm',
                      'hover:bg-muted/60',
                    )}
                    onClick={() => {
                      persistCategoryOverride(row.id, c.id)
                      onApplied()
                      onClose()
                    }}
                  >
                    <span
                      className="size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: getCategoryPillColor(c.id) }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {panel === 'defer' ? (
          <div className="space-y-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 mb-1"
              onClick={() => setPanel('menu')}
            >
              ← Back
            </Button>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Effective date</span>
              <Input
                type="date"
                value={deferDate}
                onChange={(e) => setDeferDate(e.target.value)}
              />
            </label>
            <Button
              type="button"
              className="w-full"
              disabled={!canSubmitDefer}
              onClick={() => void applyDefer()}
            >
              Save
            </Button>
          </div>
        ) : null}

        {panel === 'trip' ? (
          <div className="space-y-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 mb-1"
              onClick={() => setPanel('menu')}
            >
              ← Back
            </Button>
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {trips.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm',
                      'hover:bg-muted/60',
                    )}
                    onClick={() => void pickTrip(t.id)}
                  >
                    <Plane className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setPanel('newTrip')}
            >
              New trip
            </Button>
          </div>
        ) : null}

        {panel === 'newTrip' ? (
          <div className="space-y-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 mb-1"
              onClick={() => setPanel('trip')}
            >
              ← Back
            </Button>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Trip name</span>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Japan June 2026"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Start date</span>
              <Input
                type="date"
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">End date (optional)</span>
              <Input
                type="date"
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Budget limit (optional)</span>
              <Input
                inputMode="decimal"
                value={newBudget}
                onChange={(e) => setNewBudget(e.target.value)}
                placeholder="0"
              />
            </label>
            <Button
              type="button"
              className="w-full"
              disabled={!newName.trim() || newStart.length < 10}
              onClick={() => void submitNewTrip()}
            >
              Create &amp; assign
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
