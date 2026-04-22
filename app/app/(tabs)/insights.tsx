import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Canvas, Path, Skia } from '@shopify/react-native-skia'
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'

import { useFocusEffect } from 'expo-router'

import { BrutalScreen } from '@/src/components/Brutalist'
import * as accountsQ from '@/src/db/queries/accounts'
import * as budgetsQ from '@/src/db/queries/budgets'
import * as tripsQ from '@/src/db/queries/trips'
import * as txq from '@/src/db/queries/transactions'
import { analyzeLocalTransactions } from '@/src/lib/insights/analyze'
import { useTransactionsStore } from '@/src/stores/transactionsStore'
import {
  dismissAnomaly,
  dismissDuplicate,
  dismissedInsightsCounts,
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
import { tokens } from '@/src/theme/tokens'

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
  return CATEGORY_COLORS[idx] ?? tokens.color.accent
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

const DONUT_SIZE = 180
const STROKE_WIDTH = 28
const RADIUS = (DONUT_SIZE - STROKE_WIDTH) / 2
const CENTER = DONUT_SIZE / 2
// With thick strokes + round caps, small angular gaps visually overlap.
const GAP_DEGREES = 7

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

  useEffect(() => {
    // Animate geometry changes in-place (Rakha-like), instead of remounting the whole chart.
    startSV.value = withTiming(startAngle, {
      duration: 520,
      easing: Easing.out(Easing.cubic),
    })
    sweepSV.value = withDelay(
      delay,
      withTiming(sweepAngle, {
        duration: 620,
        easing: Easing.out(Easing.cubic),
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startAngle, sweepAngle, delay, animationKey])

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
        <Canvas style={{ width: DONUT_SIZE, height: DONUT_SIZE }}>
        {/* Background track */}
        <Path
          path={(() => {
            const d = `M ${CENTER} ${STROKE_WIDTH / 2} A ${RADIUS} ${RADIUS} 0 1 1 ${CENTER - 0.001} ${STROKE_WIDTH / 2}`
            return Skia.Path.MakeFromSVGString(d) ?? Skia.Path.Make()
          })()}
          style="stroke"
          strokeWidth={STROKE_WIDTH}
          color={tokens.color.muted}
        />
        {slices.map((s) => (
          <DonutSlice
            key={s.label}
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
      {items.map((it) => (
        <View key={it.label} style={styles.legendRow}>
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

export default function Insights() {
  const [navYm, setNavYm] = useState(() => nowYearMonth())
  const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(null)
  const [showCustomModal, setShowCustomModal] = useState(false)
  const [customDraftStart, setCustomDraftStart] = useState('')
  const [customDraftEnd, setCustomDraftEnd] = useState('')
  const [dismissRev, setDismissRev] = useState(0)
  const [pieRev, setPieRev] = useState(0)

  /** Re-run insights when the transactions store refreshes (e.g. after sync). */
  const txStoreItems = useTransactionsStore((s) => s.items)

  const focusYm = navYm
  const focusKey = monthKeyFromParts(focusYm.year, focusYm.month)
  const spendRange = useMemo(
    () => spendRangeFromCustomOrNav(focusYm, customRange),
    [focusYm.year, focusYm.month, customRange],
  )

  useFocusEffect(
    useCallback(() => {
      setPieRev((n) => n + 1)
    }, []),
  )

  useEffect(() => {
    setPieRev((n) => n + 1)
  }, [focusKey, spendRange.start, spendRange.end])

  const data = useMemo(() => {
    void dismissRev
    maybeResetDismissalsOnNewSync()
    const dismissedAnomalies = getDismissedAnomalyIds()
    const dismissedDupes = getDismissedDuplicateKeys()

    const accounts = accountsQ.listBankLinkedAccounts()
    const visible = new Set(
      accounts.filter((a) => a.include_in_insights === 1).map((a) => a.id),
    )
    const txs = txq.listTransactions().filter((t) => visible.has(t.account_id))
    const budgets = budgetsQ.listBudgets(focusKey)
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
  ])

  const dismissCounts = useMemo(() => {
    void dismissRev
    return dismissedInsightsCounts()
  }, [dismissRev])

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
      if (share <= 0) continue
      sums.set(t.trip_id, (sums.get(t.trip_id) ?? 0) + share)
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
    <BrutalScreen title="Insights" subtitle="Offline analytics (local SQLite)">
      <ScrollView contentContainerStyle={styles.scroll}>
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
        </View>

        <Text style={styles.hint}>
          Month selector sets budgets, month-over-month, cash flow, trips, and weekly bars. Use
          Custom range to override spend totals (donut, merchants, anomalies) for any dates;
          change month to clear back to that full month.
        </Text>

        <View style={styles.row}>
          <Text
            onPress={openCustomModal}
            style={[styles.pill, customRange !== null && styles.pillActive]}
          >
            Custom range
          </Text>
        </View>

        <View
          style={[
            styles.syncBanner,
            dismissCounts.anomalies + dismissCounts.duplicates > 0 && styles.syncBannerActive,
          ]}
        >
          <Text style={styles.syncBannerText}>
            {dismissCounts.anomalies + dismissCounts.duplicates > 0
              ? `${dismissCounts.anomalies + dismissCounts.duplicates} dismissed alert(s) · `
              : ''}
            Dismissed anomalies and duplicates come back after your next successful bank sync.
          </Text>
        </View>

        {data.categoryTotalsDesc.length === 0 ? (
          <View style={styles.box}>
            <Text style={styles.text}>
              Nothing to analyze yet. Sync transactions from the Transactions tab after you link
              a bank.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.card} key={`cat-${focusKey}-${spendRange.start}-${data.periodTotalSpend}`}>
              <Text style={styles.h2}>Spend by category</Text>
              <Text style={styles.rangeCaption}>{data.periodLabel}</Text>
              {(() => {
                const items = data.categoryTotalsDesc.map((r) => ({
                  label: r.category,
                  value: r.totalSpend,
                  color: colorForCategory(r.category),
                }))
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
              <Text style={styles.h2}>Trips ({focusKey})</Text>
              {tripSpend.length === 0 ? (
                <Text style={styles.text}>No trip spend in {focusKey}.</Text>
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
                data.recurring.patterns.slice(0, 8).map((r) => (
                  <View key={`${r.merchantKey}-${r.lastDate}`} style={styles.lineRow}>
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
                const fillColor =
                  r.verdict === 'over'
                    ? tokens.color.debit
                    : r.verdict === 'close'
                      ? tokens.color.accent
                      : tokens.color.credit
                return (
                  <View key={r.category} style={{ marginBottom: tokens.space[3] }}>
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
            <Text style={styles.modalHint}>Use YYYY-MM-DD (local effective / posted date).</Text>
            <Text style={styles.inputLabel}>Start</Text>
            <TextInput
              value={customDraftStart}
              onChangeText={setCustomDraftStart}
              placeholder="2026-04-01"
              placeholderTextColor={tokens.color.fg}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.inputLabel}>End</Text>
            <TextInput
              value={customDraftEnd}
              onChangeText={setCustomDraftEnd}
              placeholder="2026-04-30"
              placeholderTextColor={tokens.color.fg}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalActions}>
              <Text onPress={() => setShowCustomModal(false)} style={styles.modalCancel}>
                Cancel
              </Text>
              <Text onPress={applyCustomRange} style={styles.modalApply}>
                Apply
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </BrutalScreen>
  )
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: tokens.space[6] },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.space[2],
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.card,
    paddingVertical: tokens.space[3],
    paddingHorizontal: tokens.space[2],
  },
  monthArrow: {
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthArrowDisabled: { opacity: 0.35 },
  monthArrowText: {
    fontFamily: tokens.font.mono,
    fontSize: 28,
    fontWeight: '900',
    color: tokens.color.fg,
    lineHeight: 32,
  },
  monthArrowTextDisabled: { color: tokens.color.muted },
  monthNavTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: tokens.font.mono,
    fontSize: 16,
    fontWeight: '800',
    color: tokens.color.fg,
  },
  hint: {
    fontFamily: tokens.font.mono,
    fontSize: 11,
    color: tokens.color.fg,
    opacity: 0.75,
    marginBottom: tokens.space[3],
    lineHeight: 16,
  },
  syncBanner: {
    borderWidth: tokens.border.w2,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.muted,
    padding: tokens.space[3],
    marginBottom: tokens.space[4],
  },
  syncBannerActive: {
    backgroundColor: tokens.color.accent,
    borderColor: tokens.color.border,
  },
  syncBannerText: {
    fontFamily: tokens.font.mono,
    fontSize: 12,
    lineHeight: 17,
    color: tokens.color.fg,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space[2],
    marginBottom: tokens.space[3],
  },
  pill: {
    fontFamily: tokens.font.mono,
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    paddingVertical: tokens.space[2],
    paddingHorizontal: tokens.space[3],
    backgroundColor: tokens.color.card,
  },
  pillActive: {
    backgroundColor: tokens.color.accent,
  },
  donutWrap: {
    height: 190,
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
    paddingHorizontal: tokens.space[3],
  },
  donutCenterLabel: {
    fontFamily: tokens.font.mono,
    fontSize: 11,
    fontWeight: '800',
    color: tokens.color.fg,
    opacity: 0.7,
    marginBottom: 2,
  },
  donutCenterValue: {
    fontFamily: tokens.font.mono,
    fontSize: 16,
    fontWeight: '900',
    color: tokens.color.fg,
  },
  legendWrap: {
    marginTop: tokens.space[2],
    gap: tokens.space[2],
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[2],
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderWidth: tokens.border.w2,
    borderColor: tokens.color.border,
  },
  legendLabel: {
    flex: 1,
    fontFamily: tokens.font.mono,
    color: tokens.color.fg,
    fontSize: 12,
    opacity: 0.9,
  },
  legendValue: {
    fontFamily: tokens.font.mono,
    color: tokens.color.fg,
    fontSize: 12,
    fontWeight: '800',
  },
  budgetTrack: {
    height: 12,
    width: '100%',
    maxWidth: 280,
    backgroundColor: tokens.color.muted,
    borderWidth: tokens.border.w2,
    borderColor: tokens.color.border,
  },
  budgetFill: {
    height: '100%',
  },
  box: {
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    padding: tokens.space[5],
    backgroundColor: tokens.color.card,
  },
  card: {
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    padding: tokens.space[4],
    backgroundColor: tokens.color.card,
    marginBottom: tokens.space[4],
  },
  h2: {
    fontFamily: tokens.font.mono,
    fontWeight: '800',
    color: tokens.color.fg,
    marginBottom: tokens.space[2],
  },
  rangeCaption: {
    fontFamily: tokens.font.mono,
    fontSize: 12,
    fontWeight: '700',
    color: tokens.color.fg,
    opacity: 0.8,
    marginBottom: tokens.space[2],
  },
  text: {
    fontFamily: tokens.font.mono,
    color: tokens.color.fg,
    fontSize: 14,
  },
  kpi: {
    fontFamily: tokens.font.mono,
    color: tokens.color.fg,
    fontSize: 13,
    marginTop: tokens.space[2],
  },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.space[3],
    marginBottom: tokens.space[2],
  },
  lineLeft: {
    flex: 1,
    fontFamily: tokens.font.mono,
    color: tokens.color.fg,
    fontSize: 13,
    opacity: 0.85,
  },
  lineRight: {
    fontFamily: tokens.font.mono,
    color: tokens.color.fg,
    fontSize: 13,
    fontWeight: '800',
  },
  dismiss: {
    fontFamily: tokens.font.mono,
    color: tokens.color.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: tokens.space[4],
  },
  modalCard: {
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.card,
    padding: tokens.space[4],
  },
  modalTitle: {
    fontFamily: tokens.font.mono,
    fontWeight: '800',
    fontSize: 16,
    color: tokens.color.fg,
    marginBottom: tokens.space[2],
  },
  modalHint: {
    fontFamily: tokens.font.mono,
    fontSize: 12,
    color: tokens.color.fg,
    opacity: 0.8,
    marginBottom: tokens.space[3],
  },
  inputLabel: {
    fontFamily: tokens.font.mono,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: tokens.space[1],
    color: tokens.color.fg,
  },
  input: {
    fontFamily: tokens.font.mono,
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    padding: tokens.space[2],
    marginBottom: tokens.space[3],
    color: tokens.color.fg,
    backgroundColor: tokens.color.bg,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: tokens.space[4],
    marginTop: tokens.space[2],
  },
  modalCancel: {
    fontFamily: tokens.font.mono,
    fontWeight: '700',
    color: tokens.color.fg,
    padding: tokens.space[2],
  },
  modalApply: {
    fontFamily: tokens.font.mono,
    fontWeight: '800',
    color: tokens.color.accent,
    padding: tokens.space[2],
  },
})
