import { Ionicons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import { useRouter } from 'expo-router'
import Papa from 'papaparse'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import * as accountsQ from '@/src/db/queries/accounts'
import * as categoriesQ from '@/src/db/queries/categories'
import * as tripsQ from '@/src/db/queries/trips'
import * as txq from '@/src/db/queries/transactions'
import { DateInput } from '@/src/components/DateInput'
import {
  evaluateExpression,
  formatExpressionResult,
  isArithmeticExpression,
} from '@/src/lib/evaluateExpression'
import {
  createManualRecurringTransactions,
  type ManualRecurrenceCadence,
} from '@/src/lib/transactions/manualRecurring'
import { ensureRecurringTransactionsSeeded } from '@/src/lib/transactions/recurringAutoAdd'

// ─── Constants ────────────────────────────────────────────────────────────────

const CREAM = '#FAFAF5'
const INK = '#111111'
const MUTED = '#E8E8E0'
const YELLOW = '#F5C842'
const RED = '#FF5E5E'
const GREEN = '#3BCEAC'
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })
const MAX_ROWS = 500

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'upload' | 'mapping' | 'review'
type AmountMode = 'single' | 'debit_credit'

interface ColumnMapping {
  accountId: string
  date: string | null
  description: string | null
  amountMode: AmountMode
  amountCol: string | null
  debitCol: string | null
  creditCol: string | null
  categoryCol: string | null
  tripCol: string | null
}

interface MappedTx {
  date: string
  description: string
  amount: number
  category: string | null
  tripId: number | null
  recurrence: ManualRecurrenceCadence | 'none'
  untilDate: string
}

interface ReviewRow {
  rowId: string
  original: MappedTx
  current: MappedTx
  status: 'pending' | 'saved' | 'skipped'
  isDuplicate: boolean
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Try to parse a date string into YYYY-MM-DD. Returns null if unparseable. */
function parseDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // YYYY/MM/DD
  const ymd = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`

  // MM/DD/YYYY or M/D/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) return `${mdy[3]}-${mdy[1]!.padStart(2, '0')}-${mdy[2]!.padStart(2, '0')}`

  // MM-DD-YYYY
  const mdyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (mdyDash) return `${mdyDash[3]}-${mdyDash[1]!.padStart(2, '0')}-${mdyDash[2]!.padStart(2, '0')}`

  // Try native Date as last resort
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)

  return null
}

/** Strip currency symbols and parse a number. Handles (123.45) → -123.45. */
function parseAmount(raw: string): number | null {
  if (!raw.trim()) return null
  let s = raw.trim().replace(/[$€£,\s]/g, '')
  const negative = s.startsWith('(') && s.endsWith(')')
  s = s.replace(/[()]/g, '')
  const n = parseFloat(s)
  if (isNaN(n)) return null
  return negative ? -n : n
}

/** Guess which CSV column maps to a given role by checking common names. */
function autoDetect(headers: string[], patterns: string[]): string | null {
  const lower = headers.map((h) => h.toLowerCase().trim())
  for (const p of patterns) {
    const idx = lower.findIndex((h) => h.includes(p))
    if (idx !== -1) return headers[idx]!
  }
  return null
}

function buildAutoMapping(headers: string[]): Partial<ColumnMapping> {
  return {
    date: autoDetect(headers, ['date', 'time', 'posted', 'transaction date', 'trans date']),
    description: autoDetect(headers, ['description', 'merchant', 'payee', 'memo', 'name', 'narration', 'details', 'particulars']),
    amountMode: (autoDetect(headers, ['debit', 'withdrawal', 'charge']) &&
      autoDetect(headers, ['credit', 'deposit', 'payment']))
      ? 'debit_credit'
      : 'single',
    amountCol: autoDetect(headers, ['amount', 'value', 'sum', 'net']),
    debitCol: autoDetect(headers, ['debit', 'withdrawal', 'charge', 'expense']),
    creditCol: autoDetect(headers, ['credit', 'deposit', 'payment', 'income']),
    categoryCol: autoDetect(headers, ['category', 'type', 'tag', 'label']),
    tripCol: autoDetect(headers, ['trip', 'event', 'project', 'trip_id']),
  }
}

/** Apply column mapping to a single CSV row and return a MappedTx or null. */
function applyMapping(
  row: Record<string, string>,
  mapping: ColumnMapping,
  trips: tripsQ.TripRow[],
  categories: categoriesQ.CategoryRow[],
): MappedTx | null {
  const dateRaw = mapping.date ? (row[mapping.date] ?? '') : ''
  const date = parseDate(dateRaw)
  if (!date) return null

  const description = (mapping.description ? row[mapping.description] : '') ?? ''
  if (!description.trim()) return null

  let amount: number | null = null
  if (mapping.amountMode === 'single' && mapping.amountCol) {
    amount = parseAmount(row[mapping.amountCol] ?? '')
  } else if (mapping.amountMode === 'debit_credit') {
    const debit = mapping.debitCol ? parseAmount(row[mapping.debitCol] ?? '') : null
    const credit = mapping.creditCol ? parseAmount(row[mapping.creditCol] ?? '') : null
    if (debit != null && debit !== 0) amount = -Math.abs(debit)
    else if (credit != null && credit !== 0) amount = Math.abs(credit)
  }
  if (amount == null) return null

  // Category: try to match to an existing category label
  let category: string | null = null
  if (mapping.categoryCol) {
    const raw = (row[mapping.categoryCol] ?? '').trim().toLowerCase()
    const match = categories.find((c) => c.label.toLowerCase() === raw)
    category = match?.label ?? (raw || null)
  }

  // Trip: try to match to an existing trip name
  let tripId: number | null = null
  if (mapping.tripCol) {
    const raw = (row[mapping.tripCol] ?? '').trim().toLowerCase()
    const match = trips.find((t) => t.name.toLowerCase() === raw)
    if (match) tripId = match.id
  }

  return { date, description: description.trim(), amount, category, tripId, recurrence: 'none', untilDate: '' }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Horizontal scrolling chip row for picking a column (or "None"). */
function ColumnChips({
  label,
  options,
  selected,
  onSelect,
  required = false,
}: {
  label: string
  options: string[]
  selected: string | null
  onSelect: (v: string | null) => void
  required?: boolean
}) {
  return (
    <View style={chipStyles.block}>
      <Text style={chipStyles.label}>
        {label}
        {required && <Text style={{ color: RED }}> *</Text>}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={chipStyles.scroll}>
        {!required && (
          <Pressable onPress={() => onSelect(null)} style={({ pressed }) => pressed && { opacity: 0.7 }}>
            <View style={[chipStyles.chip, selected === null && chipStyles.chipOn]}>
              <Text style={[chipStyles.chipText, selected === null && chipStyles.chipTextOn]}>
                None
              </Text>
            </View>
          </Pressable>
        )}
        {options.map((opt) => (
          <Pressable key={opt} onPress={() => onSelect(opt)} style={({ pressed }) => pressed && { opacity: 0.7 }}>
            <View style={[chipStyles.chip, selected === opt && chipStyles.chipOn]}>
              <Text style={[chipStyles.chipText, selected === opt && chipStyles.chipTextOn]}>
                {opt}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  )
}

const chipStyles = StyleSheet.create({
  block: { marginBottom: 12 },
  label: {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: INK,
    marginBottom: 6,
  },
  scroll: { flexDirection: 'row' },
  chip: {
    borderWidth: 2,
    borderColor: INK,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 6,
    backgroundColor: CREAM,
  },
  chipOn: { backgroundColor: YELLOW },
  chipText: { fontFamily: MONO, fontSize: 12, color: INK },
  chipTextOn: { fontWeight: '800' },
})

// ─── Review row card ──────────────────────────────────────────────────────────

function ReviewCard({
  row,
  index,
  categories,
  trips,
  onChange,
  onSave,
  onReset,
  onToggleSkip,
}: {
  row: ReviewRow
  index: number
  categories: categoriesQ.CategoryRow[]
  trips: tripsQ.TripRow[]
  onChange: (field: keyof MappedTx, value: MappedTx[keyof MappedTx]) => void
  onSave: () => void
  onReset: () => void
  onToggleSkip: () => void
}) {
  const skipped = row.status === 'skipped'
  const saved = row.status === 'saved'

  const borderColor = skipped ? '#CCCCCC' : saved ? YELLOW : INK
  const cardBg = skipped ? MUTED : CREAM

  const [amountExpr, setAmountExpr] = useState(() =>
    row.current.amount !== 0 ? String(row.current.amount) : ''
  )

  // Sync when the row is reset back to its original state
  useEffect(() => {
    if (row.status === 'pending') {
      setAmountExpr(row.current.amount !== 0 ? String(row.current.amount) : '')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.status])

  const amountEvaluated = evaluateExpression(amountExpr)
  const showAmountPreview = isArithmeticExpression(amountExpr) && amountEvaluated !== null

  return (
    <View style={[cardS.card, { borderColor, backgroundColor: cardBg }]}>
      {/* Header row */}
      <View style={cardS.header}>
        <View style={cardS.statusBadge}>
          <View style={[cardS.dot, { backgroundColor: skipped ? '#AAAAAA' : saved ? YELLOW : GREEN }]} />
          <Text style={cardS.statusText}>
            {skipped ? 'SKIP' : saved ? 'SAVED' : 'READY'}
          </Text>
        </View>
        <Text style={cardS.rowNum}>#{index + 1}</Text>
        {row.isDuplicate && (
          <View style={cardS.dupBadge}>
            <Text style={cardS.dupText}>⚠ DUPLICATE</Text>
          </View>
        )}
      </View>

      {/* Fields */}
      <View style={cardS.fields}>
        {/* Date + Amount on one row */}
        <View style={cardS.row2}>
          <View style={[cardS.field, { flex: 1, marginRight: 8 }]}>
            <Text style={cardS.fieldLabel}>Date</Text>
            <TextInput
              style={[cardS.input, skipped && cardS.inputDisabled]}
              value={row.current.date}
              onChangeText={(v) => onChange('date', v)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#999"
              editable={!skipped}
              autoCorrect={false}
            />
          </View>
          <View style={[cardS.field, { flex: 1 }]}>
            <Text style={cardS.fieldLabel}>Amount</Text>
            <TextInput
              style={[cardS.input, skipped && cardS.inputDisabled]}
              value={amountExpr}
              onChangeText={(v) => {
                setAmountExpr(v)
                const n = evaluateExpression(v)
                if (n !== null) onChange('amount', n)
              }}
              onBlur={() => {
                if (amountEvaluated !== null && isArithmeticExpression(amountExpr)) {
                  const s = formatExpressionResult(amountEvaluated)
                  setAmountExpr(s)
                  onChange('amount', amountEvaluated)
                }
              }}
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
              placeholder="-45.00"
              placeholderTextColor="#999"
              editable={!skipped}
            />
            {showAmountPreview ? (
              <View style={cardS.calcPreview}>
                <Text style={cardS.calcPreviewText}>= {formatExpressionResult(amountEvaluated!)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Description */}
        <View style={cardS.field}>
          <Text style={cardS.fieldLabel}>Description</Text>
          <TextInput
            style={[cardS.input, skipped && cardS.inputDisabled]}
            value={row.current.description}
            onChangeText={(v) => onChange('description', v)}
            placeholder="Merchant or description"
            placeholderTextColor="#999"
            editable={!skipped}
            autoCorrect={false}
          />
        </View>

        {/* Category chips */}
        <Text style={cardS.fieldLabel}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          <Pressable
            onPress={() => !skipped && onChange('category', null)}
            style={({ pressed }) => pressed && { opacity: 0.7 }}
          >
            <View style={[cardS.chip, row.current.category === null && cardS.chipOn]}>
              <Text style={[cardS.chipText, row.current.category === null && cardS.chipTextOn]}>
                None
              </Text>
            </View>
          </Pressable>
          {categories.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => !skipped && onChange('category', c.label)}
              style={({ pressed }) => pressed && { opacity: 0.7 }}
            >
              <View style={[cardS.chip, row.current.category === c.label && cardS.chipOn]}>
                <Text style={[cardS.chipText, row.current.category === c.label && cardS.chipTextOn]}>
                  {c.label}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>

        {/* Trip chips */}
        {trips.length > 0 && (
          <>
            <Text style={cardS.fieldLabel}>Trip / event</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <Pressable
                onPress={() => !skipped && onChange('tripId', null)}
                style={({ pressed }) => pressed && { opacity: 0.7 }}
              >
                <View style={[cardS.chip, row.current.tripId === null && cardS.chipOn]}>
                  <Text style={[cardS.chipText, row.current.tripId === null && cardS.chipTextOn]}>
                    None
                  </Text>
                </View>
              </Pressable>
              {trips.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => !skipped && onChange('tripId', t.id)}
                  style={({ pressed }) => pressed && { opacity: 0.7 }}
                >
                  <View style={[cardS.chip, row.current.tripId === t.id && cardS.chipOn]}>
                    <Text style={[cardS.chipText, row.current.tripId === t.id && cardS.chipTextOn]}>
                      {t.name}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        <Text style={cardS.fieldLabel}>Recurring (optional)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          {(
            [
              ['none', 'None'],
              ['daily', 'Daily'],
              ['weekly', 'Weekly'],
              ['biweekly', 'Bi-weekly'],
              ['monthly', 'Monthly'],
              ['yearly', 'Yearly'],
            ] as const
          ).map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => !skipped && onChange('recurrence', key as ManualRecurrenceCadence | 'none')}
              style={({ pressed }) => pressed && { opacity: 0.7 }}
            >
              <View style={[cardS.chip, row.current.recurrence === key && cardS.chipOn]}>
                <Text style={[cardS.chipText, row.current.recurrence === key && cardS.chipTextOn]}>
                  {label}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>

        {row.current.recurrence !== 'none' ? (
          <>
            <Text style={cardS.fieldLabel}>Repeat until (optional)</Text>
            <DateInput
              value={row.current.untilDate}
              onChange={(v) => !skipped && onChange('untilDate', v)}
              style={[cardS.input, { paddingVertical: 8 }]}
              placeholder="Until date"
            />
          </>
        ) : null}
      </View>

      {/* Action buttons */}
      <View style={cardS.actions}>
        <Pressable onPress={onToggleSkip}>
          {({ pressed }) => (
            <View
              style={[
                cardS.btn,
                skipped ? cardS.btnRed : cardS.btnNeutral,
                pressed && cardS.btnPressed,
              ]}
              pointerEvents="none"
            >
              <Text style={cardS.btnText}>{skipped ? 'Unskip' : 'Skip'}</Text>
            </View>
          )}
        </Pressable>

        <Pressable onPress={onReset} disabled={skipped}>
          {({ pressed }) => (
            <View
              style={[
                cardS.btn,
                cardS.btnNeutral,
                skipped && cardS.btnDisabled,
                pressed && !skipped && cardS.btnPressed,
              ]}
              pointerEvents="none"
            >
              <Text style={cardS.btnText}>Reset</Text>
            </View>
          )}
        </Pressable>

        <Pressable onPress={onSave} disabled={skipped}>
          {({ pressed }) => (
            <View
              style={[
                cardS.btn,
                saved ? cardS.btnYellow : cardS.btnMuted,
                skipped && cardS.btnDisabled,
                pressed && !skipped && cardS.btnPressed,
              ]}
              pointerEvents="none"
            >
              <Ionicons
                name={saved ? 'checkmark' : 'checkmark-outline'}
                size={14}
                color={INK}
                style={{ marginRight: 6 }}
              />
              <Text style={cardS.btnText}>Save</Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  )
}

const cardS = StyleSheet.create({
  card: {
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: CREAM,
    marginBottom: 10,
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: INK,
  },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontFamily: MONO, fontSize: 10, fontWeight: '800', letterSpacing: 1, color: INK },
  rowNum: { fontFamily: MONO, fontSize: 10, color: '#888888', marginLeft: 'auto' },
  dupBadge: {
    backgroundColor: YELLOW,
    borderWidth: 2,
    borderColor: INK,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dupText: { fontFamily: MONO, fontSize: 9, fontWeight: '800', color: INK },
  fields: { padding: 10 },
  row2: { flexDirection: 'row', marginBottom: 0 },
  field: { marginBottom: 8 },
  fieldLabel: {
    fontFamily: MONO,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#666666',
    marginBottom: 3,
  },
  input: {
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: CREAM,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontFamily: MONO,
    fontSize: 13,
    color: INK,
  },
  inputDisabled: { backgroundColor: MUTED, color: '#888888' },
  calcPreview: {
    marginTop: 3,
    alignSelf: 'flex-start',
    backgroundColor: YELLOW,
    borderWidth: 2,
    borderColor: INK,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  calcPreviewText: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '800',
    color: INK,
  },
  chip: {
    borderWidth: 2,
    borderColor: INK,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginRight: 6,
    backgroundColor: CREAM,
  },
  chipOn: { backgroundColor: YELLOW },
  chipText: { fontFamily: MONO, fontSize: 11, color: INK },
  chipTextOn: { fontWeight: '800' },
  actions: {
    flexDirection: 'row',
    gap: 6,
    padding: 10,
    borderTopWidth: 2,
    borderTopColor: INK,
  },
  btn: {
    flex: 1,
    borderWidth: 3,
    borderColor: INK,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    backgroundColor: CREAM,
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  btnYellow: { backgroundColor: YELLOW },
  btnRed: { backgroundColor: RED },
  btnMuted: { backgroundColor: MUTED },
  btnNeutral: { backgroundColor: CREAM },
  btnDisabled: { opacity: 0.4 },
  btnPressed: { transform: [{ translateX: 3 }, { translateY: 3 }], shadowOpacity: 0, elevation: 0 },
  btnText: { fontFamily: MONO, fontSize: 11, fontWeight: '800', color: INK, textTransform: 'uppercase' },
})

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CsvImportScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  // DB data (loaded once)
  const accounts = useMemo(() => accountsQ.listManualAccounts(), [])
  const categories = useMemo(() => categoriesQ.listCategories(), [])
  const trips = useMemo(() => tripsQ.listTrips(), [])

  // Step state
  const [step, setStep] = useState<Step>('upload')

  // Upload step state
  const [fileName, setFileName] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([])

  // Mapping step state
  const [mapping, setMapping] = useState<ColumnMapping>({
    accountId: accounts[0]?.id ?? '',
    date: null,
    description: null,
    amountMode: 'single',
    amountCol: null,
    debitCol: null,
    creditCol: null,
    categoryCol: null,
    tripCol: null,
  })

  // Review step state
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([])
  const [importing, setImporting] = useState(false)

  // ── Upload step ────────────────────────────────────────────────────────────

  const onPickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'public.comma-separated-values-text'],
      copyToCacheDirectory: true,
    })
    if (result.canceled || !result.assets?.[0]) return
    const asset = result.assets[0]!

    const resp = await fetch(asset.uri)
    const text = await resp.text()

    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    })

    if (!parsed.data.length || !parsed.meta.fields?.length) {
      Alert.alert('Invalid file', 'No data found in the CSV. Make sure the first row contains column headers.')
      return
    }

    const rows = parsed.data.slice(0, MAX_ROWS)
    const hdrs = parsed.meta.fields

    setFileName(asset.name)
    setHeaders(hdrs)
    setCsvRows(rows)

    // Auto-detect column mapping
    const auto = buildAutoMapping(hdrs)
    setMapping((prev) => ({
      ...prev,
      accountId: accounts[0]?.id ?? '',
      ...auto,
    }))
  }

  // ── Mapping → Review ──────────────────────────────────────────────────────

  const onBuildReview = useCallback(() => {
    const existingTxns = txq.listTransactions()

    const built: ReviewRow[] = []
    csvRows.forEach((row, i) => {
      const mapped = applyMapping(row, mapping, trips, categories)
      if (!mapped) return // skip rows that can't be mapped

      const dup = existingTxns.some(
        (ex) =>
          ex.date === mapped.date &&
          Math.abs(ex.amount - mapped.amount) < 0.01 &&
          ex.description.trim().toLowerCase() === mapped.description.trim().toLowerCase(),
      )

      built.push({
        rowId: `import-${Date.now()}-${i}`,
        original: { ...mapped, recurrence: 'none', untilDate: '' },
        current: { ...mapped, recurrence: 'none', untilDate: '' },
        status: 'pending',
        isDuplicate: dup,
      })
    })

    if (!built.length) {
      Alert.alert(
        'No valid rows',
        'None of the CSV rows could be mapped with the current column settings. Check your date and amount columns.',
      )
      return
    }

    setReviewRows(built)
    setStep('review')
  }, [csvRows, mapping, trips, categories])

  // ── Review helpers ────────────────────────────────────────────────────────

  const updateRow = useCallback(
    (rowId: string, field: keyof MappedTx, value: MappedTx[keyof MappedTx]) => {
      setReviewRows((prev) =>
        prev.map((r) =>
          r.rowId === rowId
            ? { ...r, current: { ...r.current, [field]: value }, status: r.status === 'skipped' ? 'skipped' : 'pending' }
            : r,
        ),
      )
    },
    [],
  )

  const saveRow = useCallback((rowId: string) => {
    setReviewRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, status: 'saved' } : r)),
    )
  }, [])

  const resetRow = useCallback((rowId: string) => {
    setReviewRows((prev) =>
      prev.map((r) =>
        r.rowId === rowId ? { ...r, current: { ...r.original }, status: 'pending' } : r,
      ),
    )
  }, [])

  const toggleSkip = useCallback((rowId: string) => {
    setReviewRows((prev) =>
      prev.map((r) =>
        r.rowId === rowId
          ? { ...r, status: r.status === 'skipped' ? 'pending' : 'skipped' }
          : r,
      ),
    )
  }, [])

  const skipAll = () =>
    setReviewRows((prev) => prev.map((r) => ({ ...r, status: 'skipped' })))

  const unskipAll = () =>
    setReviewRows((prev) => prev.map((r) => ({ ...r, status: r.status === 'skipped' ? 'pending' : r.status })))

  // ── Import ────────────────────────────────────────────────────────────────

  const toImport = reviewRows.filter((r) => r.status !== 'skipped')
  const dupCount = reviewRows.filter((r) => r.isDuplicate && r.status !== 'skipped').length
  const account = accounts.find((a) => a.id === mapping.accountId)

  const onImport = async () => {
    if (!toImport.length) return
    if (dupCount > 0) {
      await new Promise<void>((resolve) => {
        Alert.alert(
          `${dupCount} possible duplicate${dupCount === 1 ? '' : 's'}`,
          'Some rows may already exist in your transactions. Import them anyway?',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
            { text: 'Import anyway', onPress: () => { resolve() } },
          ],
        )
      })
      // Check if user cancelled by seeing if importing was kicked off
    }

    setImporting(true)
    try {
      const now = new Date().toISOString()
      let inserted = 0
      for (const r of toImport) {
        if (r.current.recurrence === 'none') {
          const id = `manual-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          txq.insertTransaction({
            id,
            account_id: mapping.accountId,
            account_label: account?.name ?? null,
            date: r.current.date,
            effective_date: null,
            amount: r.current.amount,
            description: r.current.description,
            category: r.current.category,
            detail_category: null,
            trip_id: r.current.tripId,
            my_share: null,
            pending: 0,
            user_confirmed: 1,
            source: 'manual',
            synced_at: now,
          })
          inserted++
        } else {
          createManualRecurringTransactions({
            accountId: mapping.accountId,
            date: r.current.date,
            amount: r.current.amount,
            description: r.current.description,
            category: r.current.category,
            tripId: r.current.tripId,
            cadence: r.current.recurrence,
            untilDate: r.current.untilDate.trim() ? r.current.untilDate.trim() : null,
          })
          inserted++
        }
      }
      ensureRecurringTransactionsSeeded()
      Alert.alert(
        'Import complete',
        `${inserted} transaction${inserted === 1 ? '' : 's'} added.`,
        [{ text: 'Done', onPress: () => router.back() }],
      )
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setImporting(false)
    }
  }

  // ── Mapping validation ────────────────────────────────────────────────────

  const mappingValid =
    mapping.date !== null &&
    mapping.description !== null &&
    (mapping.amountMode === 'single'
      ? mapping.amountCol !== null
      : mapping.debitCol !== null || mapping.creditCol !== null)

  // ── Render ────────────────────────────────────────────────────────────────

  const stepLabel = step === 'upload' ? '1 / 3' : step === 'mapping' ? '2 / 3' : '3 / 3'

  return (
    <View style={s.screen}>
      {/* Topbar */}
      <View style={[s.topbar, { paddingTop: insets.top + 10 }]}>
        <Pressable
          onPress={() => {
            if (step === 'upload') router.back()
            else if (step === 'mapping') setStep('upload')
            else setStep('mapping')
          }}
          style={({ pressed }) => pressed && { opacity: 0.7 }}
        >
          <Text style={s.backChev}>‹</Text>
        </Pressable>
        <Text style={s.topbarTitle}>Import CSV</Text>
        <Text style={s.stepLabel}>{stepLabel}</Text>
      </View>

      {/* ── Step 1: Upload ── */}
      {step === 'upload' && (
        <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 24 }]}>
          <View style={s.card}>
            <Text style={s.sectionLabel}>Select a CSV file</Text>
            <Text style={s.bodyText}>
              Upload any bank or spreadsheet export. The first row must be column headers.
              Supports up to {MAX_ROWS} rows per import.
            </Text>
            <View style={s.spacer} />
            {fileName ? (
              <View style={s.fileRow}>
                <Ionicons name="document-text-outline" size={18} color={INK} style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.fileName} numberOfLines={1}>{fileName}</Text>
                  <Text style={s.fileRowCount}>{csvRows.length} rows · {headers.length} columns</Text>
                </View>
                <Pressable onPress={() => { void onPickFile() }} style={({ pressed }) => pressed && { opacity: 0.7 }}>
                  <Text style={s.changeLink}>Change</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => { void onPickFile() }}>
                {({ pressed }) => (
                  <View style={[s.uploadArea, pressed && { opacity: 0.7 }]}>
                    <Ionicons name="cloud-upload-outline" size={36} color={INK} />
                    <Text style={s.uploadText}>Tap to select CSV file</Text>
                    <Text style={s.uploadSub}>From Files, iCloud, Google Drive…</Text>
                  </View>
                )}
              </Pressable>
            )}
          </View>

          {accounts.length === 0 && (
            <View style={[s.card, { borderColor: YELLOW }]}>
              <Text style={s.sectionLabel}>No manual account</Text>
              <Text style={s.bodyText}>
                Create a manual account first (Settings → Manual accounts). Imported transactions
                will be saved there.
              </Text>
            </View>
          )}

          {fileName && csvRows.length > 0 && accounts.length > 0 && (
            <Pressable onPress={() => setStep('mapping')}>
              {({ pressed }) => (
                <View style={[s.btn, s.btnYellow, pressed && s.btnPressed]}>
                  <Text style={s.btnText}>Map columns →</Text>
                </View>
              )}
            </Pressable>
          )}
        </ScrollView>
      )}

      {/* ── Step 2: Mapping ── */}
      {step === 'mapping' && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 100 }]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.card}>
              <Text style={s.sectionLabel}>Import to account</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {accounts.map((a) => (
                  <Pressable
                    key={a.id}
                    onPress={() => setMapping((m) => ({ ...m, accountId: a.id }))}
                    style={({ pressed }) => pressed && { opacity: 0.7 }}
                  >
                    <View style={[chipStyles.chip, mapping.accountId === a.id && chipStyles.chipOn]}>
                      <Text style={[chipStyles.chipText, mapping.accountId === a.id && chipStyles.chipTextOn]}>
                        {a.name ?? a.id}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={s.card}>
              <Text style={s.sectionLabel}>Column mapping</Text>
              <Text style={s.bodyText}>
                Tell us which CSV columns contain each piece of data. Fields marked * are required.
              </Text>
              <View style={s.spacer} />

              <ColumnChips
                label="Date"
                options={headers}
                selected={mapping.date}
                onSelect={(v) => setMapping((m) => ({ ...m, date: v }))}
                required
              />
              <ColumnChips
                label="Description / Merchant"
                options={headers}
                selected={mapping.description}
                onSelect={(v) => setMapping((m) => ({ ...m, description: v }))}
                required
              />

              {/* Amount mode toggle */}
              <Text style={[chipStyles.label, { marginBottom: 6 }]}>
                Amount format <Text style={{ color: RED }}>*</Text>
              </Text>
              <View style={s.modeRow}>
                <Pressable
                  onPress={() => setMapping((m) => ({ ...m, amountMode: 'single' }))}
                  style={({ pressed }) => pressed && { opacity: 0.7 }}
                >
                  <View style={[s.modeBtn, mapping.amountMode === 'single' && s.modeBtnOn]}>
                    <Text style={s.modeBtnText}>Single column</Text>
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => setMapping((m) => ({ ...m, amountMode: 'debit_credit' }))}
                  style={({ pressed }) => pressed && { opacity: 0.7 }}
                >
                  <View style={[s.modeBtn, mapping.amountMode === 'debit_credit' && s.modeBtnOn]}>
                    <Text style={s.modeBtnText}>Debit + Credit</Text>
                  </View>
                </Pressable>
              </View>

              {mapping.amountMode === 'single' ? (
                <ColumnChips
                  label="Amount column"
                  options={headers}
                  selected={mapping.amountCol}
                  onSelect={(v) => setMapping((m) => ({ ...m, amountCol: v }))}
                  required
                />
              ) : (
                <>
                  <ColumnChips
                    label="Debit column (expenses → negative)"
                    options={headers}
                    selected={mapping.debitCol}
                    onSelect={(v) => setMapping((m) => ({ ...m, debitCol: v }))}
                  />
                  <ColumnChips
                    label="Credit column (income → positive)"
                    options={headers}
                    selected={mapping.creditCol}
                    onSelect={(v) => setMapping((m) => ({ ...m, creditCol: v }))}
                  />
                </>
              )}

              <ColumnChips
                label="Category (optional)"
                options={headers}
                selected={mapping.categoryCol}
                onSelect={(v) => setMapping((m) => ({ ...m, categoryCol: v }))}
              />
              <ColumnChips
                label="Trip / event (optional)"
                options={headers}
                selected={mapping.tripCol}
                onSelect={(v) => setMapping((m) => ({ ...m, tripCol: v }))}
              />
            </View>

            {/* Preview table */}
            {csvRows.slice(0, 3).length > 0 && (
              <View style={s.card}>
                <Text style={s.sectionLabel}>Preview (first 3 rows)</Text>
                {csvRows.slice(0, 3).map((row, i) => {
                  const mapped = applyMapping(row, mapping, trips, categories)
                  return (
                    <View key={i} style={[s.previewRow, i > 0 && { borderTopWidth: 1, borderTopColor: MUTED }]}>
                      {mapped ? (
                        <>
                          <Text style={s.previewDate}>{mapped.date}</Text>
                          <Text style={s.previewDesc} numberOfLines={1}>{mapped.description}</Text>
                          <Text style={[s.previewAmt, { color: mapped.amount < 0 ? RED : GREEN }]}>
                            {mapped.amount >= 0 ? '+' : ''}{mapped.amount.toFixed(2)}
                          </Text>
                        </>
                      ) : (
                        <Text style={s.previewSkip}>⚠ Row {i + 1} — could not map (check date / amount columns)</Text>
                      )}
                    </View>
                  )
                })}
              </View>
            )}
          </ScrollView>

          {/* Sticky bottom */}
          <View style={[s.stickyBar, { paddingBottom: insets.bottom + 10 }]}>
            <Pressable onPress={onBuildReview} disabled={!mappingValid}>
              {({ pressed }) => (
                <View style={[s.btn, s.btnYellow, !mappingValid && s.btnDisabled, pressed && mappingValid && s.btnPressed]}>
                  <Text style={s.btnText}>Review rows →</Text>
                </View>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* ── Step 3: Review ── */}
      {step === 'review' && (
        <>
          <ScrollView
            contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 100 }]}
            keyboardShouldPersistTaps="handled"
          >
            {/* Summary bar */}
            <View style={[s.card, { backgroundColor: MUTED }]}>
              <View style={s.summaryRow}>
                <Text style={s.summaryText}>
                  {toImport.length} to import · {reviewRows.filter((r) => r.status === 'skipped').length} skipped
                </Text>
                {dupCount > 0 && (
                  <Text style={s.dupWarn}>⚠ {dupCount} possible duplicate{dupCount > 1 ? 's' : ''}</Text>
                )}
              </View>
              <View style={s.bulkRow}>
                <Pressable onPress={skipAll} style={({ pressed }) => pressed && { opacity: 0.7 }}>
                  <View style={s.bulkBtn}>
                    <Text style={s.bulkBtnText}>Skip all</Text>
                  </View>
                </Pressable>
                <Pressable onPress={unskipAll} style={({ pressed }) => pressed && { opacity: 0.7 }}>
                  <View style={s.bulkBtn}>
                    <Text style={s.bulkBtnText}>Unskip all</Text>
                  </View>
                </Pressable>
              </View>
            </View>

            {reviewRows.map((row, i) => (
              <ReviewCard
                key={row.rowId}
                row={row}
                index={i}
                categories={categories}
                trips={trips}
                onChange={(field, value) => updateRow(row.rowId, field, value)}
                onSave={() => saveRow(row.rowId)}
                onReset={() => resetRow(row.rowId)}
                onToggleSkip={() => toggleSkip(row.rowId)}
              />
            ))}
          </ScrollView>

          {/* Sticky import button */}
          <View style={[s.stickyBar, { paddingBottom: insets.bottom + 10 }]}>
            <Pressable onPress={() => { void onImport() }} disabled={importing || toImport.length === 0}>
              {({ pressed }) => (
                <View
                  style={[
                    s.btn,
                    s.btnYellow,
                    (importing || toImport.length === 0) && s.btnDisabled,
                    pressed && !importing && toImport.length > 0 && s.btnPressed,
                  ]}
                >
                  <Ionicons name="checkmark-circle-outline" size={16} color={INK} style={{ marginRight: 6 }} />
                  <Text style={s.btnText}>
                    {importing ? 'Importing…' : `Import ${toImport.length} transaction${toImport.length === 1 ? '' : 's'}`}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>
        </>
      )}
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CREAM },
  topbar: {
    backgroundColor: INK,
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backChev: { fontFamily: MONO, fontSize: 24, fontWeight: '900', color: CREAM, lineHeight: 24 },
  topbarTitle: {
    fontFamily: MONO,
    fontSize: 18,
    fontWeight: '800',
    color: CREAM,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    flex: 1,
  },
  stepLabel: { fontFamily: MONO, fontSize: 12, color: '#888888' },
  body: { padding: 12, gap: 10 },
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
  bodyText: { fontFamily: MONO, fontSize: 13, lineHeight: 20, color: '#666666' },
  spacer: { height: 10 },
  uploadArea: {
    borderWidth: 3,
    borderColor: INK,
    borderStyle: 'dashed',
    padding: 32,
    alignItems: 'center',
    gap: 8,
    backgroundColor: MUTED,
  },
  uploadText: { fontFamily: MONO, fontSize: 14, fontWeight: '800', color: INK },
  uploadSub: { fontFamily: MONO, fontSize: 12, color: '#888888' },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: INK,
    padding: 10,
    backgroundColor: MUTED,
  },
  fileName: { fontFamily: MONO, fontSize: 13, fontWeight: '800', color: INK },
  fileRowCount: { fontFamily: MONO, fontSize: 11, color: '#666666', marginTop: 2 },
  changeLink: { fontFamily: MONO, fontSize: 12, fontWeight: '800', color: INK, textDecorationLine: 'underline' },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeBtn: {
    flex: 1,
    borderWidth: 2,
    borderColor: INK,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: CREAM,
  },
  modeBtnOn: { backgroundColor: YELLOW },
  modeBtnText: { fontFamily: MONO, fontSize: 12, fontWeight: '800', color: INK },
  previewRow: { paddingVertical: 8, flexDirection: 'row', gap: 8, alignItems: 'center' },
  previewDate: { fontFamily: MONO, fontSize: 11, color: '#666666', width: 80 },
  previewDesc: { fontFamily: MONO, fontSize: 12, color: INK, flex: 1 },
  previewAmt: { fontFamily: MONO, fontSize: 12, fontWeight: '800' },
  previewSkip: { fontFamily: MONO, fontSize: 11, color: RED, flex: 1 },
  btn: {
    borderWidth: 3,
    borderColor: INK,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  btnYellow: { backgroundColor: YELLOW },
  btnDisabled: { opacity: 0.4 },
  btnPressed: { transform: [{ translateX: 3 }, { translateY: 3 }], shadowOpacity: 0, elevation: 0 },
  btnText: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '800',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stickyBar: {
    backgroundColor: CREAM,
    borderTopWidth: 3,
    borderTopColor: INK,
    padding: 12,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  summaryText: { fontFamily: MONO, fontSize: 13, fontWeight: '800', color: INK },
  dupWarn: { fontFamily: MONO, fontSize: 11, color: RED, fontWeight: '800' },
  bulkRow: { flexDirection: 'row', gap: 8 },
  bulkBtn: {
    borderWidth: 2,
    borderColor: INK,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: CREAM,
  },
  bulkBtnText: { fontFamily: MONO, fontSize: 11, fontWeight: '800', color: INK, textTransform: 'uppercase' },
})
