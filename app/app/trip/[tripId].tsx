import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
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
import * as txq from '@/src/db/queries/transactions'
import { useTripsStore } from '@/src/stores/tripsStore'

const CREAM = '#FAFAF5'
const INK = '#111111'
const MUTED = '#E8E8E0'
const YELLOW = '#F5C842'
const RED = '#FF5E5E'
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
}

export default function TripDetailScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { tripId } = useLocalSearchParams<{ tripId?: string }>()
  const id = tripId ? Number(tripId) : NaN
  const items = useTripsStore((s) => s.items)
  const load = useTripsStore((s) => s.load)
  const update = useTripsStore((s) => s.update)
  const remove = useTripsStore((s) => s.remove)

  const trip = useMemo(() => items.find((t) => t.id === id), [items, id])

  const [name, setName] = useState('')
  const [budget, setBudget] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!trip) return
    setName(trip.name)
    setBudget(trip.budget_limit != null ? String(trip.budget_limit) : '')
    setStart(trip.start_date ?? '')
    setEnd(trip.end_date ?? '')
  }, [trip?.id])

  const tripTxns = useMemo(() => {
    if (!Number.isFinite(id)) return []
    return txq.listTransactions()
      .filter((t) => t.trip_id === id && !(t.pending === 1 && t.user_confirmed !== 1))
      .sort((a, b) => {
        const da = a.effective_date ?? a.date
        const db2 = b.effective_date ?? b.date
        return db2.localeCompare(da)
      })
  }, [id, items])

  const totalSpent = useMemo(() => tripTxns.reduce((sum, t) => {
    const amt = typeof t.my_share === 'number' && t.my_share > 0
      ? t.my_share
      : t.amount < 0 ? Math.abs(t.amount) : 0
    return sum + amt
  }, 0), [tripTxns])

  const isDirty = useMemo(() => {
    if (!trip) return false
    return (
      name.trim() !== trip.name ||
      budget !== (trip.budget_limit != null ? String(trip.budget_limit) : '') ||
      start !== (trip.start_date ?? '') ||
      end !== (trip.end_date ?? '')
    )
  }, [trip, name, budget, start, end])

  const onSave = () => {
    if (!trip) return
    const lim = budget.trim() === '' ? null : Number(budget)
    update(id, {
      name: name.trim() || trip.name,
      start_date: start.trim() || null,
      end_date: end.trim() || null,
      budget_limit: lim !== null && !Number.isNaN(lim) ? lim : null,
    })
  }

  const onDelete = () => {
    Alert.alert('Delete', 'Transactions linked to this will be unlinked.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { remove(id); router.back() } },
    ])
  }

  const topbar = (title: string) => (
    <View style={[styles.topbar, { paddingTop: insets.top + 10 }]}>
      <Pressable onPress={() => router.back()} style={({ pressed }) => pressed && { opacity: 0.7 }}>
        <Text style={styles.backChev}>‹</Text>
      </Pressable>
      <Text style={styles.topbarTitle} numberOfLines={1}>{title}</Text>
      {trip ? <Text style={styles.topbarSub}>Edit</Text> : null}
    </View>
  )

  if (!Number.isFinite(id) || !trip) {
    return (
      <View style={styles.screen}>
        {topbar('Not found')}
        <View style={{ padding: 16 }}>
          <Text style={{ fontFamily: MONO, color: INK }}>Not found.</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      {topbar(trip.name)}
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Edit form */}
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            style={styles.fieldInput}
            value={name}
            onChangeText={setName}
            autoCorrect={false}
          />
          <Text style={styles.fieldLabel}>Budget cap (optional)</Text>
          <TextInput
            style={styles.fieldInput}
            value={budget}
            onChangeText={setBudget}
            keyboardType="decimal-pad"
            placeholder="e.g. 3200"
            placeholderTextColor="#999"
          />
          <Text style={styles.fieldLabel}>Start date</Text>
          <DateInput value={start} onChange={setStart} style={styles.fieldInput} />
          <Text style={styles.fieldLabel}>End date</Text>
          <DateInput value={end} onChange={setEnd} style={[styles.fieldInput, { marginBottom: 12 }]} />
          <View style={styles.btnGroup}>
            <Pressable onPress={onSave} disabled={!isDirty}>
              {({ pressed }) => (
                <View style={[styles.btn, styles.btnYellow, !isDirty && styles.btnDisabled, pressed && isDirty && styles.btnPressed]} pointerEvents="none">
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
        </View>

        {/* Spend summary */}
        <View style={[styles.card, styles.cardMuted]}>
          <Text style={styles.sectionLabel}>Spend</Text>
          <View style={styles.spendRow}>
            <Text style={styles.spendLabel}>Total spent</Text>
            <Text style={styles.spendTotal}>{formatMoney(totalSpent)}</Text>
          </View>
          {tripTxns.length > 0 ? (
            <>
              <View style={styles.divider} />
              {tripTxns.map((t) => {
                const amt = typeof t.my_share === 'number' && t.my_share > 0
                  ? t.my_share
                  : t.amount < 0 ? Math.abs(t.amount) : null
                if (amt == null) return null
                return (
                  <View key={t.id} style={styles.txRow}>
                    <Text style={styles.txDesc} numberOfLines={1}>{t.description}</Text>
                    <Text style={styles.txAmt}>{formatMoney(amt)}</Text>
                  </View>
                )
              })}
            </>
          ) : (
            <Text style={styles.empty}>No transactions linked yet.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CREAM },
  topbar: {
    backgroundColor: INK,
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backChev: {
    fontFamily: MONO,
    fontSize: 24,
    fontWeight: '900',
    color: CREAM,
    lineHeight: 24,
  },
  topbarTitle: {
    fontFamily: MONO,
    fontSize: 18,
    fontWeight: '800',
    color: CREAM,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    flexShrink: 1,
    minWidth: 0,
  },
  topbarSub: {
    fontFamily: MONO,
    fontSize: 12,
    color: '#888888',
    flexShrink: 0,
    marginLeft: 'auto',
  },
  scroll: { padding: 12 },
  card: {
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: CREAM,
    padding: 12,
    marginBottom: 10,
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  cardMuted: { backgroundColor: MUTED },
  fieldLabel: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: INK,
    marginBottom: 4,
    marginTop: 8,
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
    marginBottom: 4,
  },
  btnGroup: { gap: 8, marginTop: 4 },
  btn: {
    borderWidth: 3,
    borderColor: INK,
    paddingVertical: 10,
    alignItems: 'center',
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  btnYellow: { backgroundColor: YELLOW },
  btnRed: { backgroundColor: RED },
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
  sectionLabel: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: INK,
    marginBottom: 8,
  },
  spendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  spendLabel: {
    fontFamily: MONO,
    fontSize: 15,
    color: INK,
  },
  spendTotal: {
    fontFamily: MONO,
    fontSize: 15,
    fontWeight: '800',
    color: INK,
  },
  divider: {
    height: 2,
    backgroundColor: INK,
    marginBottom: 8,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  txDesc: {
    fontFamily: MONO,
    fontSize: 14,
    color: INK,
    flex: 1,
    marginRight: 8,
  },
  txAmt: {
    fontFamily: MONO,
    fontSize: 14,
    fontWeight: '800',
    color: INK,
  },
  empty: {
    fontFamily: MONO,
    fontSize: 12,
    color: '#666666',
    paddingTop: 4,
  },
})
