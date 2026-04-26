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
import type { TransactionRow } from '@/src/db/queries/transactions'
import {
  clearAllocationPatch,
  markPostedPatch,
} from '@/src/lib/transactions/allocation'
import * as accountsQ from '@/src/db/queries/accounts'
import { useCategoriesStore } from '@/src/stores/categoriesStore'
import { useTransactionsStore } from '@/src/stores/transactionsStore'
import { useTripsStore } from '@/src/stores/tripsStore'

const CREAM = '#FAFAF5'
const INK = '#111111'
const YELLOW = '#F5C842'
const RED = '#FF5E5E'
const MUTED = '#E8E8E0'
const GREEN = '#3B6D11'
const TEAL = '#3BCEAC'

const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

function formatAmount(amount: number): string {
  const abs = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Math.abs(amount))
  return amount >= 0 ? `+${abs}` : `-${abs}`
}

type Props = {
  transactionId: string | null
  onDismiss: () => void
}

export const AllocationBottomSheet = forwardRef<BottomSheetModal, Props>(
  function AllocationBottomSheet({ transactionId, onDismiss }, ref) {
    const update = useTransactionsStore((s) => s.update)
    const items = useTransactionsStore((s) => s.items)
    const tx = useMemo(
      () => (transactionId ? items.find((t) => t.id === transactionId) : null),
      [items, transactionId],
    )

    const categories = useCategoriesStore((s) => s.items)
    const loadCategories = useCategoriesStore((s) => s.load)
    const trips = useTripsStore((s) => s.items)
    const loadTrips = useTripsStore((s) => s.load)
    const [deferDate, setDeferDate] = useState('')
    const [tripId, setTripId] = useState<number | null>(null)
    const [myShare, setMyShare] = useState('')
    const [category, setCategory] = useState<string | null>(null)

    useEffect(() => {
      loadCategories()
      loadTrips()
    }, [loadCategories, loadTrips])

    useEffect(() => {
      if (!tx) return
      setDeferDate(tx.effective_date ?? '')
      setTripId(tx.trip_id ?? null)
      setMyShare(tx.my_share != null ? String(tx.my_share) : '')
      setCategory(tx.category ?? null)
    }, [tx?.id])

    const isDirty = useMemo(() => {
      if (!tx) return false
      return (
        deferDate.trim() !== (tx.effective_date ?? '') ||
        tripId !== (tx.trip_id ?? null) ||
        myShare.trim() !== (tx.my_share != null ? String(tx.my_share) : '') ||
        category !== (tx.category ?? null)
      )
    }, [tx, deferDate, tripId, myShare, category])

    const snapPoints = useMemo(() => ['52%', '88%'], [])

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

    const saveAllocation = () => {
      if (!tx) return
      const shareRaw = myShare.trim()
      const share = shareRaw === '' ? null : Number(shareRaw)
      update(tx.id, {
        effective_date: deferDate.trim() === '' ? null : deferDate.trim(),
        trip_id: tripId,
        my_share: share !== null && !Number.isNaN(share) ? share : null,
        category,
        detail_category: null,
      } as Partial<TransactionRow>)
      ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
    }

    const onClear = () => {
      if (!tx) return
      update(tx.id, clearAllocationPatch())
      setDeferDate('')
      setTripId(null)
      setMyShare('')
      setCategory(null)
      ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
    }

    const onMarkPosted = () => {
      if (!tx) return
      update(tx.id, markPostedPatch())
      ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
    }

    const isIncome = tx ? tx.amount >= 0 : false

    const accountInfo = useMemo(() => {
      if (!tx) return null
      const acct = accountsQ.listAllAccounts().find((a) => a.id === tx.account_id)
      if (!acct) return tx.account_label ?? null
      return [acct.institution, acct.name].filter(Boolean).join(' · ')
    }, [tx?.account_id])

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        enablePanDownToClose
        onDismiss={onDismiss}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handle}
      >
        {tx ? (
          <BottomSheetScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            {/* Summary */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryDesc} numberOfLines={1}>{tx.description}</Text>
                <Text style={[styles.summaryAmount, isIncome ? styles.amountCredit : styles.amountDebit]}>
                  {formatAmount(tx.amount)}
                </Text>
              </View>
              <Text style={styles.summaryMeta}>
                {tx.date}{accountInfo ? ` · ${accountInfo} · ` : ''}
                {tx.pending === 1 ? <Text style={styles.pendingBadge}>{'PENDING'}</Text> : null}
              </Text>
            </View>

            {/* Defer date — hidden for pending transactions (date will update automatically when posted) */}
            {tx.pending !== 1 ? (
              <>
                <Text style={styles.fieldLabel}>Defer to date</Text>
                <DateInput value={deferDate} onChange={setDeferDate} style={styles.fieldInput} />
              </>
            ) : null}

            {/* Trip */}
            <Text style={styles.fieldLabel}>Trip / event</Text>
            <View style={styles.chips}>
              <Pressable onPress={() => setTripId(null)}>
                {({ pressed }) => (
                  <View style={[styles.chip, tripId === null && styles.chipOn, pressed && styles.chipPressed]} pointerEvents="none">
                    <Text style={styles.chipText}>None</Text>
                  </View>
                )}
              </Pressable>
              {trips.map((tr) => (
                <Pressable key={tr.id} onPress={() => setTripId(tr.id)}>
                  {({ pressed }) => (
                    <View style={[styles.chip, tripId === tr.id && styles.chipOn, pressed && styles.chipPressed]} pointerEvents="none">
                      <Text style={styles.chipText}>{tr.name}</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
            {/* My share */}
            <Text style={styles.fieldLabel}>My share (optional)</Text>
            <BottomSheetTextInput
              style={styles.fieldInput}
              value={myShare}
              onChangeText={setMyShare}
              keyboardType="decimal-pad"
              placeholder="Split / share amount"
              placeholderTextColor="#999999"
            />

            {/* Category override */}
            <Text style={styles.fieldLabel}>Category override</Text>
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

            {/* Actions */}
            <View style={styles.btnGroup}>
              <Pressable onPress={saveAllocation} disabled={!isDirty}>
                {({ pressed }) => (
                  <View style={[styles.btn, styles.btnYellow, !isDirty && styles.btnDisabled, pressed && isDirty && styles.btnPressed]} pointerEvents="none">
                    <Text style={styles.btnText}>Save allocation</Text>
                  </View>
                )}
              </Pressable>
              {tx.pending === 1 ? (
                <Pressable onPress={onMarkPosted}>
                  {({ pressed }) => (
                    <View style={[styles.btn, styles.btnTeal, pressed && styles.btnPressed]} pointerEvents="none">
                      <Text style={styles.btnText}>Mark as posted</Text>
                    </View>
                  )}
                </Pressable>
              ) : null}
              <Pressable onPress={onClear}>
                {({ pressed }) => (
                  <View style={[styles.btn, styles.btnNeutral, pressed && styles.btnPressed]} pointerEvents="none">
                    <Text style={styles.btnText}>Clear allocation</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </BottomSheetScrollView>
        ) : null}
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
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  summaryDesc: {
    fontFamily: MONO,
    fontSize: 16,
    fontWeight: '800',
    color: INK,
    flex: 1,
  },
  summaryAmount: {
    fontFamily: MONO,
    fontSize: 16,
    fontWeight: '800',
  },
  amountDebit: { color: RED },
  amountCredit: { color: GREEN },
  summaryMeta: {
    fontFamily: MONO,
    fontSize: 12,
    color: '#666666',
    marginTop: 3,
  },
  pendingBadge: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '800',
    color: INK,
    backgroundColor: YELLOW,
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
    gap: 8,
    marginTop: 16,
  },
  btn: {
    borderWidth: 3,
    borderColor: INK,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  btnYellow: { backgroundColor: YELLOW },
  btnTeal: { backgroundColor: TEAL },
  btnNeutral: { backgroundColor: CREAM },
  btnDisabled: { opacity: 0.4 },
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
