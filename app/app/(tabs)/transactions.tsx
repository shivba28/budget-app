import { FlashList } from '@shopify/flash-list'
import { BottomSheetModal } from '@gorhom/bottom-sheet'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  Modal,
} from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { useFocusEffect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AllocationBottomSheet } from '@/src/components/transactions/AllocationBottomSheet'
import { TransactionSwipeRow } from '@/src/components/transactions/TransactionSwipeRow'
import { META_LAST_TELLER_SYNC_AT } from '@/src/db/constants'
import * as meta from '@/src/db/queries/appMeta'
import type { TransactionRow } from '@/src/db/queries/transactions'
import {
  applyTransactionFilters,
  type DatePreset,
  type TransactionListFilters,
} from '@/src/lib/transactions/filters'
import {
  buildGroupedRows,
  getMonthKeysDescending,
  type TxListRow,
} from '@/src/lib/transactions/listModel'
import { useCategoriesStore } from '@/src/stores/categoriesStore'
import { useTransactionsStore } from '@/src/stores/transactionsStore'

/** Neobrutalist mock tokens (budget_app_neobrutalist_screens.html) */
const NEO = {
  cream: '#FAFAF5',
  ink: '#111111',
  yellow: '#F5C842',
  sub: '#aaaaaa',
  incomeGreen: '#3B6D11',
  incomeBorder: '#F5C842',
} as const

/** Matches HTML `font-family: 'Courier New', monospace` — System mono is lighter on iOS. */
const NEO_MONO = Platform.select({
  ios: 'Courier New',
  android: 'monospace',
  default: 'monospace',
})

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  const d = new Date(y, m - 1, 1)
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' })
}

function formatLastSyncShort(iso?: string): string {
  if (!iso) return 'Never'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 'Unknown'
  const d = Date.now() - t
  const m = Math.floor(d / 60000)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h ago`
  const days = Math.floor(h / 24)
  return `${days}d ago`
}

function formatTxMoney(amount: number): string {
  const fmt = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const s = fmt.format(Math.abs(amount))
  return amount >= 0 ? `+${s}` : `-${s}`
}

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'all', label: 'All dates' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_30', label: '30 days' },
  { key: 'custom', label: 'Custom' },
]

export default function TransactionsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const items = useTransactionsStore((s) => s.items)
  const load = useTransactionsStore((s) => s.load)
  const categoryRows = useCategoriesStore((s) => s.items)
  const loadCategories = useCategoriesStore((s) => s.load)

  const [refreshing, setRefreshing] = useState(false)
  const [filters, setFilters] = useState<TransactionListFilters>({
    search: '',
    // Default to All dates so prior months (e.g. March) are visible.
    datePreset: 'all',
    category: 'all',
    cashFlow: 'all',
    source: 'all',
    includeUnconfirmedPending: false,
  })
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [showCustomDate, setShowCustomDate] = useState(false)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const allocRef = useRef<BottomSheetModal>(null)
  const [allocTxId, setAllocTxId] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<string | undefined>(() =>
    meta.getMeta(META_LAST_TELLER_SYNC_AT),
  )

  useEffect(() => {
    void load()
    loadCategories()
  }, [load, loadCategories])

  useFocusEffect(
    useCallback(() => {
      void load()
      loadCategories()
      setLastSync(meta.getMeta(META_LAST_TELLER_SYNC_AT))
    }, [load, loadCategories]),
  )

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    void (async () => {
      try {
        const { syncTellerAllAccounts } = await import('@/src/lib/teller/sync')
        await syncTellerAllAccounts()
        setLastSync(meta.getMeta(META_LAST_TELLER_SYNC_AT))
      } catch {
        /* offline, network, or Teller error — list still refreshes */
      } finally {
        void load()
        setRefreshing(false)
      }
    })()
  }, [load])

  const filtered = useMemo(
    () => applyTransactionFilters(items, filters),
    [items, filters],
  )

  const monthKeys = useMemo(
    () => getMonthKeysDescending(filtered),
    [filtered],
  )
  const topMonthKey = monthKeys[0] ?? null

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const prevMonthKeysRef = useRef<string[]>([])

  useLayoutEffect(() => {
    const prev = prevMonthKeysRef.current
    prevMonthKeysRef.current = monthKeys

    if (monthKeys.length === 0) {
      setCollapsed(new Set())
      return
    }

    const top = monthKeys[0]!
    const prevSet = new Set(prev)

    setCollapsed((oldCollapsed) => {
      const next = new Set<string>()
      for (const mk of monthKeys) {
        const isNew = prevSet.size === 0 || !prevSet.has(mk)
        if (mk === top) {
          // Newest month defaults expanded, but user can collapse it.
          if (!isNew && oldCollapsed.has(mk)) next.add(mk)
          continue
        }
        if (isNew) {
          next.add(mk)
        } else if (oldCollapsed.has(mk)) {
          next.add(mk)
        }
      }
      return next
    })
  }, [monthKeys])

  const toggleMonth = useCallback(
    (monthKey: string) => {
      setCollapsed((prev) => {
        const n = new Set(prev)
        if (n.has(monthKey)) n.delete(monthKey)
        else n.add(monthKey)
        return n
      })
    },
    [],
  )

  const { rows } = useMemo(
    () => buildGroupedRows(filtered, collapsed),
    [filtered, collapsed],
  )

  const openAllocate = useCallback((tx: TransactionRow) => {
    setAllocTxId(tx.id)
    setTimeout(() => allocRef.current?.present(), 0)
  }, [])

  const onAllocDismiss = useCallback(() => {
    setAllocTxId(null)
  }, [])

  const setPreset = (datePreset: DatePreset) => {
    if (datePreset === 'custom') {
      const cur = filters.customDateRange
      setCustomStart(cur?.start ?? new Date().toISOString().slice(0, 10))
      setCustomEnd(cur?.end ?? new Date().toISOString().slice(0, 10))
      setShowCustomDate(true)
      return
    }
    setFilters((f) => ({ ...f, datePreset, customDateRange: undefined }))
  }

  const extraData = useMemo(
    () => ({
      f: filters,
      c: [...collapsed].sort().join('|'),
      top: topMonthKey ?? '',
    }),
    [filters, collapsed, topMonthKey],
  )

  const onTopBack = useCallback(() => {
    if (router.canGoBack()) router.back()
  }, [router])

  const renderItem = useCallback(
    ({ item }: { item: TxListRow }) => {
      if (item.type === 'header') {
        const isTop = item.monthKey === topMonthKey
        const isCollapsed = collapsed.has(item.monthKey)
        return (
          <Pressable
            onPress={() => toggleMonth(item.monthKey)}
            accessibilityRole="button"
            accessibilityState={{ expanded: !isCollapsed }}
            accessibilityLabel={`${formatMonthLabel(item.monthKey)}, ${item.count} transactions`}
            style={styles.monthAccordionPressable}
          >
            {({ pressed }) => (
              <View
                style={[
                  styles.monthAccordionRow,
                  pressed && styles.monthAccordionRowPressed,
                ]}
                pointerEvents="none"
              >
                <View style={styles.monthLeft}>
                  <Text
                    style={[
                      styles.monthAccordionChev,
                      isTop && styles.monthAccordionChevTop,
                    ]}
                  >
                    {isCollapsed ? '▶' : '▼'}
                  </Text>
                  <Text style={styles.monthSectionLabel} numberOfLines={1}>
                    {formatMonthLabel(item.monthKey)}
                  </Text>
                </View>
                <Text style={styles.monthCount} numberOfLines={1}>
                  {item.count} txns
                </Text>
              </View>
            )}
          </Pressable>
        )
      }
      const tx = item.tx
      const isIncome = tx.amount > 0
      return (
        <TransactionSwipeRow
          tx={tx}
          onPress={() => router.push(`/app/transaction-edit/${tx.id}`)}
          onAllocate={openAllocate}
        >
          <View
            style={[
              styles.txRow,
              isIncome && styles.txRowIncome,
            ]}
          >
            <View style={styles.txRowTop}>
              <Text style={styles.txDesc} numberOfLines={1}>
                {tx.description}
              </Text>
              <Text
                style={[
                  styles.txAmount,
                  isIncome && styles.txAmountIncome,
                ]}
              >
                {formatTxMoney(tx.amount)}
              </Text>
            </View>
            <Text style={styles.txMeta}>
              {tx.effective_date ?? tx.date}
              {tx.category ? ` · ${tx.category}` : ''}
              {tx.pending === 1 ? ' · pending' : ''}
            </Text>
          </View>
        </TransactionSwipeRow>
      )
    },
    [collapsed, openAllocate, router, toggleMonth, topMonthKey],
  )

  const renderListHeader = useCallback(
    () => (
      /* HTML: .card > .input-label + .input-field, then Date (no mt), Category/Flow margin-top: 6px */
      <View style={styles.card} accessibilityRole="none">
        <Text style={styles.inputLabel}>Search</Text>
        <View style={styles.searchAccordionRow}>
          <View style={styles.searchCol}>
            <TextInput
              value={filters.search}
              onChangeText={(search) => setFilters((f) => ({ ...f, search }))}
              placeholder="Filter by description..."
              placeholderTextColor="#888888"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.inputField}
            />
          </View>
          <Pressable
            onPress={() => setFiltersExpanded((v) => !v)}
            style={({ pressed }) => [styles.filtersChevBtn, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
            accessibilityLabel={filtersExpanded ? 'Collapse filters' : 'Expand filters'}
          >
            <Text style={styles.filtersChev}>Advanced {filtersExpanded ? '▼' : '▶'}</Text>
          </Pressable>
        </View>

        {filtersExpanded ? (
          <>
            <View style={styles.filterGroup}>
              <Text style={styles.inputLabel}>Date</Text>
              <View style={styles.chipRow}>
                {DATE_PRESETS.map((p) => (
                  <Chip
                    key={p.key}
                    label={p.label}
                    selected={filters.datePreset === p.key}
                    onPress={() => setPreset(p.key)}
                  />
                ))}
                {filters.datePreset === 'custom' && filters.customDateRange ? (
                  <Text style={styles.customRangeNote}>
                    {filters.customDateRange.start} → {filters.customDateRange.end}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={styles.filterGroupSpaced}>
              <Text style={styles.inputLabel}>Category</Text>
              <View style={styles.chipRow}>
                <Chip
                  label="All"
                  selected={filters.category === 'all'}
                  onPress={() => setFilters((f) => ({ ...f, category: 'all' }))}
                />
                <Chip
                  label="None"
                  selected={filters.category === '__none__'}
                  onPress={() =>
                    setFilters((f) => ({ ...f, category: '__none__' }))
                  }
                />
                {categoryRows.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.label}
                    selected={filters.category === c.label}
                    onPress={() =>
                      setFilters((f) => ({ ...f, category: c.label }))
                    }
                  />
                ))}
              </View>
            </View>
            <View style={styles.filterGroupSpaced}>
              <Text style={styles.inputLabel}>Flow</Text>
              <View style={styles.chipRow}>
                {(
                  [
                    ['all', 'All'],
                    ['in', 'In'],
                    ['out', 'Out'],
                  ] as const
                ).map(([key, label]) => (
                  <Chip
                    key={key}
                    label={label}
                    selected={filters.cashFlow === key}
                    onPress={() =>
                      setFilters((f) => ({ ...f, cashFlow: key }))
                    }
                  />
                ))}
              </View>
            </View>
          </>
        ) : null}
      </View>
    ),
    [categoryRows, filters, filtersExpanded],
  )

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + 12 }]}>
      <View
        style={[
          styles.topbar,
          { paddingTop: insets.top + 10 },
        ]}
      >
        <Text style={styles.topbarTitle} numberOfLines={1}>
          Transactions
        </Text>
        <Text style={styles.topbarSub} numberOfLines={1}>
          Last sync: {formatLastSyncShort(lastSync)}
        </Text>
      </View>

      <View style={styles.body}>
        <View style={styles.listWrap}>
          <FlashList
            data={rows}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            getItemType={(item) => item.type}
            stickyHeaderIndices={[]}
            showsVerticalScrollIndicator={false}
            extraData={extraData}
            ListHeaderComponent={renderListHeader}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {items.length === 0
                  ? 'No transactions yet. Add one to get started.'
                  : 'No transactions match these filters.'}
              </Text>
            }
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            contentContainerStyle={styles.listContent}
          />
        </View>
      </View>

      <AllocationBottomSheet
        ref={allocRef}
        transactionId={allocTxId}
        onDismiss={onAllocDismiss}
      />

      <Modal visible={showCustomDate} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Custom date range</Text>
            <Text style={styles.modalHint}>Use YYYY-MM-DD</Text>
            <TextInput
              value={customStart}
              onChangeText={setCustomStart}
              placeholder="Start (YYYY-MM-DD)"
              placeholderTextColor="#888888"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.inputField}
            />
            <TextInput
              value={customEnd}
              onChangeText={setCustomEnd}
              placeholder="End (YYYY-MM-DD)"
              placeholderTextColor="#888888"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.inputField}
            />
            <View style={styles.modalRow}>
              <Pressable
                onPress={() => setShowCustomDate(false)}
                style={({ pressed }) => [styles.modalBtn, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setFilters((f) => ({
                    ...f,
                    datePreset: 'custom',
                    customDateRange: { start: customStart.trim(), end: customEnd.trim() },
                  }))
                  setShowCustomDate(false)
                }}
                style={({ pressed }) => [styles.modalBtn, styles.modalBtnPrimary, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.modalBtnText}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.chipPressable}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.chip,
            selected && styles.chipOn,
            pressed && styles.chipPressed,
          ]}
          pointerEvents="none"
        >
          <Text style={styles.chipText} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: NEO.cream,
  },
  topbar: {
    /* .topbar — padding: 10px 14px 8px (top added to safe area) */
    backgroundColor: NEO.ink,
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topbarBack: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: NEO.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topbarTitle: {
    /* .topbar-title — RN: 800 reads closer to mock than System mono at 700 */
    fontFamily: NEO_MONO,
    fontSize: 18,
    fontWeight: Platform.OS === 'ios' ? '800' : '700',
    color: NEO.cream,
    letterSpacing: 0.6, // ~0.05em × 12px
    textTransform: 'uppercase',
    flexShrink: 1,
    minWidth: 0,
  },
  topbarSub: {
    /* .topbar-sub — margin-left: auto in HTML */
    fontFamily: NEO_MONO,
    fontSize: 12,
    color: NEO.sub,
    letterSpacing: 0.36, // ~0.04em × 9px
    flexShrink: 0,
    marginLeft: 'auto',
    maxWidth: '46%',
  },
  body: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 4,
    gap: 10,
  },
  listWrap: {
    flex: 1,
    minHeight: 120,
  },
  listContent: {
    paddingBottom: 8,
    gap: 0,
  },
  card: {
    /* .card + --shadow-sm: 3px 3px 0 #111 */
    borderWidth: 3,
    borderColor: NEO.ink,
    backgroundColor: NEO.cream,
    borderRadius: 0,
    padding: 10,
    marginBottom: 10,
    shadowColor: NEO.ink,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  inputLabel: {
    /* .input-label */
    fontFamily: NEO_MONO,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.9, // 0.1em × 9px
    textTransform: 'uppercase',
    color: NEO.ink,
    marginBottom: 2,
  },
  inputField: {
    /* .input-field */
    borderWidth: 2,
    borderColor: NEO.ink,
    backgroundColor: NEO.cream,
    borderRadius: 0,
    paddingHorizontal: 7,
    paddingVertical: 5,
    fontFamily: NEO_MONO,
    fontSize: 12,
    color: '#444444',
    marginBottom: 6,
  },
  filterGroup: {
    /* Date block: no margin-top after search (HTML) */
  },
  filterGroupSpaced: {
    /* Category / Flow: margin-top: 6px */
    marginTop: 6,
  },
  chipRow: {
    /* chip container: inline chips with margin: 2px */
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  chipPressable: {
    borderRadius: 0,
  },
  chip: {
    /* .chip */
    borderWidth: 2,
    borderColor: NEO.ink,
    borderRadius: 0,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: NEO.cream,
    margin: 2,
    maxWidth: 180,
  },
  chipOn: {
    /* .chip-on */
    backgroundColor: NEO.yellow,
  },
  chipPressed: {
    opacity: 0.88,
  },
  chipText: {
    fontFamily: NEO_MONO,
    fontSize: 12,
    fontWeight: '800',
    color: NEO.ink,
  },
  searchAccordionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchCol: {
    flex: 1,
    minWidth: 0,
  },
  filtersChevBtn: {
    width: 28,
    height: 28,
    borderWidth: 2,
    borderColor: NEO.ink,
    backgroundColor: NEO.cream,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  filtersChev: {
    fontFamily: NEO_MONO,
    fontSize: 14,
    fontWeight: '900',
    color: NEO.ink,
    lineHeight: 14,
    padding: 5,
    borderWidth: 2,
    borderColor: NEO.ink,
    marginBottom: 6,
  },
  customRangeNote: {
    fontFamily: NEO_MONO,
    fontSize: 9,
    fontWeight: '700',
    color: NEO.ink,
    opacity: 0.7,
    marginLeft: 6,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 3,
    borderColor: NEO.ink,
    backgroundColor: NEO.cream,
    padding: 12,
    shadowColor: NEO.ink,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  modalTitle: {
    fontFamily: NEO_MONO,
    fontSize: 12,
    fontWeight: '900',
    color: NEO.ink,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  modalHint: {
    fontFamily: NEO_MONO,
    fontSize: 10,
    color: NEO.ink,
    opacity: 0.7,
    marginBottom: 8,
  },
  modalRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  modalBtn: {
    flex: 1,
    backgroundColor: NEO.cream,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnPrimary: {
    backgroundColor: NEO.yellow,
  },
  modalBtnText: {
    fontFamily: NEO_MONO,
    fontSize: 12,
    fontWeight: '900',
    color: NEO.ink,
    letterSpacing: 0.55,
    textTransform: 'uppercase',
    borderWidth: 3,
    borderColor: NEO.ink,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  monthAccordionRow: {
    display: 'flex',
    flexWrap: 'nowrap',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 2,
    marginBottom: 4,
    paddingVertical: 4,
    width: '100%',
  },
  monthAccordionPressable: {
    width: '100%',
  },
  monthAccordionRowPressed: {
    opacity: 0.75,
  },
  monthLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
    width: '45%',
  },
  monthSectionLabel: {
    /* .section-label — month accordion title */
    fontFamily: NEO_MONO,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: NEO.ink,
    flexShrink: 1,
  },
  monthAccordionChev: {
    fontSize: 15,
    fontWeight: '900',
    color: NEO.ink,
    opacity: 0.55,
  },
  monthAccordionChevTop: {
    opacity: 0.35,
  },
  monthCount: {
    fontFamily: NEO_MONO,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: NEO.ink,
    opacity: 0.7,
    flexShrink: 0,
    marginLeft: 1,
    textAlign: 'right',
    width: '45%',
  },
  txRow: {
    /* .tx-row */
    borderWidth: 2,
    borderColor: NEO.ink,
    backgroundColor: NEO.cream,
    borderRadius: 0,
    paddingVertical: 7,
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  txRowIncome: {
    borderLeftWidth: 3,
    borderLeftColor: NEO.incomeBorder,
  },
  txRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  txDesc: {
    flex: 1,
    fontFamily: NEO_MONO,
    fontSize: 13,
    fontWeight: '800',
    color: NEO.ink,
  },
  txAmount: {
    fontFamily: NEO_MONO,
    fontSize: 13,
    fontWeight: '800',
    color: NEO.ink,
  },
  txAmountIncome: {
    color: NEO.incomeGreen,
  },
  txMeta: {
    marginTop: 3,
    fontFamily: NEO_MONO,
    fontSize: 10,
    color: '#666666',
  },
  empty: {
    fontFamily: NEO_MONO,
    fontSize: 12,
    color: NEO.ink,
    opacity: 0.65,
    paddingVertical: 16,
  },
})
