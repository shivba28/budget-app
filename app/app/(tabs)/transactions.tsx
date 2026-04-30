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
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Modal,
} from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { useRouter } from 'expo-router'
import { useUiSignals } from '@/src/stores/uiSignals'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

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
import { useTabStore } from '@/src/stores/tabStore'
import { useSyncStore } from '@/src/stores/syncStore'

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

const ACCOUNT_CARD_COLORS = [
  '#E63946', '#2A9D8F', '#E76F51', '#6A4C93', '#06D6A0',
  '#F4A261', '#457B9D', '#E9C46A', '#B5179E', '#4CC9F0',
]

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

function formatBalanceMoney(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

const SKELETON_WIDTHS = [
  ['62%', '18%'],
  ['48%', '22%'],
  ['71%', '16%'],
  ['55%', '20%'],
  ['40%', '24%'],
  ['66%', '17%'],
  ['53%', '21%'],
  ['44%', '19%'],
] as const

function SkeletonRow({ index }: { index: number }) {
  const opacity = useRef(new Animated.Value(1)).current
  const [descW, amtW] = SKELETON_WIDTHS[index % SKELETON_WIDTHS.length]!

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 700,
          delay: index * 80,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    )
    anim.start()
    return () => anim.stop()
  }, [opacity, index])

  return (
    <Animated.View
      style={[
        styles.txRow,
        { borderLeftWidth: 4, borderLeftColor: '#D4D4C4', opacity },
      ]}
    >
      <View style={styles.txRowTop}>
        <View style={[styles.skeletonBar, { width: descW, height: 14 }]} />
        <View style={[styles.skeletonBar, { width: amtW, height: 14 }]} />
      </View>
      <View style={[styles.skeletonBar, { width: '38%', height: 11, marginTop: 7 }]} />
    </Animated.View>
  )
}

function SkeletonList({ count = 10 }: { count?: number }) {
  return (
    <View style={{ paddingTop: 4 }}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonRow key={i} index={i} />
      ))}
    </View>
  )
}

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'all', label: 'All dates' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_30', label: '30 days' },
  { key: 'custom', label: 'Custom' },
]

type AccountDetail = {
  id: string
  name: string
  institution: string | null | undefined
  type: string | null | undefined
  balance: number
  isManual: boolean
  isCreditType: boolean
}

function AccountCard({ account, colorIndex }: { account: AccountDetail; colorIndex: number }) {
  const color = ACCOUNT_CARD_COLORS[colorIndex % ACCOUNT_CARD_COLORS.length]!
  const isNegative = account.balance < 0
  const typeLabel = account.isCreditType ? 'CREDIT' : account.isManual ? 'MANUAL' : 'BANK'

  return (
    <View style={[styles.accountCard, { backgroundColor: color }]}>
      <View style={styles.accountCardTypeChip}>
        <Text style={styles.accountCardTypeText}>{typeLabel}</Text>
      </View>
      {account.institution ? (
        <Text style={styles.accountCardInstitution} numberOfLines={1}>
          {account.institution}
        </Text>
      ) : null}
      <Text style={styles.accountCardName} numberOfLines={2}>
        {account.name}
      </Text>
      <Text style={[styles.accountCardBalance, isNegative && styles.accountCardBalanceNeg]}>
        {isNegative ? '-' : '+'}{formatBalanceMoney(Math.abs(account.balance))}
      </Text>
    </View>
  )
}

export default function TransactionsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const activeIndex = useTabStore((s) => s.activeIndex)
  const listContentBottomPad = insets.bottom + 76
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
    const rows = accountsQ.listAllAccounts()
    return rows.map((a) => {
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

  // All accounts for balance summary (including bank-linked)
  const allAccountsList = useMemo(
    () => accountsQ.listAllAccounts(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountRows],
  )

  // Per-account manual transaction sums (only needed for manual accounts)
  const manualAccountSums = useMemo(() => {
    const sums = new Map<string, number>()
    for (const tx of items) {
      // We'll filter per-account in the summary; accumulate all here
      sums.set(tx.account_id, (sums.get(tx.account_id) ?? 0) + tx.amount)
    }
    return sums
  }, [items])

  // Balance summary: bank accounts use Teller-stored balances, manual use tx sums
  const balanceSummary = useMemo(() => {
    let deposits = 0
    let creditOwed = 0
    const perAccount: AccountDetail[] = allAccountsList.map((acct) => {
      const type = acct.type?.toLowerCase() ?? ''
      const isManual = acct.enrollment_id === 'manual'
      const isCreditType = type === 'credit' || type === 'charge'

      let balance: number
      if (isManual) {
        // Manual: derive from transaction sums
        balance = manualAccountSums.get(acct.id) ?? 0
        if (balance > 0) deposits += balance
        else creditOwed += Math.abs(balance)
      } else if (isCreditType) {
        // Credit: use ledger balance (positive = amount owed)
        balance = acct.balance_ledger ?? 0
        creditOwed += balance
      } else {
        // Depository / other: use available balance
        balance = acct.balance_available ?? acct.balance_ledger ?? 0
        deposits += balance
      }

      return {
        id: acct.id,
        name: acct.name ?? 'Account',
        institution: acct.institution,
        type: acct.type,
        balance,
        isManual,
        isCreditType,
      }
    })
    return { deposits, creditOwed, net: deposits - creditOwed, perAccount }
  }, [allAccountsList, manualAccountSums])

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
  const [accordionOpen, setAccordionOpen] = useState(false)
  const [showSearch, setShowSearch] = useState(false)

  const listRef = useRef<FlashListRef<TxListRow>>(null)
  const searchInputRef = useRef<TextInput>(null)
  const summaryHeightRef = useRef(180)
  const showSearchRef = useRef(false)
  const hasActiveFiltersRef = useRef(false)
  // Track whether the list content is shorter than the container (can't scroll)
  const listContainerHeightRef = useRef(0)
  const listContentHeightRef = useRef(0)

  useEffect(() => {
    showSearchRef.current = showSearch
  }, [showSearch])

  useEffect(() => {
    hasActiveFiltersRef.current =
      filters.search.trim() !== '' ||
      filters.datePreset !== 'all' ||
      filters.category !== 'all' ||
      filters.accountId !== 'all' ||
      filters.cashFlow !== 'all'
  }, [filters])

  const addTransactionSignal = useUiSignals((s) => s.addTransactionSignal)
  const addRef = useRef<BottomSheetModal>(null)
  const mountedSignalRef = useRef(addTransactionSignal)
  const allocRef = useRef<BottomSheetModal>(null)
  const [allocTxId, setAllocTxId] = useState<string | null>(null)
  const editRef = useRef<BottomSheetModal>(null)
  const [editTxId, setEditTxId] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<string | undefined>(() =>
    meta.getMeta(META_LAST_TELLER_SYNC_AT),
  )

  useEffect(() => {
    void (async () => {
      try {
        await load()
      } finally {
        setIsLoading(false)
      }
    })()
    loadCategories()
    loadAccounts()
  }, [load, loadCategories, loadAccounts])

  useEffect(() => {
    if (activeIndex !== 0) return
    void load()
    loadCategories()
    loadAccounts()
    setLastSync(meta.getMeta(META_LAST_TELLER_SYNC_AT))
  }, [activeIndex, load, loadCategories, loadAccounts])

  const syncStatus = useSyncStore((s) => s.status)
  useEffect(() => {
    if (syncStatus !== 'done') return
    void load()
    loadAccounts() // picks up freshly stored Teller balances
    setLastSync(meta.getMeta(META_LAST_TELLER_SYNC_AT))
  }, [syncStatus, loadAccounts])

  useEffect(() => {
    if (addTransactionSignal <= mountedSignalRef.current) return
    setTimeout(() => addRef.current?.present(), 0)
  }, [addTransactionSignal])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    void (async () => {
      try {
        const { triggerManualSync } = await import('@/src/lib/foregroundSync')
        await triggerManualSync()
        setLastSync(meta.getMeta(META_LAST_TELLER_SYNC_AT))
      } catch {
        /* offline / network / Teller error */
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

  const onDelete = useCallback((tx: TransactionRow) => {
    removeTransaction(tx.id)
  }, [removeTransaction])

  const onEdit = useCallback((tx: TransactionRow) => {
    setEditTxId(tx.id)
    setTimeout(() => editRef.current?.present(), 0)
  }, [])

  const onEditDismiss = useCallback(() => {
    setEditTxId(null)
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

  const onSearchIconPress = useCallback(() => {
    setShowSearch((prev) => {
      if (prev) return prev // hide only happens by scrolling back to top
      // Opening: scroll list so search card is visible, then focus
      setTimeout(() => {
        listRef.current?.scrollToOffset({ offset: summaryHeightRef.current, animated: true })
        setTimeout(() => searchInputRef.current?.focus(), 350)
      }, 30)
      return true
    })
  }, [])

  const maybeShowSearchForShortList = useCallback(() => {
    // If the content doesn't overflow the container the user can never scroll,
    // so reveal the search bar immediately.
    if (
      !showSearchRef.current &&
      listContentHeightRef.current > 0 &&
      listContentHeightRef.current <= listContainerHeightRef.current
    ) {
      setShowSearch(true)
    }
  }, [])

  const onListLayout = useCallback((e: { nativeEvent: { layout: { height: number } } }) => {
    listContainerHeightRef.current = e.nativeEvent.layout.height
    maybeShowSearchForShortList()
  }, [maybeShowSearchForShortList])

  const onListContentSizeChange = useCallback((_w: number, h: number) => {
    listContentHeightRef.current = h
    maybeShowSearchForShortList()
  }, [maybeShowSearchForShortList])

  const onListScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = e.nativeEvent.contentOffset.y
    // Show search once user has scrolled ~80% through the summary section
    if (!showSearchRef.current && y > summaryHeightRef.current * 0.8) {
      setShowSearch(true)
    }
    // Hide search when back near the top, but only if no active filters/search
    if (showSearchRef.current && y < 30 && !hasActiveFiltersRef.current) {
      setShowSearch(false)
    }
  }, [])

  const extraData = useMemo(
    () => ({
      f: filters,
      c: [...collapsed].sort().join('|'),
      top: topMonthKey ?? '',
      pad: listContentBottomPad,
    }),
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
      const categoryColor = tx.category ? (categoryColorMap.get(tx.category) ?? null) : null
      const leftBorderColor = categoryColor ?? (isIncome ? NEO.incomeBorder : NEO.ink)
      const acct = accountMap.get(tx.account_id)
      const accountLabel = tx.source === 'bank'
        ? [acct?.institution, acct?.name ?? tx.account_label].filter(Boolean).join(' · ')
        : (acct?.name ?? tx.account_label ?? null)
      return (
        <TransactionSwipeRow
          tx={tx}
          onAllocate={openAllocate}
          onEdit={onEdit}
          onDelete={onDelete}
        >
          <View
            style={[
              styles.txRow,
              { borderLeftWidth: 4, borderLeftColor: leftBorderColor },
            ]}
          >
            <View style={styles.txRowTop}>
              <Text style={styles.txDesc} numberOfLines={1}>
                {tx.description}
              </Text>
              <View style={styles.txAmountCol}>
                <Text
                  style={[
                    styles.txAmount,
                    tx.my_share != null
                      ? styles.txAmountExpense
                      : isIncome
                        ? styles.txAmountIncome
                        : tx.amount < 0
                          ? styles.txAmountExpense
                          : undefined,
                  ]}
                >
                  {tx.my_share != null
                    ? formatTxMoney(tx.my_share)
                    : formatTxMoney(tx.amount)}
                </Text>
                {tx.my_share != null ? (
                  <Text style={styles.txShare}>
                    full: {formatTxMoney(tx.amount)}
                  </Text>
                ) : null}
              </View>
            </View>
            <Text style={styles.txMeta}>
              {tx.effective_date ?? tx.date}
              {accountLabel ? ` · ${accountLabel}` : ''}
              {tx.category ? ` · ${tx.category}` : ''}
            </Text>
            {tx.pending === 1 ?
              <Text style={styles.txMeta}>
                <Text style={styles.txPendingTag}>{'PENDING'}</Text>
              </Text>
            : null}
          </View>
        </TransactionSwipeRow>
      )
    },
    [accountMap, categoryColorMap, collapsed, onDelete, onEdit, openAllocate, toggleMonth, topMonthKey],
  )

  const renderListHeader = useCallback(
    () => (
      <View>
        {/* ── Balance Summary ──────────────────────────────── */}
        <View
          style={styles.summarySection}
          onLayout={(e) => { summaryHeightRef.current = e.nativeEvent.layout.height }}
        >
          {/* Net balance row + search icon */}
          <View style={styles.summaryHeaderRow}>
            <View style={styles.summaryNetBlock}>
              <Text style={styles.summaryNetLabel}>NET BALANCE</Text>
              <Text style={styles.summaryNetAmount}>
                {formatBalanceMoney(balanceSummary.net)}
              </Text>
            </View>
            <Pressable
              onPress={onSearchIconPress}
              accessibilityRole="button"
              accessibilityLabel={showSearch ? 'Hide search' : 'Show search'}
            >
              {({ pressed }) => (
                <View style={[styles.searchIconBtn, pressed && { opacity: 0.7 }]}>
                  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                    <Circle cx={11} cy={11} r={7} stroke={NEO.ink} strokeWidth={2.5} />
                    <Path
                      d="M16.5 16.5 L21 21"
                      stroke={NEO.ink}
                      strokeWidth={2.5}
                      strokeLinecap="round"
                    />
                  </Svg>
                </View>
              )}
            </Pressable>
          </View>

          {/* Deposits / Credit totals */}
          <View style={styles.summaryTotalsRow}>
            <View style={styles.summaryTotalItem}>
              <Text style={styles.summaryTotalLabel}>DEPOSITS</Text>
              <Text style={styles.summaryDepositAmt}>
                +{formatBalanceMoney(balanceSummary.deposits)}
              </Text>
            </View>
            <View style={styles.summaryTotalDivider} />
            <View style={[styles.summaryTotalItem, { alignItems: 'flex-end' }]}>
              <Text style={styles.summaryTotalLabel}>CREDIT</Text>
              <Text style={styles.summaryCreditAmt}>
                -{formatBalanceMoney(balanceSummary.creditOwed)}
              </Text>
            </View>
          </View>

          {/* Accordion toggle */}
          <Pressable
            onPress={() => setAccordionOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: accordionOpen }}
            accessibilityLabel={accordionOpen ? 'Collapse accounts' : 'Expand accounts'}
          >
            {({ pressed }) => (
              <View style={[styles.accordionToggleBtn, pressed && { opacity: 0.75 }]}>
                <Text style={styles.accordionToggleText}>
                  {accordionOpen ? '▲  HIDE ACCOUNTS' : '▼  SHOW ACCOUNTS'}
                </Text>
              </View>
            )}
          </Pressable>

          {/* Account cards horizontal scroll */}
          {accordionOpen ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.accountCardsScroll}
              contentContainerStyle={styles.accountCardsContent}
            >
              {balanceSummary.perAccount.length === 0 ? (
                <View style={styles.accountCardsEmpty}>
                  <Text style={styles.accountCardsEmptyText}>No accounts yet</Text>
                </View>
              ) : (
                balanceSummary.perAccount.map((acct, i) => (
                  <AccountCard key={acct.id} account={acct} colorIndex={i} />
                ))
              )}
            </ScrollView>
          ) : null}
        </View>

        {/* ── Search / Filter Card (hidden until triggered) ── */}
        <View style={showSearch ? styles.card : styles.cardHidden} accessibilityRole="none">
          <Text style={styles.inputLabel}>Search</Text>
          <View style={styles.searchAccordionRow}>
            <View style={styles.searchCol}>
              <TextInput
                ref={searchInputRef}
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
                <Text style={styles.inputLabel}>Account</Text>
                <View style={styles.chipRow}>
                  <Chip
                    label="All"
                    selected={filters.accountId === 'all'}
                    onPress={() => setFilters((f) => ({ ...f, accountId: 'all' }))}
                  />
                  {accountOptions.map((a) => (
                    <Chip
                      key={a.id}
                      label={a.label}
                      selected={filters.accountId === a.id}
                      onPress={() => setFilters((f) => ({ ...f, accountId: a.id }))}
                    />
                  ))}
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
                    onPress={() => setFilters((f) => ({ ...f, category: '__none__' }))}
                  />
                  {categoryRows.map((c) => (
                    <Chip
                      key={c.id}
                      label={c.label}
                      selected={filters.category === c.label}
                      onPress={() => setFilters((f) => ({ ...f, category: c.label }))}
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
                      onPress={() => setFilters((f) => ({ ...f, cashFlow: key }))}
                    />
                  ))}
                </View>
              </View>
            </>
          ) : null}
        </View>
      </View>
    ),
    [
      accountOptions, accordionOpen, balanceSummary, categoryRows,
      filters, filtersExpanded, onSearchIconPress, showSearch,
    ],
  )

  return (
    <View style={styles.screen}>
      <View style={[styles.topbar, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.topbarTitle} numberOfLines={1}>
          Home
        </Text>
        <Text style={styles.topbarSub} numberOfLines={1}>
          Last sync: {formatLastSyncShort(lastSync)}
        </Text>
      </View>

      <View style={styles.body}>
        <View style={styles.listWrap}>
          {refreshing || isLoading ? (
            <FlashList
              data={[]}
              renderItem={() => null}
              ListHeaderComponent={
                <>
                  {renderListHeader()}
                  <SkeletonList count={10} />
                </>
              }
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
              contentContainerStyle={[styles.listContent, { paddingBottom: listContentBottomPad }]}
              showsVerticalScrollIndicator={false}
            />
          ) : (
            <FlashList
              ref={listRef}
              data={rows}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              getItemType={(item) => item.type}
              stickyHeaderIndices={[]}
              showsVerticalScrollIndicator={false}
              extraData={extraData}
              ListHeaderComponent={renderListHeader}
              ListEmptyComponent={
                items.length === 0 ? (
                  <EmptyState
                    variant="transactions"
                    title="No transactions yet"
                    subtitle="Add one manually or sync a bank account."
                  />
                ) : (
                  <View style={styles.emptyFiltered}>
                    <Text style={styles.empty}>No transactions match these filters.</Text>
                  </View>
                )
              }
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
              contentContainerStyle={[styles.listContent, { paddingBottom: listContentBottomPad }]}
              onScroll={onListScroll}
              scrollEventThrottle={16}
              onLayout={onListLayout}
              onContentSizeChange={onListContentSizeChange}
            />
          )}
        </View>
      </View>

      <AddTransactionBottomSheet ref={addRef} />

      <AllocationBottomSheet
        ref={allocRef}
        transactionId={allocTxId}
        onDismiss={onAllocDismiss}
      />

      <EditTransactionBottomSheet
        ref={editRef}
        transactionId={editTxId}
        onDismiss={onEditDismiss}
      />

      <Modal visible={showCustomDate} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Custom date range</Text>
            <DateInput value={customStart} onChange={setCustomStart} placeholder="Start date" style={styles.inputField} />
            <DateInput value={customEnd} onChange={setCustomEnd} placeholder="End date" style={styles.inputField} />
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
    <Pressable onPress={onPress} style={styles.chipPressable}>
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
    backgroundColor: NEO.ink,
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topbarTitle: {
    fontFamily: NEO_MONO,
    fontSize: 18,
    fontWeight: Platform.OS === 'ios' ? '800' : '700',
    color: NEO.cream,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    flexShrink: 1,
    minWidth: 0,
  },
  topbarSub: {
    fontFamily: NEO_MONO,
    fontSize: 12,
    color: NEO.sub,
    letterSpacing: 0.36,
    flexShrink: 0,
    marginLeft: 'auto',
    maxWidth: '46%',
  },
  body: {
    flex: 1,
    paddingBottom: 4,
    gap: 10,
  },
  listWrap: {
    flex: 1,
    minHeight: 120,
  },
  listContent: {
    gap: 0,
  },

  // ── Balance Summary Section ──────────────────────────
  summarySection: {
    backgroundColor: '#000000',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
    marginBottom: 10,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  summaryNetBlock: {
    flex: 1,
    minWidth: 0,
  },
  summaryNetLabel: {
    fontFamily: NEO_MONO,
    fontSize: 11,
    fontWeight: '700',
    color: '#888888',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  summaryNetAmount: {
    fontFamily: NEO_MONO,
    fontSize: 30,
    fontWeight: Platform.OS === 'ios' ? '800' : '700',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  searchIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: NEO.yellow,
    borderWidth: 3,
    borderColor: NEO.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    shadowColor: NEO.ink,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  summaryTotalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryTotalItem: {
    flex: 1,
  },
  summaryTotalLabel: {
    fontFamily: NEO_MONO,
    fontSize: 10,
    fontWeight: '700',
    color: '#666666',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  summaryDepositAmt: {
    fontFamily: NEO_MONO,
    fontSize: 16,
    fontWeight: '800',
    color: '#4ADE80',
    letterSpacing: 0.3,
  },
  summaryTotalDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#333333',
    marginHorizontal: 12,
  },
  summaryCreditAmt: {
    fontFamily: NEO_MONO,
    fontSize: 16,
    fontWeight: '800',
    color: '#F87171',
    letterSpacing: 0.3,
  },
  accordionToggleBtn: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: NEO.cream,
    backgroundColor: NEO.ink,
    marginBottom: 4,
    shadowColor: NEO.cream,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 0,
    elevation: 4,
  },
  accordionToggleText: {
    fontFamily: NEO_MONO,
    fontSize: 11,
    fontWeight: '800',
    color: NEO.cream,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  accountCardsScroll: {
    marginTop: 8,
    marginBottom: 4,
  },
  accountCardsContent: {
    paddingHorizontal: 0,
    gap: 10,
    paddingBottom: 8,
  },
  accountCardsEmpty: {
    width: 160,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333333',
    borderStyle: 'dashed',
  },
  accountCardsEmptyText: {
    fontFamily: NEO_MONO,
    fontSize: 11,
    color: '#555555',
  },

  // ── Account Card ─────────────────────────────────────
  accountCard: {
    width: 168,
    borderRadius: 12,
    padding: 14,
    justifyContent: 'space-between',
    minHeight: 104,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 5,
  },
  accountCardTypeChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 6,
  },
  accountCardTypeText: {
    fontFamily: NEO_MONO,
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  accountCardInstitution: {
    fontFamily: NEO_MONO,
    fontSize: 10,
    color: 'rgba(255,255,255,0.65)',
    marginBottom: 1,
  },
  accountCardName: {
    fontFamily: NEO_MONO,
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
    flex: 1,
    marginBottom: 8,
  },
  accountCardBalance: {
    fontFamily: NEO_MONO,
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  accountCardBalanceNeg: {
    color: '#FFD0D0',
  },

  // ── Search / Filter ───────────────────────────────────
  card: {
    borderWidth: 3,
    borderColor: NEO.ink,
    backgroundColor: NEO.cream,
    borderRadius: 0,
    padding: 10,
    marginBottom: 10,
    marginHorizontal: 12,
    shadowColor: NEO.ink,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  cardHidden: {
    height: 0,
    overflow: 'hidden',
    marginHorizontal: 12,
  },
  inputLabel: {
    fontFamily: NEO_MONO,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: NEO.ink,
    marginBottom: 2,
  },
  inputField: {
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
  filterGroup: {},
  filterGroupSpaced: {
    marginTop: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  chipPressable: {
    borderRadius: 0,
  },
  chip: {
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

  // ── Modal ─────────────────────────────────────────────
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

  // ── Month accordion ───────────────────────────────────
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
    paddingHorizontal: 12,
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

  // ── Transaction rows ──────────────────────────────────
  txRow: {
    borderWidth: 2,
    borderColor: NEO.ink,
    backgroundColor: NEO.cream,
    borderRadius: 0,
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
  txPendingTag: {
    fontFamily: NEO_MONO,
    fontSize: 11,
    fontWeight: '700',
    color: '#CC2222',
  },
  txAmountCol: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontFamily: NEO_MONO,
    fontSize: 15,
    fontWeight: '800',
    color: NEO.ink,
  },
  txAmountIncome: {
    color: NEO.incomeGreen,
  },
  txAmountExpense: {
    color: '#CC2222',
  },
  txShare: {
    fontFamily: NEO_MONO,
    fontSize: 11,
    fontWeight: '700',
    color: NEO.sub,
    marginTop: 1,
  },
  txMeta: {
    marginTop: 3,
    fontFamily: NEO_MONO,
    fontSize: 12,
    color: '#666666',
  },
  skeletonBar: {
    backgroundColor: '#D4D4C4',
    borderRadius: 2,
  },
  empty: {
    fontFamily: NEO_MONO,
    fontSize: 12,
    color: NEO.ink,
    opacity: 0.65,
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  emptyFiltered: {
    paddingHorizontal: 4,
  },
})
