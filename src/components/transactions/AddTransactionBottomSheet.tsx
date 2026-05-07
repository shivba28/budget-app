import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet'
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet'
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import { DateInput } from '@/src/components/DateInput'
import { CalculatorAmountInput } from '@/src/components/CalculatorAmountInput'
import { evaluateExpression } from '@/src/lib/evaluateExpression'
import { useAccountsStore } from '@/src/stores/accountsStore'
import { useCategoriesStore } from '@/src/stores/categoriesStore'
import { useTransactionsStore } from '@/src/stores/transactionsStore'
import { useTripsStore } from '@/src/stores/tripsStore'
import {
  createManualRecurringTransactions,
  type ManualRecurrenceCadence,
} from '@/src/lib/transactions/manualRecurring'
import { ensureRecurringTransactionsSeeded } from '@/src/lib/transactions/recurringAutoAdd'

const CREAM = '#FAFAF5'
const INK = '#111111'
const YELLOW = '#F5C842'
const MUTED = '#E8E8E0'

const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

type Props = {
  onDismiss?: () => void
}

export const AddTransactionBottomSheet = forwardRef<BottomSheetModal, Props>(
  function AddTransactionBottomSheet({ onDismiss }, ref) {
    const accounts = useAccountsStore((s) => s.items)
    const loadAccounts = useAccountsStore((s) => s.load)
    const categories = useCategoriesStore((s) => s.items)
    const loadCategories = useCategoriesStore((s) => s.load)
    const trips = useTripsStore((s) => s.items)
    const loadTrips = useTripsStore((s) => s.load)
    const add = useTransactionsStore((s) => s.add)
    const loadTx = useTransactionsStore((s) => s.load)

    const [accountId, setAccountId] = useState<string | null>(null)
    const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
    const [amountAbs, setAmountAbs] = useState('')
    const [amountSign, setAmountSign] = useState<'out' | 'in'>('out')
    const [description, setDescription] = useState('')
    const [category, setCategory] = useState<string | null>(null)
    const [tripId, setTripId] = useState<number | null>(null)
    const [recurrence, setRecurrence] = useState<ManualRecurrenceCadence | 'none'>('none')
    const [untilDate, setUntilDate] = useState('')
    const [notes, setNotes] = useState('')

    useEffect(() => {
      loadAccounts()
      loadCategories()
      loadTrips()
    }, [loadAccounts, loadCategories, loadTrips])

    useEffect(() => {
      if (!accountId && accounts[0]) setAccountId(accounts[0].id)
    }, [accounts, accountId])

    const resetForm = () => {
      setDate(new Date().toISOString().slice(0, 10))
      setAmountAbs('')
      setAmountSign('out')
      setDescription('')
      setCategory(null)
      setTripId(null)
      setRecurrence('none')
      setUntilDate('')
      setNotes('')
    }

    const canSave = useMemo(() => {
      if (!accountId) return false
      const a = evaluateExpression(amountAbs)
      return a !== null && description.trim() !== ''
    }, [accountId, amountAbs, description])

    const untilDateOrNull = useMemo(() => {
      if (recurrence === 'none') return null
      const t = untilDate.trim()
      if (!t) return null
      return t
    }, [recurrence, untilDate])

    const snapPoints = useMemo(() => ['60%', '92%'], [])

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.45}
        />
      ),
      [],
    )

    const onSave = () => {
      if (!accountId || !canSave) return
      const abs = evaluateExpression(amountAbs) ?? 0
      const a = amountSign === 'out' ? -Math.abs(abs) : Math.abs(abs)
      if (recurrence === 'none') {
        add({
          account_id: accountId,
          date,
          effective_date: null,
          trip_id: tripId,
          my_share: null,
          amount: a,
          description: description.trim(),
          category,
          detail_category: null,
          pending: 0,
          user_confirmed: 1,
          source: 'manual',
          account_label: null,
          synced_at: null,
          notes: notes.trim() || null,
        })
      } else {
        createManualRecurringTransactions({
          accountId,
          date,
          amount: a,
          description: description.trim(),
          category,
          tripId,
          cadence: recurrence,
          untilDate: untilDateOrNull,
        })
        ensureRecurringTransactionsSeeded()
        loadTx()
      }
      resetForm()
      ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
    }

    const handleDismiss = () => {
      resetForm()
      onDismiss?.()
    }

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        enablePanDownToClose
        onDismiss={handleDismiss}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handle}
      >
        <BottomSheetScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.summaryCard}>
            <Text style={styles.summaryDesc}>New transaction</Text>
            <Text style={styles.summaryMeta}>Saved locally</Text>
          </View>

          {accounts.length === 0 ? (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryMeta}>Add a manual account in Settings first.</Text>
            </View>
          ) : null}

          <Text style={styles.fieldLabel}>Account</Text>
          <View style={styles.chips}>
            {accounts.map((ac) => (
              <Pressable key={ac.id} onPress={() => setAccountId(ac.id)}>
                {({ pressed }) => (
                  <View style={[styles.chip, accountId === ac.id && styles.chipOn, pressed && styles.chipPressed]} pointerEvents="none">
                    <Text style={styles.chipText}>{ac.name}</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Date</Text>
          <DateInput value={date} onChange={setDate} style={styles.fieldInput} />

          <Text style={styles.fieldLabel}>Amount</Text>
          <CalculatorAmountInput
            inputStyle={styles.fieldInput}
            value={amountAbs}
            onChangeText={setAmountAbs}
            bottomSheet
          />
          <View style={styles.chips}>
            <Pressable onPress={() => setAmountSign('out')}>
              {({ pressed }) => (
                <View style={[styles.chip, amountSign === 'out' && styles.chipOn, pressed && styles.chipPressed]} pointerEvents="none">
                  <Text style={styles.chipText}>Spend (−)</Text>
                </View>
              )}
            </Pressable>
            <Pressable onPress={() => setAmountSign('in')}>
              {({ pressed }) => (
                <View style={[styles.chip, amountSign === 'in' && styles.chipOn, pressed && styles.chipPressed]} pointerEvents="none">
                  <Text style={styles.chipText}>Income (+)</Text>
                </View>
              )}
            </Pressable>
          </View>

          <Text style={styles.fieldLabel}>Description</Text>
          <BottomSheetTextInput
            style={styles.fieldInput}
            value={description}
            onChangeText={setDescription}
            placeholder="Merchant name or note…"
            placeholderTextColor="#999999"
          />

          <Text style={styles.fieldLabel}>Notes (optional)</Text>
          <BottomSheetTextInput
            style={[styles.fieldInput, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Dinner with Mom, subscription ref…"
            placeholderTextColor="#999999"
            multiline
            numberOfLines={2}
          />

          <Text style={styles.fieldLabel}>Category (optional)</Text>
          <View style={styles.chips}>
            <Pressable onPress={() => setCategory(null)}>
              {({ pressed }) => (
                <View style={[styles.chip, category === null && styles.chipOn, pressed && styles.chipPressed]} pointerEvents="none">
                  <Text style={styles.chipText}>None</Text>
                </View>
              )}
            </Pressable>
            {categories.map((c) => (
              <Pressable key={c.id} onPress={() => setCategory(c.label)}>
                {({ pressed }) => (
                  <View
                    style={[
                      styles.chip,
                      category === c.label && styles.chipOn,
                      category === c.label && c.color ? { backgroundColor: c.color } : null,
                      pressed && styles.chipPressed,
                    ]}
                    pointerEvents="none"
                  >
                    <Text style={styles.chipText}>{c.label}</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Trip / event (optional)</Text>
          <View style={styles.chips}>
            <Pressable onPress={() => setTripId(null)}>
              {({ pressed }) => (
                <View style={[styles.chip, tripId === null && styles.chipOn, pressed && styles.chipPressed]} pointerEvents="none">
                  <Text style={styles.chipText}>None</Text>
                </View>
              )}
            </Pressable>
            {trips.map((t) => (
              <Pressable key={t.id} onPress={() => setTripId(t.id)}>
                {({ pressed }) => (
                  <View style={[styles.chip, tripId === t.id && styles.chipOn, pressed && styles.chipPressed]} pointerEvents="none">
                    <Text style={styles.chipText}>{t.name}</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Recurring (optional)</Text>
          <View style={styles.chips}>
            {(
              [
                ['none', 'None'],
                ['daily', 'Daily'],
                ['weekly', 'Weekly'],
                ['biweekly', 'Bi-weekly'],
                ['monthly', 'Monthly'],
                ['yearly', 'Yearly'],
              ] as const
            ).map(([key, label]) => (
              <Pressable
                key={key}
                onPress={() => {
                  setRecurrence(key as ManualRecurrenceCadence | 'none')
                  if (key === 'none') {
                    setUntilDate('')
                  }
                }}
              >
                {({ pressed }) => (
                  <View
                    style={[
                      styles.chip,
                      recurrence === key && styles.chipOn,
                      pressed && styles.chipPressed,
                    ]}
                    pointerEvents="none"
                  >
                    <Text style={styles.chipText}>{label}</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>

          {recurrence !== 'none' ? (
            <>
              <Text style={styles.fieldLabel}>Repeat until (optional)</Text>
              <DateInput value={untilDate} onChange={setUntilDate} style={styles.fieldInput} placeholder="Until date" />
            </>
          ) : null}

          <View style={styles.btnGroup}>
            <Pressable onPress={onSave} disabled={!canSave}>
              {({ pressed }) => (
                <View style={[styles.btn, styles.btnYellow, !canSave && styles.btnDisabled, pressed && styles.btnPressed]} pointerEvents="none">
                  <Text style={styles.btnText}>Save transaction</Text>
                </View>
              )}
            </Pressable>
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    )
  },
)

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: CREAM,
    borderWidth: 3,
    borderColor: INK,
  },
  handle: {
    backgroundColor: INK,
    width: 48,
  },
  scroll: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 48,
  },
  summaryCard: {
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: MUTED,
    padding: 10,
    marginBottom: 16,
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  summaryDesc: {
    fontFamily: MONO,
    fontSize: 16,
    fontWeight: '800',
    color: INK,
  },
  summaryMeta: {
    fontFamily: MONO,
    fontSize: 12,
    color: '#666666',
    marginTop: 3,
  },
  fieldLabel: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: INK,
    marginBottom: 3,
    marginTop: 10,
  },
  fieldInput: {
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: CREAM,
    paddingHorizontal: 9,
    paddingVertical: 7,
    fontFamily: MONO,
    fontSize: 14,
    color: INK,
    marginBottom: 6,
  },
  notesInput: {
    minHeight: 56,
    textAlignVertical: 'top',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  chip: {
    borderWidth: 2,
    borderColor: INK,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: CREAM,
  },
  chipOn: { backgroundColor: YELLOW },
  chipPressed: { opacity: 0.7 },
  chipText: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '800',
    color: INK,
  },
  btnGroup: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  btn: {
    flex: 1,
    borderWidth: 3,
    borderColor: INK,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  btnYellow: { backgroundColor: YELLOW },
  btnDisabled: { opacity: 0.45 },
  btnPressed: { transform: [{ translateX: 3 }, { translateY: 3 }], shadowOpacity: 0, elevation: 0 },
  btnText: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '800',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
})
