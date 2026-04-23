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

import {
  BrutalBackRow,
  BrutalButton,
  BrutalCard,
  BrutalScreen,
  BrutalTextField,
} from '@/src/components/Brutalist'
import { useAccountsStore } from '@/src/stores/accountsStore'
import { useCategoriesStore } from '@/src/stores/categoriesStore'
import { useTransactionsStore } from '@/src/stores/transactionsStore'
import { useTripsStore } from '@/src/stores/tripsStore'
import { tokens } from '@/src/theme/tokens'

export default function TransactionNewScreen() {
  const router = useRouter()
  const accounts = useAccountsStore((s) => s.items)
  const loadAccounts = useAccountsStore((s) => s.load)
  const categories = useCategoriesStore((s) => s.items)
  const loadCategories = useCategoriesStore((s) => s.load)
  const trips = useTripsStore((s) => s.items)
  const loadTrips = useTripsStore((s) => s.load)
  const add = useTransactionsStore((s) => s.add)

  const [accountId, setAccountId] = useState<string | null>(null)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
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
    if (!accountId && accounts[0]) setAccountId(accounts[0].id)
  }, [accounts, accountId])

  const canSave = useMemo(() => {
    if (!accountId) return false
    const a = Number(amount)
    if (Number.isNaN(a) || description.trim() === '') return false
    return true
  }, [accountId, amount, description])

  const onSave = () => {
    if (!accountId || !canSave) return
    const a = Number(amount)
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
    })
    router.back()
  }

  return (
    <BrutalScreen title="New transaction" subtitle="Saved locally">
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <BrutalBackRow onBack={() => router.back()} />
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
                  style={[
                    styles.chip,
                    accountId === ac.id && styles.chipOn,
                  ]}
                >
                  <Text style={styles.chipText}>{ac.name}</Text>
                </Pressable>
              ))}
            </View>
            <BrutalTextField label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
            <BrutalTextField
              label="Amount (negative = spend)"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
            <BrutalTextField
              label="Description"
              value={description}
              onChangeText={setDescription}
            />
            <Text style={styles.blockLabel}>Category (optional)</Text>
            <View style={styles.chips}>
              <Pressable
                onPress={() => setCategory(null)}
                style={[styles.chip, category === null && styles.chipOn]}
              >
                <Text style={styles.chipText}>None</Text>
              </Pressable>
              {categories.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setCategory(c.label)}
                  style={[styles.chip, category === c.label && styles.chipOn]}
                >
                  <Text style={styles.chipText}>{c.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.blockLabel}>Trip (optional)</Text>
            <View style={styles.chips}>
              <Pressable
                onPress={() => setTripId(null)}
                style={[styles.chip, tripId === null && styles.chipOn]}
              >
                <Text style={styles.chipText}>None</Text>
              </Pressable>
              {trips.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => setTripId(t.id)}
                  style={[styles.chip, tripId === t.id && styles.chipOn]}
                >
                  <Text style={styles.chipText}>{t.name}</Text>
                </Pressable>
              ))}
            </View>
            <BrutalButton title="Save" onPress={onSave} disabled={!canSave} />
          </BrutalCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </BrutalScreen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingBottom: tokens.space[6] + tokens.space[6] },
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
