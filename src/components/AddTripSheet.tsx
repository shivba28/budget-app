import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import type { Trip } from '@/lib/domain'
import { createTripOnServer, updateTripOnServer } from '@/lib/serverData'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Props = {
  readonly open: boolean
  readonly onClose: () => void
  /** When set, the sheet updates this trip instead of creating one. */
  readonly tripToEdit?: Trip | null
  /** Called after a successful create with the new trip. */
  readonly onAdded?: (trip: Trip) => void
  /** Called after a successful update in edit mode. */
  readonly onUpdated?: () => void
}

function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function AddTripSheet({
  open,
  onClose,
  tripToEdit = null,
  onAdded,
  onUpdated,
}: Props): ReactElement | null {
  const reduceMotion = useReducedMotion()
  const [rendered, setRendered] = useState(open)
  const [name, setName] = useState('')
  const [start, setStart] = useState(todayYmd)
  const [end, setEnd] = useState('')
  const [budget, setBudget] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (open) setRendered(true)
  }, [open])

  useEffect(() => {
    if (!open) return
    setSaveError(null)
    setSaving(false)
    if (tripToEdit) {
      setName(tripToEdit.name)
      setStart(tripToEdit.startDate.slice(0, 10))
      setEnd(tripToEdit.endDate ?? '')
      setBudget(
        tripToEdit.budgetLimit !== null ? String(tripToEdit.budgetLimit) : '',
      )
    } else {
      setName('')
      setStart(todayYmd())
      setEnd('')
      setBudget('')
    }
  }, [open, tripToEdit])

  const budgetOk = useMemo(() => {
    const b = budget.trim().replace(/[$,]/g, '')
    if (b === '') return true
    const x = Number(b)
    return Number.isFinite(x) && x >= 0
  }, [budget])

  const canSave =
    name.trim().length > 0 && start.length >= 10 && budgetOk

  async function onSave(): Promise<void> {
    if (!canSave || saving) return
    setSaveError(null)
    setSaving(true)
    try {
      let limit: number | null = null
      const b = budget.trim().replace(/[$,]/g, '')
      if (b !== '') {
        const x = Number(b)
        if (!Number.isFinite(x) || x < 0) {
          setSaveError('Check budget amount.')
          return
        }
        limit = Math.round(x * 100) / 100
      }
      if (tripToEdit) {
        const ok = await updateTripOnServer(tripToEdit.id, {
          name: name.trim(),
          startDate: start.slice(0, 10),
          endDate: end.trim().length >= 10 ? end.slice(0, 10) : null,
          budgetLimit: limit,
        })
        if (!ok) {
          setSaveError('Could not update trip. Try again.')
          return
        }
        onUpdated?.()
        onClose()
        return
      }
      const created = await createTripOnServer({
        name: name.trim(),
        startDate: start.slice(0, 10),
        endDate: end.trim().length >= 10 ? end.slice(0, 10) : null,
        budgetLimit: limit,
        color: null,
      })
      if (!created) {
        setSaveError('Could not create trip. Try again.')
        return
      }
      onAdded?.(created)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!rendered) return null

  const isEdit = tripToEdit != null
  const dialogLabel = isEdit ? 'Edit trip' : 'Add trip'

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
          {isEdit ? 'Edit trip' : 'Add trip'}
        </h2>

        {saveError ? (
          <p className="mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-destructive">
            {saveError}
          </p>
        ) : null}

        <div className="space-y-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Name</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Japan June 2026"
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Start date</span>
            <Input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">End date (optional)</span>
            <Input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Budget limit (optional)</span>
            <Input
              inputMode="decimal"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="0"
            />
          </label>
        </div>

        <div className="mt-6">
          <Button
            type="button"
            className="w-full"
            disabled={!canSave || saving}
            onClick={() => void onSave()}
          >
            {saving
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save changes'
                : 'Create trip'}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
