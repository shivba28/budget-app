import { useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { BottomSheetModal } from '@gorhom/bottom-sheet'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

import { EmptyState } from '@/src/components/EmptyState'
import { TripNewBottomSheet } from '@/src/components/trips/TripNewBottomSheet'
import { useTripsStore } from '@/src/stores/tripsStore'
import * as txq from '@/src/db/queries/transactions'

const CREAM = '#FAFAF5'
const INK = '#111111'
const YELLOW = '#F5C842'
const GREEN = '#3BCEAC'
const RED = '#FF5E5E'
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

function fmtShortDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
function spendColor(pct: number) { return pct >= 1 ? RED : pct >= 0.75 ? YELLOW : GREEN }

export default function AllTripsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const sheetRef = useRef<BottomSheetModal>(null)
  const [pendingNavId, setPendingNavId] = useState<number | null>(null)

  const items = useTripsStore((s) => s.items)
  const load = useTripsStore((s) => s.load)
  const [refreshing, setRefreshing] = useState(false)

  // Only show trips (type='trip' or legacy rows without type)
  const trips = useMemo(
    () => items.filter((t) => !t.type || t.type === 'trip'),
    [items],
  )

  const spendByTrip = useMemo(() => {
    const map = new Map<number, number>()
    for (const t of txq.listTransactions()) {
      if (t.trip_id == null || (t.pending === 1 && t.user_confirmed !== 1)) continue
      const amt = typeof t.my_share === 'number' && t.my_share > 0
        ? t.my_share : t.amount < 0 ? Math.abs(t.amount) : 0
      if (amt > 0) map.set(t.trip_id, (map.get(t.trip_id) ?? 0) + amt)
    }
    return map
  }, [items])

  useEffect(() => { load() }, [load])

  const onRefresh = () => {
    setRefreshing(true)
    load()
    setRefreshing(false)
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.topbar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          {({ pressed }) => (
            <View style={[styles.backBtnInner, pressed && { opacity: 0.7 }]} pointerEvents="none">
              <Ionicons name="arrow-back" size={20} color={CREAM} />
            </View>
          )}
        </Pressable>
        <Text style={[styles.topbarTitle, { flex: 1 }]} numberOfLines={1}>Trips</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{trips.length} total</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {trips.length === 0 ? (
          <EmptyState
            variant="trips"
            title="No trips yet"
            subtitle="Tap + to log your first trip and track spending by destination."
          />
        ) : trips.map((trip) => {
          const spend = spendByTrip.get(trip.id) ?? 0
          const pct = trip.budget_limit != null && trip.budget_limit > 0
            ? Math.min(1, spend / trip.budget_limit) : null
          return (
            <Pressable key={trip.id} onPress={() => router.push(`/app/trip/${trip.id}`)}>
              {({ pressed }) => (
                <View style={[styles.card, pressed && { opacity: 0.85 }]}>
                  <View style={styles.cardRow}>
                    <Text style={styles.cardName} numberOfLines={1}>{trip.name}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#999" />
                  </View>
                  {(trip.start_date || trip.end_date) ? (
                    <Text style={styles.cardMeta}>
                      {trip.start_date ? fmtShortDate(trip.start_date) : '?'} – {trip.end_date ? fmtShortDate(trip.end_date) : '?'}
                      {trip.budget_limit ? `  ·  Budget $${trip.budget_limit.toLocaleString()}` : ''}
                    </Text>
                  ) : trip.budget_limit ? (
                    <Text style={styles.cardMeta}>Budget ${trip.budget_limit.toLocaleString()}</Text>
                  ) : null}
                  {pct !== null ? (
                    <>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${Math.min(100, pct * 100)}%` as any, backgroundColor: spendColor(pct) }]} />
                      </View>
                      <Text style={styles.cardSpent}>
                        ${spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} spent
                      </Text>
                    </>
                  ) : null}
                </View>
              )}
            </Pressable>
          )
        })}
      </ScrollView>

      {/* FAB */}
      <View style={[styles.fabWrap, { bottom: insets.bottom + 16 }]}>
        <Pressable onPress={() => sheetRef.current?.present()} accessibilityLabel="Add trip">
          {({ pressed }) => (
            <View style={[styles.fab, pressed && styles.fabPressed]} pointerEvents="none">
              <Ionicons name="add" size={36} color={INK} />
            </View>
          )}
        </Pressable>
      </View>

      <TripNewBottomSheet
        ref={sheetRef}
        defaultType="trip"
        onCreated={(id) => setPendingNavId(id)}
        onDismiss={() => {
          if (pendingNavId !== null) {
            router.push(`/app/trip/${pendingNavId}`)
            setPendingNavId(null)
          }
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CREAM },
  topbar: {
    backgroundColor: INK, paddingHorizontal: 14, paddingBottom: 10,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  backBtn: { flexShrink: 0 },
  backBtnInner: {
    width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, borderWidth: 2, borderColor: '#333333',
  },
  topbarTitle: {
    fontFamily: MONO, fontSize: 20,
    fontWeight: Platform.OS === 'ios' ? '800' : '700',
    color: CREAM, letterSpacing: 0.6, textTransform: 'uppercase',
  },
  countBadge: {
    backgroundColor: YELLOW, borderWidth: 2, borderColor: INK,
    paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0,
  },
  countBadgeText: {
    fontFamily: MONO, fontSize: 11, fontWeight: '800', color: INK,
  },
  scroll: { padding: 12 },
  card: {
    borderWidth: 3, borderColor: INK, backgroundColor: CREAM,
    padding: 12, marginBottom: 10,
    shadowColor: INK, shadowOffset: { width: 3, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 3,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardName: { fontFamily: MONO, fontSize: 15, fontWeight: '800', color: INK, flex: 1, marginRight: 6 },
  cardMeta: { fontFamily: MONO, fontSize: 11, color: '#666666', marginTop: 3 },
  barTrack: {
    height: 8, backgroundColor: '#E8E8E0', borderWidth: 2, borderColor: INK,
    marginTop: 8, overflow: 'hidden',
  },
  barFill: { height: '100%' },
  cardSpent: { fontFamily: MONO, fontSize: 10, color: '#666666', marginTop: 3 },
  fabWrap: { position: 'absolute', right: 20, zIndex: 10 },
  fab: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: YELLOW,
    borderWidth: 3, borderColor: INK, alignItems: 'center', justifyContent: 'center',
    shadowColor: INK, shadowOffset: { width: 3, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 6,
  },
  fabPressed: { transform: [{ translateX: 3 }, { translateY: 3 }], shadowOpacity: 0, elevation: 0 },
})
