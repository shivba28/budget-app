import { FlashList } from '@shopify/flash-list'
import { BottomSheetModal } from '@gorhom/bottom-sheet'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'

import { BrutalButton, BrutalScreen, BrutalTextField } from '@/src/components/Brutalist'
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
import { buildGroupedRows, type TxListRow } from '@/src/lib/transactions/listModel'
import { useCategoriesStore } from '@/src/stores/categoriesStore'
import { useTransactionsStore } from '@/src/stores/transactionsStore'
import { tokens } from '@/src/theme/tokens'

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  const d = new Date(y, m - 1, 1)
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' })
}

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'all', label: 'All dates' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_30', label: '30 days' },
  { key: 'this_year', label: 'This year' },
]

export default function TransactionsScreen() {
  const router = useRouter()
  const items = useTransactionsStore((s) => s.items)
  const load = useTransactionsStore((s) => s.load)
  const categoryRows = useCategoriesStore((s) => s.items)
  const loadCategories = useCategoriesStore((s) => s.load)

  const [refreshing, setRefreshing] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [filters, setFilters] = useState<TransactionListFilters>({
    search: '',
    datePreset: 'all',
    category: 'all',
    cashFlow: 'all',
    source: 'all',
    includeUnconfirmedPending: false,
  })

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

  const { rows, stickyHeaderIndices } = useMemo(
    () => buildGroupedRows(filtered, collapsed),
    [filtered, collapsed],
  )

  const toggleMonth = useCallback((monthKey: string) => {
    setCollapsed((prev) => {
      const n = new Set(prev)
      if (n.has(monthKey)) n.delete(monthKey)
      else n.add(monthKey)
      return n
    })
  }, [])

  const openAllocate = useCallback((tx: TransactionRow) => {
    setAllocTxId(tx.id)
    setTimeout(() => allocRef.current?.present(), 0)
  }, [])

  const onAllocDismiss = useCallback(() => {
    setAllocTxId(null)
  }, [])

  const setPreset = (datePreset: DatePreset) =>
    setFilters((f) => ({ ...f, datePreset }))

  const extraData = useMemo(
    () => ({
      c: [...collapsed].sort().join('|'),
      f: filters,
    }),
    [collapsed, filters],
  )

  const renderItem = useCallback(
    ({ item }: { item: TxListRow }) => {
      if (item.type === 'header') {
        const isCollapsed = collapsed.has(item.monthKey)
        return (
          <Pressable
            onPress={() => toggleMonth(item.monthKey)}
            style={({ pressed }) => [
              styles.sectionHeader,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.sectionTitle}>
              {formatMonthLabel(item.monthKey)}
            </Text>
            <View style={styles.sectionRight}>
              <Text style={styles.sectionCount}>{item.count}</Text>
              <Text style={styles.chev}>{isCollapsed ? '▶' : '▼'}</Text>
            </View>
          </Pressable>
        )
      }
      const tx = item.tx
      return (
        <TransactionSwipeRow
          tx={tx}
          onPress={() => router.push(`/app/transaction-edit/${tx.id}`)}
          onAllocate={openAllocate}
        >
          <View style={styles.rowInner}>
            <View style={styles.rowTop}>
              <Text style={styles.desc} numberOfLines={1}>
                {tx.description}
              </Text>
              <Text style={styles.amount}>
                {tx.amount >= 0 ? '+' : ''}
                {tx.amount.toFixed(2)}
              </Text>
            </View>
            <Text style={styles.meta}>
              {tx.effective_date ?? tx.date}
              {tx.category ? ` · ${tx.category}` : ''}
              {tx.pending === 1 ? ' · pending' : ''}
            </Text>
          </View>
        </TransactionSwipeRow>
      )
    },
    [collapsed, openAllocate, router, toggleMonth],
  )

  const renderListHeader = useCallback(
    () => (
      <View style={styles.headerBlock}>
        <BrutalTextField
          label="Search"
          value={filters.search}
          onChangeText={(search) => setFilters((f) => ({ ...f, search }))}
          placeholder="Description or label"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.chipSection}>DATE</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {DATE_PRESETS.map((p) => (
            <Chip
              key={p.key}
              label={p.label}
              selected={filters.datePreset === p.key}
              onPress={() => setPreset(p.key)}
            />
          ))}
        </ScrollView>
        <Text style={styles.chipSection}>CATEGORY</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          <Chip
            label="All"
            selected={filters.category === 'all'}
            onPress={() =>
              setFilters((f) => ({ ...f, category: 'all' }))
            }
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
        </ScrollView>
        <Text style={styles.chipSection}>FLOW</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
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
        </ScrollView>
        <Text style={styles.chipSection}>SOURCE</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {(
            [
              ['all', 'All'],
              ['manual', 'Manual'],
              ['bank', 'Bank'],
            ] as const
          ).map(([key, label]) => (
            <Chip
              key={key}
              label={label}
              selected={filters.source === key}
              onPress={() =>
                setFilters((f) => ({ ...f, source: key }))
              }
            />
          ))}
        </ScrollView>
        <Chip
          label={
            filters.includeUnconfirmedPending
              ? 'Showing unposted'
              : 'Hide unposted'
          }
          selected={filters.includeUnconfirmedPending}
          onPress={() =>
            setFilters((f) => ({
              ...f,
              includeUnconfirmedPending: !f.includeUnconfirmedPending,
            }))
          }
        />
      </View>
    ),
    [categoryRows, filters],
  )

  return (
    <BrutalScreen
      title="Transactions"
      subtitle={
        lastSync
          ? `Last bank sync: ${new Date(lastSync).toLocaleString()}`
          : 'Browse, filter, allocate · pull to sync banks'
      }
    >
      <View style={styles.root}>
        <FlashList
          data={rows}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          getItemType={(item) => item.type}
          stickyHeaderIndices={stickyHeaderIndices}
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
        <View style={styles.footer}>
          <BrutalButton
            title="Add transaction"
            onPress={() => router.push('/app/transaction-new')}
          />
        </View>
      </View>
      <AllocationBottomSheet
        ref={allocRef}
        transactionId={allocTxId}
        onDismiss={onAllocDismiss}
      />
    </BrutalScreen>
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
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipOn,
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: {
    paddingBottom: tokens.space[6],
  },
  headerBlock: {
    paddingBottom: tokens.space[4],
    gap: tokens.space[2],
  },
  chipSection: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: tokens.color.fg,
    marginTop: tokens.space[3],
  },
  chipRow: {
    flexDirection: 'row',
    gap: tokens.space[2],
    paddingVertical: tokens.space[1],
  },
  chip: {
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[2],
    backgroundColor: tokens.color.card,
  },
  chipOn: {
    backgroundColor: tokens.color.accent,
  },
  chipText: {
    fontWeight: '800',
    fontSize: 12,
    color: tokens.color.fg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: tokens.space[3],
    paddingHorizontal: tokens.space[2],
    backgroundColor: tokens.color.muted,
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    marginBottom: tokens.space[2],
  },
  sectionTitle: {
    fontWeight: '900',
    fontSize: 16,
    color: tokens.color.fg,
  },
  sectionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[3],
  },
  sectionCount: {
    fontFamily: tokens.font.mono,
    fontSize: 13,
    color: tokens.color.fg,
  },
  chev: {
    fontSize: 16,
    fontWeight: '900',
  },
  rowInner: {
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.card,
    padding: tokens.space[4],
    marginBottom: tokens.space[2],
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.space[3],
  },
  desc: {
    flex: 1,
    fontWeight: '700',
    color: tokens.color.fg,
    fontSize: 15,
  },
  amount: {
    fontFamily: tokens.font.mono,
    fontWeight: '700',
    color: tokens.color.fg,
    fontSize: 15,
  },
  meta: {
    marginTop: tokens.space[2],
    fontFamily: tokens.font.mono,
    fontSize: 12,
    color: tokens.color.fg,
    opacity: 0.65,
  },
  empty: {
    fontFamily: tokens.font.mono,
    color: tokens.color.fg,
    opacity: 0.7,
    paddingVertical: tokens.space[4],
  },
  footer: {
    paddingTop: tokens.space[3],
  },
})
