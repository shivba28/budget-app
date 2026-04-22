import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'

import {
  BrutalBackRow,
  BrutalButton,
  BrutalCard,
  BrutalScreen,
} from '@/src/components/Brutalist'
import { TellerConnectWebView } from '@/src/components/TellerConnect/TellerConnectWebView'
import { META_LAST_TELLER_SYNC_AT } from '@/src/db/constants'
import * as meta from '@/src/db/queries/appMeta'
import * as accountsQ from '@/src/db/queries/accounts'
import {
  getTellerApplicationId,
  getTellerConnectEnvironment,
  isTellerSandbox,
} from '@/src/lib/teller/connect'
import * as enrollmentStore from '@/src/lib/teller/enrollmentStore'
import { disconnectTellerEnrollment, syncTellerAllAccounts, syncTellerForEnrollment } from '@/src/lib/teller/sync'
import { useTellerEnrollmentsStore } from '@/src/stores/tellerEnrollmentsStore'
import { useTransactionsStore } from '@/src/stores/transactionsStore'
import { tokens as themeTokens } from '@/src/theme/tokens'

function formatAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  const diff = Date.now() - t
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function BankAccountsScreen() {
  const router = useRouter()
  const txLoad = useTransactionsStore((s) => s.load)
  const enrollments = useTellerEnrollmentsStore((s) => s.items)
  const refreshEnrollmentStore = useTellerEnrollmentsStore((s) => s.refresh)

  const [busy, setBusy] = useState(false)
  const [bankAccs, setBankAccs] = useState(accountsQ.listBankLinkedAccounts())
  const [lastGlobal, setLastGlobal] = useState(meta.getMeta(META_LAST_TELLER_SYNC_AT))
  const [showTellerConnect, setShowTellerConnect] = useState(false)
  const [repairEnrollmentId, setRepairEnrollmentId] = useState<string | undefined>()

  const applicationId = getTellerApplicationId()
  const tellerEnv = getTellerConnectEnvironment()

  const refreshLocal = useCallback(() => {
    refreshEnrollmentStore()
    setBankAccs(accountsQ.listBankLinkedAccounts())
    setLastGlobal(meta.getMeta(META_LAST_TELLER_SYNC_AT))
  }, [refreshEnrollmentStore])

  useEffect(() => {
    refreshLocal()
  }, [refreshLocal])

  const onSyncAll = async () => {
    setBusy(true)
    try {
      await syncTellerAllAccounts()
      txLoad()
      refreshLocal()
    } catch (e) {
      Alert.alert('Sync failed', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const onDisconnect = (enrollmentId: string) => {
    Alert.alert(
      'Disconnect bank',
      'Removes linked accounts and their transactions from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true)
              try {
                await disconnectTellerEnrollment(enrollmentId)
                txLoad()
                refreshLocal()
              } catch (e) {
                Alert.alert('Error', e instanceof Error ? e.message : String(e))
              } finally {
                setBusy(false)
              }
            })()
          },
        },
      ],
    )
  }

  const toggleInsights = (accountId: string, value: boolean) => {
    accountsQ.updateAccount(accountId, {
      include_in_insights: value ? 1 : 0,
    })
    refreshLocal()
  }

  return (
    <BrutalScreen title="Bank accounts" subtitle="Teller · local device only">
      <ScrollView contentContainerStyle={styles.scroll}>
        <BrutalBackRow onBack={() => router.back()} />
        {busy ? (
          <ActivityIndicator color={themeTokens.color.fg} style={styles.loader} />
        ) : null}

        <Text style={styles.hint}>
          Last sync (all): {formatAgo(lastGlobal)} ·{' '}
          {isTellerSandbox()
            ? 'Sandbox: standard TLS only (no mTLS).'
            : 'Non-sandbox API may require client certs (mTLS).'}
        </Text>
        <Text style={styles.devHint}>
          Teller Connect runs in a WebView — use an EAS development client build, not Expo Go.
        </Text>

        <BrutalCard>
          {applicationId.length === 0 ? (
            <Text style={styles.muted}>
              Set EXPO_PUBLIC_TELLER_APP_ID to enable Teller Connect (same as budget-app
              VITE_TELLER_APP_ID).
            </Text>
          ) : null}
          <BrutalButton
            title="Add bank account"
            onPress={() => {
              setRepairEnrollmentId(undefined)
              setShowTellerConnect(true)
            }}
            disabled={!applicationId.trim() || busy}
          />
          <View style={styles.spacer} />
          <BrutalButton title="Sync now" variant="neutral" onPress={onSyncAll} />
        </BrutalCard>

        <Text style={styles.section}>ENROLLMENTS</Text>
        {enrollments.length === 0 ? (
          <Text style={styles.muted}>No linked banks yet.</Text>
        ) : (
          enrollments.map((e) => (
            <View key={e.enrollmentId} style={styles.card}>
              <Text style={styles.enrollTitle}>{e.enrollmentId}</Text>
              {e.institutionName ? (
                <Text style={styles.muted}>{e.institutionName}</Text>
              ) : null}
              <Text style={styles.muted}>
                Status:{' '}
                {e.status === 'disconnected'
                  ? 'Disconnected'
                  : e.status === 'connected'
                    ? 'Connected'
                    : 'Unknown'}{' '}
                · Last sync: {formatAgo(e.lastSyncAt)}
              </Text>
              {e.status === 'disconnected' && e.lastError ? (
                <Text style={styles.muted}>Reconnect required · {e.lastError}</Text>
              ) : null}
              <BrutalButton
                title={e.status === 'disconnected' ? 'Reconnect required' : 'Reconnect'}
                variant="neutral"
                onPress={() => {
                  setRepairEnrollmentId(e.enrollmentId)
                  setShowTellerConnect(true)
                }}
              />
              <View style={styles.spacer} />
              <BrutalButton
                title="Disconnect"
                variant="neutral"
                onPress={() => onDisconnect(e.enrollmentId)}
              />
            </View>
          ))
        )}

        <Text style={styles.section}>LINKED ACCOUNTS</Text>
        {bankAccs.length === 0 ? (
          <Text style={styles.muted}>No bank accounts in SQLite.</Text>
        ) : (
          bankAccs.map((a) => (
            <View key={a.id} style={styles.card}>
              <Text style={styles.accName}>{a.name ?? a.id}</Text>
              <Text style={styles.muted}>
                {a.institution ?? '—'} · {a.type ?? '—'}
              </Text>
              <Text style={styles.muted}>
                Last synced: {formatAgo(a.last_synced)}
              </Text>
              <View style={styles.row}>
                <Text style={styles.switchLabel}>Include in insights</Text>
                <Switch
                  value={a.include_in_insights === 1}
                  onValueChange={(v) => toggleInsights(a.id, v)}
                />
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {showTellerConnect && applicationId.trim().length > 0 ? (
        <Modal
          visible
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => {
            setShowTellerConnect(false)
            setRepairEnrollmentId(undefined)
          }}
        >
          <TellerConnectWebView
            applicationId={applicationId}
            environment={tellerEnv}
            enrollmentId={repairEnrollmentId}
            onSuccess={async (enrollment) => {
              setShowTellerConnect(false)
              setRepairEnrollmentId(undefined)
              setBusy(true)
              try {
                await enrollmentStore.saveEnrollment(enrollment)
                await syncTellerForEnrollment(enrollment.enrollmentId)
                txLoad()
                refreshLocal()
                Alert.alert('Linked', 'Bank enrollment saved. Transactions are syncing.')
              } catch (err) {
                Alert.alert('Connect failed', err instanceof Error ? err.message : String(err))
              } finally {
                setBusy(false)
              }
            }}
            onExit={() => {
              setShowTellerConnect(false)
              setRepairEnrollmentId(undefined)
            }}
            onError={(err) => {
              setShowTellerConnect(false)
              setRepairEnrollmentId(undefined)
              Alert.alert('Teller Connect', err)
            }}
          />
        </Modal>
      ) : null}
    </BrutalScreen>
  )
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: themeTokens.space[6] + themeTokens.space[6] },
  loader: { marginBottom: themeTokens.space[3] },
  hint: {
    fontFamily: themeTokens.font.mono,
    fontSize: 12,
    lineHeight: 18,
    opacity: 0.75,
    marginBottom: themeTokens.space[2],
  },
  devHint: {
    fontFamily: themeTokens.font.mono,
    fontSize: 11,
    lineHeight: 16,
    opacity: 0.65,
    marginBottom: themeTokens.space[4],
  },
  section: {
    marginTop: themeTokens.space[4],
    marginBottom: themeTokens.space[2],
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  spacer: { height: themeTokens.space[3] },
  muted: {
    fontFamily: themeTokens.font.mono,
    fontSize: 14,
    opacity: 0.7,
    marginBottom: themeTokens.space[2],
  },
  card: {
    borderWidth: themeTokens.border.w3,
    borderColor: themeTokens.color.border,
    borderRadius: themeTokens.radius.sm,
    padding: themeTokens.space[4],
    backgroundColor: themeTokens.color.card,
    marginBottom: themeTokens.space[3],
    gap: themeTokens.space[2],
  },
  enrollTitle: { fontWeight: '800', fontSize: 15 },
  accName: { fontWeight: '800', fontSize: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: themeTokens.space[2],
  },
  switchLabel: {
    fontFamily: themeTokens.font.mono,
    fontSize: 13,
    fontWeight: '600',
  },
})
