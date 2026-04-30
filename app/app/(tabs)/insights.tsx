import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Canvas, Path, Skia } from '@shopify/react-native-skia'
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'

import { useTabStore } from '@/src/stores/tabStore'

import { DateInput } from '@/src/components/DateInput'
import { EmptyState } from '@/src/components/EmptyState'
import * as accountsQ from '@/src/db/queries/accounts'
import * as budgetsQ from '@/src/db/queries/budgets'
import * as tripsQ from '@/src/db/queries/trips'
import * as txq from '@/src/db/queries/transactions'
import { analyzeLocalTransactions } from '@/src/lib/insights/analyze'
import { useCategoriesStore } from '@/src/stores/categoriesStore'
import { useTransactionsStore } from '@/src/stores/transactionsStore'
import {
  dismissAnomaly,
  dismissDuplicate,
  getDismissedAnomalyIds,
  getDismissedDuplicateKeys,
  maybeResetDismissalsOnNewSync,
} from '@/src/lib/insights/dismissals'
import type { DuplicateCharge } from '@/src/lib/insights/types'
import {
  formatSpendRangeLabel,
  monthCalendarRange,
  monthKeyFromParts,
  shiftMonth,
} from '@/src/lib/insights/utils'
const CREAM = '#FAFAF5'
const INK = '#111111'
const MUTED = '#E1E1E1'
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

const CATEGORY_COLORS = [
  '#F94144', // red
  '#F3722C', // orange
  '#F8961E', // amber
  '#F9C74F', // yellow
  '#90BE6D', // green
  '#43AA8B', // teal
  '#577590', // blue-gray
  '#277DA1', // blue
  '#4D908E', // deep teal
  '#9B5DE5', // purple
  '#F15BB5', // pink
  '#00BBF9', // sky
] as const

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function colorForCategory(category: string): string {
  const key = category.trim().toLowerCase() || 'other'
  const idx = hashString(key) % CATEGORY_COLORS.length
  return CATEGORY_COLORS[idx] ?? '#9B5DE5'
}

function resolveCategoryColor(label: string, categoryRows: { label: string; color: string | null }[]): string {
  const key = label.trim()
  if (!key) return colorForCategory(label)
  const hit = categoryRows.find((c) => c.label === key)
  const c = hit?.color?.trim()
  if (c) return c
  return colorForCategory(label)
}

function nowYearMonth(): { year: number; month: number } {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

function clampYearMonth(y: number, m: number): { year: number; month: number } {
  const today = nowYearMonth()
  if (y > today.year || (y === today.year && m > today.month)) return today
  const minY = 2000
  if (y < minY || (y === minY && m < 1)) return { year: minY, month: 1 }
  return { year: y, month: m }
}

function formatMonthNavTitle(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  })
}

function duplicateStableKey(d: DuplicateCharge): string {
  return [...d.transactions]
    .map((t) => t.id)
    .sort()
    .join('|')
}

/** Custom dates if set; otherwise the full calendar month from the month selector. */
function spendRangeFromCustomOrNav(
  nav: { year: number; month: number },
  custom: { start: string; end: string } | null,
): { start: string; end: string; label: string } {
  if (custom) {
    const a = custom.start <= custom.end ? custom.start : custom.end
    const b = custom.start <= custom.end ? custom.end : custom.start
    return { start: a, end: b, label: formatSpendRangeLabel(a, b) }
  }
  const { start, end } = monthCalendarRange(nav.year, nav.month)
  return { start, end, label: formatSpendRangeLabel(start, end) }
}

function formatMoney(n: number): string {
  const v = Math.round(n * 100) / 100
  return v.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

const DONUT_SIZE = 200
const STROKE_WIDTH = 28
const RADIUS = (DONUT_SIZE - STROKE_WIDTH) / 2
const CENTER = DONUT_SIZE / 2
// With thick strokes + round caps, small angular gaps visually overlap.
const GAP_DEGREES = 1

type DonutSliceProps = {
  label: string
  startAngle: number // degrees
  sweepAngle: number // degrees, full target
  color: string
  delay: number
  animationKey: number
}

function DonutSlice({
  startAngle,
  sweepAngle,
  color,
  delay,
  animationKey,
}: DonutSliceProps) {
  const startSV = useSharedValue(startAngle)
  const sweepSV = useSharedValue(sweepAngle)
  const didMount = useRef(false)

  // Morph geometry when data changes (month / range) without replaying.
  useEffect(() => {
    startSV.value = withTiming(startAngle, {
      duration: 520,
      easing: Easing.out(Easing.cubic),
    })
    sweepSV.value = withTiming(sweepAngle, {
      duration: 520,
      easing: Easing.out(Easing.cubic),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startAngle, sweepAngle])

  // Replay the sweep only when the screen comes back into focus.
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true
      return
    }
    sweepSV.value = 0
    sweepSV.value = withDelay(
      delay,
      withTiming(sweepAngle, {
        duration: 620,
        easing: Easing.out(Easing.cubic),
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animationKey])

  const path = useDerivedValue(() => {
    const currentSweep = Math.max(0, Math.min(359.999, sweepSV.value))
    if (currentSweep <= 0.001) return Skia.Path.Make()

    const toRad = (deg: number) => (deg * Math.PI) / 180
    const start = toRad(startSV.value - 90) // offset so 0° = top
    const end = toRad(startSV.value - 90 + currentSweep)

    const x0 = CENTER + RADIUS * Math.cos(start)
    const y0 = CENTER + RADIUS * Math.sin(start)
    const x1 = CENTER + RADIUS * Math.cos(end)
    const y1 = CENTER + RADIUS * Math.sin(end)

    const largeArc = currentSweep > 180 ? 1 : 0
    const d = `M ${x0} ${y0} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${x1} ${y1}`
    return Skia.Path.MakeFromSVGString(d) ?? Skia.Path.Make()
  }, [startSV, sweepSV])

  return (
    <Path
      path={path}
      style="stroke"
      strokeWidth={STROKE_WIDTH}
      strokeCap="round"
      color={color}
    />
  )
}

function CategoryDonut({
  values,
  animationKey,
}: {
  values: { label: string; value: number; color: string }[]
  animationKey: number
}) {
  const data = values.filter((v) => v.value > 0)
  if (data.length === 0) return null

  const total = data.reduce((sum, d) => sum + d.value, 0)
  // Convert round-cap radius to an angular padding so thick strokes don't visually overlap.
  // Each end cap extends ~strokeWidth/2 along the tangent.
  const capAngleDeg = ((STROKE_WIDTH / 2) / RADIUS) * (180 / Math.PI)

  // When there are many categories, a fixed gap can consume the whole 360° and zero out sweeps.
  // Make the gap adaptive so we always leave room for data.
  const n = data.length
  const desiredGap = GAP_DEGREES + capAngleDeg * 2
  const maxGap = n > 0 ? 360 / n - 0.5 : 0
  let effectiveGap = Math.max(0, Math.min(desiredGap, maxGap))
  let totalGapDegrees = effectiveGap * n
  let availableDegrees = 360 - totalGapDegrees
  if (availableDegrees < 5) {
    // If gaps still eat almost everything, drop gaps entirely to keep slices visible.
    effectiveGap = 0
    totalGapDegrees = 0
    availableDegrees = 360
  }

  type SliceAngle = {
    label: string
    startAngle: number
    sweepAngle: number
    color: string
    delay: number
  }

  const slices: SliceAngle[] = []
  let cursor = 0
  data.forEach((d, i) => {
    const rawSweep = total > 0 ? (d.value / total) * availableDegrees : 0
    // Don't shrink the sweep itself; effectiveGap already accounts for round caps.
    // Shrinking can zero-out small categories and make them disappear.
    const sweep = Math.max(0, rawSweep)
    slices.push({
      label: d.label,
      startAngle: cursor,
      sweepAngle: sweep,
      color: d.color,
      delay: i * 120,
    })
    cursor += rawSweep + effectiveGap
  })

  return (
    <View style={styles.donutWrap}>
      <View style={{ width: DONUT_SIZE, height: DONUT_SIZE }}>
        <Canvas style={{ width: DONUT_SIZE, height: DONUT_SIZE + 1 }}>
        {/* Background track */}
        <Path
          path={(() => {
            const d = `M ${CENTER} ${STROKE_WIDTH / 2} A ${RADIUS} ${RADIUS} 0 1 1 ${CENTER - 0.001} ${STROKE_WIDTH / 2}`
            return Skia.Path.MakeFromSVGString(d) ?? Skia.Path.Make()
          })()}
          style="stroke"
          strokeWidth={STROKE_WIDTH}
          color={"transparent"}
        />
        {slices.map((s, i) => (
          <DonutSlice
            key={`${s.label ?? 'uncategorized'}-${i}`}
            label={s.label}
            startAngle={s.startAngle}
            sweepAngle={s.sweepAngle}
            color={s.color}
            delay={s.delay}
            animationKey={animationKey}
          />
        ))}
        </Canvas>
        <View pointerEvents="none" style={styles.donutCenter}>
          <Text style={styles.donutCenterLabel}>Total</Text>
          <Text style={styles.donutCenterValue} numberOfLines={1}>
            {formatMoney(total)}
          </Text>
        </View>
      </View>
    </View>
  )
}

function CategoryLegend({
  items,
}: {
  items: { label: string; value: number; color: string }[]
}) {
  if (items.length === 0) return null
  return (
    <View style={styles.legendWrap}>
      {items.map((it, i) => (
        <View key={`${it.label ?? 'uncategorized'}-${i}`} style={styles.legendRow}>
          <View style={[styles.legendSwatch, { backgroundColor: it.color }]} />
          <Text style={styles.legendLabel} numberOfLines={1}>
            {it.label}
          </Text>
          <Text style={styles.legendValue}>{formatMoney(it.value)}</Text>
        </View>
      ))}
    </View>
  )
}

function buildDonutItems(
  rows: { category: string; totalSpend: number }[],
  categoryRows: { label: string; color: string | null }[],
): { label: string; value: number; color: string }[] {
  const MAX_SLICES = 8
  const mapped = rows.map((r) => ({
    label: r.category ?? 'Uncategorized',
    value: r.totalSpend,
    color: resolveCategoryColor(r.category, categoryRows),
  }))
  const byLabel = (a: { label: string }, b: { label: string }) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })

  if (mapped.length <= MAX_SLICES) {
    return [...mapped].sort(byLabel)
  }

  const top = mapped.slice(0, MAX_SLICES)
  const otherTotal = mapped.slice(MAX_SLICES).reduce((s, x) => s + x.value, 0)
  const named = [...top].sort(byLabel)
  if (otherTotal > 0) {
    const otherLabel = named.some((x) => x.label === 'Other') ? 'Other (more)' : 'Other'
    return [...named, { label: otherLabel, value: otherTotal, color: '#888888' }]
  }
  return named
}

export default function Insights() {
  const activeIndex = useTabStore((s) => s.activeIndex)
  const insets = useSafeAreaInsets()
  const [navYm, setNavYm] = useState(() => nowYearMonth())
  const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(null)
  const [showCustomModal, setShowCustomModal] = useState(false)
  const [customDraftStart, setCustomDraftStart] = useState('')
  const [customDraftEnd, setCustomDraftEnd] = useState('')
  const [dismissRev, setDismissRev] = useState(0)
  const [pieRev, setPieRev] = useState(0)
  const [budgetRev, setBudgetRev] = useState(0)

  /** Re-run insights when the transactions store refreshes (e.g. after sync). */
  const txStoreItems = useTransactionsStore((s) => s.items)
  const categoryRows = useCategoriesStore((s) => s.items)
  const loadCategories = useCategoriesStore((s) => s.load)

  const focusYm = navYm
  const focusKey = monthKeyFromParts(focusYm.year, focusYm.month)
  const spendRange = useMemo(
    () => spendRangeFromCustomOrNav(focusYm, customRange),
    [focusYm.year, focusYm.month, customRange],
  )

  // Reload when insights tab becomes active (replaces useFocusEffect)
  useEffect(() => {
    if (activeIndex !== 1) return
    setPieRev((n) => n + 1)
    setBudgetRev((n) => n + 1)
    loadCategories()
  }, [activeIndex, loadCategories])

  const data = useMemo(() => {
    void dismissRev
    void budgetRev
    maybeResetDismissalsOnNewSync()
    const dismissedAnomalies = getDismissedAnomalyIds()
    const dismissedDupes = getDismissedDuplicateKeys()

    const accounts = accountsQ.listBankLinkedAccounts()
    const visible = new Set(
      accounts.filter((a) => a.include_in_insights === 1).map((a) => a.id),
    )
    const txs = txq.listTransactions().filter((t) => visible.has(t.account_id))
    // Prefer budgets keyed to the specific month; fall back to the 'default' template
    const specificBudgets = budgetsQ.listBudgets(focusKey)
    const budgets = specificBudgets.length > 0
      ? specificBudgets
      : budgetsQ.listBudgets('default')
    const budgetsByCat = new Map<string, number>()
    for (const b of budgets) {
      const cat = (b.category ?? '').trim() || 'Other'
      budgetsByCat.set(cat, (budgetsByCat.get(cat) ?? 0) + b.amount)
    }
    const res = analyzeLocalTransactions({
      transactions: txs,
      focusYear: focusYm.year,
      focusMonth: focusYm.month,
      spendRange: { start: spendRange.start, end: spendRange.end },
      spendRangeLabel: spendRange.label,
      budgetsByCategory: budgetsByCat,
      totalBudgetCap: null,
    })
    return {
      ...res,
      anomalies: res.anomalies.filter((a) => !dismissedAnomalies.has(a.transaction.id)),
      duplicateCharges: res.duplicateCharges.filter(
        (d) => !dismissedDupes.has(duplicateStableKey(d)),
      ),
    }
  }, [
    dismissRev,
    focusYm.year,
    focusYm.month,
    focusKey,
    spendRange.start,
    spendRange.end,
    spendRange.label,
    txStoreItems,
    budgetRev,
  ])

  const todayYm = nowYearMonth()
  const atLatestMonth =
    navYm.year === todayYm.year && navYm.month === todayYm.month
  const monthNavPrev = () => {
    const { y, m } = shiftMonth(navYm.year, navYm.month, -1)
    setNavYm(clampYearMonth(y, m))
    setCustomRange(null)
  }
  const monthNavNext = () => {
    const { y, m } = shiftMonth(navYm.year, navYm.month, 1)
    setNavYm(clampYearMonth(y, m))
    setCustomRange(null)
  }

  const openCustomModal = () => {
    const base = customRange ?? monthCalendarRange(navYm.year, navYm.month)
    setCustomDraftStart(base.start)
    setCustomDraftEnd(base.end)
    setShowCustomModal(true)
  }

  const applyCustomRange = () => {
    const re = /^\d{4}-\d{2}-\d{2}$/
    if (!re.test(customDraftStart.trim()) || !re.test(customDraftEnd.trim())) return
    setCustomRange({ start: customDraftStart.trim(), end: customDraftEnd.trim() })
    setShowCustomModal(false)
  }

  const tripSpend = useMemo(() => {
    const trips = tripsQ.listTrips()
    const byId = new Map(trips.map((t) => [t.id, t]))
    const sums = new Map<number, number>()
    for (const t of txq.listTransactions()) {
      if (t.pending === 1 && t.user_confirmed !== 1) continue
      if (t.trip_id == null) continue
      const mk = (t.effective_date ?? t.date).slice(0, 7)
      if (mk !== focusKey) continue
      const share =
        typeof t.my_share === 'number' && Number.isFinite(t.my_share)
          ? t.my_share
          : t.amount
      if (share >= 0) continue  // expenses are negative; skip income/zero
      sums.set(t.trip_id, (sums.get(t.trip_id) ?? 0) + Math.abs(share))
    }
    return [...sums.entries()]
      .map(([tripId, spend]) => ({
        tripId,
        spend,
        name: byId.get(tripId)?.name ?? `Trip ${tripId}`,
      }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 6)
  }, [focusKey, txStoreItems])

  return (
    <View style={styles.screen}>
      <View style={[styles.topbar, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.topbarTitle}>Insights</Text>
        <Text style={styles.topbarSub}>Offline analytics</Text>
      </View>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 76 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.monthNav}>
          <Pressable
            onPress={monthNavPrev}
            style={styles.monthArrow}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
          >
            <Text style={styles.monthArrowText}>‹</Text>
          </Pressable>
          <Text style={styles.monthNavTitle}>
            {formatMonthNavTitle(navYm.year, navYm.month)}
          </Text>
          <Pressable
            onPress={monthNavNext}
            style={[styles.monthArrow, atLatestMonth && styles.monthArrowDisabled]}
            hitSlop={10}
            disabled={atLatestMonth}
            accessibilityRole="button"
            accessibilityLabel="Next month"
          >
            <Text style={[styles.monthArrowText, atLatestMonth && styles.monthArrowTextDisabled]}>
              ›
            </Text>
          </Pressable>
          <Pressable
            onPress={openCustomModal}
            hitSlop={10}
            style={({ pressed }) => pressed && { opacity: 0.7 }}
            accessibilityRole="button"
            accessibilityLabel="Custom date range"
          >
            <View style={[styles.calendarBtn, customRange !== null && styles.calendarBtnActive]}>
              <Ionicons name="calendar-outline" size={18} color={INK} />
            </View>
          </Pressable>
        </View>

        {data.categoryTotalsDesc.length === 0 ? (
          <EmptyState
            variant="insights"
            title="No data yet"
            subtitle={"Sync transactions from the Transactions tab\nafter linking a bank account."}
          />
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.h2}>Spend by category</Text>
              <Text style={styles.rangeCaption}>{data.periodLabel}</Text>
              {(() => {
                const items = buildDonutItems(data.categoryTotalsDesc, categoryRows)
                return (
                  <>
                    <CategoryDonut animationKey={pieRev} values={items} />
                    <CategoryLegend items={items} />
                  </>
                )
              })()}
            </View>

            <View style={styles.card}>
              <Text style={styles.h2}>Top merchants</Text>
              <Text style={styles.rangeCaption}>{data.periodLabel}</Text>
              {data.topMerchants.map((m) => (
                <View key={m.merchantKey} style={styles.lineRow}>
                  <Text style={styles.lineLeft} numberOfLines={1}>
                    {m.displayName}
                  </Text>
                  <Text style={styles.lineRight}>{formatMoney(m.totalSpend)}</Text>
                </View>
              ))}
            </View>

            <View style={styles.card}>
              <Text style={styles.h2}>Month-over-month deltas</Text>
              {data.categoryMoM.length === 0 ? (
                <Text style={styles.text}>Not enough data yet.</Text>
              ) : (
                data.categoryMoM.map((c) => (
                  <View key={c.category} style={styles.lineRow}>
                    <Text style={styles.lineLeft} numberOfLines={1}>
                      {c.category}
                    </Text>
                    <Text style={styles.lineRight}>
                      {formatMoney(c.absoluteChange)}
                    </Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.h2}>Trips &amp; Events ({focusKey})</Text>
              {tripSpend.length === 0 ? (
                <Text style={styles.text}>No trip or event spend in {focusKey}.</Text>
              ) : (
                tripSpend.map((t) => (
                  <View key={t.tripId} style={styles.lineRow}>
                    <Text style={styles.lineLeft} numberOfLines={1}>
                      {t.name}
                    </Text>
                    <Text style={styles.lineRight}>{formatMoney(t.spend)}</Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.h2}>Cash flow (6 months)</Text>
              {data.cashFlowLastSixMonths.map((m) => (
                <View key={m.key} style={styles.lineRow}>
                  <Text style={styles.lineLeft}>{m.label}</Text>
                  <Text style={styles.lineRight}>{formatMoney(m.net)}</Text>
                </View>
              ))}
            </View>

            <View style={styles.card}>
              <Text style={styles.h2}>Anomalies</Text>
              <Text style={styles.rangeCaption}>{data.periodLabel}</Text>
              {data.anomalies.length === 0 ? (
                <Text style={styles.text}>No anomalies detected.</Text>
              ) : (
                data.anomalies.slice(0, 5).map((a) => (
                  <View key={a.transaction.id} style={styles.lineRow}>
                    <Text style={styles.lineLeft} numberOfLines={1}>
                      {a.transaction.description}
                    </Text>
                    <Text
                      style={styles.dismiss}
                      onPress={() => {
                        dismissAnomaly(a.transaction.id)
                        setDismissRev((n) => n + 1)
                      }}
                    >
                      Dismiss
                    </Text>
                    <Text style={styles.lineRight}>
                      {formatMoney(Math.abs(a.transaction.amount))}
                    </Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.h2}>Potential duplicates</Text>
              <Text style={styles.rangeCaption}>{data.periodLabel}</Text>
              {data.duplicateCharges.length === 0 ? (
                <Text style={styles.text}>No duplicates found.</Text>
              ) : (
                data.duplicateCharges.slice(0, 5).map((d) => {
                  const key = duplicateStableKey(d)
                  return (
                    <View key={key} style={styles.lineRow}>
                      <Text style={styles.lineLeft} numberOfLines={1}>
                        {d.displayName}
                      </Text>
                      <Text
                        style={styles.dismiss}
                        onPress={() => {
                          dismissDuplicate(key)
                          setDismissRev((n) => n + 1)
                        }}
                      >
                        Dismiss
                      </Text>
                      <Text style={styles.lineRight}>
                        {formatMoney(Math.abs(d.amount))}
                      </Text>
                    </View>
                  )
                })
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.h2}>Recurring charges</Text>
              {data.recurring.patterns.length === 0 ? (
                <Text style={styles.text}>No recurring patterns yet.</Text>
              ) : (
                data.recurring.patterns.slice(0, 8).map((r, i) => (
                  <View
                    key={`${r.merchantKey}-${r.lastDate}-${Math.round(r.typicalAmount * 100)}-${r.monthsActive}-${i}`}
                    style={styles.lineRow}
                  >
                    <Text style={styles.lineLeft} numberOfLines={1}>
                      {r.displayName}
                    </Text>
                    <Text style={styles.lineRight}>
                      {formatMoney(Math.abs(r.typicalAmount))}
                    </Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.h2}>Budget health</Text>
              {data.budgetHealth.rows.slice(0, 10).map((r) => {
                const budget = r.budget
                const pct = budget > 0 ? Math.min(1, r.projectedSpend / budget) : 0
                const fillColor = resolveCategoryColor(r.category, categoryRows)
                return (
                  <View key={r.category} style={{ marginBottom: 10 }}>
                    <View style={styles.lineRow}>
                      <Text style={styles.lineLeft} numberOfLines={1}>
                        {r.category}
                      </Text>
                      <Text style={styles.lineRight}>
                        {formatMoney(r.projectedSpend)} / {formatMoney(budget)}
                      </Text>
                    </View>
                    <View style={styles.budgetTrack}>
                      <View style={[styles.budgetFill, { width: `${pct * 100}%`, backgroundColor: fillColor }]} />
                    </View>
                  </View>
                )
              })}
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={showCustomModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Custom date range</Text>
            <Text style={styles.inputLabel}>Start</Text>
            <DateInput value={customDraftStart} onChange={setCustomDraftStart} style={styles.input} />
            <Text style={styles.inputLabel}>End</Text>
            <DateInput value={customDraftEnd} onChange={setCustomDraftEnd} style={styles.input} />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setShowCustomModal(false)} style={{ flex: 1 }}>
                {({ pressed }) => (
                  <View style={[styles.modalBtn, styles.modalBtnCancel, pressed && styles.modalBtnPressed]} pointerEvents="none">
                    <Text style={styles.modalBtnText}>Cancel</Text>
                  </View>
                )}
              </Pressable>
              <Pressable onPress={applyCustomRange} style={{ flex: 1 }}>
                {({ pressed }) => (
                  <View style={[styles.modalBtn, styles.modalBtnApply, pressed && styles.modalBtnPressed]} pointerEvents="none">
                    <Text style={styles.modalBtnText}>Apply</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: CREAM,
  },
  topbar: {
    backgroundColor: INK,
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    letterSpacing: 0.4,
    flexShrink: 0,
    marginLeft: 'auto',
  },
  scroll: { paddingHorizontal: 12, paddingTop: 12 },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: CREAM,
    paddingVertical: 4,
    paddingHorizontal: 4,
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  monthArrow: {
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthArrowDisabled: { opacity: 0.35 },
  monthArrowText: {
    fontFamily: MONO,
    fontSize: 28,
    fontWeight: '900',
    color: INK,
    lineHeight: 32,
  },
  monthArrowTextDisabled: { color: '#999' },
  monthNavTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: MONO,
    fontSize: 15,
    fontWeight: '800',
    color: INK,
  },
  calendarBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: CREAM,
    marginLeft: 4,
  },
  calendarBtnActive: {
    backgroundColor: '#F5C842',
  },
  donutWrap: {
    height: 220,
    width: '100%',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  donutCenter: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: DONUT_SIZE,
    height: DONUT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  donutCenterLabel: {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: '800',
    color: INK,
    opacity: 0.7,
    marginBottom: 2,
  },
  donutCenterValue: {
    fontFamily: MONO,
    fontSize: 16,
    fontWeight: '900',
    color: INK,
  },
  legendWrap: {
    marginTop: 8,
    gap: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderWidth: 2,
    borderColor: INK,
  },
  legendLabel: {
    flex: 1,
    fontFamily: MONO,
    color: INK,
    fontSize: 12,
  },
  legendValue: {
    fontFamily: MONO,
    color: INK,
    fontSize: 12,
    fontWeight: '800',
  },
  budgetTrack: {
    height: 10,
    width: '100%',
    backgroundColor: MUTED,
    borderWidth: 2,
    borderColor: INK,
  },
  budgetFill: {
    height: '100%',
  },
  box: {
    borderWidth: 3,
    borderColor: INK,
    padding: 14,
    backgroundColor: CREAM,
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  card: {
    borderWidth: 3,
    borderColor: INK,
    padding: 12,
    backgroundColor: CREAM,
    marginBottom: 10,
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  h2: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '800',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  rangeCaption: {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: '700',
    color: '#666',
    marginBottom: 8,
  },
  text: {
    fontFamily: MONO,
    color: INK,
    fontSize: 13,
  },
  kpi: {
    fontFamily: MONO,
    color: INK,
    fontSize: 13,
    marginTop: 8,
  },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 6,
  },
  lineLeft: {
    flex: 1,
    fontFamily: MONO,
    color: INK,
    fontSize: 13,
  },
  lineRight: {
    fontFamily: MONO,
    color: INK,
    fontSize: 13,
    fontWeight: '800',
  },
  dismiss: {
    fontFamily: MONO,
    color: '#F5C842',
    fontSize: 12,
    fontWeight: '800',
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
    marginBottom: 8,
  },
  modalHint: {
    fontFamily: MONO,
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  inputLabel: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    fontFamily: MONO,
    borderWidth: 2,
    borderColor: INK,
    paddingHorizontal: 9,
    paddingVertical: 7,
    marginBottom: 10,
    color: INK,
    backgroundColor: CREAM,
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  modalBtn: {
    borderWidth: 3,
    borderColor: INK,
    paddingVertical: 11,
    alignItems: 'center',
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  modalBtnCancel: {
    backgroundColor: CREAM,
  },
  modalBtnApply: {
    backgroundColor: '#F5C842',
  },
  modalBtnPressed: {
    transform: [{ translateX: 3 }, { translateY: 3 }],
    shadowOpacity: 0,
    elevation: 0,
  },
  modalBtnText: {
    fontFamily: MONO,
    fontWeight: '800',
    color: INK,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
})
