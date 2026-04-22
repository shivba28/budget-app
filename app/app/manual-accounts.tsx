import { useEffect, useState } from 'react'
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'

import {
  BrutalBackRow,
  BrutalButton,
  BrutalCard,
  BrutalScreen,
  BrutalTextField,
} from '@/src/components/Brutalist'
import { useAccountsStore } from '@/src/stores/accountsStore'
import { tokens } from '@/src/theme/tokens'

export default function ManualAccountsScreen() {
  const router = useRouter()
  const items = useAccountsStore((s) => s.items)
  const load = useAccountsStore((s) => s.load)
  const add = useAccountsStore((s) => s.add)
  const update = useAccountsStore((s) => s.update)
  const remove = useAccountsStore((s) => s.remove)

  const [name, setName] = useState('')
  const [inst, setInst] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editInst, setEditInst] = useState('')

  useEffect(() => {
    load()
  }, [load])

  const onCreate = () => {
    const n = name.trim()
    if (!n) return
    add({ name: n, institution: inst.trim() || null })
    setName('')
    setInst('')
  }

  const startEdit = (id: string) => {
    const row = items.find((a) => a.id === id)
    if (!row) return
    setEditingId(id)
    setEditName(row.name ?? '')
    setEditInst(row.institution ?? '')
  }

  const saveEdit = () => {
    if (!editingId) return
    update(editingId, {
      name: editName.trim(),
      institution: editInst.trim() || null,
    })
    setEditingId(null)
  }

  const onDelete = (id: string) => {
    const ok = remove(id)
    if (!ok) {
      Alert.alert(
        'Cannot delete',
        'Remove or reassign transactions that use this account first.',
      )
    }
  }

  return (
    <BrutalScreen title="Manual accounts" subtitle="Local-only ledgers">
      <BrutalBackRow onBack={() => router.back()} />
      <BrutalCard>
        <BrutalTextField label="Account name" value={name} onChangeText={setName} />
        <BrutalTextField
          label="Institution (optional)"
          value={inst}
          onChangeText={setInst}
        />
        <BrutalButton title="Add account" onPress={onCreate} />
      </BrutalCard>
      <Text style={styles.section}>ACCOUNTS</Text>
      <FlatList
        data={items}
        keyExtractor={(a) => a.id}
        ListEmptyComponent={
          <Text style={styles.empty}>No manual accounts.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            {editingId === item.id ? (
              <>
                <BrutalTextField label="Name" value={editName} onChangeText={setEditName} />
                <BrutalTextField
                  label="Institution"
                  value={editInst}
                  onChangeText={setEditInst}
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
                <Text style={styles.rowTitle}>{item.name}</Text>
                {item.institution ? (
                  <Text style={styles.rowMeta}>{item.institution}</Text>
                ) : null}
                <View style={styles.gap}>
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
  rowMeta: {
    fontFamily: tokens.font.mono,
    fontSize: 13,
    opacity: 0.75,
    marginBottom: tokens.space[3],
  },
  gap: { gap: tokens.space[2] },
})
