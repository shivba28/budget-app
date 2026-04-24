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
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import { DateInput } from '@/src/components/DateInput'
import { useAccountsStore } from '@/src/stores/accountsStore'
import { useCategoriesStore } from '@/src/stores/categoriesStore'
import { useTransactionsStore } from '@/src/stores/transactionsStore'
import { useTripsStore } from '@/src/stores/tripsStore'

const CREAM = '#FAFAF5'
const INK = '#111111'
const YELLOW = '#F5C842'
const RED = '#FF5E5E'
const MUTED = '#E8E8E0'
const GREEN = '#3B6D11'

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

export const EditTransactionBottomSheet = forwardRef<BottomSheetModal, Props>(
  function EditTransactionBottomSheet({ transactionId, onDismiss }, ref) {
    const items = useTransactionsStore((s) => s.items)
    const update = useTransactionsStore((s) => s.update)
    const remove = useTransactionsStore((s) => s.remove)

    const tx = useMemo(
      () => (transactionId ? items.find((t) => t.id === transactionId) : null),
      [items, transactionId],
    )

    const accounts = useAccountsStore((s) => s.items)
    const loadAccounts = useAccountsStore((s) => s.load)
    const categories = useCategoriesStore((s) => s.items)
    const loadCategories = useCategoriesStore((s) => s.load)
    const trips = useTripsStore((s) => s.items)
    const loadTrips = useTripsStore((s) => s.load)

    const [accountId, setAccountId] = useState<string | null>(null)
    const [date, setDate] = useState('')
    const [amount, setAmount] = useState('')
    const [description, setDescription] = useState('')
    const [category, setCategory] = useState<string | null>(null)
    const [tripId, setTripId] = useState<number | null>(null)

    useEffect(() => {
      loadAccounts()
      loadCategories()
      loadTrips()
    }, [loadAccounts, loadCategories, loadTrips])

    useEffect(() => {
      if (!tx) return
      setAccountId(tx.account_id)
      setDate(tx.date)
      setAmount(String(tx.amount))
      setDescription(tx.description)
      setCategory(tx.category ?? null)
      setTripId(tx.trip_id ?? null)
    }, [tx?.id])

    const isDirty = useMemo(() => {
      if (!tx) return false
      return (
        accountId !== tx.account_id ||
        date !== tx.date ||
        Number(amount) !== tx.amount ||
        description.trim() !== tx.description ||
        category !== (tx.category ?? null) ||
        tripId !== (tx.trip_id ?? null)
      )
    }, [tx, accountId, date, amount, description, category, tripId])

    const canSave = useMemo(() => {
      if (!accountId || !tx || !isDirty) return false
      const a = Number(amount)
      return !Number.isNaN(a) && description.trim() !== ''
    }, [accountId, amount, description, tx, isDirty])

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
      if (!tx || !canSave) return
      update(tx.id, {
        account_id: accountId!,
        date,
        amount: Number(amount),
        description: description.trim(),
        category,
        trip_id: tripId,
        source: 'manual',
      })
      ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
    }

    const onDelete = () => {
      if (!tx) return
      Alert.alert('Delete transaction', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            remove(tx.id)
            ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
          },
        },
      ])
    }

    const txAccount = useMemo(
      () => accounts.find((a) => a.id === tx?.account_id),
      [accounts, tx?.account_id],
    )
    const isIncome = tx ? tx.amount >= 0 : false

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
                {tx.date}
                {tx.category ? ` · ${tx.category}` : ''}
                {txAccount ? ` · ${txAccount.name}` : ''}
              </Text>
            </View>

            {/* Account */}
            <Text style={styles.fieldLabel}>Account</Text>
            <View style={styles.chips}>
              {accounts.map((ac) => (
                <Pressable key={ac.id} onPress={() => setAccountId(ac.id)}>
                  {({ pressed }) => (
                    <View
                      style={[styles.chip, accountId === ac.id && styles.chipOn, pressed && styles.chipPressed]}
                      pointerEvents="none"
                    >
                      <Text style={styles.chipText}>{ac.name}</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>

            {/* Date */}
            <Text style={styles.fieldLabel}>Date</Text>
            <DateInput value={date} onChange={setDate} style={styles.fieldInput} />

            {/* Amount */}
            <Text style={styles.fieldLabel}>Amount (negative = spend)</Text>
            <BottomSheetTextInput
              style={styles.fieldInput}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="-0.00"
              placeholderTextColor="#999999"
            />

            {/* Description */}
            <Text style={styles.fieldLabel}>Description</Text>
            <BottomSheetTextInput
              style={styles.fieldInput}
              value={description}
              onChangeText={setDescription}
              placeholder="Merchant name or note…"
              placeholderTextColor="#999999"
            />

            {/* Category */}
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

            {/* Trip */}
            <Text style={styles.fieldLabel}>Trip (optional)</Text>
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

            {/* Actions */}
            <View style={styles.btnGroup}>
              <Pressable onPress={onSave} disabled={!canSave}>
                {({ pressed }) => (
                  <View style={[styles.btn, styles.btnYellow, !canSave && styles.btnDisabled, pressed && styles.btnPressed]} pointerEvents="none">
                    <Text style={styles.btnText}>Save</Text>
                  </View>
                )}
              </Pressable>
              <Pressable onPress={onDelete}>
                {({ pressed }) => (
                  <View style={[styles.btn, styles.btnRed, pressed && styles.btnPressed]} pointerEvents="none">
                    <Text style={styles.btnText}>Delete</Text>
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
  btnRed: { backgroundColor: RED },
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
