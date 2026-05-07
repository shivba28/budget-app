import { useEffect, useMemo, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

import { DateInput } from '@/src/components/DateInput'
import {
  BrutalButton,
  BrutalCard,
  BrutalTextField,
} from '@/src/components/Brutalist'
import { CalculatorAmountInput } from '@/src/components/CalculatorAmountInput'
import { evaluateExpression } from '@/src/lib/evaluateExpression'
import { useAccountsStore } from '@/src/stores/accountsStore'
import { useCategoriesStore } from '@/src/stores/categoriesStore'
import { useTransactionsStore } from '@/src/stores/transactionsStore'
import { useTripsStore } from '@/src/stores/tripsStore'
import { tokens } from '@/src/theme/tokens'
import {
  createManualRecurringTransactions,
  type ManualRecurrenceCadence,
} from '@/src/lib/transactions/manualRecurring'
import { ensureRecurringTransactionsSeeded } from '@/src/lib/transactions/recurringAutoAdd'

export default function TransactionNewScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
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
  const [notes, setNotes] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [tripId, setTripId] = useState<number | null>(null)
  const [recurrence, setRecurrence] = useState<ManualRecurrenceCadence | 'none'>('none')
  const [untilDate, setUntilDate] = useState('')

  useEffect(() => {
    loadAccounts()
    loadCategories()
    loadTrips()
  }, [loadAccounts, loadCategories, loadTrips])

  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id)
  }, [accounts, accountId])

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
        notes: notes.trim() || null,
        category,
        detail_category: null,
        pending: 0,
        user_confirmed: 1,
        source: 'manual',
        account_label: null,
        synced_at: null,
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
      // Seed anything due right away (and rolling fallback if untilDate is blank).
      ensureRecurringTransactionsSeeded()
      loadTx()
    }
    router.back()
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.statusBarFill, { height: insets.top }]} />
      {/* Top bar — matches app header style */}
      <View style={[styles.topbar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          {({ pressed }) => (
            <View style={[styles.backBtnInner, pressed && { opacity: 0.7 }]} pointerEvents="none">
              <Ionicons name="arrow-back" size={20} color="#FAFAF5" />
            </View>
          )}
        </Pressable>
        <View style={styles.topbarMid}>
          <Text style={styles.topbarTitle}>New Transaction</Text>
          <Text style={styles.topbarSub}>Saved locally</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {accounts.length === 0 ? (
            <Text style={styles.warn}>
              Add a manual account in Settings first.
            </Text>
          ) : null}
          <BrutalCard>
            <Text style={styles.blockLabel}>Account</Text>
            <View style={styles.chips}>
              {accounts.map((ac) => (
                <Pressable
                  key={ac.id}
                  onPress={() => setAccountId(ac.id)}
                  style={({ pressed }) => [
                    styles.chip,
                    accountId === ac.id && styles.chipOn,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.chipText}>{ac.name}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.blockLabel}>Date</Text>
            <DateInput value={date} onChange={setDate} style={styles.dateInput} />
            <CalculatorAmountInput
              label="Amount"
              value={amountAbs}
              onChangeText={setAmountAbs}
              inputStyle={styles.amountInput}
              wrapperStyle={styles.amountWrap}
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
            <BrutalTextField
              label="Description"
              value={description}
              onChangeText={setDescription}
            />
            <BrutalTextField
              label="Notes (optional)"
              value={notes}
              onChangeText={setNotes}
              placeholder="Any extra detail…"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={{ minHeight: 72, paddingTop: 8 }}
            />
            <Text style={styles.blockLabel}>Category (optional)</Text>
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
                  style={({ pressed }) => [styles.chip, category === c.label && styles.chipOn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.chipText}>{c.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.blockLabel}>Trip / event (optional)</Text>
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
            <Text style={styles.blockLabel}>Recurring (optional)</Text>
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
                <Text style={styles.blockLabel}>Repeat until (optional)</Text>
                <DateInput value={untilDate} onChange={setUntilDate} style={styles.dateInput} placeholder="Until date" />
              </>
            ) : null}
            <BrutalButton title="Save" onPress={onSave} disabled={!canSave} />
          </BrutalCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const NEO_MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FAFAF5' },
  statusBarFill: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: '#111111' },
  flex: { flex: 1 },

  // ── Topbar (matches app header style) ─────────────────
  topbar: {
    backgroundColor: '#111111',
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: { flexShrink: 0 },
  backBtnInner: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#333333',
  },
  topbarMid: { flex: 1, minWidth: 0 },
  topbarTitle: {
    fontFamily: NEO_MONO,
    fontSize: 18,
    fontWeight: Platform.OS === 'ios' ? '800' : '700',
    color: '#FAFAF5',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  topbarSub: {
    fontFamily: NEO_MONO,
    fontSize: 11,
    color: '#aaaaaa',
    letterSpacing: 0.3,
    marginTop: 1,
  },
  amountWrap: { marginBottom: tokens.space[4] },
  amountInput: {
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space[4],
    paddingVertical: tokens.space[3],
    fontSize: 16,
    fontWeight: '600',
    color: tokens.color.fg,
    backgroundColor: tokens.color.card,
  },
  scroll: { paddingBottom: 0 },
  warn: {
    fontFamily: tokens.font.mono,
    color: tokens.color.debit,
    marginBottom: tokens.space[3],
  },
  blockLabel: {
    fontFamily: tokens.font.mono,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: tokens.space[2],
    marginTop: tokens.space[2],
    color: tokens.color.fg,
  },
  dateInput: {
    marginBottom: tokens.space[3],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space[2],
    marginBottom: tokens.space[3],
  },
  chip: {
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[2],
    backgroundColor: tokens.color.card,
  },
  chipOn: {
    backgroundColor: tokens.color.accent,
  },
  chipText: {
    fontWeight: '700',
    fontSize: 13,
    color: tokens.color.fg,
  },
})
