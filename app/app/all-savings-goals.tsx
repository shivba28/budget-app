import { useEffect, useRef } from 'react'
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { BottomSheetModal } from '@gorhom/bottom-sheet'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

import { EmptyState } from '@/src/components/EmptyState'
import { SavingsGoalBottomSheet } from '@/src/components/savings/SavingsGoalBottomSheet'
import { useSavingsGoalsStore } from '@/src/stores/savingsGoalsStore'

const CREAM = '#FAFAF5'
const INK = '#111111'
const YELLOW = '#F5C842'
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

function fmtMoney(n: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)
}

export default function AllSavingsGoalsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const sheetRef = useRef<BottomSheetModal>(null)

  const items = useSavingsGoalsStore((s) => s.items)
  const load = useSavingsGoalsStore((s) => s.load)

  useEffect(() => { load() }, [load])

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
        <Text style={[styles.topbarTitle, { flex: 1 }]} numberOfLines={1}>Savings Goals</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{items.length} total</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
      >
        {items.length === 0 ? (
          <EmptyState
            variant="savings-goals"
            title="No savings goals yet"
            subtitle="Tap + to set a goal and track your progress towards it."
          />
        ) : items.map((goal) => {
          const pct = Math.min(1, (goal.current_amount ?? 0) / Math.max(1, goal.target_amount))
          const pctLabel = Math.round(pct * 100)
          const remaining = Math.max(0, goal.target_amount - (goal.current_amount ?? 0))
          const accentColor = goal.color ?? YELLOW
          const barColor = pct >= 1 ? '#3BCEAC' : pct >= 0.6 ? '#F5C842' : '#457B9D'

          return (
            <Pressable key={goal.id} onPress={() => router.push(`/app/savings-goal/${goal.id}`)}>
              {({ pressed }) => (
                <View style={[styles.card, { borderLeftColor: accentColor, borderLeftWidth: 5 }, pressed && { opacity: 0.85 }]}>
                  <View style={styles.cardRow}>
                    <Text style={styles.cardName} numberOfLines={1}>{goal.name}</Text>
                    <Text style={[styles.cardPct, { color: barColor }]}>{pctLabel}%</Text>
                    <Ionicons name="chevron-forward" size={16} color="#999" style={{ marginLeft: 4 }} />
                  </View>

                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${pctLabel}%` as any, backgroundColor: barColor }]} />
                  </View>

                  <View style={styles.cardFooter}>
                    <Text style={styles.cardSaved}>{fmtMoney(goal.current_amount ?? 0)} saved</Text>
                    <Text style={styles.cardTarget}>of {fmtMoney(goal.target_amount)}</Text>
                  </View>

                  {remaining > 0 ? (
                    <Text style={styles.cardRemaining}>{fmtMoney(remaining)} remaining</Text>
                  ) : (
                    <Text style={[styles.cardRemaining, { color: '#3BCEAC', fontWeight: '800' }]}>🎉 Goal reached!</Text>
                  )}

                  {goal.target_date ? (
                    <Text style={styles.cardMeta}>
                      Target: {new Date(goal.target_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  ) : null}
                </View>
              )}
            </Pressable>
          )
        })}
      </ScrollView>

      {/* FAB */}
      <View style={[styles.fabWrap, { bottom: insets.bottom + 16 }]}>
        <Pressable onPress={() => sheetRef.current?.present()} accessibilityLabel="Add savings goal">
          {({ pressed }) => (
            <View style={[styles.fab, pressed && styles.fabPressed]} pointerEvents="none">
              <Ionicons name="add" size={36} color={INK} />
            </View>
          )}
        </Pressable>
      </View>

      <SavingsGoalBottomSheet ref={sheetRef} onCreated={() => load()} />
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
  cardRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  cardName: { fontFamily: MONO, fontSize: 15, fontWeight: '800', color: INK, flex: 1 },
  cardPct: { fontFamily: MONO, fontSize: 13, fontWeight: '800' },
  barTrack: {
    height: 10, backgroundColor: '#E8E8E0', borderWidth: 2, borderColor: INK,
    marginBottom: 6, overflow: 'hidden', borderRadius: 2,
  },
  barFill: { height: '100%' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  cardSaved: { fontFamily: MONO, fontSize: 11, fontWeight: '800', color: INK },
  cardTarget: { fontFamily: MONO, fontSize: 11, color: '#666666' },
  cardRemaining: { fontFamily: MONO, fontSize: 11, color: '#888888', marginTop: 3 },
  cardMeta: { fontFamily: MONO, fontSize: 10, color: '#999999', marginTop: 3 },
  fabWrap: { position: 'absolute', right: 20, zIndex: 10 },
  fab: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: YELLOW,
    borderWidth: 3, borderColor: INK, alignItems: 'center', justifyContent: 'center',
    shadowColor: INK, shadowOffset: { width: 3, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 6,
  },
  fabPressed: { transform: [{ translateX: 3 }, { translateY: 3 }], shadowOpacity: 0, elevation: 0 },
})
