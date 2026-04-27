import { useEffect, useMemo, useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { File, Paths } from 'expo-file-system'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { DateInput } from '@/src/components/DateInput'
import { useCategoriesStore } from '@/src/stores/categoriesStore'
import { useTripsStore } from '@/src/stores/tripsStore'
import { useTransactionsStore } from '@/src/stores/transactionsStore'

type CashFlow = 'all' | 'in' | 'out'
type AmountCmp = 'any' | 'lt' | 'gt'
type ExportFormat = 'csv' | 'pdf'

const CREAM = '#FAFAF5'
const INK = '#111111'
const MUTED = '#E8E8E0'
const YELLOW = '#F5C842'
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

function clampIsoDate(v: string): string {
  const t = v.trim()
  return t
}

function inRange(ymd: string, start?: string, end?: string): boolean {
  if (start && ymd < start) return false
  if (end && ymd > end) return false
  return true
}

function escapeCsvCell(v: unknown): string {
  const s = String(v ?? '')
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function rowsToCsv(rows: Record<string, unknown>[]): string {
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
  const lines = [headers.join(',')]
  for (const r of rows) {
    lines.push(headers.map((h) => escapeCsvCell(r[h])).join(','))
  }
  return lines.join('\n')
}

function htmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

type NativePrint = typeof import('expo-print')
type NativeSharing = typeof import('expo-sharing')

function loadNative(): { Print: NativePrint; Sharing: NativeSharing } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Print = require('expo-print') as NativePrint
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sharing = require('expo-sharing') as NativeSharing
    return { Print, Sharing }
  } catch {
    return null
  }
}

export default function ExportScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const items = useTransactionsStore((s) => s.items)
  const load = useTransactionsStore((s) => s.load)
  const categories = useCategoriesStore((s) => s.items)
  const loadCategories = useCategoriesStore((s) => s.load)
  const trips = useTripsStore((s) => s.items)
  const loadTrips = useTripsStore((s) => s.load)

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [tripId, setTripId] = useState<number | 'all'>('all')
  const [category, setCategory] = useState<string | 'all'>('all')
  const [cashFlow, setCashFlow] = useState<CashFlow>('all')
  const [amountCmp, setAmountCmp] = useState<AmountCmp>('any')
  const [amountAbs, setAmountAbs] = useState('')
  const [format, setFormat] = useState<ExportFormat>('csv')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    load()
    loadCategories()
    loadTrips()
  }, [load, loadCategories, loadTrips])

  const filtered = useMemo(() => {
    const abs = Number(amountAbs)
    const hasAmt = amountCmp !== 'any' && amountAbs.trim() !== '' && !Number.isNaN(abs)
    return items.filter((tx) => {
      const d = tx.effective_date ?? tx.date
      if (!inRange(d, startDate.trim() || undefined, endDate.trim() || undefined)) return false
      if (tripId !== 'all' && (tx.trip_id ?? null) !== tripId) return false
      if (category !== 'all' && (tx.category ?? '') !== category) return false
      if (cashFlow === 'in' && tx.amount <= 0) return false
      if (cashFlow === 'out' && tx.amount >= 0) return false
      if (hasAmt) {
        const a = Math.abs(tx.amount)
        if (amountCmp === 'lt' && !(a < abs)) return false
        if (amountCmp === 'gt' && !(a > abs)) return false
      }
      return true
    })
  }, [items, startDate, endDate, tripId, category, cashFlow, amountCmp, amountAbs])

  const exportRows = useMemo(() => filtered.map((t) => ({
    id: t.id,
    date: t.date,
    effective_date: t.effective_date ?? '',
    description: t.description,
    amount: t.amount,
    category: t.category ?? '',
    detail_category: t.detail_category ?? '',
    account_id: t.account_id,
    account_label: t.account_label ?? '',
    source: t.source,
    pending: t.pending === 1 ? 'true' : 'false',
    trip_id: t.trip_id ?? '',
    my_share: t.my_share ?? '',
  })), [filtered])

  const canExport = useMemo(() => {
    if (exportRows.length === 0) return false
    if (amountCmp !== 'any' && amountAbs.trim() !== '' && Number.isNaN(Number(amountAbs))) return false
    return true
  }, [exportRows.length, amountCmp, amountAbs])

  const onExport = async () => {
    if (exporting || !canExport) return
    setExporting(true)
    try {
      const stamp = new Date().toISOString().slice(0, 10)
      if (format === 'csv') {
        const csv = rowsToCsv(exportRows as unknown as Record<string, unknown>[])
        const fileName = `brutal-budget-export-${stamp}.csv`
        const file = new File(Paths.cache.uri + fileName)
        file.create({ overwrite: true })
        file.write(csv)

        // Prefer native file share (better “real CSV” attachment UX).
        const native = (() => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const Sharing = require('expo-sharing') as NativeSharing
            return { Sharing }
          } catch {
            return null
          }
        })()

        if (native) {
          await native.Sharing.shareAsync(file.uri, {
            dialogTitle: `Export ${stamp}`,
            mimeType: 'text/csv',
            UTI: 'public.comma-separated-values-text',
          })
        } else {
          // Fallback: share sheet without expo-sharing available.
          await Share.share({
            title: fileName,
            message: csv,
            url: file.uri,
          })
        }
      } else {
        const native = loadNative()
        if (!native) {
          Alert.alert(
            'PDF export unavailable',
            'PDF export requires a rebuild of the dev client (native module expo-print is not installed in this app binary yet).',
          )
          return
        }
        const rowsHtml = exportRows.map((r) => `
          <tr>
            <td>${htmlEscape(String(r.date))}</td>
            <td>${htmlEscape(String(r.description))}</td>
            <td style="text-align:right">${htmlEscape(String(r.amount))}</td>
            <td>${htmlEscape(String(r.category))}</td>
            <td>${htmlEscape(String(r.trip_id))}</td>
          </tr>
        `).join('')
        const html = `
          <html>
            <head>
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; padding: 16px; }
                h1 { font-size: 16px; margin: 0 0 8px; }
                .meta { font-size: 12px; color: #666; margin-bottom: 12px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #ddd; padding: 6px; font-size: 11px; }
                th { background: #f3f3f3; text-align: left; }
              </style>
            </head>
            <body>
              <h1>Brutal Budget Export</h1>
              <div class="meta">${exportRows.length} transactions • ${stamp}</div>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Category</th>
                    <th>Trip</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>
            </body>
          </html>
        `
        const { uri } = await native.Print.printToFileAsync({ html, base64: false })
        await native.Sharing.shareAsync(uri, { dialogTitle: `Export ${stamp}` })
      }
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.topbar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <Text style={styles.backChev}>‹</Text>
        </Pressable>
        <Text style={styles.topbarTitle}>Export</Text>
        <Text style={styles.topbarSub}>{filtered.length} rows</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 120 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Date range</Text>
            <Text style={styles.fieldLabel}>Start (optional)</Text>
            <DateInput value={clampIsoDate(startDate)} onChange={setStartDate} style={styles.inputField} placeholder="Start date" />
            <Text style={styles.fieldLabel}>End (optional)</Text>
            <DateInput value={clampIsoDate(endDate)} onChange={setEndDate} style={styles.inputField} placeholder="End date" />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Trip / event</Text>
            <View style={styles.chips}>
              <Chip label="All" selected={tripId === 'all'} onPress={() => setTripId('all')} />
              {trips.map((t) => (
                <Chip key={t.id} label={t.name} selected={tripId === t.id} onPress={() => setTripId(t.id)} />
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Category</Text>
            <View style={styles.chips}>
              <Chip label="All" selected={category === 'all'} onPress={() => setCategory('all')} />
              {categories.map((c) => (
                <Chip key={c.id} label={c.label} selected={category === c.label} onPress={() => setCategory(c.label)} />
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Flow</Text>
            <View style={styles.chips}>
              <Chip label="All" selected={cashFlow === 'all'} onPress={() => setCashFlow('all')} />
              <Chip label="In" selected={cashFlow === 'in'} onPress={() => setCashFlow('in')} />
              <Chip label="Out" selected={cashFlow === 'out'} onPress={() => setCashFlow('out')} />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Amount filter</Text>
            <View style={styles.chips}>
              <Chip label="Any" selected={amountCmp === 'any'} onPress={() => setAmountCmp('any')} />
              <Chip label="Less than" selected={amountCmp === 'lt'} onPress={() => setAmountCmp('lt')} />
              <Chip label="Greater than" selected={amountCmp === 'gt'} onPress={() => setAmountCmp('gt')} />
            </View>
            {amountCmp !== 'any' ? (
              <>
                <Text style={styles.fieldLabel}>Amount (absolute)</Text>
                <TextInput
                  value={amountAbs}
                  onChangeText={setAmountAbs}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor="#999"
                  style={styles.inputField}
                />
              </>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Format</Text>
            <View style={styles.chips}>
              <Chip label="CSV" selected={format === 'csv'} onPress={() => setFormat('csv')} />
              <Chip label="PDF" selected={format === 'pdf'} onPress={() => setFormat('pdf')} />
            </View>
          </View>

          <View style={styles.exportAction}>
            <Pressable onPress={() => { void onExport() }} disabled={!canExport || exporting}>
              {({ pressed }) => (
                <View style={[styles.btn, styles.btnYellow, (!canExport || exporting) && styles.btnDisabled, pressed && canExport && !exporting && styles.btnPressed]} pointerEvents="none">
                  <Text style={styles.btnText}>{exporting ? 'Exporting…' : `Export ${exportRows.length} rows`}</Text>
                </View>
              )}
            </Pressable>
            {!canExport ? <Text style={styles.hint}>No rows match these filters.</Text> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.8 }}>
      <View style={[styles.chip, selected && styles.chipOn]} pointerEvents="none">
        <Text style={styles.chipText} numberOfLines={1}>{label}</Text>
      </View>
    </Pressable>
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
  backChev: { fontFamily: MONO, fontSize: 28, fontWeight: '900', color: CREAM, lineHeight: 28 },
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
  topbarSub: { fontFamily: MONO, fontSize: 13, color: '#888888', flexShrink: 0, marginLeft: 'auto' },
  body: { padding: 12, gap: 10, paddingBottom: 120 },
  card: {
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: CREAM,
    padding: 12,
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  sectionLabel: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: INK,
    marginBottom: 8,
  },
  fieldLabel: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: INK,
    marginBottom: 3,
    marginTop: 8,
  },
  inputField: {
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderWidth: 2,
    borderColor: INK,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: CREAM,
    maxWidth: 200,
  },
  chipOn: { backgroundColor: YELLOW },
  chipText: { fontFamily: MONO, fontSize: 12, fontWeight: '800', color: INK },
  exportAction: { marginTop: 2 },
  btn: {
    borderWidth: 3,
    borderColor: INK,
    paddingTop: 12,
    paddingBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
    backgroundColor: CREAM,
  },
  btnYellow: { backgroundColor: YELLOW },
  btnDisabled: { opacity: 0.4 },
  btnPressed: { transform: [{ translateX: 3 }, { translateY: 3 }], shadowOpacity: 0, elevation: 0 },
  btnText: { fontFamily: MONO, fontSize: 13, fontWeight: '800', color: INK, textTransform: 'uppercase', letterSpacing: 0.5 },
  hint: { fontFamily: MONO, fontSize: 12, color: '#666666', marginTop: 8 },
})

