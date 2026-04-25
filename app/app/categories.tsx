import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  type DimensionValue,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useCategoriesStore } from '@/src/stores/categoriesStore'

const CREAM = '#FAFAF5'
const INK = '#111111'
const MUTED = '#E8E8E0'
const YELLOW = '#F5C842'
const RED = '#FF5E5E'
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

// ── color math ────────────────────────────────────────────────────────────────

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0, g = 0, b = 0
  if (h < 60)       { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else              { r = c; b = x }
  const toH = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0')
  return `#${toH(r)}${toH(g)}${toH(b)}`
}

function hexToHsv(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  if (clean.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(clean)) return [0, 1, 0.9]
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const v = max
  const s = max === 0 ? 0 : (max - min) / max
  let hh = 0
  if (max !== min) {
    const d = max - min
    if (max === r) hh = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) hh = ((b - r) / d + 2) * 60
    else hh = ((r - g) / d + 4) * 60
  }
  return [hh, s, v]
}

// ── GradientSlider ────────────────────────────────────────────────────────────

type GStop = { offset: string; color: string }

function GradientSlider({
  gradId,
  stops,
  value,
  onChange,
}: {
  gradId: string
  stops: GStop[]
  value: number
  onChange: (v: number) => void
}) {
  const widthRef = useRef(0)
  const cbRef = useRef(onChange)
  useEffect(() => { cbRef.current = onChange })

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / (widthRef.current || 1)))
        cbRef.current(ratio)
      },
      onPanResponderMove: (e) => {
        const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / (widthRef.current || 1)))
        cbRef.current(ratio)
      },
    })
  )

  const pct = `${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%` as DimensionValue

  return (
    <View
      style={slSt.track}
      onLayout={(e) => { widthRef.current = e.nativeEvent.layout.width }}
      {...pan.current.panHandlers}
    >
      <Svg height="100%" width="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            {stops.map((s) => (
              <Stop key={s.offset} offset={s.offset} stopColor={s.color} stopOpacity="1" />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradId})`} />
      </Svg>
      <View style={[slSt.thumb, { left: pct }]} pointerEvents="none" />
    </View>
  )
}

const slSt = StyleSheet.create({
  track: {
    height: 30,
    borderWidth: 2,
    borderColor: INK,
    marginBottom: 12,
    overflow: 'visible',
  },
  thumb: {
    position: 'absolute',
    top: -5,
    width: 18,
    height: 40,
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: CREAM,
    marginLeft: -9,
  },
})

// ── InlineColorPicker ─────────────────────────────────────────────────────────

function InlineColorPicker({
  value,
  onChange,
  prefix,
}: {
  value: string
  onChange: (hex: string) => void
  prefix: string
}) {
  const [h, s, v] = hexToHsv(value || '#F94144')
  const [hue, setHue] = useState(h)
  const [sat, setSat] = useState(s)
  const [val, setVal] = useState(v)
  const [hexInput, setHexInput] = useState(value || '#F94144')

  const hRef = useRef(hue)
  const sRef = useRef(sat)
  const vRef = useRef(val)
  const cbRef = useRef(onChange)
  useEffect(() => { cbRef.current = onChange })

  const commit = useCallback((nh: number, ns: number, nv: number) => {
    const hex = hsvToHex(nh, ns, nv)
    setHexInput(hex)
    cbRef.current(hex)
  }, [])

  const onHue = useCallback((ratio: number) => {
    const nh = ratio * 360
    hRef.current = nh
    setHue(nh)
    commit(nh, sRef.current, vRef.current)
  }, [commit])

  const onSat = useCallback((ratio: number) => {
    sRef.current = ratio
    setSat(ratio)
    commit(hRef.current, ratio, vRef.current)
  }, [commit])

  const onVal = useCallback((ratio: number) => {
    vRef.current = ratio
    setVal(ratio)
    commit(hRef.current, sRef.current, ratio)
  }, [commit])

  const onHexChange = (text: string) => {
    setHexInput(text)
    if (/^#[0-9a-fA-F]{6}$/.test(text.trim())) {
      const [nh, ns, nv] = hexToHsv(text.trim())
      hRef.current = nh; sRef.current = ns; vRef.current = nv
      setHue(nh); setSat(ns); setVal(nv)
      cbRef.current(text.trim())
    }
  }

  const pureHue = hsvToHex(hue, 1, 1)
  const satColor = hsvToHex(hue, sat, 1)
  const current = hsvToHex(hue, sat, val)

  return (
    <View style={pkSt.wrap}>
      <View style={[pkSt.preview, { backgroundColor: current }]} />

      <Text style={pkSt.sliderLabel}>Hue</Text>
      <GradientSlider
        gradId={`${prefix}-h`}
        stops={[
          { offset: '0',    color: '#FF0000' },
          { offset: '0.17', color: '#FFFF00' },
          { offset: '0.33', color: '#00FF00' },
          { offset: '0.5',  color: '#00FFFF' },
          { offset: '0.67', color: '#0000FF' },
          { offset: '0.83', color: '#FF00FF' },
          { offset: '1',    color: '#FF0000' },
        ]}
        value={hue / 360}
        onChange={onHue}
      />

      <Text style={pkSt.sliderLabel}>Saturation</Text>
      <GradientSlider
        gradId={`${prefix}-s`}
        stops={[{ offset: '0', color: '#FFFFFF' }, { offset: '1', color: pureHue }]}
        value={sat}
        onChange={onSat}
      />

      <Text style={pkSt.sliderLabel}>Brightness</Text>
      <GradientSlider
        gradId={`${prefix}-v`}
        stops={[{ offset: '0', color: '#000000' }, { offset: '1', color: satColor }]}
        value={val}
        onChange={onVal}
      />

      <Text style={pkSt.sliderLabel}>Hex</Text>
      <TextInput
        style={pkSt.hexInput}
        value={hexInput}
        onChangeText={onHexChange}
        placeholder="#F94144"
        placeholderTextColor="#888"
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  )
}

const pkSt = StyleSheet.create({
  wrap: { marginBottom: 10 },
  preview: {
    height: 44,
    borderWidth: 2,
    borderColor: INK,
    marginBottom: 12,
  },
  sliderLabel: {
    fontFamily: MONO,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: INK,
    marginBottom: 4,
  },
  hexInput: {
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
})

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function CategoriesScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const items = useCategoriesStore((s) => s.items)
  const load  = useCategoriesStore((s) => s.load)
  const add   = useCategoriesStore((s) => s.add)
  const update = useCategoriesStore((s) => s.update)
  const remove = useCategoriesStore((s) => s.remove)

  const [label, setLabel]       = useState('')
  const [color, setColor]       = useState('#F94144')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editColor, setEditColor] = useState('#F94144')

  useEffect(() => { load() }, [load])

  const onCreate = () => {
    const l = label.trim()
    if (!l) return
    const ok = add({ label: l, color: color || null })
    if (!ok) {
      Alert.alert('Duplicate category', 'A category with this name already exists (names are case-insensitive).')
      return
    }
    setLabel('')
    setColor('#F94144')
  }

  const startEdit = (id: string) => {
    const row = items.find((c) => c.id === id)
    if (!row) return
    setEditingId(id)
    setEditLabel(row.label)
    setEditColor(row.color ?? '#F94144')
  }

  const editingItem = useMemo(() => items.find((c) => c.id === editingId), [items, editingId])

  const isEditDirty = useMemo(() => {
    if (!editingItem) return false
    return editLabel.trim() !== editingItem.label || editColor !== (editingItem.color ?? '#F94144')
  }, [editingItem, editLabel, editColor])

  const onSaveEdit = () => {
    if (!editingId) return
    const l = editLabel.trim()
    if (!l) return
    const ok = update(editingId, { label: l, color: editColor || null })
    if (!ok) {
      Alert.alert('Duplicate category', 'Another category already uses this name (names are case-insensitive).')
      return
    }
    setEditingId(null)
  }

  const onDelete = (id: string) => {
    const row = items.find((c) => c.id === id)
    if (!row || row.source !== 'user') return
    Alert.alert(
      'Delete category',
      'Transactions using this category will have no category (unassigned). Budget rows keep this label as text until you edit them.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            remove(id)
            setEditingId(null)
          },
        },
      ],
    )
  }

  const userCats = useMemo(() => items.filter((c) => c.source === 'user'), [items])
  const tellerCats = useMemo(() => items.filter((c) => c.source === 'teller'), [items])

  const renderCategoryItem = (item: (typeof items)[number]) => {
    if (editingId === item.id) {
      return (
        <View key={item.id} style={ss.rowEditWrap}>
          <View style={ss.editCard}>
            <Text style={ss.fieldLabel}>Name</Text>
            <TextInput
              style={ss.fieldInput}
              value={editLabel}
              onChangeText={setEditLabel}
              autoCorrect={false}
            />
            <Text style={ss.fieldLabel}>Color</Text>
            <InlineColorPicker
              value={editColor}
              onChange={setEditColor}
              prefix={`edit-${item.id}`}
            />
            <View style={ss.editBtnRow}>
              <Pressable onPress={onSaveEdit} disabled={!isEditDirty} style={{ flex: 1 }}>
                {({ pressed }) => (
                  <View style={[ss.btn, ss.btnYellow, !isEditDirty && ss.btnDisabled, pressed && isEditDirty && ss.btnPressed]} pointerEvents="none">
                    <Text style={ss.btnText}>Save</Text>
                  </View>
                )}
              </Pressable>
              {item.source === 'user' ? (
                <Pressable onPress={() => onDelete(item.id)} style={{ flex: 1 }}>
                  {({ pressed }) => (
                    <View style={[ss.btn, ss.btnRed, pressed && ss.btnPressed]} pointerEvents="none">
                      <Text style={ss.btnText}>Delete</Text>
                    </View>
                  )}
                </Pressable>
              ) : null}
              <Pressable onPress={() => setEditingId(null)} style={{ flex: 1 }}>
                {({ pressed }) => (
                  <View style={[ss.btn, ss.btnNeutral, pressed && ss.btnPressed]} pointerEvents="none">
                    <Text style={ss.btnText}>Cancel</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      )
    }
    const rowColor = item.color ?? MUTED
    return (
      <Pressable key={item.id} onPress={() => startEdit(item.id)}>
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
                {item.label}
              </Text>
            </View>
            <Text style={ss.rowEdit}>Edit</Text>
          </View>
        )}
      </Pressable>
    )
  }

  return (
    <View style={ss.screen}>
      {/* Top bar */}
      <View style={[ss.topbar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <Text style={ss.backChev}>‹</Text>
        </Pressable>
        <Text style={ss.topbarTitle}>Categories</Text>
        <Text style={ss.topbarSub}>Labels</Text>
      </View>

      <ScrollView
        style={ss.scrollFill}
        contentContainerStyle={[ss.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Create form */}
        <View style={ss.card}>
          <Text style={ss.fieldLabel}>Name</Text>
          <TextInput
            style={ss.fieldInput}
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. Dining…"
            placeholderTextColor="#888"
          />
          <Text style={ss.fieldLabel}>Color</Text>
          <InlineColorPicker value={color} onChange={setColor} prefix="create" />
          <Pressable onPress={onCreate}>
            {({ pressed }) => (
              <View style={[ss.btn, ss.btnYellow, pressed && ss.btnPressed]} pointerEvents="none">
                <Text style={ss.btnText}>Add category</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Category list (rows + left accent, same as Budgets › Rows) */}
        {items.length === 0 ? (
          <Text style={ss.empty}>No categories yet.</Text>
        ) : (
          <>
            {userCats.length > 0 ? (
              <View style={{ marginBottom: 8 }}>
                <Text style={ss.groupLabel}>Your categories</Text>
                {userCats.map((item) => renderCategoryItem(item))}
              </View>
            ) : null}
            {tellerCats.length > 0 ? (
              <View style={{ marginBottom: 8 }}>
                <Text style={ss.groupLabel}>Bank categories</Text>
                {tellerCats.map((item) => renderCategoryItem(item))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  )
}

const ss = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CREAM },
  scrollFill: { flex: 1, backgroundColor: CREAM },
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
  scroll: { padding: 12, flexGrow: 1, backgroundColor: CREAM },
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
    marginBottom: 0,
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  rowEditWrap: {
    width: '100%',
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
  btnYellow:  { backgroundColor: YELLOW },
  btnRed:     { backgroundColor: RED },
  btnNeutral: { backgroundColor: CREAM },
  btnPressed: { transform: [{ translateX: 3 }, { translateY: 3 }], shadowOpacity: 0, elevation: 0 },
  btnDisabled: { opacity: 0.4 },
  btnText: {
    fontFamily: MONO,
    fontSize: 15,
    fontWeight: '800',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editBtnRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
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
  rowEdit: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '800',
    color: INK,
    opacity: 0.5,
    textTransform: 'uppercase',
  },
  empty: {
    fontFamily: MONO,
    fontSize: 15,
    color: '#666666',
    paddingVertical: 12,
  },
})
