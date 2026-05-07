import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useFocusEffect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

import { useBudgetsStore } from '@/src/stores/budgetsStore'
import { useCategoriesStore } from '@/src/stores/categoriesStore'

const CREAM = '#FAFAF5'
const INK = '#111111'
const MUTED = '#E8E8E0'
const YELLOW = '#F5C842'
const RED = '#FF5E5E'
const GREEN = '#4ADE80'
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

// ── helpers ────────────────────────────────────────────────────────────────

function currentYearMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

function parseYearMonth(ym: string): Date {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return new Date()
  return new Date(y, m - 1, 1)
}

function toYearMonth(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function formatMonthLabel(ym: string): string {
  if (!ym || ym === 'default') return 'DEFAULT'
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym.toUpperCase()
  return new Date(y, m - 1, 1)
    .toLocaleString(undefined, { month: 'long', year: 'numeric' })
    .toUpperCase()
}

// ── MonthPickerInput ───────────────────────────────────────────────────────

function MonthPickerInput({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const isDefault = value === 'default' || value === ''
  const pickerDate = isDefault ? new Date() : parseYearMonth(value)

  const onAndroidChange = (_: unknown, selected?: Date) => {
    setOpen(false)
    if (selected) onChange(toYearMonth(selected))
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [ss.monthField, pressed && { opacity: 0.7 }]}
      >
        <View style={ss.monthFieldInner}>
          <Text style={ss.monthFieldText}>{isDefault ? 'Default' : formatMonthLabel(value)}</Text>
          <Ionicons name="chevron-down" size={14} color={INK} />
        </View>
      </Pressable>

      {Platform.OS === 'android' && open && (
        <DateTimePicker
          value={pickerDate}
          mode="date"
          display="default"
          themeVariant="light"
          onChange={onAndroidChange}
        />
      )}

      {Platform.OS !== 'android' && (
        <Modal visible={open} transparent animationType="slide">
          <Pressable style={ss.backdrop} onPress={() => setOpen(false)} />
          <View style={ss.sheet}>
            <View style={ss.sheetHeader}>
              <Pressable onPress={() => setOpen(false)}>
                <Text style={ss.headerBtn}>Cancel</Text>
              </Pressable>
              <Text style={ss.sheetTitle}>Select month</Text>
              <Pressable onPress={() => setOpen(false)}>
                <Text style={[ss.headerBtn, { color: YELLOW }]}>Done</Text>
              </Pressable>
            </View>

            {/* Default option */}
            <Pressable
              onPress={() => { onChange('default'); setOpen(false) }}
              style={({ pressed }) => [ss.defaultBtn, pressed && ss.defaultBtnPressed]}
            >
              <Ionicons name={isDefault ? 'checkmark-circle' : 'refresh-circle-outline'} size={28} color={INK} style={{ marginLeft: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={ss.defaultBtnTitle}>Use Default</Text>
                <Text style={ss.defaultBtnSub}>Rolling template — applies to every month</Text>
              </View>
            </Pressable>

            <View style={ss.pickerDivider} />
            <View style={ss.pickerWrap}>
              <DateTimePicker
                value={pickerDate}
                mode="date"
                display="spinner"
                themeVariant="light"
                textColor={INK}
                onChange={(_: unknown, selected?: Date) => {
                  if (selected) onChange(toYearMonth(selected))
                }}
                style={ss.picker}
              />
            </View>
          </View>
        </Modal>
      )}
    </>
  )
}

// ── Toast ──────────────────────────────────────────────────────────────────

function useToast() {
  const [message, setMessage] = useState('')
  const anim = useRef(new Animated.Value(0)).current

  const show = useCallback((msg: string) => {
    setMessage(msg)
    anim.setValue(0)
    Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(1400),
      Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => setMessage(''))
  }, [anim])

  const node = message ? (
    <Animated.View
      pointerEvents="none"
      style={[
        ss.toast,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        },
      ]}
    >
      <Ionicons name="checkmark-circle" size={16} color={INK} />
      <Text style={ss.toastText}>{message}</Text>
    </Animated.View>
  ) : null

  return { show, node }
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function BudgetsScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const toast = useToast()

  const items = useBudgetsStore((s) => s.items)
  const month = useBudgetsStore((s) => s.month)
  const totalCap = useBudgetsStore((s) => s.totalCap)
  const load = useBudgetsStore((s) => s.load)
  const setMonth = useBudgetsStore((s) => s.setMonth)
  const setTotalCap = useBudgetsStore((s) => s.setTotalCap)
  const add = useBudgetsStore((s) => s.add)
  const update = useBudgetsStore((s) => s.update)
  const remove = useBudgetsStore((s) => s.remove)

  const categories = useCategoriesStore((s) => s.items)
  const loadCategories = useCategoriesStore((s) => s.load)

  const [capInput, setCapInput] = useState('')
  const [monthDraft, setMonthDraft] = useState(month)
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [editAmt, setEditAmt] = useState('')

  useFocusEffect(
    useCallback(() => {
      load()
      loadCategories()
    }, [load, loadCategories]),
  )
  useEffect(() => { setCapInput(totalCap != null ? String(totalCap) : '') }, [totalCap])
  useEffect(() => { setMonthDraft(month) }, [month])

  const userCats = useMemo(() => categories.filter((c) => c.source === 'user'), [categories])
  const tellerCats = useMemo(() => categories.filter((c) => c.source === 'teller'), [categories])

  const budgetForLabel = useCallback(
    (label: string) => items.find((b) => b.category === label),
    [items],
  )

  // Cap is dirty if capInput differs numerically from the stored totalCap
  const isCapDirty = useMemo(() => {
    const t = capInput.trim()
    if (t === '') return totalCap !== null
    const n = Number(t)
    if (Number.isNaN(n)) return false
    return n !== totalCap
  }, [capInput, totalCap])

  const isMonthDirty = useMemo(() => monthDraft !== month, [monthDraft, month])

  const applyCap = () => {
    const t = capInput.trim()
    if (t === '') {
      setTotalCap(null)
    } else {
      const n = Number(t)
      if (Number.isNaN(n)) return
      setTotalCap(n)
    }
    toast.show('Monthly cap saved')
  }

  const applyMonth = () => {
    const val = monthDraft.trim() === '' ? 'default' : monthDraft
    setMonth(val)
    setMonthDraft(val)
    toast.show('Month applied')
  }

  const startEdit = (categoryLabel: string) => {
    const row = budgetForLabel(categoryLabel)
    setEditingCategory(categoryLabel)
    setEditAmt(row != null ? String(row.amount) : '')
  }

  const editingBudget = useMemo(
    () => (editingCategory ? budgetForLabel(editingCategory) : undefined),
    [editingCategory, budgetForLabel],
  )

  const isEditDirty = useMemo(() => {
    if (!editingCategory) return false
    const cur = editingBudget != null ? String(editingBudget.amount) : ''
    return editAmt.trim() !== cur
  }, [editingCategory, editingBudget, editAmt])

  const saveEdit = () => {
    if (!editingCategory) return
    const a = Number(editAmt)
    if (Number.isNaN(a) || a <= 0) {
      Alert.alert('Invalid amount', 'Enter a positive number.')
      return
    }
    const existing = budgetForLabel(editingCategory)
    if (existing) update(existing.id, { amount: a })
    else add({ category: editingCategory, amount: a, month })
    setEditingCategory(null)
    setEditAmt('')
    toast.show('Budget saved')
  }

  const onDeleteBudget = () => {
    if (!editingCategory) return
    const existing = budgetForLabel(editingCategory)
    if (!existing) {
      setEditingCategory(null)
      setEditAmt('')
      return
    }
    Alert.alert('Remove budget', `Clear budget for "${editingCategory}" this month?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          remove(existing.id)
          setEditingCategory(null)
          setEditAmt('')
          toast.show('Budget removed')
        },
      },
    ])
  }

  const renderCategoryBudgetRow = (cat: (typeof categories)[number]) => {
    const label = cat.label
    const rowColor = cat.color ?? MUTED
    const budget = budgetForLabel(label)

    if (editingCategory === label) {
      return (
        <View key={cat.id} style={ss.editCard}>
          <Text style={ss.fieldLabel}>Category</Text>
          <Text style={ss.editCategoryName}>{label}</Text>
          <Text style={ss.fieldLabel}>Amount</Text>
          <TextInput
            style={ss.fieldInput}
            value={editAmt}
            onChangeText={setEditAmt}
            placeholder="e.g. 600"
            placeholderTextColor="#888"
            keyboardType="decimal-pad"
          />
          <View style={ss.editBtnRow}>
            <Pressable onPress={saveEdit} disabled={!isEditDirty} style={{ flex: 1 }}>
              {({ pressed }) => (
                <View
                  style={[
                    ss.btn,
                    ss.btnYellow,
                    !isEditDirty && ss.btnDisabled,
                    pressed && isEditDirty && ss.btnPressed,
                  ]}
                  pointerEvents="none"
                >
                  <Text style={ss.btnText}>Save</Text>
                </View>
              )}
            </Pressable>
            {editingBudget ? (
              <Pressable onPress={onDeleteBudget} style={{ flex: 1 }}>
                {({ pressed }) => (
                  <View style={[ss.btn, ss.btnRed, pressed && ss.btnPressed]} pointerEvents="none">
                    <Text style={ss.btnText}>Remove</Text>
                  </View>
                )}
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => { setEditingCategory(null); setEditAmt('') }}
              style={{ flex: 1 }}
            >
              {({ pressed }) => (
                <View style={[ss.btn, ss.btnNeutral, pressed && ss.btnPressed]} pointerEvents="none">
                  <Text style={ss.btnText}>Cancel</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>
      )
    }

    return (
      <Pressable key={cat.id} onPress={() => startEdit(label)}>
        {({ pressed }) => (
          <View
            style={[
              ss.rowCard,
              { borderLeftColor: rowColor, borderLeftWidth: 6 },
              pressed && { opacity: 0.85 },
            ]}
          >
            <View style={ss.rowLeft}>
              <View style={[ss.rowSwatch, { backgroundColor: rowColor }]} />
              <Text style={ss.rowCat} numberOfLines={1}>{label}</Text>
            </View>
            <Text style={ss.rowAmt}>{budget != null ? `$${budget.amount.toFixed(2)}` : '—'}</Text>
            <Text style={ss.rowEdit}>Edit</Text>
          </View>
        )}
      </Pressable>
    )
  }

  return (
    <KeyboardAvoidingView
      style={ss.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[ss.topbar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <Text style={ss.backChev}>‹</Text>
        </Pressable>
        <Text style={ss.topbarTitle}>Budgets</Text>
        <Text style={ss.topbarSub}>{formatMonthLabel(month)}</Text>
      </View>

      {/* Toast notification */}
      <View style={ss.toastWrap}>
        {toast.node}
      </View>

      <ScrollView
        contentContainerStyle={[ss.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={ss.card}>
          {/* ── Month picker ── */}
          <Text style={ss.fieldLabel}>Budget month</Text>
          <MonthPickerInput value={monthDraft} onChange={setMonthDraft} />
          <Text style={ss.hint}>
            Tap to pick a month, or choose "Default" for a rolling template applied to any month.
          </Text>
          <Pressable onPress={applyMonth} disabled={!isMonthDirty}>
            {({ pressed }) => (
              <View
                style={[
                  ss.btn, ss.btnYellow,
                  !isMonthDirty && ss.btnDisabled,
                  pressed && isMonthDirty && ss.btnPressed,
                ]}
                pointerEvents="none"
              >
                <Text style={ss.btnText}>Apply month</Text>
              </View>
            )}
          </Pressable>

          {/* ── Monthly cap ── */}
          <Text style={[ss.fieldLabel, { marginTop: 16 }]}>Total monthly cap (optional)</Text>
          <TextInput
            style={ss.fieldInput}
            value={capInput}
            onChangeText={setCapInput}
            placeholder="e.g. 3000  (clear to remove)"
            placeholderTextColor="#888"
            keyboardType="decimal-pad"
          />
          <Pressable onPress={applyCap} disabled={!isCapDirty}>
            {({ pressed }) => (
              <View
                style={[
                  ss.btn, ss.btnNeutral,
                  !isCapDirty && ss.btnDisabled,
                  pressed && isCapDirty && ss.btnPressed,
                ]}
                pointerEvents="none"
              >
                <Text style={ss.btnText}>Save cap</Text>
              </View>
            )}
          </Pressable>
        </View>

        <Text style={ss.sectionLabel}>Category budgets</Text>
        {categories.length === 0 ? (
          <Text style={ss.empty}>No categories yet — add some in Settings › Categories.</Text>
        ) : (
          <>
            {userCats.length > 0 ? (
              <View style={{ marginBottom: 8 }}>
                <Text style={ss.groupLabel}>Your categories</Text>
                {userCats.map((c) => renderCategoryBudgetRow(c))}
              </View>
            ) : null}
            {tellerCats.length > 0 ? (
              <View style={{ marginBottom: 8 }}>
                <Text style={ss.groupLabel}>Bank categories</Text>
                {tellerCats.map((c) => renderCategoryBudgetRow(c))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const ss = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CREAM },

  topbar: {
    backgroundColor: INK,
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backChev: {
    fontFamily: MONO,
    fontSize: 28,
    fontWeight: '900',
    color: CREAM,
    lineHeight: 28,
  },
  topbarTitle: {
    fontFamily: MONO,
    fontSize: 20,
    fontWeight: '800',
    color: CREAM,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    flexShrink: 1,
    minWidth: 0,
  },
  topbarSub: {
    fontFamily: MONO,
    fontSize: 13,
    color: '#888888',
    flexShrink: 0,
    marginLeft: 'auto',
  },

  // ── Toast ──────────────────────────────────────────────
  toastWrap: {
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 2,
    zIndex: 99,
    // sits in normal flow right below the topbar
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: GREEN,
    borderWidth: 2,
    borderColor: INK,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: INK,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 6,
  },
  toastText: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '800',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Month picker field ──────────────────────────────────
  monthField: {
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: CREAM,
    paddingHorizontal: 10,
    paddingVertical: 11,
    marginBottom: 8,
  },
  monthFieldInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  monthFieldText: {
    fontFamily: MONO,
    fontSize: 15,
    fontWeight: '800',
    color: INK,
    letterSpacing: 0.4,
  },

  // ── Month picker modal ──────────────────────────────────
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: CREAM,
    borderTopWidth: 3,
    borderTopColor: INK,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: INK,
  },
  sheetTitle: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '800',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerBtn: {
    fontFamily: MONO,
    fontSize: 14,
    fontWeight: '700',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  defaultBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 16,
    borderWidth: 3,
    borderColor: INK,
    paddingVertical: 24,
    paddingHorizontal: 22,
    backgroundColor: YELLOW,
    shadowColor: INK,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  defaultBtnPressed: {
    transform: [{ translateX: 4 }, { translateY: 4 }],
    shadowOpacity: 0,
    elevation: 0,
  },
  defaultBtnTitle: {
    fontFamily: MONO,
    fontSize: 16,
    fontWeight: '800',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  defaultBtnSub: {
    fontFamily: MONO,
    fontSize: 12,
    color: '#444444',
    marginTop: 4,
  },
  pickerDivider: {
    height: 0,
  },
  pickerWrap: {
    alignItems: 'center',
    paddingBottom: 12,
  },
  picker: {
    backgroundColor: CREAM,
    alignSelf: 'center',
  },

  // ── Form ──────────────────────────────────────────────
  scroll: { padding: 12 },
  card: {
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: CREAM,
    padding: 14,
    marginBottom: 12,
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  editCard: {
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: MUTED,
    padding: 14,
    marginBottom: 8,
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  editCategoryName: {
    fontFamily: MONO,
    fontSize: 16,
    fontWeight: '800',
    color: INK,
    marginBottom: 8,
  },
  fieldLabel: {
    fontFamily: MONO,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: INK,
    marginBottom: 6,
    marginTop: 6,
  },
  fieldInput: {
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: CREAM,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontFamily: MONO,
    fontSize: 16,
    color: INK,
    marginBottom: 8,
  },
  hint: {
    fontFamily: MONO,
    fontSize: 12,
    color: '#555555',
    lineHeight: 18,
    marginBottom: 10,
  },
  groupLabel: {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: '800',
    color: '#555555',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  btn: {
    borderWidth: 3,
    borderColor: INK,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
    marginBottom: 2,
  },
  btnYellow: { backgroundColor: YELLOW },
  btnRed: { backgroundColor: RED },
  btnNeutral: { backgroundColor: CREAM },
  btnDisabled: { opacity: 0.35 },
  btnPressed: { transform: [{ translateX: 3 }, { translateY: 3 }], shadowOpacity: 0, elevation: 0 },
  btnText: {
    fontFamily: MONO,
    fontSize: 15,
    fontWeight: '800',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editBtnRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  sectionLabel: {
    fontFamily: MONO,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: INK,
    marginBottom: 8,
  },
  empty: { fontFamily: MONO, fontSize: 15, color: '#666666', paddingVertical: 12 },
  rowCard: {
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: CREAM,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowSwatch: {
    width: 14,
    height: 14,
    borderWidth: 2,
    borderColor: INK,
    flexShrink: 0,
  },
  rowCat: {
    fontFamily: MONO,
    fontSize: 15,
    fontWeight: '800',
    color: INK,
    flex: 1,
  },
  rowAmt: {
    fontFamily: MONO,
    fontSize: 15,
    fontWeight: '800',
    color: INK,
  },
  rowEdit: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '800',
    color: INK,
    opacity: 0.5,
    textTransform: 'uppercase',
  },
})
