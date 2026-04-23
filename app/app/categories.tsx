import { useEffect, useState } from 'react'
import {
  Alert,
  Modal,
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

import { useCategoriesStore } from '@/src/stores/categoriesStore'

const CREAM = '#FAFAF5'
const INK = '#111111'
const MUTED = '#E8E8E0'
const YELLOW = '#F5C842'
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

const PALETTE = [
  '#F94144', '#F3722C', '#F8961E', '#F9C74F',
  '#90BE6D', '#43AA8B', '#277DA1', '#9B5DE5',
  '#F15BB5', '#00BBF9', '#3BCEAC', '#F5C842',
  '#FF5E5E', '#C5B4E3', '#111111',
]

export default function CategoriesScreen() {
  const insets = useSafeAreaInsets()
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
  const [pickerOpen, setPickerOpen] = useState<null | 'create' | 'edit'>(null)

  useEffect(() => { load() }, [load])

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
    update(editingId, { label: l, color: editColor.trim() || null })
    setEditingId(null)
  }

  const onDelete = (id: string) => {
    Alert.alert('Delete category', 'Budget rows that reference this label stay as-is.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove(id) },
    ])
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.topbar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <Text style={styles.backChev}>‹</Text>
        </Pressable>
        <Text style={styles.topbarTitle}>Categories</Text>
        <Text style={styles.topbarSub}>Labels</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Create form */}
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            style={styles.fieldInput}
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. Dining…"
            placeholderTextColor="#999"
          />
          <Text style={styles.fieldLabel}>Color (hex, optional)</Text>
          <View style={styles.colorRow}>
            <View style={[styles.colorPreview, color.trim() ? { backgroundColor: color.trim() } : null]} />
            <TextInput
              style={[styles.fieldInput, styles.colorInput]}
              value={color}
              onChangeText={setColor}
              placeholder="#F94144"
              placeholderTextColor="#999"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <Pressable onPress={() => setPickerOpen('create')} style={({ pressed }) => pressed && { opacity: 0.8 }}>
            <View style={styles.pickBtn}>
              <Text style={styles.pickBtnText}>Pick a color</Text>
            </View>
          </Pressable>
          <Pressable onPress={onCreate} style={({ pressed }) => pressed && { opacity: 0.85 }}>
            <View style={[styles.btn, styles.btnYellow]}>
              <Text style={styles.btnText}>Add category</Text>
            </View>
          </Pressable>
        </View>

        {/* List */}
        <Text style={styles.sectionLabel}>All</Text>
        {items.length === 0 ? (
          <Text style={styles.empty}>No categories yet.</Text>
        ) : (
          items.map((item) => {
            if (editingId === item.id) {
              return (
                <View key={item.id} style={styles.editCard}>
                  <Text style={styles.fieldLabel}>Name</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={editLabel}
                    onChangeText={setEditLabel}
                    autoCorrect={false}
                  />
                  <Text style={styles.fieldLabel}>Color (hex, optional)</Text>
                  <View style={styles.colorRow}>
                    <View style={[styles.colorPreview, editColor.trim() ? { backgroundColor: editColor.trim() } : null]} />
                    <TextInput
                      style={[styles.fieldInput, styles.colorInput]}
                      value={editColor}
                      onChangeText={setEditColor}
                      placeholder="#F94144"
                      placeholderTextColor="#999"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                  <Pressable onPress={() => setPickerOpen('edit')} style={({ pressed }) => pressed && { opacity: 0.8 }}>
                    <View style={styles.pickBtn}>
                      <Text style={styles.pickBtnText}>Pick a color</Text>
                    </View>
                  </Pressable>
                  <View style={styles.editBtnRow}>
                    <Pressable onPress={onSaveEdit} style={[{ flex: 1 }, ({ pressed }) => pressed && { opacity: 0.85 }]}>
                      <View style={[styles.btn, styles.btnYellow]}>
                        <Text style={styles.btnText}>Save</Text>
                      </View>
                    </Pressable>
                    <Pressable onPress={() => onDelete(item.id)} style={[{ flex: 1 }, ({ pressed }) => pressed && { opacity: 0.85 }]}>
                      <View style={[styles.btn, styles.btnRed]}>
                        <Text style={styles.btnText}>Delete</Text>
                      </View>
                    </Pressable>
                    <Pressable onPress={() => setEditingId(null)} style={[{ flex: 1 }, ({ pressed }) => pressed && { opacity: 0.85 }]}>
                      <View style={[styles.btn, styles.btnNeutral]}>
                        <Text style={styles.btnText}>Cancel</Text>
                      </View>
                    </Pressable>
                  </View>
                </View>
              )
            }

            const bg = item.color ?? MUTED
            return (
              <Pressable key={item.id} onPress={() => startEdit(item.id)} style={({ pressed }) => pressed && { opacity: 0.85 }}>
                <View style={[styles.catBadge, { backgroundColor: bg }]}>
                  <View style={[styles.catSwatch, { backgroundColor: bg }]} />
                  <Text style={styles.catLabel} numberOfLines={1}>{item.label}</Text>
                  <Text style={styles.catEdit}>Edit</Text>
                </View>
              </Pressable>
            )
          })
        )}
      </ScrollView>

      {/* Color picker modal */}
      <Modal visible={pickerOpen !== null} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Pick a color</Text>
            <View style={styles.paletteGrid}>
              {PALETTE.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => {
                    if (pickerOpen === 'edit') setEditColor(c)
                    else setColor(c)
                    setPickerOpen(null)
                  }}
                  style={({ pressed }) => pressed && { opacity: 0.8 }}
                >
                  <View style={[styles.swatchBtn, { backgroundColor: c }]} />
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setPickerOpen(null)} style={({ pressed }) => pressed && { opacity: 0.8 }}>
              <View style={[styles.btn, styles.btnNeutral]}>
                <Text style={styles.btnText}>Close</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CREAM },
  topbar: {
    backgroundColor: INK,
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backChev: {
    fontFamily: MONO,
    fontSize: 24,
    fontWeight: '900',
    color: CREAM,
    lineHeight: 24,
  },
  topbarTitle: {
    fontFamily: MONO,
    fontSize: 18,
    fontWeight: '800',
    color: CREAM,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    flexShrink: 1,
    minWidth: 0,
  },
  topbarSub: {
    fontFamily: MONO,
    fontSize: 12,
    color: '#888888',
    flexShrink: 0,
    marginLeft: 'auto',
  },
  scroll: { padding: 12 },
  card: {
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: CREAM,
    padding: 12,
    marginBottom: 10,
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
    padding: 12,
    marginBottom: 6,
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  fieldLabel: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: INK,
    marginBottom: 4,
    marginTop: 6,
  },
  fieldInput: {
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: CREAM,
    paddingHorizontal: 9,
    paddingVertical: 7,
    fontFamily: MONO,
    fontSize: 14,
    color: INK,
    marginBottom: 6,
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 0,
  },
  colorPreview: {
    width: 28,
    height: 28,
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: MUTED,
    flexShrink: 0,
  },
  colorInput: {
    flex: 1,
    marginBottom: 6,
  },
  pickBtn: {
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: MUTED,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  pickBtnText: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '800',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  btn: {
    borderWidth: 3,
    borderColor: INK,
    paddingVertical: 10,
    alignItems: 'center',
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  btnYellow: { backgroundColor: YELLOW },
  btnRed: { backgroundColor: '#FF5E5E' },
  btnNeutral: { backgroundColor: CREAM },
  btnText: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '800',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editBtnRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  sectionLabel: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: INK,
    marginBottom: 6,
  },
  empty: {
    fontFamily: MONO,
    fontSize: 13,
    color: '#666666',
    paddingVertical: 12,
  },
  catBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 3,
    borderColor: INK,
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginBottom: 5,
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  catSwatch: {
    width: 12,
    height: 12,
    borderWidth: 2,
    borderColor: INK,
    flexShrink: 0,
  },
  catLabel: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '800',
    color: INK,
    flex: 1,
  },
  catEdit: {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: '800',
    color: INK,
    opacity: 0.6,
    textTransform: 'uppercase',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: CREAM,
    padding: 16,
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  modalTitle: {
    fontFamily: MONO,
    fontWeight: '800',
    fontSize: 14,
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  paletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  swatchBtn: {
    width: 44,
    height: 44,
    borderWidth: 3,
    borderColor: INK,
  },
})
