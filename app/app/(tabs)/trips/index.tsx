import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { BottomSheetModal } from '@gorhom/bottom-sheet'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import * as txq from '@/src/db/queries/transactions'
import { TripNewBottomSheet } from '@/src/components/trips/TripNewBottomSheet'
import { useTripsStore } from '@/src/stores/tripsStore'
import { useUiSignals } from '@/src/stores/uiSignals'
import { useTabStore } from '@/src/stores/tabStore'

const CREAM = '#FAFAF5'
const INK = '#111111'
const MUTED = '#E8E8E0'
const YELLOW = '#F5C842'
const GREEN = '#3BCEAC'
const RED = '#FF5E5E'
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

function spendColor(pct: number): string {
  if (pct >= 1) return RED
  if (pct >= 0.75) return YELLOW
  return GREEN
}

function formatShortDate(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function tripMeta(trip: { budget_limit: number | null; start_date: string | null; end_date: string | null }): string | null {
  const parts: string[] = []
  if (trip.budget_limit != null) parts.push(`Cap $${trip.budget_limit.toLocaleString()}`)
  if (trip.start_date || trip.end_date) {
    const s = trip.start_date ? formatShortDate(trip.start_date) : '?'
    const e = trip.end_date ? formatShortDate(trip.end_date) : '?'
    parts.push(`${s} – ${e}`)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

export default function TripsListScreen() {
  const activeIndex = useTabStore((s) => s.activeIndex)
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const items = useTripsStore((s) => s.items)
  const load = useTripsStore((s) => s.load)
  const addTripSignal = useUiSignals((s) => s.addTripSignal)
  const sheetRef = useRef<BottomSheetModal>(null)
  const mountedTripSignalRef = useRef(addTripSignal)
  const [pendingNavId, setPendingNavId] = useState<number | null>(null)

  // Initial load
  useEffect(() => { load() }, [load])
  // Reload when trips tab becomes active (replaces useFocusEffect)
  useEffect(() => { if (activeIndex === 2) load() }, [activeIndex, load])

  useEffect(() => {
    if (addTripSignal <= mountedTripSignalRef.current) return
    sheetRef.current?.present()
  }, [addTripSignal])

  const onCreated = (id: number) => {
    setPendingNavId(id)
  }

  const onSheetDismiss = () => {
    if (pendingNavId !== null) {
      router.push(`/app/trip/${pendingNavId}`)
      setPendingNavId(null)
    }
  }

  const spendByTrip = useMemo(() => {
    const map = new Map<number, number>()
    for (const t of txq.listTransactions()) {
      if (t.trip_id == null) continue
      if (t.pending === 1 && t.user_confirmed !== 1) continue
      const amt = typeof t.my_share === 'number' && t.my_share > 0
        ? t.my_share
        : t.amount < 0 ? Math.abs(t.amount) : 0
      if (amt <= 0) continue
      map.set(t.trip_id, (map.get(t.trip_id) ?? 0) + amt)
    }
    return map
  }, [items])

  return (
    <View style={styles.screen}>
      <View style={[styles.topbar, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.topbarTitle}>Trips</Text>
        <Text style={styles.topbarSub}>Tag spending</Text>
      </View>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 76 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>Your trips</Text>
        {items.length === 0 ? (
          <Text style={styles.empty}>No trips yet — tap + to create one.</Text>
        ) : (
          items.map((trip) => {
            const spend = spendByTrip.get(trip.id) ?? 0
            const pct = trip.budget_limit != null && trip.budget_limit > 0
              ? Math.min(1, spend / trip.budget_limit)
              : null
            const meta = tripMeta(trip)
            return (
              <Pressable
                key={trip.id}
                onPress={() => router.push(`/app/trip/${trip.id}`)}
                style={({ pressed }) => pressed && { opacity: 0.85 }}
              >
                <View style={styles.tripCard}>
                  <View style={styles.tripRow}>
                    <Text style={styles.tripName}>{trip.name}</Text>
                    <Text style={styles.tripChev}>›</Text>
                  </View>
                  {meta ? <Text style={styles.tripMeta}>{meta}</Text> : null}
                  {pct !== null ? (
                    <>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${pct * 100}%` as any, backgroundColor: spendColor(pct) }]} />
                      </View>
                      <Text style={styles.tripSpent}>
                        ${spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} spent
                      </Text>
                    </>
                  ) : null}
                </View>
              </Pressable>
            )
          })
        )}
      </ScrollView>
      <TripNewBottomSheet
        ref={sheetRef}
        onCreated={onCreated}
        onDismiss={onSheetDismiss}
      />
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
  sectionLabel: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: INK,
    marginBottom: 6,
  },
  empty: {
    fontFamily: MONO,
    fontSize: 13,
    color: '#666666',
    paddingVertical: 12,
  },
  tripCard: {
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: CREAM,
    padding: 10,
    marginBottom: 6,
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tripName: {
    fontFamily: MONO,
    fontSize: 14,
    fontWeight: '800',
    color: INK,
  },
  tripChev: {
    fontFamily: MONO,
    fontSize: 14,
    color: '#999999',
  },
  tripMeta: {
    fontFamily: MONO,
    fontSize: 11,
    color: '#666666',
    marginTop: 3,
  },
  progressTrack: {
    height: 8,
    backgroundColor: MUTED,
    borderWidth: 2,
    borderColor: INK,
    marginTop: 5,
  },
  progressFill: { height: '100%' },
  tripSpent: {
    fontFamily: MONO,
    fontSize: 10,
    color: '#666666',
    marginTop: 2,
  },
})
