import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { CATEGORIES } from '@/constants/categories'
import { isKnownCategoryId } from '@/lib/categories'
import type { Transaction } from '@/lib/domain'
import {
  createManualTransactionOnServer,
  updateManualTransactionOnServer,
} from '@/lib/serverData'
import * as storage from '@/lib/storage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type Props = {
  readonly open: boolean
  readonly onClose: () => void
  readonly onAdded: () => void
  /** When set, sheet edits this manual transaction instead of creating a new one. */
  readonly editingTransaction?: Transaction | null
}

type FlowSign = 'debit' | 'credit'

function manualAccountIdFromAccountId(accountId: string): string {
  return accountId.startsWith('manual-') ? accountId.slice('manual-'.length) : ''
}

function sortTransactionsDesc(list: Transaction[]): Transaction[] {
  return [...list].sort((a, b) => {
    const d = b.date.localeCompare(a.date)
    if (d !== 0) return d
    return b.id.localeCompare(a.id)
  })
}

export function AddTransactionSheet({
  open,
  onClose,
  onAdded,
  editingTransaction = null,
}: Props): ReactElement | null {
  const reduceMotion = useReducedMotion()
  const [rendered, setRendered] = useState(open)
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [amountRaw, setAmountRaw] = useState('')
  const [flowSign, setFlowSign] = useState<FlowSign>('debit')
  const [categoryId, setCategoryId] = useState(CATEGORIES[0]?.id ?? 'other')
  const [manualAccountId, setManualAccountId] = useState('')
  const [accountsTick, setAccountsTick] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const isEdit = editingTransaction !== null && editingTransaction.source === 'manual'

  const manualAccounts = useMemo(() => {
    void accountsTick
    return storage.getManualAccounts()
  }, [accountsTick])

  useEffect(() => {
    const on = (): void => setAccountsTick((n) => n + 1)
    window.addEventListener(storage.MANUAL_ACCOUNTS_CHANGED_EVENT, on)
    return () =>
      window.removeEventListener(storage.MANUAL_ACCOUNTS_CHANGED_EVENT, on)
  }, [])

  useEffect(() => {
    if (open) setRendered(true)
  }, [open])

  useEffect(() => {
    if (!open) return
    setSaveError(null)
    setSaving(false)
    const accs = storage.getManualAccounts()
    const defaultAcc = accs[0]?.id ?? ''

    if (isEdit && editingTransaction) {
      const tx = editingTransaction
      setDescription(tx.description)
      setDate(tx.date.slice(0, 10))
      const abs = Math.abs(tx.amount)
      setAmountRaw(abs > 0 ? String(abs) : '')
      setFlowSign(tx.amount > 0 ? 'debit' : 'credit')
      setCategoryId(
        isKnownCategoryId(tx.categoryId) ? tx.categoryId : CATEGORIES[0]?.id ?? 'other',
      )
      const mid = manualAccountIdFromAccountId(tx.accountId)
      setManualAccountId(mid && accs.some((a) => a.id === mid) ? mid : defaultAcc)
      return
    }

    setDescription('')
    setDate(new Date().toISOString().slice(0, 10))
    setAmountRaw('')
    setFlowSign('debit')
    setCategoryId(CATEGORIES[0]?.id ?? 'other')
    setManualAccountId(defaultAcc)
  }, [open, isEdit, editingTransaction?.id])

  const amountNum = useMemo(() => {
    const n = parseFloat(amountRaw.replace(/[$,]/g, ''))
    return Number.isFinite(n) && n > 0 ? n : null
  }, [amountRaw])

  const selectedAccount = manualAccounts.find((a) => a.id === manualAccountId)
  const canSave =
    description.trim().length > 0 &&
    date.length >= 10 &&
    amountNum !== null &&
    isKnownCategoryId(categoryId) &&
    selectedAccount !== undefined

  async function onSave(): Promise<void> {
    if (!canSave || !selectedAccount || saving) return
    setSaveError(null)
    setSaving(true)
    try {
      const signed =
        flowSign === 'debit' ? amountNum! : -amountNum!

      if (isEdit && editingTransaction) {
        const updated = await updateManualTransactionOnServer({
          transactionId: editingTransaction.id,
          description: description.trim(),
          amount: signed,
          date,
          categoryId,
          accountLabel: selectedAccount.name,
          manualAccountId: selectedAccount.id,
        })
        if (!updated) {
          setSaveError('Could not save. Try again.')
          return
        }
        const cur = storage.getTransactions() ?? []
        const next = sortTransactionsDesc(
          cur.map((t) => (t.id === editingTransaction.id ? updated : t)),
        )
        storage.saveTransactions(next)
        onAdded()
        onClose()
        return
      }

      const tx = await createManualTransactionOnServer({
        description: description.trim(),
        amount: signed,
        date,
        categoryId,
        accountLabel: selectedAccount.name,
        manualAccountId: selectedAccount.id,
      })
      if (!tx) {
        setSaveError('Could not save. Try again.')
        return
      }
      const cur = storage.getTransactions() ?? []
      storage.saveTransactions([tx, ...cur])
      onAdded()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!rendered) return null

  const dialogLabel = isEdit ? 'Edit transaction' : 'Add transaction'

  return (
    <motion.div
      className="fixed inset-0 z-[250] flex flex-col justify-end p-0"
      role="presentation"
      initial={false}
      animate={{
        opacity: open ? 1 : 0,
        backgroundColor: open ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0)',
      }}
      transition={
        reduceMotion
          ? { duration: 0.01 }
          : { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }
      }
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
      onAnimationComplete={() => {
        if (!open) setRendered(false)
      }}
    >
      <motion.div
        className="max-h-[min(100vh,660px)] w-full overflow-y-auto overflow-x-hidden touch-pan-y rounded-t-2xl border border-border bg-background p-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel}
        initial={false}
        animate={{
          y: open ? 0 : 28,
        }}
        transition={
          reduceMotion
            ? { duration: 0.01 }
            : { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }
        }
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="relative mb-3">
          <div className="mx-auto h-1 w-10 shrink-0 rounded-full bg-muted" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 -mt-1 shrink-0"
            disabled={saving}
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-5" aria-hidden />
          </Button>
        </div>
        <h2 className="mb-4 pr-10 text-base font-semibold text-foreground">
          {dialogLabel}
        </h2>

        {saveError ? (
          <p className="mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-destructive">
            {saveError}
          </p>
        ) : null}

        <div className="space-y-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Description</span>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Apple Store"
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Date</span>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <div className="space-y-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Amount</span>
              <Input
                inputMode="decimal"
                value={amountRaw}
                onChange={(e) => setAmountRaw(e.target.value)}
                placeholder="0.00"
              />
            </label>
            <fieldset className="tx-toolbar__fieldset border-0 p-0">
              <legend className="tx-toolbar__label mb-2">Type</legend>
              <div
                className="tx-toggle-group tx-toggle-group--spaced"
                role="group"
                aria-label="Debit or credit"
              >
                <button
                  type="button"
                  className={cn(
                    flowSign === 'debit'
                      ? 'tx-toggle tx-toggle--active'
                      : 'tx-toggle',
                  )}
                  onClick={() => setFlowSign('debit')}
                >
                  Debit
                </button>
                <button
                  type="button"
                  className={cn(
                    flowSign === 'credit'
                      ? 'tx-toggle tx-toggle--active'
                      : 'tx-toggle',
                  )}
                  onClick={() => setFlowSign('credit')}
                >
                  Credit
                </button>
              </div>
            </fieldset>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Category</span>
            <select
              className="tx-toolbar__select h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Account</span>
            <select
              className="tx-toolbar__select h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={manualAccountId}
              onChange={(e) => setManualAccountId(e.target.value)}
              disabled={manualAccounts.length === 0}
            >
              {manualAccounts.length === 0 ? (
                <option value="">No accounts — add one in Settings</option>
              ) : (
                manualAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>

        <div className="mt-6">
          <Button
            type="button"
            className="w-full"
            disabled={!canSave || saving}
            onClick={() => void onSave()}
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save'}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
