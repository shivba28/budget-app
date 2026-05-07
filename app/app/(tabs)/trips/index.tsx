/**
 * Planning Hub — top-level tab showing the latest items in each of the three
 * sub-sections: Savings Goals, Trips, and Events.
 *
 * Each section has a "View all →" button that pushes to the respective full
 * list screen where the FAB (add button) lives.
 */
import { useEffect, useMemo } from 'react'
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

import { EmptyState } from '@/src/components/EmptyState'
import { useTripsStore } from '@/src/stores/tripsStore'
import { useSavingsGoalsStore } from '@/src/stores/savingsGoalsStore'
import { useTabStore } from '@/src/stores/tabStore'
import * as txq from '@/src/db/queries/transactions'

const CREAM = '#FAFAF5'
const INK = '#111111'
const YELLOW = '#F5C842'
const GREEN = '#3BCEAC'
const RED_SPEND = '#FF5E5E'
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

function fmtMoney(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2,
  }).format(n)
}
function fmtShortDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
function spendBarColor(pct: number) { return pct >= 1 ? RED_SPEND : pct >= 0.75 ? YELLOW : GREEN }

// ── Shared sub-components ──────────────────────────────────────────────────

function SectionHeader({ title, count, onViewAll }: { title: string; count: number; onViewAll: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <View>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{count} total</Text>
      </View>
      <Pressable onPress={onViewAll}>
        {({ pressed }) => (
          <View style={[styles.viewAllBtn, pressed && styles.viewAllBtnPressed]} pointerEvents="none">
            <Text style={styles.viewAllBtnText}>View all</Text>
            <Ionicons name="arrow-forward" size={12} color={INK} />
          </View>
        )}
      </Pressable>
    </View>
  )
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.sectionCard}>{children}</View>
}

function ViewMoreRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <View style={[styles.viewMoreRow, pressed && { opacity: 0.7 }]} pointerEvents="none">
          <Text style={styles.viewMoreText}>{label}</Text>
          <Ionicons name="chevron-forward" size={14} color={INK} />
        </View>
      )}
    </Pressable>
  )
}

// ── Main Screen ────────────────────────────────────────────────────────────

export default function PlanningScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const activeIndex = useTabStore((s) => s.activeIndex)

  const tripItems = useTripsStore((s) => s.items)
  const loadTrips = useTripsStore((s) => s.load)
  const goalItems = useSavingsGoalsStore((s) => s.items)
  const loadGoals = useSavingsGoalsStore((s) => s.load)

  const trips = useMemo(() => tripItems.filter((t) => !t.type || t.type === 'trip'), [tripItems])
  const events = useMemo(() => tripItems.filter((t) => t.type === 'event'), [tripItems])

  const latestGoals = useMemo(() => goalItems.slice(0, 3), [goalItems])
  const latestTrips = useMemo(() => trips.slice(0, 3), [trips])
  const latestEvents = useMemo(() => events.slice(0, 3), [events])

  const spendByTrip = useMemo(() => {
    const map = new Map<number, number>()
    for (const t of txq.listTransactions()) {
      if (t.trip_id == null || (t.pending === 1 && t.user_confirmed !== 1)) continue
      const amt = typeof t.my_share === 'number' && t.my_share > 0
        ? t.my_share : t.amount < 0 ? Math.abs(t.amount) : 0
      if (amt > 0) map.set(t.trip_id, (map.get(t.trip_id) ?? 0) + amt)
    }
    return map
  }, [tripItems])

  useEffect(() => { loadTrips(); loadGoals() }, [loadTrips, loadGoals])
  useEffect(() => { if (activeIndex === 2) { loadTrips(); loadGoals() } }, [activeIndex, loadTrips, loadGoals])

  return (
    <View style={styles.screen}>
      {/* Top bar */}
      <View style={[styles.topbar, { paddingTop: insets.top + 10 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.topbarTitle}>Planning</Text>
          <Text style={styles.topbarSub}>Goals · Trips · Events</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => { loadTrips(); loadGoals() }} />
        }
      >

        {/* ── SAVINGS GOALS ─────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title="💰  Savings Goals"
            count={goalItems.length}
            onViewAll={() => router.push('/app/all-savings-goals')}
          />
          <SectionCard>
            {latestGoals.length === 0 ? (
              <View style={styles.emptyInCard}>
                <EmptyState
                  variant="savings-goals"
                  title="No savings goals yet"
                  subtitle="Track your progress towards any financial goal."
                />
                <Pressable onPress={() => router.push('/app/all-savings-goals')} style={{ marginTop: -12, marginBottom: 8 }}>
                  {({ pressed }) => (
                    <View style={[styles.addBtn, pressed && styles.addBtnPressed]} pointerEvents="none">
                      <Ionicons name="add" size={16} color={INK} />
                      <Text style={styles.addBtnText}>Add first goal</Text>
                    </View>
                  )}
                </Pressable>
              </View>
            ) : (
              <>
                {latestGoals.map((goal, i) => {
                  const pct = Math.min(1, (goal.current_amount ?? 0) / Math.max(1, goal.target_amount))
                  const pctLabel = Math.round(pct * 100)
                  const accentColor = goal.color ?? YELLOW
                  const barColor = pct >= 1 ? '#3BCEAC' : pct >= 0.6 ? YELLOW : '#457B9D'
                  return (
                    <Pressable key={String(goal.id ?? i)} onPress={() => router.push(`/app/savings-goal/${goal.id}`)}>
                      {({ pressed }) => (
                        <View
                          style={[
                            styles.goalRow,
                            i > 0 && styles.rowBorder,
                            { borderLeftColor: accentColor },
                            pressed && { opacity: 0.8 },
                          ]}
                        >
                          <View style={styles.goalRowTop}>
                            <Text style={styles.goalName} numberOfLines={1}>{goal.name}</Text>
                            <Text style={[styles.goalPct, { color: barColor }]}>{pctLabel}%</Text>
                          </View>
                          <View style={styles.goalBar}>
                            <View style={[styles.goalBarFill, { width: `${pctLabel}%` as any, backgroundColor: barColor }]} />
                          </View>
                          <View style={styles.goalFooter}>
                            <Text style={styles.goalSaved}>{fmtMoney(goal.current_amount ?? 0)}</Text>
                            <Text style={styles.goalTarget}>of {fmtMoney(goal.target_amount)}</Text>
                          </View>
                        </View>
                      )}
                    </Pressable>
                  )
                })}
                {goalItems.length > 3 ? (
                  <ViewMoreRow
                    label={`+${goalItems.length - 3} more goals`}
                    onPress={() => router.push('/app/all-savings-goals')}
                  />
                ) : null}
              </>
            )}
          </SectionCard>
        </View>

        {/* ── TRIPS ─────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title="✈️  Trips"
            count={trips.length}
            onViewAll={() => router.push('/app/all-trips')}
          />
          <SectionCard>
            {latestTrips.length === 0 ? (
              <View style={styles.emptyInCard}>
                <EmptyState
                  variant="trips"
                  title="No trips yet"
                  subtitle="Log destinations and track your travel spending."
                />
                <Pressable onPress={() => router.push('/app/all-trips')} style={{ marginTop: -12, marginBottom: 8 }}>
                  {({ pressed }) => (
                    <View style={[styles.addBtn, pressed && styles.addBtnPressed]} pointerEvents="none">
                      <Ionicons name="add" size={16} color={INK} />
                      <Text style={styles.addBtnText}>Add first trip</Text>
                    </View>
                  )}
                </Pressable>
              </View>
            ) : (
              <>
                {latestTrips.map((trip, i) => {
                  const spend = spendByTrip.get(trip.id) ?? 0
                  const pct = trip.budget_limit != null && trip.budget_limit > 0
                    ? Math.min(1, spend / trip.budget_limit) : null
                  return (
                    <Pressable key={String(trip.id ?? i)} onPress={() => router.push(`/app/trip/${trip.id}`)}>
                      {({ pressed }) => (
                        <View style={[styles.tripRow, i > 0 && styles.rowBorder, pressed && { opacity: 0.8 }]}>
                          <View style={styles.tripRowTop}>
                            <Text style={styles.tripName} numberOfLines={1}>{trip.name}</Text>
                            <Ionicons name="chevron-forward" size={14} color="#999" />
                          </View>
                          {(trip.start_date || trip.end_date || trip.budget_limit) ? (
                            <Text style={styles.tripMeta}>
                              {trip.start_date ? fmtShortDate(trip.start_date) : null}
                              {trip.end_date ? ` – ${fmtShortDate(trip.end_date)}` : null}
                              {trip.budget_limit ? `  ·  $${trip.budget_limit.toLocaleString()}` : null}
                            </Text>
                          ) : null}
                          {pct !== null ? (
                            <>
                              <View style={styles.tripBar}>
                                <View style={[styles.tripBarFill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: spendBarColor(pct) }]} />
                              </View>
                              <Text style={styles.tripSpent}>
                                ${spend.toLocaleString(undefined, { minimumFractionDigits: 2 })} spent
                              </Text>
                            </>
                          ) : null}
                        </View>
                      )}
                    </Pressable>
                  )
                })}
                {trips.length > 3 ? (
                  <ViewMoreRow
                    label={`+${trips.length - 3} more trips`}
                    onPress={() => router.push('/app/all-trips')}
                  />
                ) : null}
              </>
            )}
          </SectionCard>
        </View>

        {/* ── EVENTS ────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title="📅  Events"
            count={events.length}
            onViewAll={() => router.push('/app/all-events')}
          />
          <SectionCard>
            {latestEvents.length === 0 ? (
              <View style={styles.emptyInCard}>
                <EmptyState
                  variant="events"
                  title="No events yet"
                  subtitle="Track spending for birthdays, weddings, and more."
                />
                <Pressable onPress={() => router.push('/app/all-events')} style={{ marginTop: -12, marginBottom: 8 }}>
                  {({ pressed }) => (
                    <View style={[styles.addBtn, pressed && styles.addBtnPressed]} pointerEvents="none">
                      <Ionicons name="add" size={16} color={INK} />
                      <Text style={styles.addBtnText}>Add first event</Text>
                    </View>
                  )}
                </Pressable>
              </View>
            ) : (
              <>
                {latestEvents.map((event, i) => {
                  const spend = spendByTrip.get(event.id) ?? 0
                  const pct = event.budget_limit != null && event.budget_limit > 0
                    ? Math.min(1, spend / event.budget_limit) : null
                  return (
                    <Pressable key={String(event.id ?? i)} onPress={() => router.push(`/app/trip/${event.id}`)}>
                      {({ pressed }) => (
                        <View style={[styles.tripRow, i > 0 && styles.rowBorder, pressed && { opacity: 0.8 }]}>
                          <View style={styles.tripRowTop}>
                            <Text style={styles.tripName} numberOfLines={1}>{event.name}</Text>
                            <Ionicons name="chevron-forward" size={14} color="#999" />
                          </View>
                          {(event.start_date || event.budget_limit) ? (
                            <Text style={styles.tripMeta}>
                              {event.start_date ? fmtShortDate(event.start_date) : null}
                              {event.end_date && event.end_date !== event.start_date ? ` – ${fmtShortDate(event.end_date)}` : null}
                              {event.budget_limit ? `  ·  $${event.budget_limit.toLocaleString()}` : null}
                            </Text>
                          ) : null}
                          {pct !== null ? (
                            <>
                              <View style={styles.tripBar}>
                                <View style={[styles.tripBarFill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: spendBarColor(pct) }]} />
                              </View>
                              <Text style={styles.tripSpent}>
                                ${spend.toLocaleString(undefined, { minimumFractionDigits: 2 })} spent
                              </Text>
                            </>
                          ) : null}
                        </View>
                      )}
                    </Pressable>
                  )
                })}
                {events.length > 3 ? (
                  <ViewMoreRow
                    label={`+${events.length - 3} more events`}
                    onPress={() => router.push('/app/all-events')}
                  />
                ) : null}
              </>
            )}
          </SectionCard>
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
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  topbarTitle: {
    fontFamily: MONO,
    fontSize: 20,
    fontWeight: Platform.OS === 'ios' ? '800' : '700',
    color: CREAM,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  topbarSub: {
    fontFamily: MONO,
    fontSize: 11,
    color: '#888888',
    letterSpacing: 0.3,
    marginTop: 2,
  },

  scroll: { paddingTop: 4 },
  section: { paddingHorizontal: 14, marginBottom: 4 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: MONO,
    fontSize: 14,
    fontWeight: '800',
    color: INK,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sectionCount: {
    fontFamily: MONO,
    fontSize: 10,
    color: '#888888',
    marginTop: 1,
    letterSpacing: 0.3,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 2,
    borderColor: INK,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: CREAM,
    shadowColor: INK,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  viewAllBtnPressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
    shadowOpacity: 0,
    elevation: 0,
  },
  viewAllBtnText: {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: '800',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  sectionCard: {
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: CREAM,
    shadowColor: INK,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
    overflow: 'hidden',
  },

  emptyInCard: { alignItems: 'center', paddingTop: 4 },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: YELLOW,
    paddingHorizontal: 16,
    paddingVertical: 8,
    shadowColor: INK,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
    marginBottom: 4,
  },
  addBtnPressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
    shadowOpacity: 0,
    elevation: 0,
  },
  addBtnText: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '800',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  rowBorder: { borderTopWidth: 1, borderTopColor: '#E8E8E0' },

  viewMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E0',
    backgroundColor: '#F5F5EE',
  },
  viewMoreText: {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: '800',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Savings goal row
  goalRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderLeftWidth: 4,
    borderLeftColor: YELLOW,
  },
  goalRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  goalName: { fontFamily: MONO, fontSize: 14, fontWeight: '800', color: INK, flex: 1, marginRight: 6 },
  goalPct: { fontFamily: MONO, fontSize: 12, fontWeight: '800' },
  goalBar: {
    height: 8,
    backgroundColor: '#E8E8E0',
    borderWidth: 1,
    borderColor: '#CCCCCC',
    overflow: 'hidden',
    borderRadius: 2,
    marginBottom: 5,
  },
  goalBarFill: { height: '100%' },
  goalFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  goalSaved: { fontFamily: MONO, fontSize: 11, fontWeight: '800', color: INK },
  goalTarget: { fontFamily: MONO, fontSize: 11, color: '#666666' },

  // Trip/event row
  tripRow: { paddingVertical: 10, paddingHorizontal: 12 },
  tripRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tripName: { fontFamily: MONO, fontSize: 14, fontWeight: '800', color: INK, flex: 1, marginRight: 6 },
  tripMeta: { fontFamily: MONO, fontSize: 11, color: '#666666', marginTop: 3 },
  tripBar: {
    height: 7,
    backgroundColor: '#E8E8E0',
    borderWidth: 1,
    borderColor: '#CCCCCC',
    overflow: 'hidden',
    borderRadius: 2,
    marginTop: 6,
    marginBottom: 3,
  },
  tripBarFill: { height: '100%' },
  tripSpent: { fontFamily: MONO, fontSize: 10, color: '#666666' },
})
