import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'

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

export default function TransactionEditScreen() {
  const router = useRouter()
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
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [tripId, setTripId] = useState<number | null>(null)

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
    setAmount(String(tx.amount))
    setDescription(tx.description)
    setCategory(tx.category ?? null)
    setTripId(tx.trip_id ?? null)
  }, [tx])

  const canSave = useMemo(() => {
    if (!accountId || !tx) return false
    const a = Number(amount)
    if (Number.isNaN(a) || description.trim() === '') return false
    return true
  }, [accountId, amount, description, tx])

  const onSave = () => {
    if (!id || !tx || !canSave) return
    const a = Number(amount)
    update(id, {
      account_id: accountId!,
      date,
      amount: a,
      description: description.trim(),
      category,
      trip_id: tripId,
      source: 'manual',
    })
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

  if (!id) {
    return (
      <BrutalScreen title="Edit" subtitle="Missing id">
        <BrutalBackRow onBack={() => router.back()} />
      </BrutalScreen>
    )
  }

  if (!tx) {
    return (
      <BrutalScreen title="Edit" subtitle="Not found">
        <BrutalBackRow onBack={() => router.back()} />
        <Text style={styles.warn}>Unknown transaction.</Text>
      </BrutalScreen>
    )
  }

  return (
    <BrutalScreen title="Edit transaction" subtitle="Local row">
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <BrutalBackRow onBack={() => router.back()} />
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
              label="Amount"
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
            <View style={styles.actions}>
              <BrutalButton title="Save" onPress={onSave} disabled={!canSave} />
              <BrutalButton title="Delete" variant="neutral" onPress={onDelete} />
            </View>
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
    color: tokens.color.fg,
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
  actions: {
    gap: tokens.space[3],
    marginTop: tokens.space[2],
  },
})
