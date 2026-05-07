import { FlashList, FlashListRef } from '@shopify/flash-list'
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
  Animated,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import Svg, { Circle, Path } from 'react-native-svg'
import { Ionicons } from '@expo/vector-icons'

import { DateInput } from '@/src/components/DateInput'
import { EmptyState } from '@/src/components/EmptyState'
import { AddTransactionBottomSheet } from '@/src/components/transactions/AddTransactionBottomSheet'
import { AllocationBottomSheet } from '@/src/components/transactions/AllocationBottomSheet'
import { EditTransactionBottomSheet } from '@/src/components/transactions/EditTransactionBottomSheet'
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
import { useAccountsStore } from '@/src/stores/accountsStore'
import { useCategoriesStore } from '@/src/stores/categoriesStore'
import * as accountsQ from '@/src/db/queries/accounts'
import { useTransactionsStore } from '@/src/stores/transactionsStore'

const NEO = {
  cream: '#FAFAF5',
  ink: '#111111',
  yellow: '#F5C842',
  sub: '#aaaaaa',
  incomeGreen: '#3B6D11',
  incomeBorder: '#F5C842',
} as const

const NEO_MONO = Platform.select({
  ios: 'Courier New',
  android: 'monospace',
  default: 'monospace',
})

// ── helpers ────────────────────────────────────────────────────────────────

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
  return `${Math.floor(h / 24)}d ago`
}

function formatTxMoney(amount: number): string {
  const fmt = new Intl.NumberFormat(undefined, {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
  return amount >= 0 ? `+${fmt.format(Math.abs(amount))}` : `-${fmt.format(Math.abs(amount))}`
}

// ── Skeleton ───────────────────────────────────────────────────────────────

const SKELETON_WIDTHS = [
  ['62%', '18%'], ['48%', '22%'], ['71%', '16%'], ['55%', '20%'],
  ['40%', '24%'], ['66%', '17%'], ['53%', '21%'], ['44%', '19%'],
] as const

function SkeletonRow({ index }: { index: number }) {
  const opacity = useRef(new Animated.Value(1)).current
  const [descW, amtW] = SKELETON_WIDTHS[index % SKELETON_WIDTHS.length]!
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 700, delay: index * 80, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    )
    anim.start()
    return () => anim.stop()
  }, [opacity, index])
  return (
    <Animated.View style={[styles.txRow, { borderLeftWidth: 4, borderLeftColor: '#D4D4C4', opacity }]}>
      <View style={styles.txRowTop}>
        <View style={[styles.skeletonBar, { width: descW, height: 14 }]} />
        <View style={[styles.skeletonBar, { width: amtW, height: 14 }]} />
      </View>
      <View style={[styles.skeletonBar, { width: '38%', height: 11, marginTop: 7 }]} />
    </Animated.View>
  )
}

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'all', label: 'All dates' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_30', label: '30 days' },
  { key: 'custom', label: 'Custom' },
]

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.chipPressable}>
      {({ pressed }) => (
        <View style={[styles.chip, selected && styles.chipOn, pressed && styles.chipPressed]} pointerEvents="none">
          <Text style={styles.chipText} numberOfLines={1}>{label}</Text>
        </View>
      )}
    </Pressable>
  )
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function AllTransactionsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const listContentBottomPad = insets.bottom + 100

  const items = useTransactionsStore((s) => s.items)
  const load = useTransactionsStore((s) => s.load)
  const removeTransaction = useTransactionsStore((s) => s.remove)
  const categoryRows = useCategoriesStore((s) => s.items)
  const loadCategories = useCategoriesStore((s) => s.load)
  const accountRows = useAccountsStore((s) => s.items)
  const loadAccounts = useAccountsStore((s) => s.load)

  const accountMap = useMemo(
    () => new Map(accountsQ.listAllAccounts().map((a) => [a.id, { name: a.name, institution: a.institution }])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountRows],
  )

  const accountOptions = useMemo(() => {
    return accountsQ.listAllAccounts().map((a) => {
      const isManual = a.enrollment_id === 'manual'
      const label = isManual
        ? (a.name ?? 'Manual account')
        : ([a.institution, a.name].filter(Boolean).join(' · ') || 'Bank account')
      return { id: a.id, label }
    })
  }, [accountRows])

  const categoryColorMap = useMemo(
    () => new Map(categoryRows.map((c) => [c.label, c.color])),
    [categoryRows],
  )

  const [refreshing, setRefreshing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [filters, setFilters] = useState<TransactionListFilters>({
    search: '',
    datePreset: 'all',
    category: 'all',
    accountId: 'all',
    cashFlow: 'all',
    source: 'all',
    includeUnconfirmedPending: true,
  })
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [showCustomDate, setShowCustomDate] = useState(false)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [lastSync, setLastSync] = useState<string | undefined>(() => meta.getMeta(META_LAST_TELLER_SYNC_AT))

  const addRef = useRef<BottomSheetModal>(null)
  const allocRef = useRef<BottomSheetModal>(null)
  const [allocTxId, setAllocTxId] = useState<string | null>(null)
  const editRef = useRef<BottomSheetModal>(null)
  const [editTxId, setEditTxId] = useState<string | null>(null)
  const listRef = useRef<FlashListRef<TxListRow>>(null)
  const searchInputRef = useRef<TextInput>(null)

  useEffect(() => {
    void (async () => {
      try { await load() } finally { setIsLoading(false) }
    })()
    loadCategories()
    loadAccounts()
  }, [load, loadCategories, loadAccounts])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    void (async () => {
      try {
        const { triggerManualSync } = await import('@/src/lib/foregroundSync')
        await triggerManualSync()
        setLastSync(meta.getMeta(META_LAST_TELLER_SYNC_AT))
      } catch { /* offline */ } finally {
        void load()
        setRefreshing(false)
      }
    })()
  }, [load])

  const filtered = useMemo(() => applyTransactionFilters(items, filters), [items, filters])
  const monthKeys = useMemo(() => getMonthKeysDescending(filtered), [filtered])
  const topMonthKey = monthKeys[0] ?? null

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const prevMonthKeysRef = useRef<string[]>([])

  useLayoutEffect(() => {
    const prev = prevMonthKeysRef.current
    prevMonthKeysRef.current = monthKeys
    if (monthKeys.length === 0) { setCollapsed(new Set()); return }
    const top = monthKeys[0]!
    const prevSet = new Set(prev)
    setCollapsed((oldCollapsed) => {
      const next = new Set<string>()
      for (const mk of monthKeys) {
        const isNew = prevSet.size === 0 || !prevSet.has(mk)
        if (mk === top) {
          if (!isNew && oldCollapsed.has(mk)) next.add(mk)
          continue
        }
        if (isNew) next.add(mk)
        else if (oldCollapsed.has(mk)) next.add(mk)
      }
      return next
    })
  }, [monthKeys])

  const toggleMonth = useCallback((monthKey: string) => {
    setCollapsed((prev) => {
      const n = new Set(prev)
      if (n.has(monthKey)) n.delete(monthKey); else n.add(monthKey)
      return n
    })
  }, [])

  const { rows } = useMemo(() => buildGroupedRows(filtered, collapsed), [filtered, collapsed])

  const openAllocate = useCallback((tx: TransactionRow) => {
    setAllocTxId(tx.id)
    setTimeout(() => allocRef.current?.present(), 0)
  }, [])

  const onDelete = useCallback((tx: TransactionRow) => { removeTransaction(tx.id) }, [removeTransaction])
  const onEdit = useCallback((tx: TransactionRow) => {
    setEditTxId(tx.id)
    setTimeout(() => editRef.current?.present(), 0)
  }, [])
  const onEditDismiss = useCallback(() => setEditTxId(null), [])
  const onAllocDismiss = useCallback(() => setAllocTxId(null), [])

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
    () => ({ f: filters, c: [...collapsed].sort().join('|'), top: topMonthKey ?? '', pad: listContentBottomPad }),
    [filters, collapsed, topMonthKey, listContentBottomPad],
  )

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
            style={styles.monthAccordionPressable}
          >
            {({ pressed }) => (
              <View style={[styles.monthAccordionRow, pressed && { opacity: 0.75 }]} pointerEvents="none">
                <View style={styles.monthLeft}>
                  <Text style={[styles.monthAccordionChev, isTop && { opacity: 0.35 }]}>
                    {isCollapsed ? '▶' : '▼'}
                  </Text>
                  <Text style={styles.monthSectionLabel} numberOfLines={1}>
                    {formatMonthLabel(item.monthKey)}
                  </Text>
                </View>
                <Text style={styles.monthCount}>{item.count} txns</Text>
              </View>
            )}
          </Pressable>
        )
      }

      const tx = item.tx
      const isIncome = tx.amount > 0
      const categoryColor = tx.category ? (categoryColorMap.get(tx.category) ?? null) : null
      const leftBorderColor = categoryColor ?? (isIncome ? NEO.incomeBorder : NEO.ink)
      const acct = accountMap.get(tx.account_id)
      const accountLabel = tx.source === 'bank'
        ? [acct?.institution, acct?.name ?? tx.account_label].filter(Boolean).join(' · ')
        : (acct?.name ?? tx.account_label ?? null)

      return (
        <TransactionSwipeRow tx={tx} onAllocate={openAllocate} onEdit={onEdit} onDelete={onDelete}>
          <View style={[styles.txRow, { borderLeftWidth: 4, borderLeftColor: leftBorderColor }]}>
            <View style={styles.txRowTop}>
              <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>
              <View style={styles.txAmountCol}>
                <Text style={[
                  styles.txAmount,
                  tx.my_share != null ? styles.txAmountExpense : isIncome ? styles.txAmountIncome : tx.amount < 0 ? styles.txAmountExpense : undefined,
                ]}>
                  {tx.my_share != null ? formatTxMoney(tx.my_share) : formatTxMoney(tx.amount)}
                </Text>
                {tx.my_share != null ? (
                  <Text style={styles.txShare}>full: {formatTxMoney(tx.amount)}</Text>
                ) : null}
              </View>
            </View>
            <Text style={styles.txMeta}>
              {tx.effective_date ?? tx.date}
              {accountLabel ? ` · ${accountLabel}` : ''}
              {tx.category ? ` · ${tx.category}` : ''}
            </Text>
            {(tx as any).notes ? (
              <Text style={styles.txNotes} numberOfLines={2}>{(tx as any).notes}</Text>
            ) : null}
            {tx.pending === 1 ? (
              <Text style={styles.txMeta}><Text style={styles.txPendingTag}>PENDING</Text></Text>
            ) : null}
          </View>
        </TransactionSwipeRow>
      )
    },
    [accountMap, categoryColorMap, collapsed, onDelete, onEdit, openAllocate, toggleMonth, topMonthKey],
  )

  const renderListHeader = useCallback(
    () => (
      <View>
        {/* Search + Filters */}
        <View style={styles.filterCard}>
          <View style={styles.searchRow}>
            <View style={styles.searchIconWrap}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                <Circle cx={11} cy={11} r={7} stroke={NEO.ink} strokeWidth={2.5} />
                <Path d="M16.5 16.5 L21 21" stroke={NEO.ink} strokeWidth={2.5} strokeLinecap="round" />
              </Svg>
            </View>
            <TextInput
              ref={searchInputRef}
              value={filters.search}
              onChangeText={(search) => setFilters((f) => ({ ...f, search }))}
              placeholder="Search transactions..."
              placeholderTextColor="#888888"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.searchInput}
            />
            <Pressable
              onPress={() => setFiltersExpanded((v) => !v)}
              style={({ pressed }) => [styles.filterToggleBtn, pressed && { opacity: 0.8 }]}
            >
              <Ionicons name={filtersExpanded ? 'options' : 'options-outline'} size={20} color={filtersExpanded ? NEO.yellow : NEO.cream} />
            </Pressable>
          </View>

          {filtersExpanded ? (
            <View style={styles.filtersExpanded}>
              <Text style={styles.filterLabel}>DATE</Text>
              <View style={styles.chipRow}>
                {DATE_PRESETS.map((p) => (
                  <Chip key={p.key} label={p.label} selected={filters.datePreset === p.key} onPress={() => setPreset(p.key)} />
                ))}
                {filters.datePreset === 'custom' && filters.customDateRange ? (
                  <Text style={styles.customRangeNote}>{filters.customDateRange.start} → {filters.customDateRange.end}</Text>
                ) : null}
              </View>
              <Text style={[styles.filterLabel, { marginTop: 8 }]}>ACCOUNT</Text>
              <View style={styles.chipRow}>
                <Chip label="All" selected={filters.accountId === 'all'} onPress={() => setFilters((f) => ({ ...f, accountId: 'all' }))} />
                {accountOptions.map((a) => (
                  <Chip key={a.id} label={a.label} selected={filters.accountId === a.id} onPress={() => setFilters((f) => ({ ...f, accountId: a.id }))} />
                ))}
              </View>
              <Text style={[styles.filterLabel, { marginTop: 8 }]}>CATEGORY</Text>
              <View style={styles.chipRow}>
                <Chip label="All" selected={filters.category === 'all'} onPress={() => setFilters((f) => ({ ...f, category: 'all' }))} />
                <Chip label="None" selected={filters.category === '__none__'} onPress={() => setFilters((f) => ({ ...f, category: '__none__' }))} />
                {categoryRows.map((c) => (
                  <Chip key={c.id} label={c.label} selected={filters.category === c.label} onPress={() => setFilters((f) => ({ ...f, category: c.label }))} />
                ))}
              </View>
              <Text style={[styles.filterLabel, { marginTop: 8 }]}>FLOW</Text>
              <View style={styles.chipRow}>
                {(['all', 'in', 'out'] as const).map((k) => (
                  <Chip key={k} label={k === 'all' ? 'All' : k === 'in' ? 'Income' : 'Spend'} selected={filters.cashFlow === k} onPress={() => setFilters((f) => ({ ...f, cashFlow: k }))} />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </View>
    ),
    [accountOptions, categoryRows, filters, filtersExpanded],
  )

  const hasActiveFilters = filters.search.trim() !== '' || filters.datePreset !== 'all' || filters.category !== 'all' || filters.accountId !== 'all' || filters.cashFlow !== 'all'

  return (
    <View style={styles.screen}>
      {/* Black fill behind the status bar so the topbar colour reaches the top of the screen */}
      <View style={[styles.statusBarFill, { height: insets.top }]} />
      {/* Top bar */}
      <View style={[styles.topbar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          {({ pressed }) => (
            <View style={[styles.backBtnInner, pressed && { opacity: 0.7 }]} pointerEvents="none">
              <Ionicons name="arrow-back" size={20} color={NEO.cream} />
            </View>
          )}
        </Pressable>
        <View style={styles.topbarMid}>
          <Text style={styles.topbarTitle}>Transactions</Text>
          <Text style={styles.topbarSub}>Last sync: {formatLastSyncShort(lastSync)}</Text>
        </View>
        <View style={styles.topbarCount}>
          <Text style={styles.topbarCountText}>{filtered.length}</Text>
        </View>
      </View>

      {/* List */}
      <View style={{ flex: 1 }}>
        {isLoading ? (
          <FlashList
            data={[]}
            renderItem={() => null}
            ListHeaderComponent={<>
              {renderListHeader()}
              {Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} index={i} />)}
            </>}
            contentContainerStyle={{ paddingBottom: listContentBottomPad }}
          />
        ) : (
          <FlashList
            ref={listRef}
            data={rows}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            getItemType={(item) => item.type}
            showsVerticalScrollIndicator={false}
            extraData={extraData}
            ListHeaderComponent={renderListHeader}
            ListEmptyComponent={
              hasActiveFilters ? (
                <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
                  <Text style={styles.emptyText}>No transactions match these filters.</Text>
                </View>
              ) : (
                <EmptyState variant="transactions" title="No transactions yet" subtitle="Add one with the + button below." />
              )
            }
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={{ paddingBottom: listContentBottomPad }}
          />
        )}
      </View>

      {/* FAB */}
      <View style={[styles.fabWrap, { bottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={() => addRef.current?.present()}
          accessibilityRole="button"
          accessibilityLabel="Add transaction"
        >
          {({ pressed }) => (
            <View style={[styles.fab, pressed && styles.fabPressed]} pointerEvents="none">
              <Ionicons name="add" size={36} color={NEO.ink} />
            </View>
          )}
        </Pressable>
      </View>

      {/* Modals */}
      <AddTransactionBottomSheet ref={addRef} />
      <AllocationBottomSheet ref={allocRef} transactionId={allocTxId} onDismiss={onAllocDismiss} />
      <EditTransactionBottomSheet ref={editRef} transactionId={editTxId} onDismiss={onEditDismiss} />

      <Modal visible={showCustomDate} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Custom date range</Text>
            <DateInput value={customStart} onChange={setCustomStart} placeholder="Start date" style={styles.modalInput} />
            <DateInput value={customEnd} onChange={setCustomEnd} placeholder="End date" style={styles.modalInput} />
            <View style={styles.modalRow}>
              <Pressable onPress={() => setShowCustomDate(false)} style={({ pressed }) => [styles.modalBtn, pressed && { opacity: 0.85 }]}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setFilters((f) => ({ ...f, datePreset: 'custom', customDateRange: { start: customStart.trim(), end: customEnd.trim() } }))
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: NEO.cream },
  statusBarFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: NEO.ink,
  },

  topbar: {
    backgroundColor: NEO.ink,
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: { flexShrink: 0 },
  backBtnInner: {
    width: 32, height: 32,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#333333',
  },
  topbarMid: { flex: 1, minWidth: 0 },
  topbarTitle: {
    fontFamily: NEO_MONO,
    fontSize: 18,
    fontWeight: Platform.OS === 'ios' ? '800' : '700',
    color: NEO.cream,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  topbarSub: {
    fontFamily: NEO_MONO,
    fontSize: 11,
    color: NEO.sub,
    letterSpacing: 0.3,
    marginTop: 1,
  },
  topbarCount: {
    backgroundColor: NEO.yellow,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 2,
    borderColor: '#333333',
  },
  topbarCountText: {
    fontFamily: NEO_MONO,
    fontSize: 12,
    fontWeight: '800',
    color: NEO.ink,
  },

  // Filter card
  filterCard: {
    backgroundColor: NEO.ink,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    marginBottom: 4,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchIconWrap: {
    width: 28, height: 28,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: NEO.yellow,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#333',
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#333333',
    backgroundColor: NEO.cream,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontFamily: NEO_MONO,
    fontSize: 13,
    color: NEO.ink,
    borderRadius: 4,
  },
  filterToggleBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#222222',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#444444',
    flexShrink: 0,
  },
  filtersExpanded: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#333333',
  },
  filterLabel: {
    fontFamily: NEO_MONO,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: NEO.sub,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 4,
  },
  chipPressable: {},
  chip: {
    borderWidth: 2,
    borderColor: '#555555',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#222222',
  },
  chipOn: { backgroundColor: NEO.yellow, borderColor: NEO.yellow },
  chipPressed: { opacity: 0.7 },
  chipText: {
    fontFamily: NEO_MONO,
    fontSize: 11,
    fontWeight: '800',
    color: NEO.cream,
  },
  customRangeNote: {
    fontFamily: NEO_MONO,
    fontSize: 9,
    color: NEO.sub,
    marginTop: 2,
    alignSelf: 'center',
  },

  // Month accordion
  monthAccordionPressable: { width: '100%' },
  monthAccordionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginTop: 2,
    marginBottom: 4,
  },
  monthLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  monthSectionLabel: {
    fontFamily: NEO_MONO,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: NEO.ink,
    flexShrink: 1,
  },
  monthAccordionChev: {
    fontSize: 14, fontWeight: '900', color: NEO.ink, opacity: 0.5,
  },
  monthCount: {
    fontFamily: NEO_MONO,
    fontSize: 13,
    fontWeight: '800',
    color: NEO.ink,
    opacity: 0.6,
    textAlign: 'right',
    flexShrink: 0,
  },

  // Transaction rows
  txRow: {
    borderWidth: 2,
    borderColor: NEO.ink,
    backgroundColor: NEO.cream,
    paddingVertical: 7,
    paddingHorizontal: 8,
    marginBottom: 10,
    marginHorizontal: 12,
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
    fontSize: 15,
    fontWeight: '800',
    color: NEO.ink,
  },
  txAmountCol: { alignItems: 'flex-end' },
  txAmount: { fontFamily: NEO_MONO, fontSize: 15, fontWeight: '800', color: NEO.ink },
  txAmountIncome: { color: NEO.incomeGreen },
  txAmountExpense: { color: '#CC2222' },
  txShare: { fontFamily: NEO_MONO, fontSize: 11, fontWeight: '700', color: NEO.sub, marginTop: 1 },
  txMeta: { marginTop: 3, fontFamily: NEO_MONO, fontSize: 12, color: '#666666' },
  txNotes: { marginTop: 3, fontFamily: NEO_MONO, fontSize: 11, color: '#888888', fontStyle: 'italic' },
  txPendingTag: { fontFamily: NEO_MONO, fontSize: 11, fontWeight: '700', color: '#CC2222' },
  skeletonBar: { backgroundColor: '#D4D4C4', borderRadius: 2 },
  emptyText: { fontFamily: NEO_MONO, fontSize: 12, color: NEO.ink, opacity: 0.65 },

  // FAB
  fabWrap: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
  },
  fab: {
    width: 64, height: 64,
    borderRadius: 32,
    backgroundColor: NEO.yellow,
    borderWidth: 3,
    borderColor: NEO.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: NEO.ink,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 6,
  },
  fabPressed: {
    transform: [{ translateX: 3 }, { translateY: 3 }],
    shadowOpacity: 0,
    elevation: 0,
  },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  modalCard: {
    width: '100%', maxWidth: 360,
    borderWidth: 3, borderColor: NEO.ink,
    backgroundColor: NEO.cream,
    padding: 12,
    shadowColor: NEO.ink, shadowOffset: { width: 3, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 3,
  },
  modalTitle: {
    fontFamily: NEO_MONO, fontSize: 12, fontWeight: '900', color: NEO.ink,
    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4,
  },
  modalInput: {
    borderWidth: 2, borderColor: NEO.ink, backgroundColor: NEO.cream,
    paddingHorizontal: 7, paddingVertical: 5,
    fontFamily: NEO_MONO, fontSize: 12, color: '#444444', marginBottom: 6,
  },
  modalRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  modalBtn: {
    flex: 1, backgroundColor: NEO.cream, paddingVertical: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  modalBtnPrimary: { backgroundColor: NEO.yellow },
  modalBtnText: {
    fontFamily: NEO_MONO, fontSize: 12, fontWeight: '900', color: NEO.ink,
    letterSpacing: 0.55, textTransform: 'uppercase',
    borderWidth: 3, borderColor: NEO.ink, paddingVertical: 3, paddingHorizontal: 7,
  },
})
