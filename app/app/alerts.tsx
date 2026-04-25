import { useEffect, useMemo, useState } from 'react'
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { BudgetAlertSettings } from '@/src/lib/notifications'
import { getBudgetAlertSettings, runBudgetAlertCheck, setBudgetAlertSettings } from '@/src/lib/notifications'
import { useCategoriesStore } from '@/src/stores/categoriesStore'

const CREAM = '#FAFAF5'
const INK = '#111111'
const MUTED = '#E8E8E0'
const YELLOW = '#F5C842'
const TEAL   = '#3BCEAC'
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

function pctToText(n: number): string {
  return String(Math.round(n * 100))
}

function textToPct(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(1, n / 100))
}

function hourTextToHour(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  const h = Math.floor(n)
  if (h < 0 || h > 23) return null
  return h
}

export default function AlertsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const categories = useCategoriesStore((s) => s.items)
  const loadCategories = useCategoriesStore((s) => s.load)

  const [settings, setSettings] = useState<BudgetAlertSettings>(() => getBudgetAlertSettings())
  const [t80, setT80] = useState(() => pctToText(settings.threshold80))
  const [t100, setT100] = useState(() => pctToText(settings.threshold100))
  const [qhStart, setQhStart] = useState(() => String(settings.quietHours?.startHour ?? 22))
  const [qhEnd, setQhEnd] = useState(() => String(settings.quietHours?.endHour ?? 8))

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  const userCats = useMemo(() => categories.filter((c) => c.source === 'user'), [categories])
  const tellerCats = useMemo(() => categories.filter((c) => c.source === 'teller'), [categories])

  const save = () => {
    const p80 = textToPct(t80)
    const p100 = textToPct(t100)
    if (p80 == null || p100 == null) {
      Alert.alert('Invalid thresholds', 'Enter percent values like 80 and 100.')
      return
    }
    const sH = hourTextToHour(qhStart)
    const eH = hourTextToHour(qhEnd)
    if (sH == null || eH == null) {
      Alert.alert('Invalid quiet hours', 'Use 0–23 for start/end hours.')
      return
    }

    const next: BudgetAlertSettings = {
      ...settings,
      threshold80: Math.min(p80, p100),
      threshold100: Math.max(p100, p80),
      quietHours: { startHour: sH, endHour: eH },
    }
    setBudgetAlertSettings(next)
    setSettings(next)
    // Run once immediately so user can validate behavior.
    void runBudgetAlertCheck('manual')
    Alert.alert('Saved', 'Budget alert settings updated.')
  }

  const toggleCategory = (label: string) => {
    const cur = settings.perCategoryEnabled[label]
    const next: BudgetAlertSettings = {
      ...settings,
      perCategoryEnabled: {
        ...settings.perCategoryEnabled,
        [label]: cur === false ? true : false,
      },
    }
    setBudgetAlertSettings(next)
    setSettings(next)
  }

  const enabledFor = (label: string) => settings.perCategoryEnabled[label] !== false

  return (
    <View style={styles.screen}>
      <View style={[styles.topbar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <Text style={styles.backChev}>‹</Text>
        </Pressable>
        <Text style={styles.topbarTitle}>Budget alerts</Text>
        <Text style={styles.topbarSub}>Local</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>General</Text>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Enabled</Text>
            <Switch
              value={settings.enabled}
              onValueChange={(v) => {
                const next = { ...settings, enabled: v }
                setBudgetAlertSettings(next)
                setSettings(next)
              }}
              trackColor={{ false: MUTED, true: TEAL }}
              thumbColor={CREAM}
              ios_backgroundColor={MUTED}
            />
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Thresholds (%)</Text>
          <View style={styles.inlineRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.miniLabel}>Warn</Text>
              <TextInput
                style={styles.fieldInput}
                value={t80}
                onChangeText={setT80}
                keyboardType="number-pad"
                placeholder="80"
                placeholderTextColor="#888"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.miniLabel}>Cap</Text>
              <TextInput
                style={styles.fieldInput}
                value={t100}
                onChangeText={setT100}
                keyboardType="number-pad"
                placeholder="100"
                placeholderTextColor="#888"
              />
            </View>
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Quiet hours (0–23)</Text>
          <View style={styles.inlineRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.miniLabel}>Start</Text>
              <TextInput
                style={styles.fieldInput}
                value={qhStart}
                onChangeText={setQhStart}
                keyboardType="number-pad"
                placeholder="22"
                placeholderTextColor="#888"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.miniLabel}>End</Text>
              <TextInput
                style={styles.fieldInput}
                value={qhEnd}
                onChangeText={setQhEnd}
                keyboardType="number-pad"
                placeholder="8"
                placeholderTextColor="#888"
              />
            </View>
          </View>

          <Pressable onPress={save}>
            {({ pressed }) => (
              <View style={[styles.btn, styles.btnYellow, pressed && styles.btnPressed]} pointerEvents="none">
                <Text style={styles.btnText}>Save settings</Text>
              </View>
            )}
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Per-category</Text>

          {userCats.length > 0 ? (
            <>
              <Text style={styles.groupLabel}>Your categories</Text>
              {userCats.map((c) => (
                <View key={c.id} style={styles.rowCard}>
                  <View style={styles.rowLeft}>
                    <View style={[styles.rowSwatch, { backgroundColor: c.color ?? MUTED }]} />
                    <Text style={styles.rowCat} numberOfLines={1}>{c.label}</Text>
                  </View>
                  <Switch
                    value={enabledFor(c.label)}
                    onValueChange={() => toggleCategory(c.label)}
                    trackColor={{ false: MUTED, true: TEAL }}
                    thumbColor={CREAM}
                    ios_backgroundColor={MUTED}
                  />
                </View>
              ))}
            </>
          ) : null}

          {tellerCats.length > 0 ? (
            <>
              <Text style={[styles.groupLabel, { marginTop: 10 }]}>Bank categories</Text>
              {tellerCats.map((c) => (
                <View key={c.id} style={styles.rowCard}>
                  <View style={styles.rowLeft}>
                    <View style={[styles.rowSwatch, { backgroundColor: c.color ?? MUTED }]} />
                    <Text style={styles.rowCat} numberOfLines={1}>{c.label}</Text>
                  </View>
                  <Switch
                    value={enabledFor(c.label)}
                    onValueChange={() => toggleCategory(c.label)}
                    trackColor={{ false: MUTED, true: TEAL }}
                    thumbColor={CREAM}
                    ios_backgroundColor={MUTED}
                  />
                </View>
              ))}
            </>
          ) : null}
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
  sectionLabel: {
    fontFamily: MONO,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: INK,
    marginBottom: 8,
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
  fieldLabel: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: INK,
    marginBottom: 6,
  },
  miniLabel: {
    fontFamily: MONO,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#555555',
    marginBottom: 4,
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
  inlineRow: { flexDirection: 'row', gap: 8 },
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
    justifyContent: 'space-between',
    gap: 8,
  },
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
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
    opacity: 0.6,
    textTransform: 'uppercase',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 2,
    borderTopColor: INK,
    paddingTop: 10,
  },
  switchLabel: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '800',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  btnPressed: { transform: [{ translateX: 3 }, { translateY: 3 }], shadowOpacity: 0, elevation: 0 },
  btnText: {
    fontFamily: MONO,
    fontSize: 15,
    fontWeight: '800',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
})

