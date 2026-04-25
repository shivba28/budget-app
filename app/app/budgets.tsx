import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useBudgetsStore } from '@/src/stores/budgetsStore'
import { useCategoriesStore } from '@/src/stores/categoriesStore'

const CREAM = '#FAFAF5'
const INK = '#111111'
const MUTED = '#E8E8E0'
const YELLOW = '#F5C842'
const RED = '#FF5E5E'
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

export default function BudgetsScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()

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

  const applyCap = () => {
    const t = capInput.trim()
    if (t === '') {
      setTotalCap(null)
      return
    }
    const n = Number(t)
    if (Number.isNaN(n)) return
    setTotalCap(n)
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
  }

  const onDeleteBudget = () => {
    if (!editingCategory) return
    const existing = budgetForLabel(editingCategory)
    if (!existing) {
      setEditingCategory(null)
      setEditAmt('')
      return
    }
    Alert.alert('Remove budget', `Clear budget for “${editingCategory}” this month?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          remove(existing.id)
          setEditingCategory(null)
          setEditAmt('')
        },
      },
    ])
  }

  const colorFor = (label: string): string | null =>
    categories.find((c) => c.label === label)?.color ?? null

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
              onPress={() => {
                setEditingCategory(null)
                setEditAmt('')
              }}
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
              <Text style={ss.rowCat} numberOfLines={1}>
                {label}
              </Text>
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
        <Text style={ss.topbarSub}>{month}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[ss.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={ss.card}>
          <Text style={ss.fieldLabel}>Month key</Text>
          <TextInput
            style={ss.fieldInput}
            value={monthDraft}
            onChangeText={setMonthDraft}
            placeholder="default or 2026-04"
            placeholderTextColor="#888"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={ss.hint}>
            Use "default" for a rolling template, or YYYY-MM for a specific month.
          </Text>
          <Pressable onPress={() => setMonth(monthDraft)}>
            {({ pressed }) => (
              <View style={[ss.btn, ss.btnYellow, pressed && ss.btnPressed]} pointerEvents="none">
                <Text style={ss.btnText}>Apply month</Text>
              </View>
            )}
          </Pressable>

          <Text style={[ss.fieldLabel, { marginTop: 16 }]}>Total monthly cap (optional)</Text>
          <TextInput
            style={ss.fieldInput}
            value={capInput}
            onChangeText={setCapInput}
            placeholder="e.g. 3000"
            placeholderTextColor="#888"
            keyboardType="decimal-pad"
          />
          <Pressable onPress={applyCap}>
            {({ pressed }) => (
              <View style={[ss.btn, ss.btnNeutral, pressed && ss.btnPressed]} pointerEvents="none">
                <Text style={ss.btnText}>Save cap</Text>
              </View>
            )}
          </Pressable>
        </View>

        <Text style={ss.sectionLabel}>Rows</Text>
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
  btnDisabled: { opacity: 0.4 },
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
