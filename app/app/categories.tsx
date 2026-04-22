import { useEffect, useState } from 'react'
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'

import {
  BrutalBackRow,
  BrutalButton,
  BrutalCard,
  BrutalScreen,
  BrutalTextField,
} from '@/src/components/Brutalist'
import { useCategoriesStore } from '@/src/stores/categoriesStore'
import { tokens } from '@/src/theme/tokens'

export default function CategoriesScreen() {
  const router = useRouter()
  const items = useCategoriesStore((s) => s.items)
  const load = useCategoriesStore((s) => s.load)
  const add = useCategoriesStore((s) => s.add)
  const update = useCategoriesStore((s) => s.update)
  const remove = useCategoriesStore((s) => s.remove)

  const [label, setLabel] = useState('')
  const [color, setColor] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editColor, setEditColor] = useState('')

  useEffect(() => {
    load()
  }, [load])

  const onCreate = () => {
    const l = label.trim()
    if (!l) return
    add({ label: l, color: color.trim() || null })
    setLabel('')
    setColor('')
  }

  const startEdit = (id: string) => {
    const row = items.find((c) => c.id === id)
    if (!row) return
    setEditingId(id)
    setEditLabel(row.label)
    setEditColor(row.color ?? '')
  }

  const onSaveEdit = () => {
    if (!editingId) return
    const l = editLabel.trim()
    if (!l) return
    update(editingId, {
      label: l,
      color: editColor.trim() || null,
    })
    setEditingId(null)
  }

  const onDelete = (id: string) => {
    Alert.alert('Delete category', 'Budget rows that reference this label stay as-is.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => remove(id),
      },
    ])
  }

  return (
    <BrutalScreen title="Categories" subtitle="Labels for manual transactions">
      <BrutalBackRow onBack={() => router.back()} />
      <BrutalCard>
        <BrutalTextField label="Name" value={label} onChangeText={setLabel} />
        <BrutalTextField
          label="Color (hex, optional)"
          value={color}
          onChangeText={setColor}
          placeholder="#111111"
          autoCapitalize="none"
        />
        <BrutalButton title="Add category" onPress={onCreate} />
      </BrutalCard>
      <Text style={styles.section}>ALL</Text>
      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        ListEmptyComponent={
          <Text style={styles.empty}>No categories yet.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            {editingId === item.id ? (
              <>
                <BrutalTextField
                  label="Edit name"
                  value={editLabel}
                  onChangeText={setEditLabel}
                />
                <BrutalTextField
                  label="Edit color"
                  value={editColor}
                  onChangeText={setEditColor}
                  autoCapitalize="none"
                />
                <View style={styles.rowActions}>
                  <BrutalButton title="Save" onPress={onSaveEdit} />
                  <BrutalButton
                    title="Cancel"
                    variant="neutral"
                    onPress={() => setEditingId(null)}
                  />
                </View>
              </>
            ) : (
              <>
                <View style={styles.rowTop}>
                  <View
                    style={[
                      styles.swatch,
                      item.color
                        ? { backgroundColor: item.color }
                        : styles.swatchEmpty,
                    ]}
                  />
                  <Text style={styles.rowLabel}>{item.label}</Text>
                </View>
                <View style={styles.rowActions}>
                  <BrutalButton title="Edit" onPress={() => startEdit(item.id)} />
                  <BrutalButton
                    title="Delete"
                    variant="neutral"
                    onPress={() => onDelete(item.id)}
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
  section: {
    marginTop: tokens.space[5],
    marginBottom: tokens.space[3],
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: tokens.color.fg,
  },
  list: {
    paddingBottom: tokens.space[6] + tokens.space[5],
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
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[3],
    marginBottom: tokens.space[3],
  },
  swatch: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: tokens.border.w2,
    borderColor: tokens.color.border,
  },
  swatchEmpty: {
    backgroundColor: tokens.color.muted,
  },
  rowLabel: {
    fontWeight: '800',
    fontSize: 16,
    color: tokens.color.fg,
    flex: 1,
  },
  rowActions: {
    gap: tokens.space[2],
  },
})
