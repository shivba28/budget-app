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
import { Ionicons } from '@expo/vector-icons'

import { DateInput } from '@/src/components/DateInput'
import { useSavingsGoalsStore } from '@/src/stores/savingsGoalsStore'

const CREAM = '#FAFAF5'
const INK = '#111111'
const YELLOW = '#F5C842'
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

const GOAL_COLORS = [
  '#F5C842', '#3BCEAC', '#6A4C93', '#457B9D',
  '#E76F51', '#2A9D8F', '#B5179E', '#06D6A0',
]

function fmtMoney(n: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)
}

function daysUntil(ymd: string): number | null {
  if (!ymd) return null
  const d = new Date(`${ymd}T00:00:00`)
  if (isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000)
}

export default function SavingsGoalDetailScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { goalId } = useLocalSearchParams<{ goalId?: string }>()
  const id = goalId ? Number(goalId) : NaN

  const items = useSavingsGoalsStore((s) => s.items)
  const load = useSavingsGoalsStore((s) => s.load)
  const update = useSavingsGoalsStore((s) => s.update)
  const remove = useSavingsGoalsStore((s) => s.remove)

  const goal = useMemo(() => items.find((g) => g.id === id), [items, id])

  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [saved, setSaved] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [notes, setNotes] = useState('')

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!goal) return
    setName(goal.name)
    setTarget(String(goal.target_amount))
    setSaved(String(goal.current_amount))
    setTargetDate(goal.target_date ?? '')
    setColor(goal.color ?? GOAL_COLORS[0]!)
    setNotes(goal.notes ?? '')
  }, [goal?.id])

  const isDirty = useMemo(() => {
    if (!goal) return false
    return (
      name.trim() !== goal.name ||
      Number(target) !== goal.target_amount ||
      Number(saved) !== goal.current_amount ||
      (targetDate.trim() || null) !== (goal.target_date ?? null) ||
      (color ?? null) !== (goal.color ?? null) ||
      (notes.trim() || null) !== (goal.notes ?? null)
    )
  }, [goal, name, target, saved, targetDate, color, notes])

  const pct = goal
    ? Math.min(1, (goal.current_amount ?? 0) / Math.max(1, goal.target_amount))
    : 0
  const pctLabel = Math.round(pct * 100)
  const remaining = goal ? Math.max(0, goal.target_amount - (goal.current_amount ?? 0)) : 0
  const days = goal?.target_date ? daysUntil(goal.target_date) : null

  const barColor = pct >= 1 ? '#3BCEAC' : pct >= 0.6 ? '#F5C842' : '#457B9D'

  const onSave = () => {
    if (!goal) return
    update(id, {
      name: name.trim() || goal.name,
      target_amount: Number(target) || goal.target_amount,
      current_amount: Number(saved) || 0,
      target_date: targetDate.trim() || null,
      color,
      notes: notes.trim() || null,
    })
  }

  const onDelete = () => {
    Alert.alert('Delete goal', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { remove(id); router.back() } },
    ])
  }

  if (!Number.isFinite(id) || !goal) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.topbar}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            {({ pressed }) => (
              <View style={[styles.backBtnInner, pressed && { opacity: 0.7 }]} pointerEvents="none">
                <Ionicons name="arrow-back" size={20} color={CREAM} />
              </View>
            )}
          </Pressable>
          <Text style={styles.topbarTitle}>Not found</Text>
        </View>
      </View>
    )
  }

  const accentColor = goal.color ?? YELLOW

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={[styles.topbar, { backgroundColor: accentColor }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          {({ pressed }) => (
            <View style={[styles.backBtnInner, { borderColor: 'rgba(0,0,0,0.2)' }, pressed && { opacity: 0.7 }]} pointerEvents="none">
              <Ionicons name="arrow-back" size={20} color={INK} />
            </View>
          )}
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.topbarTitle, { color: INK }]} numberOfLines={1}>{goal.name}</Text>
          <Text style={[styles.topbarSub, { color: 'rgba(0,0,0,0.55)' }]}>Savings goal</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Progress card */}
        <View style={[styles.progressCard, { borderColor: accentColor }]}>
          <View style={styles.progressNumbers}>
            <View>
              <Text style={styles.progressLabel}>SAVED</Text>
              <Text style={[styles.progressValue, { color: accentColor === YELLOW ? '#6B5B00' : accentColor }]}>
                {fmtMoney(goal.current_amount ?? 0)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.progressLabel}>TARGET</Text>
              <Text style={styles.progressValue}>{fmtMoney(goal.target_amount)}</Text>
            </View>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${pctLabel}%`, backgroundColor: barColor }]} />
          </View>
          <View style={styles.progressFooter}>
            <Text style={styles.progressPct}>{pctLabel}% complete</Text>
            {remaining > 0 ? (
              <Text style={styles.progressRemaining}>{fmtMoney(remaining)} remaining</Text>
            ) : (
              <Text style={[styles.progressPct, { color: '#3BCEAC' }]}>🎉 Goal reached!</Text>
            )}
          </View>
          {days !== null ? (
            <Text style={styles.progressDays}>
              {days > 0 ? `${days} days until target date` : days === 0 ? 'Target date is today!' : `${Math.abs(days)} days past target date`}
            </Text>
          ) : null}
        </View>

        {/* Edit form */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Edit goal</Text>

          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput style={styles.fieldInput} value={name} onChangeText={setName} autoCorrect={false} />

          <Text style={styles.fieldLabel}>Target ($)</Text>
          <TextInput style={styles.fieldInput} value={target} onChangeText={setTarget} keyboardType="decimal-pad" />

          <Text style={styles.fieldLabel}>Amount saved ($)</Text>
          <TextInput style={styles.fieldInput} value={saved} onChangeText={setSaved} keyboardType="decimal-pad" />

          <Text style={styles.fieldLabel}>Target date (optional)</Text>
          <DateInput value={targetDate} onChange={setTargetDate} style={styles.fieldInput} />

          <Text style={styles.fieldLabel}>Color</Text>
          <View style={styles.colorRow}>
            {GOAL_COLORS.map((c) => (
              <Pressable key={c} onPress={() => setColor(c)}>
                <View
                  style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotOn]}
                  pointerEvents="none"
                />
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Notes (optional)</Text>
          <TextInput
            style={[styles.fieldInput, { minHeight: 52, textAlignVertical: 'top' }]}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={2}
            placeholder="Why this goal matters…"
            placeholderTextColor="#999"
          />

          <View style={styles.btnRow}>
            <Pressable onPress={onSave} disabled={!isDirty} style={{ flex: 1 }}>
              {({ pressed }) => (
                <View style={[styles.btn, { backgroundColor: YELLOW }, !isDirty && styles.btnDisabled, pressed && isDirty && styles.btnPressed]} pointerEvents="none">
                  <Text style={styles.btnText}>Save</Text>
                </View>
              )}
            </Pressable>
            <Pressable onPress={onDelete} style={{ flex: 1 }}>
              {({ pressed }) => (
                <View style={[styles.btn, { backgroundColor: '#FF5E5E' }, pressed && styles.btnPressed]} pointerEvents="none">
                  <Text style={styles.btnText}>Delete</Text>
                </View>
              )}
            </Pressable>
          </View>
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
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: { flexShrink: 0 },
  backBtnInner: {
    width: 32, height: 32,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, borderWidth: 2, borderColor: '#333333',
  },
  topbarTitle: {
    fontFamily: MONO,
    fontSize: 18,
    fontWeight: Platform.OS === 'ios' ? '800' : '700',
    color: CREAM,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    flex: 1,
  },
  topbarSub: {
    fontFamily: MONO, fontSize: 11, color: '#aaaaaa', marginTop: 1,
  },
  scroll: { padding: 14 },

  progressCard: {
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: CREAM,
    padding: 14,
    marginBottom: 14,
    shadowColor: INK,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  progressNumbers: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  progressLabel: {
    fontFamily: MONO, fontSize: 9, fontWeight: '800',
    color: '#888888', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2,
  },
  progressValue: {
    fontFamily: MONO, fontSize: 20, fontWeight: '800', color: INK,
  },
  barTrack: {
    height: 12,
    backgroundColor: '#E8E8E0',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 8,
  },
  barFill: { height: '100%', borderRadius: 4 },
  progressFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressPct: { fontFamily: MONO, fontSize: 11, fontWeight: '800', color: INK },
  progressRemaining: { fontFamily: MONO, fontSize: 11, color: '#666666' },
  progressDays: {
    fontFamily: MONO, fontSize: 10, color: '#888888', marginTop: 6, textAlign: 'center',
  },

  card: {
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: CREAM,
    padding: 12,
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  sectionLabel: {
    fontFamily: MONO, fontSize: 11, fontWeight: '800',
    letterSpacing: 1.2, textTransform: 'uppercase', color: '#888888', marginBottom: 10,
  },
  fieldLabel: {
    fontFamily: MONO, fontSize: 12, fontWeight: '800',
    letterSpacing: 1, textTransform: 'uppercase', color: INK, marginBottom: 4, marginTop: 10,
  },
  fieldInput: {
    borderWidth: 2, borderColor: INK, backgroundColor: CREAM,
    paddingHorizontal: 9, paddingVertical: 7,
    fontFamily: MONO, fontSize: 14, color: INK,
  },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  colorDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  colorDotOn: { borderColor: INK, borderWidth: 3, transform: [{ scale: 1.15 }] },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  btn: {
    borderWidth: 3, borderColor: INK, paddingVertical: 10,
    alignItems: 'center',
    shadowColor: INK, shadowOffset: { width: 3, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 3,
  },
  btnDisabled: { opacity: 0.4 },
  btnPressed: { transform: [{ translateX: 3 }, { translateY: 3 }], shadowOpacity: 0, elevation: 0 },
  btnText: {
    fontFamily: MONO, fontSize: 13, fontWeight: '800',
    color: INK, textTransform: 'uppercase', letterSpacing: 0.5,
  },
})
