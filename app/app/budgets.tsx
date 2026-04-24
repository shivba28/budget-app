import { useEffect, useMemo, useState } from 'react'
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
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useBudgetsStore } from '@/src/stores/budgetsStore'
import { useCategoriesStore } from '@/src/stores/categoriesStore'

const CREAM  = '#FAFAF5'
const INK    = '#111111'
const MUTED  = '#E8E8E0'
const YELLOW = '#F5C842'
const RED    = '#FF5E5E'
const MONO   = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

export default function BudgetsScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const items      = useBudgetsStore((s) => s.items)
  const month      = useBudgetsStore((s) => s.month)
  const totalCap   = useBudgetsStore((s) => s.totalCap)
  const load       = useBudgetsStore((s) => s.load)
  const setMonth   = useBudgetsStore((s) => s.setMonth)
  const setTotalCap = useBudgetsStore((s) => s.setTotalCap)
  const add    = useBudgetsStore((s) => s.add)
  const update = useBudgetsStore((s) => s.update)
  const remove = useBudgetsStore((s) => s.remove)

  const categories    = useCategoriesStore((s) => s.items)
  const loadCategories = useCategoriesStore((s) => s.load)

  const [capInput, setCapInput]     = useState('')
  const [monthDraft, setMonthDraft] = useState(month)
  const [selectedCat, setSelectedCat] = useState<string | null>(null)
  const [amt, setAmt]               = useState('')
  const [editingId, setEditingId]   = useState<number | null>(null)
  const [editCat, setEditCat]       = useState<string>('')
  const [editAmt, setEditAmt]       = useState('')

  useEffect(() => { load(); loadCategories() }, [load, loadCategories])
  useEffect(() => { setCapInput(totalCap != null ? String(totalCap) : '') }, [totalCap])
  useEffect(() => { setMonthDraft(month) }, [month])

  const userCats   = useMemo(() => categories.filter((c) => c.source === 'user'),   [categories])
  const tellerCats = useMemo(() => categories.filter((c) => c.source === 'teller'), [categories])

  const applyCap = () => {
    const t = capInput.trim()
    if (t === '') { setTotalCap(null); return }
    const n = Number(t)
    if (Number.isNaN(n)) return
    setTotalCap(n)
  }

  const onAddRow = () => {
    if (!selectedCat) return
    const a = Number(amt)
    if (Number.isNaN(a) || a <= 0) return
    add({ category: selectedCat, amount: a, month })
    setSelectedCat(null)
    setAmt('')
  }

  const startEdit = (id: number) => {
    const row = items.find((b) => b.id === id)
    if (!row) return
    setEditingId(id)
    setEditCat(row.category)
    setEditAmt(String(row.amount))
  }

  const editingItem = useMemo(() => items.find((b) => b.id === editingId), [items, editingId])

  const isEditDirty = useMemo(() => {
    if (!editingItem) return false
    return editCat !== editingItem.category || editAmt !== String(editingItem.amount)
  }, [editingItem, editCat, editAmt])

  const saveEdit = () => {
    if (editingId == null) return
    const a = Number(editAmt)
    if (Number.isNaN(a)) return
    update(editingId, { category: editCat, amount: a })
    setEditingId(null)
  }

  const onDelete = (id: number) => {
    Alert.alert('Delete row', 'Remove this budget row?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { remove(id); setEditingId(null) } },
    ])
  }

  // Find category color for a label string
  const colorFor = (label: string): string | null =>
    categories.find((c) => c.label === label)?.color ?? null

  const CategoryChips = ({
    cats,
    groupLabel,
  }: {
    cats: typeof categories
    groupLabel: string
  }) => {
    if (cats.length === 0) return null
    return (
      <View style={{ marginBottom: 8 }}>
        <Text style={ss.groupLabel}>{groupLabel}</Text>
        <View style={ss.chipsWrap}>
          {cats.map((c) => {
            const active = selectedCat === c.label
            const bg = c.color ?? MUTED
            return (
              <Pressable key={c.id} onPress={() => setSelectedCat(active ? null : c.label)}>
                {({ pressed }) => (
                  <View
                    style={[
                      ss.chip,
                      { backgroundColor: active ? bg : CREAM },
                      active && ss.chipActive,
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <View style={[ss.chipSwatch, { backgroundColor: bg }]} />
                    <Text style={ss.chipText}>{c.label}</Text>
                  </View>
                )}
              </Pressable>
            )
          })}
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={ss.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Topbar */}
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
        {/* Month & cap settings */}
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

        {/* Add row form */}
        <View style={ss.card}>
          <Text style={ss.fieldLabel}>Select category</Text>

          {categories.length === 0 ? (
            <Text style={ss.hint}>No categories yet — add some in Settings › Categories.</Text>
          ) : (
            <>
              <CategoryChips cats={userCats} groupLabel="Your categories" />
              <CategoryChips cats={tellerCats} groupLabel="Bank categories" />
            </>
          )}

          {selectedCat ? (
            <View style={ss.selectedRow}>
              <View
                style={[
                  ss.selectedSwatch,
                  { backgroundColor: colorFor(selectedCat) ?? MUTED },
                ]}
              />
              <Text style={ss.selectedLabel}>{selectedCat}</Text>
            </View>
          ) : (
            <Text style={ss.hint}>Tap a category above to select it.</Text>
          )}

          <Text style={[ss.fieldLabel, { marginTop: 12 }]}>Amount</Text>
          <TextInput
            style={ss.fieldInput}
            value={amt}
            onChangeText={setAmt}
            placeholder="e.g. 600"
            placeholderTextColor="#888"
            keyboardType="decimal-pad"
          />
          <Pressable onPress={onAddRow} disabled={!selectedCat}>
            {({ pressed }) => (
              <View style={[ss.btn, ss.btnYellow, !selectedCat && ss.btnDisabled, pressed && !selectedCat ? null : pressed && ss.btnPressed]} pointerEvents="none">
                <Text style={ss.btnText}>Add budget row</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Rows list */}
        <Text style={ss.sectionLabel}>Rows</Text>
        {items.length === 0 ? (
          <Text style={ss.empty}>No budget rows for this month.</Text>
        ) : (
          items.map((item) => {
            const rowColor = colorFor(item.category)

            if (editingId === item.id) {
              return (
                <View key={item.id} style={ss.editCard}>
                  <Text style={ss.fieldLabel}>Category</Text>
                  <View style={ss.chipsWrap}>
                    {categories.map((c) => {
                      const active = editCat === c.label
                      const bg = c.color ?? MUTED
                      return (
                        <Pressable key={c.id} onPress={() => setEditCat(c.label)}>
                          {({ pressed }) => (
                            <View
                              style={[
                                ss.chip,
                                { backgroundColor: active ? bg : CREAM },
                                active && ss.chipActive,
                                pressed && { opacity: 0.8 },
                              ]}
                            >
                              <View style={[ss.chipSwatch, { backgroundColor: bg }]} />
                              <Text style={ss.chipText}>{c.label}</Text>
                            </View>
                          )}
                        </Pressable>
                      )
                    })}
                  </View>
                  <Text style={ss.fieldLabel}>Amount</Text>
                  <TextInput
                    style={ss.fieldInput}
                    value={editAmt}
                    onChangeText={setEditAmt}
                    keyboardType="decimal-pad"
                  />
                  <View style={ss.editBtnRow}>
                    <Pressable onPress={saveEdit} disabled={!isEditDirty} style={{ flex: 1 }}>
                      {({ pressed }) => (
                        <View style={[ss.btn, ss.btnYellow, !isEditDirty && ss.btnDisabled, pressed && isEditDirty && ss.btnPressed]} pointerEvents="none">
                          <Text style={ss.btnText}>Save</Text>
                        </View>
                      )}
                    </Pressable>
                    <Pressable onPress={() => onDelete(item.id)} style={{ flex: 1 }}>
                      {({ pressed }) => (
                        <View style={[ss.btn, ss.btnRed, pressed && ss.btnPressed]} pointerEvents="none">
                          <Text style={ss.btnText}>Delete</Text>
                        </View>
                      )}
                    </Pressable>
                    <Pressable onPress={() => setEditingId(null)} style={{ flex: 1 }}>
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
              <Pressable key={item.id} onPress={() => startEdit(item.id)}>
                {({ pressed }) => (
                  <View
                    style={[
                      ss.rowCard,
                      rowColor ? { borderLeftColor: rowColor, borderLeftWidth: 6 } : null,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <View style={ss.rowLeft}>
                      {rowColor ? (
                        <View style={[ss.rowSwatch, { backgroundColor: rowColor }]} />
                      ) : null}
                      <Text style={ss.rowCat} numberOfLines={1}>{item.category}</Text>
                    </View>
                    <Text style={ss.rowAmt}>${item.amount.toFixed(2)}</Text>
                    <Text style={ss.rowEdit}>Edit</Text>
                  </View>
                )}
              </Pressable>
            )
          })
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
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 2,
    borderColor: INK,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipActive: {
    borderWidth: 3,
    shadowColor: INK,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  chipSwatch: {
    width: 12,
    height: 12,
    borderWidth: 1,
    borderColor: INK,
    flexShrink: 0,
  },
  chipText: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '800',
    color: INK,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: MUTED,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 4,
  },
  selectedSwatch: {
    width: 16,
    height: 16,
    borderWidth: 2,
    borderColor: INK,
  },
  selectedLabel: {
    fontFamily: MONO,
    fontSize: 15,
    fontWeight: '800',
    color: INK,
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
  btnYellow:   { backgroundColor: YELLOW },
  btnRed:      { backgroundColor: RED },
  btnNeutral:  { backgroundColor: CREAM },
  btnDisabled: { opacity: 0.4 },
  btnPressed:  { transform: [{ translateX: 3 }, { translateY: 3 }], shadowOpacity: 0, elevation: 0 },
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
