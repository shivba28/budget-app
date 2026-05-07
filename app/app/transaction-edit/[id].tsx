import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { DateInput } from '@/src/components/DateInput'
import { CalculatorAmountInput } from '@/src/components/CalculatorAmountInput'
import { evaluateExpression } from '@/src/lib/evaluateExpression'

import { useAccountsStore } from '@/src/stores/accountsStore'
import { useCategoriesStore } from '@/src/stores/categoriesStore'
import { useTransactionsStore } from '@/src/stores/transactionsStore'
import { useTripsStore } from '@/src/stores/tripsStore'
import * as recurringQ from '@/src/db/queries/recurringRules'
import {
  linkExistingTransactionToNewRecurrence,
  type ManualRecurrenceCadence,
} from '@/src/lib/transactions/manualRecurring'
import { ensureRecurringTransactionsSeeded } from '@/src/lib/transactions/recurringAutoAdd'

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

export default function TransactionEditScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id?: string }>()
  const items = useTransactionsStore((s) => s.items)
  const load = useTransactionsStore((s) => s.load)
  const update = useTransactionsStore((s) => s.update)
  const remove = useTransactionsStore((s) => s.remove)

  const accounts = useAccountsStore((s) => s.items)
  const loadAccounts = useAccountsStore((s) => s.load)
  const categories = useCategoriesStore((s) => s.items)
  const loadCategories = useCategoriesStore((s) => s.load)
  const trips = useTripsStore((s) => s.items)
  const loadTrips = useTripsStore((s) => s.load)

  const tx = useMemo(
    () => (id ? items.find((t) => t.id === id) : undefined),
    [id, items],
  )

  const [accountId, setAccountId] = useState<string | null>(null)
  const [date, setDate] = useState('')
  const [amountAbs, setAmountAbs] = useState('')
  const [amountSign, setAmountSign] = useState<'out' | 'in'>('out')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [tripId, setTripId] = useState<number | null>(null)
  const [recurrence, setRecurrence] = useState<ManualRecurrenceCadence | 'none'>('none')
  const [untilDate, setUntilDate] = useState('')
  const [loadedRuleForTx, setLoadedRuleForTx] = useState<string | null>(null)
  const [loadedUntilDate, setLoadedUntilDate] = useState<string | null>(null)

  useEffect(() => {
    load()
    loadAccounts()
    loadCategories()
    loadTrips()
  }, [load, loadAccounts, loadCategories, loadTrips])

  useEffect(() => {
    if (!tx) return
    setAccountId(tx.account_id)
    setDate(tx.date)
    setAmountAbs(String(Math.abs(tx.amount)))
    setAmountSign(tx.amount < 0 ? 'out' : 'in')
    setDescription(tx.description)
    setNotes(tx.notes ?? '')
    setCategory(tx.category ?? null)
    setTripId(tx.trip_id ?? null)
    const rid = (tx as any).recurring_rule_id as string | null | undefined
    if (rid) {
      const rule = recurringQ.getRecurringRule(rid)
      if (rule?.cadence) {
        setRecurrence(rule.cadence as ManualRecurrenceCadence)
        setLoadedRuleForTx(rid)
        setLoadedUntilDate(rule.until_date ?? null)
        setUntilDate(rule.until_date ?? '')
      } else {
        setRecurrence('none')
        setLoadedRuleForTx(null)
        setLoadedUntilDate(null)
        setUntilDate('')
      }
    } else {
      setRecurrence('none')
      setLoadedRuleForTx(null)
      setLoadedUntilDate(null)
      setUntilDate('')
    }
  }, [tx])

  const canSave = useMemo(() => {
    if (!accountId || !tx) return false
    const a = evaluateExpression(amountAbs)
    return a !== null && description.trim() !== ''
  }, [accountId, amountAbs, description, tx])

  const untilDateOrNull = useMemo(() => {
    if (recurrence === 'none') return null
    const t = untilDate.trim()
    if (!t) return null
    return t
  }, [recurrence, untilDate])

  const onSave = () => {
    if (!id || !tx || !canSave) return
    const abs = evaluateExpression(amountAbs) ?? 0
    const signedAmt = amountSign === 'out' ? -Math.abs(abs) : Math.abs(abs)
    update(id, {
      account_id: accountId!,
      date,
      amount: signedAmt,
      description: description.trim(),
      notes: notes.trim() || null,
      category,
      trip_id: tripId,
      source: 'manual',
    })

    if (recurrence !== 'none') {
      // If this tx isn't already linked to a rule, or user changed cadence, create a fresh rule and generate future occurrences.
      const prevCadence = loadedRuleForTx ? recurringQ.getRecurringRule(loadedRuleForTx)?.cadence : null
      const prevUntil = loadedRuleForTx ? (recurringQ.getRecurringRule(loadedRuleForTx)?.until_date ?? null) : null
      if (!loadedRuleForTx || (prevCadence && prevCadence !== recurrence) || prevUntil !== untilDateOrNull) {
        linkExistingTransactionToNewRecurrence({
          transactionId: id,
          accountId: accountId!,
          date,
          amount: signedAmt,
          description: description.trim(),
          category,
          tripId,
          cadence: recurrence,
          untilDate: untilDateOrNull,
        })
        ensureRecurringTransactionsSeeded()
        load()
      }
    }
    router.back()
  }

  const onDelete = () => {
    if (!id) return
    Alert.alert('Delete transaction', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          remove(id)
          router.back()
        },
      },
    ])
  }

  const txAccount = useMemo(
    () => accounts.find((a) => a.id === tx?.account_id),
    [accounts, tx?.account_id],
  )

  if (!id || !tx) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.topbar}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
            <Text style={styles.backChev}>‹</Text>
          </Pressable>
          <Text style={styles.tbTitle}>Edit transaction</Text>
        </View>
        <View style={styles.body}>
          <Text style={styles.warn}>{!id ? 'Missing id.' : 'Transaction not found.'}</Text>
        </View>
      </View>
    )
  }

  const isIncome = tx.amount >= 0

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topbar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.backChev}>‹</Text>
        </Pressable>
        <Text style={styles.tbTitle}>Edit transaction</Text>
        <Text style={styles.tbSub}>Local row</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Summary card */}
          <View style={styles.summaryCard}>
            <View style={styles.row}>
              <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>
              <Text style={[styles.txAmount, isIncome ? styles.amountCredit : styles.amountDebit]}>
                {formatAmount(tx.amount)}
              </Text>
            </View>
            <Text style={styles.txMeta}>
              {tx.date}
              {tx.category ? ` · ${tx.category}` : ''}
              {txAccount ? ` · ${txAccount.name}` : ''}
              {tx.pending === 1
                ? <Text style={styles.pendingBadge}>{' PENDING'}</Text>
                : null}
            </Text>
            {tx.notes ? (
              <Text style={styles.txNotes} numberOfLines={2}>{tx.notes}</Text>
            ) : null}
          </View>

          {/* Form card */}
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Account</Text>
            <View style={styles.chips}>
              {accounts.map((ac) => (
                <Pressable
                  key={ac.id}
                  onPress={() => setAccountId(ac.id)}
                  style={({ pressed }) => [styles.chip, accountId === ac.id && styles.chipOn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.chipText}>{ac.name}</Text>
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
            />
            <View style={styles.chips}>
              <Pressable
                onPress={() => setAmountSign('out')}
                style={({ pressed }) => [styles.chip, amountSign === 'out' && styles.chipOn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.chipText}>Spend (−)</Text>
              </Pressable>
              <Pressable
                onPress={() => setAmountSign('in')}
                style={({ pressed }) => [styles.chip, amountSign === 'in' && styles.chipOn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.chipText}>Income (+)</Text>
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={styles.fieldInput}
              value={description}
              onChangeText={setDescription}
              placeholderTextColor="#999"
              placeholder="Merchant name or note…"
            />

            <Text style={styles.fieldLabel}>Notes (optional)</Text>
            <TextInput
              style={[styles.fieldInput, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholderTextColor="#999"
              placeholder="Any extra detail…"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <Text style={styles.sectionLabel}>Category (optional)</Text>
            <View style={styles.chips}>
              <Pressable
                onPress={() => setCategory(null)}
                style={({ pressed }) => [styles.chip, category === null && styles.chipOn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.chipText}>None</Text>
              </Pressable>
              {categories.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setCategory(c.label)}
                  style={({ pressed }) => [
                    styles.chip,
                    category === c.label && styles.chipOn,
                    category === c.label && c.color ? { backgroundColor: c.color } : null,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.chipText}>{c.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Trip / event (optional)</Text>
            <View style={styles.chips}>
              <Pressable
                onPress={() => setTripId(null)}
                style={({ pressed }) => [styles.chip, tripId === null && styles.chipOn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.chipText}>None</Text>
              </Pressable>
              {trips.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => setTripId(t.id)}
                  style={({ pressed }) => [styles.chip, tripId === t.id && styles.chipOn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.chipText}>{t.name}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Recurring (optional)</Text>
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
                  style={({ pressed }) => [
                    styles.chip,
                    recurrence === key && styles.chipOn,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.chipText}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {recurrence !== 'none' ? (
              <>
                <Text style={styles.sectionLabel}>Repeat until (optional)</Text>
                <DateInput value={untilDate} onChange={setUntilDate} style={styles.fieldInput} placeholder="Until date" />
              </>
            ) : null}

            <View style={styles.btnGroup}>
              <Pressable
                onPress={onSave}
                disabled={!canSave}
                style={({ pressed }) => [styles.btnPressable, pressed && { opacity: 0.85 }]}
              >
                <View style={[styles.btn, styles.btnYellow, !canSave && styles.btnDisabled]}>
                  <Text style={styles.btnText}>Save</Text>
                </View>
              </Pressable>
              <Pressable
                onPress={onDelete}
                style={({ pressed }) => [styles.btnPressable, pressed && { opacity: 0.85 }]}
              >
                <View style={[styles.btn, styles.btnRed]}>
                  <Text style={styles.btnText}>Delete</Text>
                </View>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: CREAM,
  },
  flex: { flex: 1 },
  topbar: {
    backgroundColor: INK,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: CREAM,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  backChev: {
    color: CREAM,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
  tbTitle: {
    fontFamily: MONO,
    fontSize: 15,
    fontWeight: '700',
    color: CREAM,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  tbSub: {
    fontFamily: MONO,
    fontSize: 12,
    color: '#aaaaaa',
    marginLeft: 'auto',
  },
  body: {
    padding: 10,
    gap: 8,
  },
  summaryCard: {
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: MUTED,
    padding: 8,
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  txDesc: {
    fontFamily: MONO,
    fontSize: 16,
    fontWeight: '800',
    color: INK,
    flex: 1,
  },
  txAmount: {
    fontFamily: MONO,
    fontSize: 16,
    fontWeight: '800',
  },
  amountDebit: { color: RED },
  amountCredit: { color: GREEN },
  txMeta: {
    fontFamily: MONO,
    fontSize: 12,
    color: '#666666',
    marginTop: 3,
  },
  pendingBadge: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '800',
    backgroundColor: YELLOW,
    color: INK,
  },
  txNotes: {
    fontFamily: MONO,
    fontSize: 12,
    color: '#555555',
    marginTop: 5,
    fontStyle: 'italic',
  },
  card: {
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: CREAM,
    padding: 10,
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  sectionLabel: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: INK,
    marginBottom: 6,
    marginTop: 4,
  },
  fieldLabel: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: INK,
    marginBottom: 3,
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
    marginBottom: 10,
  },
  notesInput: {
    minHeight: 72,
    paddingTop: 7,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  chip: {
    borderWidth: 2,
    borderColor: INK,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: CREAM,
  },
  chipOn: {
    backgroundColor: YELLOW,
  },
  chipText: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '800',
    color: INK,
  },
  btnGroup: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  btnPressable: {
    flex: 1,
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
  btnRed: { backgroundColor: RED },
  btnDisabled: { opacity: 0.45 },
  btnText: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '800',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  warn: {
    fontFamily: MONO,
    fontSize: 12,
    color: INK,
    padding: 10,
  },
})
