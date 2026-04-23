import { useEffect, useMemo, useState } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'

import {
  BrutalBackRow,
  BrutalButton,
  BrutalCard,
  BrutalScreen,
  BrutalTextField,
} from '@/src/components/Brutalist'
import { useBudgetsStore } from '@/src/stores/budgetsStore'
import { tokens } from '@/src/theme/tokens'

export default function BudgetsScreen() {
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

  const [capInput, setCapInput] = useState('')
  const [monthDraft, setMonthDraft] = useState(month)
  const [cat, setCat] = useState('')
  const [amt, setAmt] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editCat, setEditCat] = useState('')
  const [editAmt, setEditAmt] = useState('')

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setCapInput(totalCap != null ? String(totalCap) : '')
  }, [totalCap])

  useEffect(() => {
    setMonthDraft(month)
  }, [month])

  const monthHint = useMemo(
    () =>
      'Use default for the rolling template, or 2026-04 style keys later.',
    [],
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

  const onAddRow = () => {
    const c = cat.trim()
    const a = Number(amt)
    if (!c || Number.isNaN(a)) return
    add({ category: c, amount: a, month })
    setCat('')
    setAmt('')
  }

  const startEdit = (id: number) => {
    const row = items.find((b) => b.id === id)
    if (!row) return
    setEditingId(id)
    setEditCat(row.category)
    setEditAmt(String(row.amount))
  }

  const saveEdit = () => {
    if (editingId == null) return
    const a = Number(editAmt)
    if (Number.isNaN(a)) return
    update(editingId, { category: editCat.trim(), amount: a })
    setEditingId(null)
  }

  return (
    <BrutalScreen title="Budgets" subtitle={`Month: ${month}`}>
      <BrutalBackRow onBack={() => router.back()} />
      <BrutalCard>
        <BrutalTextField
          label="Month key"
          value={monthDraft}
          onChangeText={setMonthDraft}
          autoCapitalize="none"
        />
        <Text style={styles.hint}>{monthHint}</Text>
        <BrutalButton title="Apply month" onPress={() => setMonth(monthDraft)} />
        <BrutalTextField
          label="Total monthly cap (optional)"
          value={capInput}
          onChangeText={setCapInput}
          keyboardType="decimal-pad"
        />
        <BrutalButton title="Save total cap" onPress={applyCap} />
      </BrutalCard>
      <BrutalCard>
        <BrutalTextField label="Category label" value={cat} onChangeText={setCat} />
        <BrutalTextField
          label="Amount"
          value={amt}
          onChangeText={setAmt}
          keyboardType="decimal-pad"
        />
        <BrutalButton title="Add budget row" onPress={onAddRow} />
      </BrutalCard>
      <Text style={styles.section}>ROWS</Text>
      <FlatList
        data={items}
        keyExtractor={(b) => String(b.id)}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Text style={styles.empty}>No budget rows for this month.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            {editingId === item.id ? (
              <>
                <BrutalTextField label="Category" value={editCat} onChangeText={setEditCat} />
                <BrutalTextField
                  label="Amount"
                  value={editAmt}
                  onChangeText={setEditAmt}
                  keyboardType="decimal-pad"
                />
                <View style={styles.gap}>
                  <BrutalButton title="Save" onPress={saveEdit} />
                  <BrutalButton
                    title="Cancel"
                    variant="neutral"
                    onPress={() => setEditingId(null)}
                  />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.rowTitle}>{item.category}</Text>
                <Text style={styles.rowAmt}>{item.amount.toFixed(2)}</Text>
                <View style={styles.gap}>
                  <BrutalButton title="Edit" onPress={() => startEdit(item.id)} />
                  <BrutalButton
                    title="Delete"
                    variant="neutral"
                    onPress={() => remove(item.id)}
                  />
                </View>
              </>
            )}
          </View>
        )}
        contentContainerStyle={styles.list}
      />
    </BrutalScreen>
  )
}

const styles = StyleSheet.create({
  hint: {
    fontFamily: tokens.font.mono,
    fontSize: 12,
    lineHeight: 18,
    color: tokens.color.fg,
    opacity: 0.75,
    marginBottom: tokens.space[4],
  },
  section: {
    marginTop: tokens.space[4],
    marginBottom: tokens.space[3],
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: tokens.color.fg,
  },
  list: {
    paddingBottom: tokens.space[6] + tokens.space[6],
    gap: tokens.space[3],
  },
  empty: {
    fontFamily: tokens.font.mono,
    color: tokens.color.fg,
    opacity: 0.7,
  },
  row: {
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.card,
    padding: tokens.space[4],
  },
  rowTitle: {
    fontWeight: '800',
    fontSize: 16,
    color: tokens.color.fg,
    marginBottom: tokens.space[2],
  },
  rowAmt: {
    fontFamily: tokens.font.mono,
    fontSize: 15,
    marginBottom: tokens.space[3],
  },
  gap: { gap: tokens.space[2] },
})
