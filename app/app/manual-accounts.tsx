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
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useAccountsStore } from '@/src/stores/accountsStore'

const CREAM  = '#FAFAF5'
const INK    = '#111111'
const MUTED  = '#E8E8E0'
const YELLOW = '#F5C842'
const RED    = '#FF5E5E'
const MONO   = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

export default function ManualAccountsScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const items  = useAccountsStore((s) => s.items)
  const load   = useAccountsStore((s) => s.load)
  const add    = useAccountsStore((s) => s.add)
  const update = useAccountsStore((s) => s.update)
  const remove = useAccountsStore((s) => s.remove)

  const [name, setName]           = useState('')
  const [inst, setInst]           = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName]   = useState('')
  const [editInst, setEditInst]   = useState('')

  useEffect(() => { load() }, [load])

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
    update(editingId, { name: editName.trim(), institution: editInst.trim() || null })
    setEditingId(null)
  }

  const editingItem = useMemo(() => items.find((a) => a.id === editingId), [items, editingId])

  const isEditDirty = useMemo(() => {
    if (!editingItem) return false
    return editName.trim() !== (editingItem.name ?? '') || editInst.trim() !== (editingItem.institution ?? '')
  }, [editingItem, editName, editInst])

  const onDelete = (id: string) => {
    Alert.alert(
      'Delete account',
      'Remove or reassign transactions first if any reference this account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const ok = remove(id)
            setEditingId(null)
            if (!ok)
              Alert.alert('Cannot delete', 'Remove or reassign transactions that use this account first.')
          },
        },
      ],
    )
  }

  return (
    <View style={ss.screen}>
      {/* Topbar */}
      <View style={[ss.topbar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <Text style={ss.backChev}>‹</Text>
        </Pressable>
        <Text style={ss.topbarTitle}>Manual accounts</Text>
        <Text style={ss.topbarSub}>Local-only</Text>
      </View>

      <ScrollView
        contentContainerStyle={[ss.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Add form */}
        <View style={ss.card}>
          <Text style={ss.fieldLabel}>Account name</Text>
          <TextInput
            style={ss.fieldInput}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Checking"
            placeholderTextColor="#888"
          />
          <Text style={ss.fieldLabel}>Institution (optional)</Text>
          <TextInput
            style={ss.fieldInput}
            value={inst}
            onChangeText={setInst}
            placeholder="e.g. Chase"
            placeholderTextColor="#888"
          />
          <Pressable onPress={onCreate}>
            {({ pressed }) => (
              <View style={[ss.btn, ss.btnYellow, pressed && ss.btnPressed]} pointerEvents="none">
                <Text style={ss.btnText}>Add account</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Accounts list */}
        <Text style={ss.sectionLabel}>Accounts</Text>
        {items.length === 0 ? (
          <Text style={ss.empty}>No manual accounts yet.</Text>
        ) : (
          items.map((item) => {
            if (editingId === item.id) {
              return (
                <View key={item.id} style={ss.editCard}>
                  <Text style={ss.fieldLabel}>Name</Text>
                  <TextInput
                    style={ss.fieldInput}
                    value={editName}
                    onChangeText={setEditName}
                    autoCorrect={false}
                  />
                  <Text style={ss.fieldLabel}>Institution</Text>
                  <TextInput
                    style={ss.fieldInput}
                    value={editInst}
                    onChangeText={setEditInst}
                    placeholder="optional"
                    placeholderTextColor="#888"
                    autoCorrect={false}
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
                  <View style={[ss.rowCard, pressed && { opacity: 0.85 }]}>
                    <View style={ss.rowInfo}>
                      <Text style={ss.rowName} numberOfLines={1}>{item.name}</Text>
                      {item.institution ? (
                        <Text style={ss.rowMeta} numberOfLines={1}>{item.institution}</Text>
                      ) : null}
                    </View>
                    <Text style={ss.rowEdit}>Edit</Text>
                  </View>
                )}
              </Pressable>
            )
          })
        )}
      </ScrollView>
    </View>
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
  btnDisabled: { opacity: 0.4 },
  btnRed:     { backgroundColor: RED },
  btnNeutral: { backgroundColor: CREAM },
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
  },
  rowInfo: { flex: 1 },
  rowName: {
    fontFamily: MONO,
    fontSize: 15,
    fontWeight: '800',
    color: INK,
  },
  rowMeta: {
    fontFamily: MONO,
    fontSize: 13,
    color: '#555555',
    marginTop: 3,
  },
  rowEdit: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '800',
    color: INK,
    opacity: 0.5,
    textTransform: 'uppercase',
    marginLeft: 10,
  },
})
