/**
 * Home Dashboard — balance summary, this-month snapshot, budget spotlight,
 * upcoming bills, and recent transactions with a "View all" shortcut.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { META_LAST_TELLER_SYNC_AT } from '@/src/db/constants'
import * as meta from '@/src/db/queries/appMeta'
import * as budgetsQ from '@/src/db/queries/budgets'
import { useAccountsStore } from '@/src/stores/accountsStore'
import { useBudgetsStore } from '@/src/stores/budgetsStore'
import { useCategoriesStore } from '@/src/stores/categoriesStore'
import * as accountsQ from '@/src/db/queries/accounts'
import { useTransactionsStore } from '@/src/stores/transactionsStore'
import { useTabStore } from '@/src/stores/tabStore'
import { useSyncStore } from '@/src/stores/syncStore'
import { getUpcomingBills, scheduleRecurringBillReminders, type UpcomingBill } from '@/src/lib/notifications'

const NEO = {
  cream: '#FAFAF5',
  ink: '#111111',
  yellow: '#F5C842',
  sub: '#aaaaaa',
  incomeGreen: '#3B6D11',
  creditRed: '#CC2222',
  muted: '#E8E8E0',
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

// ── helpers ────────────────────────────────────────────────────────────────

function fmtCurrency(n: number, sign = false): string {
  const fmt = new Intl.NumberFormat(undefined, {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
  if (sign) return n >= 0 ? `+${fmt.format(n)}` : `-${fmt.format(Math.abs(n))}`
  return fmt.format(n)
}

function formatLastSync(iso?: string): string {
  if (!iso) return 'Never synced'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 'Unknown'
  const diff = Date.now() - t
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7)
}

function formatTxMoney(amount: number): string {
  const fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return amount >= 0 ? `+${fmt.format(Math.abs(amount))}` : `-${fmt.format(Math.abs(amount))}`
}

// ── Sub-components ─────────────────────────────────────────────────────────

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
  const isNeg = account.balance < 0
  const typeLabel = account.isCreditType ? 'CREDIT' : 'BANK'
  return (
    <View style={[styles.accountCard, { backgroundColor: color }]}>
      <View style={styles.accountCardChip}>
        <Text style={styles.accountCardChipText}>{typeLabel}</Text>
      </View>
      {account.institution ? <Text style={styles.accountCardInst} numberOfLines={1}>{account.institution}</Text> : null}
      <Text style={styles.accountCardName} numberOfLines={2}>{account.name}</Text>
      <Text style={[styles.accountCardBalance, isNeg && { color: '#FFD0D0' }]}>
        {isNeg ? '-' : '+'}{fmtCurrency(Math.abs(account.balance))}
      </Text>
    </View>
  )
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>
}

/** Neo-brutalist action button used in section headers (Edit, View all, etc.) */
function ActionBtn({ label, icon, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <View style={[styles.actionBtn, pressed && styles.actionBtnPressed]} pointerEvents="none">
          <Text style={styles.actionBtnText}>{label}</Text>
          <Ionicons name={icon} size={11} color={NEO.ink} />
        </View>
      )}
    </Pressable>
  )
}

// ── Main Screen ────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const activeIndex = useTabStore((s) => s.activeIndex)

  const items = useTransactionsStore((s) => s.items)
  const load = useTransactionsStore((s) => s.load)
  const categoryRows = useCategoriesStore((s) => s.items)
  const loadCategories = useCategoriesStore((s) => s.load)
  const accountRows = useAccountsStore((s) => s.items)
  const loadAccounts = useAccountsStore((s) => s.load)
  const totalCap = useBudgetsStore((s) => s.totalCap)

  const [refreshing, setRefreshing] = useState(false)
  const [lastSync, setLastSync] = useState<string | undefined>(() => meta.getMeta(META_LAST_TELLER_SYNC_AT))
  const [accordionOpen, setAccordionOpen] = useState(false)
  const [upcomingBills, setUpcomingBills] = useState<UpcomingBill[]>([])

  const allAccountsList = useMemo(() => accountsQ.listAllAccounts(), [accountRows])

  // ── Balance summary ──────────────────────────────────────────────────────
  const manualAccountSums = useMemo(() => {
    const sums = new Map<string, number>()
    for (const tx of items) sums.set(tx.account_id, (sums.get(tx.account_id) ?? 0) + tx.amount)
    return sums
  }, [items])

  const balanceSummary = useMemo(() => {
    let deposits = 0, creditOwed = 0
    const perAccount: AccountDetail[] = []
    for (const acct of allAccountsList) {
      const type = acct.type?.toLowerCase() ?? ''
      const isManual = acct.enrollment_id === 'manual'
      const isCreditType = type === 'credit' || type === 'charge'
      let balance: number
      if (isManual) {
        balance = manualAccountSums.get(acct.id) ?? 0
        if (balance > 0) deposits += balance; else creditOwed += Math.abs(balance)
        continue
      } else if (isCreditType) {
        balance = acct.balance_ledger ?? 0
        creditOwed += balance
      } else {
        balance = acct.balance_available ?? acct.balance_ledger ?? 0
        deposits += balance
      }
      perAccount.push({ id: acct.id, name: acct.name ?? 'Account', institution: acct.institution, type: acct.type, balance, isManual, isCreditType })
    }
    return { deposits, creditOwed, net: deposits - creditOwed, perAccount }
  }, [allAccountsList, manualAccountSums])

  // ── This month ───────────────────────────────────────────────────────────
  const thisMonthStats = useMemo(() => {
    const mk = currentMonthKey()
    let income = 0, spend = 0
    for (const tx of items) {
      const txMonth = (tx.effective_date ?? tx.date)?.slice(0, 7)
      if (txMonth !== mk) continue
      const amt = tx.my_share != null ? tx.my_share : tx.amount
      if (amt > 0) income += amt
      else spend += Math.abs(amt)
    }
    return { income, spend, net: income - spend }
  }, [items])

  // ── Budget spotlight ─────────────────────────────────────────────────────
  const { budgetSpotlight, capSpotlight } = useMemo(() => {
    const mk = currentMonthKey()
    const specific = budgetsQ.listBudgets(mk)
    const budgets = specific.length > 0 ? specific : budgetsQ.listBudgets('default')

    // Total monthly spend (expenses only) for cap row
    let totalSpend = 0
    const spendByCat = new Map<string, number>()
    for (const tx of items) {
      const txMonth = (tx.effective_date ?? tx.date)?.slice(0, 7)
      if (txMonth !== mk) continue
      const amt = tx.my_share != null ? tx.my_share : tx.amount
      if (amt < 0) {
        const spend = Math.abs(amt)
        totalSpend += spend
        const cat = (tx.category ?? '').trim() || 'Other'
        spendByCat.set(cat, (spendByCat.get(cat) ?? 0) + spend)
      }
    }

    const capRow = totalCap != null
      ? { spent: totalSpend, limit: totalCap, pct: Math.min(1, totalSpend / Math.max(1, totalCap)) }
      : null

    const rows = budgets.length === 0 ? [] : budgets
      .map((b) => ({
        category: b.category,
        limit: b.amount,
        spent: spendByCat.get(b.category) ?? 0,
        pct: Math.min(1, (spendByCat.get(b.category) ?? 0) / Math.max(1, b.amount)),
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 4)

    return { budgetSpotlight: rows, capSpotlight: capRow }
  }, [items, totalCap])

  // ── Recent transactions ──────────────────────────────────────────────────
  const recentTx = useMemo(() => items.slice(0, 6), [items])

  const categoryColorMap = useMemo(
    () => new Map(categoryRows.map((c) => [c.label, c.color])),
    [categoryRows],
  )

  const accountMap = useMemo(
    () => new Map(accountsQ.listAllAccounts().map((a) => [a.id, { name: a.name, institution: a.institution }])),
    [accountRows],
  )

  // ── Load / refresh ───────────────────────────────────────────────────────
  const refreshUpcomingBills = useCallback(() => {
    try {
      setUpcomingBills(getUpcomingBills(30))
      void scheduleRecurringBillReminders()
    } catch { /* table not ready */ }
  }, [])

  useEffect(() => {
    void load()
    loadCategories()
    loadAccounts()
    refreshUpcomingBills()
  }, [load, loadCategories, loadAccounts, refreshUpcomingBills])

  useEffect(() => {
    if (activeIndex !== 0) return
    void load()
    loadCategories()
    loadAccounts()
    setLastSync(meta.getMeta(META_LAST_TELLER_SYNC_AT))
    refreshUpcomingBills()
  }, [activeIndex, load, loadCategories, loadAccounts, refreshUpcomingBills])

  const syncStatus = useSyncStore((s) => s.status)
  useEffect(() => {
    if (syncStatus !== 'done') return
    void load()
    loadAccounts()
    setLastSync(meta.getMeta(META_LAST_TELLER_SYNC_AT))
    refreshUpcomingBills()
  }, [syncStatus, loadAccounts, refreshUpcomingBills])

  // Pull-to-refresh: use triggerManualSyncNow so the Live Activity / SyncProgressBar
  // fires correctly even if a startup auto-sync is still in progress. It waits for
  // any in-progress sync to finish (up to 15 s) before triggering a fresh one so
  // the user always gets a Live Activity for their pull.
  const onRefresh = useCallback(() => {
    setRefreshing(true)
    void (async () => {
      try {
        const { triggerManualSyncNow } = await import('@/src/lib/foregroundSync')
        await triggerManualSyncNow()
        setLastSync(meta.getMeta(META_LAST_TELLER_SYNC_AT))
      } catch { /* offline or no accounts */ } finally {
        void load()
        loadCategories()
        loadAccounts()
        refreshUpcomingBills()
        setRefreshing(false)
      }
    })()
  }, [load, loadCategories, loadAccounts, refreshUpcomingBills])

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>
      {/* Top bar */}
      <View style={[styles.topbar, { paddingTop: insets.top + 10 }]}>
        <Text style={[styles.topbarTitle, { flex: 1 }]}>Home</Text>
        <View style={styles.syncBadge}>
          <Ionicons name="sync-outline" size={11} color={NEO.sub} />
          <Text style={styles.syncBadgeText}>{formatLastSync(lastSync)}</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >

        {/* ── 1. Balance Summary ─────────────────────────────── */}
        <View style={styles.balanceSection}>
          <View style={styles.balanceHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.balanceLabel}>NET BALANCE</Text>
              <Text style={styles.balanceAmount}>{fmtCurrency(balanceSummary.net)}</Text>
            </View>
          </View>

          <View style={styles.balanceTotalsRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.balanceTotalLabel}>DEPOSITS</Text>
              <Text style={styles.depositsAmt}>+{fmtCurrency(balanceSummary.deposits)}</Text>
            </View>
            <View style={styles.balanceDivider} />
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={styles.balanceTotalLabel}>CREDIT OWED</Text>
              <Text style={styles.creditAmt}>-{fmtCurrency(balanceSummary.creditOwed)}</Text>
            </View>
          </View>

          {/* Account cards accordion */}
          <Pressable onPress={() => setAccordionOpen((v) => !v)}>
            {({ pressed }) => (
              <View style={[styles.accordionBtn, pressed && { opacity: 0.75 }]} pointerEvents="none">
                <Ionicons
                  name={accordionOpen ? 'chevron-up' : 'chevron-down'}
                  size={12}
                  color={NEO.cream}
                />
                <Text style={styles.accordionBtnText}>
                  {accordionOpen ? 'HIDE ACCOUNTS' : 'SHOW ACCOUNTS'}
                </Text>
              </View>
            )}
          </Pressable>

          {accordionOpen ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: 10, marginBottom: 4 }}
              contentContainerStyle={{ gap: 10, paddingBottom: 6 }}
            >
              {balanceSummary.perAccount.length === 0 ? (
                <View style={styles.noAccountsCard}>
                  <Text style={styles.noAccountsText}>No linked accounts</Text>
                </View>
              ) : balanceSummary.perAccount.map((acct, i) => (
                <AccountCard key={acct.id} account={acct} colorIndex={i} />
              ))}
            </ScrollView>
          ) : null}
        </View>

        {/* ── 2. This Month Snapshot ─────────────────────────── */}
        <View style={styles.section}>
          <SectionTitle>THIS MONTH</SectionTitle>
          <View style={styles.thisMonthCard}>
            <View style={styles.thisMonthRow}>
              <View style={styles.thisMonthStat}>
                <Text style={styles.thisMonthStatLabel}>INCOME</Text>
                <Text style={[styles.thisMonthStatValue, { color: '#4ADE80' }]}>
                  +{fmtCurrency(thisMonthStats.income)}
                </Text>
              </View>
              <View style={styles.thisMonthDivider} />
              <View style={[styles.thisMonthStat, { alignItems: 'center' }]}>
                <Text style={styles.thisMonthStatLabel}>SPEND</Text>
                <Text style={[styles.thisMonthStatValue, { color: '#F87171' }]}>
                  -{fmtCurrency(thisMonthStats.spend)}
                </Text>
              </View>
              <View style={styles.thisMonthDivider} />
              <View style={[styles.thisMonthStat, { alignItems: 'flex-end' }]}>
                <Text style={styles.thisMonthStatLabel}>NET</Text>
                <Text style={[
                  styles.thisMonthStatValue,
                  { color: thisMonthStats.net >= 0 ? '#4ADE80' : '#F87171' },
                ]}>
                  {thisMonthStats.net >= 0 ? '+' : '-'}{fmtCurrency(Math.abs(thisMonthStats.net))}
                </Text>
              </View>
            </View>
            {/* Spend vs income progress bar */}
            {thisMonthStats.income > 0 || thisMonthStats.spend > 0 ? (
              <View style={styles.monthBar}>
                <View
                  style={[
                    styles.monthBarIncome,
                    { flex: thisMonthStats.income / Math.max(1, thisMonthStats.income + thisMonthStats.spend) },
                  ]}
                />
                <View
                  style={[
                    styles.monthBarSpend,
                    { flex: thisMonthStats.spend / Math.max(1, thisMonthStats.income + thisMonthStats.spend) },
                  ]}
                />
              </View>
            ) : null}
          </View>
        </View>

        {/* ── 3. Budget Spotlight ────────────────────────────── */}
        {(budgetSpotlight.length > 0 || capSpotlight != null) ? (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <SectionTitle>BUDGET SPOTLIGHT</SectionTitle>
              <ActionBtn
                label="Edit"
                icon="pencil-outline"
                onPress={() => router.push('/app/budgets')}
              />
            </View>
            <View style={styles.budgetCard}>
              {/* Monthly cap row — always first */}
              {capSpotlight != null ? (() => {
                const pctLabel = Math.round(capSpotlight.pct * 100)
                const barColor = capSpotlight.pct >= 1 ? '#F87171' : capSpotlight.pct >= 0.8 ? '#FBBF24' : '#4ADE80'
                return (
                  <View style={[styles.budgetRow, styles.capRow]}>
                    <View style={styles.budgetRowTop}>
                      <View style={styles.capLabelRow}>
                        <Ionicons name="wallet-outline" size={12} color="#666666" />
                        <Text style={[styles.budgetCat, styles.capLabel]}>MONTHLY CAP</Text>
                      </View>
                      <Text style={[styles.budgetPct, { color: barColor }]}>{pctLabel}%</Text>
                    </View>
                    <View style={styles.budgetBarBg}>
                      <View style={[styles.budgetBarFill, { width: `${Math.min(100, pctLabel)}%`, backgroundColor: barColor }]} />
                    </View>
                    <View style={styles.budgetAmtRow}>
                      <Text style={styles.budgetSpent}>{fmtCurrency(capSpotlight.spent)} spent</Text>
                      <Text style={styles.budgetLimit}>of {fmtCurrency(capSpotlight.limit)}</Text>
                    </View>
                  </View>
                )
              })() : null}

              {/* Category budget rows */}
              {budgetSpotlight.map((b, i) => {
                const pctLabel = Math.round(b.pct * 100)
                const barColor = b.pct >= 1 ? '#F87171' : b.pct >= 0.8 ? '#FBBF24' : '#4ADE80'
                const hasBorder = capSpotlight != null || i > 0
                return (
                  <View key={`${b.category}-${i}`} style={[styles.budgetRow, hasBorder && styles.budgetRowBorder]}>
                    <View style={styles.budgetRowTop}>
                      <Text style={styles.budgetCat} numberOfLines={1}>{b.category}</Text>
                      <Text style={[styles.budgetPct, { color: barColor }]}>{pctLabel}%</Text>
                    </View>
                    <View style={styles.budgetBarBg}>
                      <View style={[styles.budgetBarFill, { width: `${Math.min(100, pctLabel)}%`, backgroundColor: barColor }]} />
                    </View>
                    <View style={styles.budgetAmtRow}>
                      <Text style={styles.budgetSpent}>{fmtCurrency(b.spent)} spent</Text>
                      <Text style={styles.budgetLimit}>of {fmtCurrency(b.limit)}</Text>
                    </View>
                  </View>
                )
              })}
            </View>
          </View>
        ) : null}

        {/* ── 4. Upcoming Bills ──────────────────────────────── */}
        {upcomingBills.length > 0 ? (
          <View style={styles.section}>
            <SectionTitle>UPCOMING BILLS</SectionTitle>
            <View style={styles.upcomingCard}>
              {upcomingBills.map((bill, i) => (
                <View key={bill.ruleId} style={[styles.upcomingRow, i > 0 && styles.upcomingRowBorder]}>
                  <View style={[
                    styles.upcomingDueBadge,
                    bill.daysUntilDue === 0 ? { backgroundColor: '#F87171' }
                      : bill.daysUntilDue <= 3 ? { backgroundColor: '#FBBF24' }
                      : { backgroundColor: '#D1D5DB' },
                  ]}>
                    <Text style={styles.upcomingDueText}>
                      {bill.daysUntilDue === 0 ? 'TODAY'
                        : bill.daysUntilDue === 1 ? 'TMRW'
                        : `${bill.daysUntilDue}D`}
                    </Text>
                  </View>
                  <View style={styles.upcomingMid}>
                    <Text style={styles.upcomingDesc} numberOfLines={1}>{bill.description}</Text>
                    {bill.category ? <Text style={styles.upcomingCat}>{bill.category}</Text> : null}
                  </View>
                  <Text style={[
                    styles.upcomingAmt,
                    bill.amount < 0 ? { color: NEO.creditRed } : { color: NEO.incomeGreen },
                  ]}>
                    {bill.amount < 0 ? '-' : '+'}{fmtCurrency(Math.abs(bill.amount))}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* ── 5. Recent Activity ────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <SectionTitle>RECENT ACTIVITY</SectionTitle>
            <ActionBtn
              label="View all"
              icon="arrow-forward"
              onPress={() => router.push('/app/all-transactions')}
            />
          </View>

          {recentTx.length === 0 ? (
            <View style={styles.recentCard}>
              <Text style={styles.emptyText}>No transactions yet.</Text>
              <Pressable
                onPress={() => router.push('/app/all-transactions')}
                style={{ marginTop: 10, alignSelf: 'flex-start' }}
              >
                {({ pressed }) => (
                  <View style={[styles.addFirstBtn, pressed && { opacity: 0.75 }]} pointerEvents="none">
                    <Text style={styles.addFirstBtnText}>Add transaction</Text>
                  </View>
                )}
              </Pressable>
            </View>
          ) : (
            <View style={styles.recentCard}>
              {recentTx.map((tx, i) => {
                const isIncome = tx.amount > 0
                const catColor = tx.category ? (categoryColorMap.get(tx.category) ?? null) : null
                const borderColor = catColor ?? (isIncome ? NEO.yellow : NEO.ink)
                const acct = accountMap.get(tx.account_id)
                const acctLabel = tx.source === 'bank'
                  ? [acct?.institution, acct?.name ?? tx.account_label].filter(Boolean).join(' · ')
                  : (acct?.name ?? tx.account_label ?? null)
                return (
                  <View
                    key={tx.id ?? String(i)}
                    style={[styles.recentRow, i > 0 && styles.recentRowBorder, { borderLeftColor: borderColor }]}
                  >
                    <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                      <Text style={styles.recentDesc} numberOfLines={1}>{tx.description}</Text>
                      <Text style={styles.recentMeta} numberOfLines={1}>
                        {tx.effective_date ?? tx.date}
                        {acctLabel ? ` · ${acctLabel}` : ''}
                        {tx.category ? ` · ${tx.category}` : ''}
                      </Text>
                    </View>
                    <Text style={[
                      styles.recentAmt,
                      tx.my_share != null ? { color: NEO.creditRed }
                        : isIncome ? { color: NEO.incomeGreen }
                        : tx.amount < 0 ? { color: NEO.creditRed } : undefined,
                    ]}>
                      {tx.my_share != null ? formatTxMoney(tx.my_share) : formatTxMoney(tx.amount)}
                    </Text>
                  </View>
                )
              })}

              {/* View all button */}
              <Pressable
                onPress={() => router.push('/app/all-transactions')}
                style={{ marginTop: 10 }}
              >
                {({ pressed }) => (
                  <View style={[styles.viewAllBtn, pressed && styles.viewAllBtnPressed]} pointerEvents="none">
                    <Text style={styles.viewAllBtnText}>VIEW ALL TRANSACTIONS</Text>
                    <Ionicons name="arrow-forward" size={14} color={NEO.yellow} />
                  </View>
                )}
              </Pressable>
            </View>
          )}
        </View>

        {/* ── 6. Quick Actions ──────────────────────────────── */}
        <View style={styles.section}>
          <SectionTitle>QUICK ACTIONS</SectionTitle>
          <View style={styles.quickActions}>
            <Pressable style={{ flex: 1 }} onPress={() => router.push('/app/all-transactions')}>
              {({ pressed }) => (
                <View style={[styles.quickBtn, pressed && styles.quickBtnPressed]} pointerEvents="none">
                  <Ionicons name="add-circle-outline" size={24} color={NEO.ink} style={styles.quickBtnIcon} />
                  <Text style={styles.quickBtnLabel}>Add{'\n'}Transaction</Text>
                </View>
              )}
            </Pressable>
            <Pressable style={{ flex: 1 }} onPress={() => router.push('/app/budgets')}>
              {({ pressed }) => (
                <View style={[styles.quickBtn, pressed && styles.quickBtnPressed]} pointerEvents="none">
                  <Ionicons name="wallet-outline" size={24} color={NEO.ink} style={styles.quickBtnIcon} />
                  <Text style={styles.quickBtnLabel}>Manage{'\n'}Budgets</Text>
                </View>
              )}
            </Pressable>
            <Pressable style={{ flex: 1 }} onPress={() => router.push('/app/categories')}>
              {({ pressed }) => (
                <View style={[styles.quickBtn, pressed && styles.quickBtnPressed]} pointerEvents="none">
                  <Ionicons name="pricetag-outline" size={24} color={NEO.ink} style={styles.quickBtnIcon} />
                  <Text style={styles.quickBtnLabel}>Edit{'\n'}Categories</Text>
                </View>
              )}
            </Pressable>
            <Pressable style={{ flex: 1 }} onPress={() => router.push('/app/alerts')}>
              {({ pressed }) => (
                <View style={[styles.quickBtn, pressed && styles.quickBtnPressed]} pointerEvents="none">
                  <Ionicons name="notifications-outline" size={24} color={NEO.ink} style={styles.quickBtnIcon} />
                  <Text style={styles.quickBtnLabel}>Budget{'\n'}Alerts</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>

      </ScrollView>
    </View>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: NEO.cream },

  topbar: {
    backgroundColor: NEO.ink,
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topbarTitle: {
    fontFamily: NEO_MONO,
    fontSize: 20,
    fontWeight: Platform.OS === 'ios' ? '800' : '700',
    color: NEO.cream,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  // Sync timestamp badge shown on the right of the header
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  syncBadgeText: {
    fontFamily: NEO_MONO,
    fontSize: 11,
    color: NEO.sub,
    letterSpacing: 0.3,
  },

  scroll: {
    paddingTop: 0,
  },

  section: {
    paddingHorizontal: 14,
    marginBottom: 6,
  },
  sectionTitle: {
    fontFamily: NEO_MONO,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: '#888888',
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },

  // ── Neo-brutalist action button (Edit, View all, etc.) ───────────────
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 2,
    borderColor: NEO.ink,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: NEO.cream,
    shadowColor: NEO.ink,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
    marginTop: 14,
  },
  actionBtnPressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
    shadowOpacity: 0,
    elevation: 0,
  },
  actionBtnText: {
    fontFamily: NEO_MONO,
    fontSize: 11,
    fontWeight: '800',
    color: NEO.ink,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Balance Section ──────────────────────────────────
  balanceSection: {
    backgroundColor: '#000000',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    marginBottom: 6,
  },
  balanceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  balanceLabel: {
    fontFamily: NEO_MONO,
    fontSize: 11,
    fontWeight: '700',
    color: '#888888',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  balanceAmount: {
    fontFamily: NEO_MONO,
    fontSize: 32,
    fontWeight: Platform.OS === 'ios' ? '800' : '700',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  balanceTotalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  balanceTotalLabel: {
    fontFamily: NEO_MONO,
    fontSize: 9,
    fontWeight: '700',
    color: '#666666',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  depositsAmt: {
    fontFamily: NEO_MONO,
    fontSize: 15,
    fontWeight: '800',
    color: '#4ADE80',
    letterSpacing: 0.3,
  },
  balanceDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#333333',
    marginHorizontal: 16,
  },
  creditAmt: {
    fontFamily: NEO_MONO,
    fontSize: 15,
    fontWeight: '800',
    color: '#F87171',
    letterSpacing: 0.3,
  },
  accordionBtn: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: NEO.cream,
    backgroundColor: NEO.ink,
  },
  accordionBtnText: {
    fontFamily: NEO_MONO,
    fontSize: 11,
    fontWeight: '800',
    color: NEO.cream,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  // ── Account cards ────────────────────────────────────
  accountCard: {
    width: 160,
    borderRadius: 12,
    padding: 12,
    justifyContent: 'space-between',
    minHeight: 96,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  accountCardChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginBottom: 4,
  },
  accountCardChipText: {
    fontFamily: NEO_MONO,
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  accountCardInst: {
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
    marginBottom: 6,
  },
  accountCardBalance: {
    fontFamily: NEO_MONO,
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
  },
  noAccountsCard: {
    width: 150,
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333333',
    borderStyle: 'dashed',
    borderRadius: 8,
  },
  noAccountsText: {
    fontFamily: NEO_MONO,
    fontSize: 11,
    color: '#555555',
  },

  // ── This Month ────────────────────────────────────────
  thisMonthCard: {
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
  thisMonthRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  thisMonthStat: { flex: 1 },
  thisMonthDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#DDDDDD',
    marginHorizontal: 10,
    alignSelf: 'center',
  },
  thisMonthStatLabel: {
    fontFamily: NEO_MONO,
    fontSize: 9,
    fontWeight: '800',
    color: '#888888',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  thisMonthStatValue: {
    fontFamily: NEO_MONO,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  monthBar: {
    height: 6,
    flexDirection: 'row',
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: '#E8E8E0',
  },
  monthBarIncome: {
    backgroundColor: '#4ADE80',
    borderRadius: 3,
  },
  monthBarSpend: {
    backgroundColor: '#F87171',
    borderRadius: 3,
  },

  // ── Budget Spotlight ──────────────────────────────────
  budgetCard: {
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
  budgetRow: { paddingVertical: 8 },
  budgetRowBorder: { borderTopWidth: 1, borderTopColor: '#E8E8E0' },
  capRow: { backgroundColor: '#F5F5EE' },
  capLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  capLabel: { fontSize: 11, color: '#666666', fontWeight: '700' },
  budgetRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  budgetCat: {
    fontFamily: NEO_MONO,
    fontSize: 13,
    fontWeight: '800',
    color: NEO.ink,
    flex: 1,
    marginRight: 6,
  },
  budgetPct: {
    fontFamily: NEO_MONO,
    fontSize: 13,
    fontWeight: '800',
    flexShrink: 0,
  },
  budgetBarBg: {
    height: 8,
    backgroundColor: '#E8E8E0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#D4D4C4',
  },
  budgetBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  budgetAmtRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  budgetSpent: { fontFamily: NEO_MONO, fontSize: 10, color: '#666666' },
  budgetLimit: { fontFamily: NEO_MONO, fontSize: 10, color: '#888888' },

  // ── Upcoming Bills ────────────────────────────────────
  upcomingCard: {
    borderWidth: 3,
    borderColor: NEO.ink,
    backgroundColor: NEO.cream,
    shadowColor: NEO.ink,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  upcomingRowBorder: { borderTopWidth: 1, borderTopColor: '#E8E8E0' },
  upcomingDueBadge: {
    width: 40,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  upcomingDueText: {
    fontFamily: NEO_MONO,
    fontSize: 9,
    fontWeight: '800',
    color: NEO.ink,
    letterSpacing: 0.5,
  },
  upcomingMid: { flex: 1, minWidth: 0 },
  upcomingDesc: {
    fontFamily: NEO_MONO,
    fontSize: 13,
    fontWeight: '800',
    color: NEO.ink,
  },
  upcomingCat: {
    fontFamily: NEO_MONO,
    fontSize: 10,
    color: '#888888',
    marginTop: 1,
  },
  upcomingAmt: {
    fontFamily: NEO_MONO,
    fontSize: 13,
    fontWeight: '800',
    flexShrink: 0,
  },

  // ── Recent Activity ───────────────────────────────────
  recentCard: {
    borderWidth: 3,
    borderColor: NEO.ink,
    backgroundColor: NEO.cream,
    padding: 0,
    shadowColor: NEO.ink,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
    overflow: 'hidden',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingRight: 12,
    paddingLeft: 10,
    borderLeftWidth: 4,
  },
  recentRowBorder: { borderTopWidth: 1, borderTopColor: '#E8E8E0' },
  recentDesc: {
    fontFamily: NEO_MONO,
    fontSize: 13,
    fontWeight: '800',
    color: NEO.ink,
  },
  recentMeta: {
    fontFamily: NEO_MONO,
    fontSize: 11,
    color: '#777777',
    marginTop: 2,
  },
  recentAmt: {
    fontFamily: NEO_MONO,
    fontSize: 14,
    fontWeight: '800',
    color: NEO.ink,
    flexShrink: 0,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 12,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: NEO.ink,
    backgroundColor: NEO.ink,
    paddingVertical: 10,
    shadowColor: NEO.ink,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  viewAllBtnPressed: {
    transform: [{ translateX: 3 }, { translateY: 3 }],
    shadowOpacity: 0,
    elevation: 0,
  },
  viewAllBtnText: {
    fontFamily: NEO_MONO,
    fontSize: 12,
    fontWeight: '800',
    color: NEO.yellow,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // ── Quick Actions ─────────────────────────────────────
  quickActions: {
    flexDirection: 'row',
    gap: 8,
  },
  quickBtn: {
    borderWidth: 3,
    borderColor: NEO.ink,
    backgroundColor: NEO.cream,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: NEO.ink,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  quickBtnPressed: {
    transform: [{ translateX: 3 }, { translateY: 3 }],
    shadowOpacity: 0,
    elevation: 0,
  },
  quickBtnIcon: { marginBottom: 4 },
  quickBtnLabel: {
    fontFamily: NEO_MONO,
    fontSize: 9,
    fontWeight: '800',
    color: NEO.ink,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Misc ─────────────────────────────────────────────
  emptyText: {
    fontFamily: NEO_MONO,
    fontSize: 13,
    color: '#888888',
    padding: 12,
  },
  addFirstBtn: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: NEO.ink,
    backgroundColor: NEO.yellow,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    shadowColor: NEO.ink,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  addFirstBtnText: {
    fontFamily: NEO_MONO,
    fontSize: 13,
    fontWeight: '800',
    color: NEO.ink,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
})
