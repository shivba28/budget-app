import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { TellerConnectWebView } from '@/src/components/TellerConnect/TellerConnectWebView'
import { EmptyState } from '@/src/components/EmptyState'
import { META_LAST_TELLER_SYNC_AT } from '@/src/db/constants'
import * as meta from '@/src/db/queries/appMeta'
import * as accountsQ from '@/src/db/queries/accounts'
import {
  getTellerApplicationId,
  getTellerConnectEnvironment,
  isTellerSandbox,
} from '@/src/lib/teller/connect'
import * as enrollmentStore from '@/src/lib/teller/enrollmentStore'
import {
  disconnectTellerEnrollment,
  syncTellerForEnrollment,
} from '@/src/lib/teller/sync'
import { useTellerEnrollmentsStore } from '@/src/stores/tellerEnrollmentsStore'
import { useTransactionsStore } from '@/src/stores/transactionsStore'

const CREAM  = '#FAFAF5'
const INK    = '#111111'
const MUTED  = '#E8E8E0'
const YELLOW = '#F5C842'
const RED    = '#FF5E5E'
const TEAL   = '#3BCEAC'
const MONO   = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

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
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const txLoad = useTransactionsStore((s) => s.load)
  const enrollments = useTellerEnrollmentsStore((s) => s.items)
  const refreshEnrollmentStore = useTellerEnrollmentsStore((s) => s.refresh)

  const [busy, setBusy] = useState(false)
  const [bankAccs, setBankAccs]     = useState(accountsQ.listBankLinkedAccounts())
  const [lastGlobal, setLastGlobal] = useState(meta.getMeta(META_LAST_TELLER_SYNC_AT))
  const [showTellerConnect, setShowTellerConnect]     = useState(false)
  const [repairEnrollmentId, setRepairEnrollmentId]   = useState<string | undefined>()

  const applicationId = getTellerApplicationId()
  const tellerEnv     = getTellerConnectEnvironment()

  const refreshLocal = useCallback(() => {
    refreshEnrollmentStore()
    setBankAccs(accountsQ.listBankLinkedAccounts())
    setLastGlobal(meta.getMeta(META_LAST_TELLER_SYNC_AT))
  }, [refreshEnrollmentStore])

  useEffect(() => { refreshLocal() }, [refreshLocal])

  const onSyncAll = async () => {
    setBusy(true)
    try {
      const { triggerManualSync } = await import('@/src/lib/foregroundSync')
      await triggerManualSync()
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
    accountsQ.updateAccount(accountId, { include_in_insights: value ? 1 : 0 })
    refreshLocal()
  }

  return (
    <View style={ss.screen}>
      {/* Topbar */}
      <View style={[ss.topbar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <Text style={ss.backChev}>‹</Text>
        </Pressable>
        <Text style={ss.topbarTitle}>Bank accounts</Text>
        <Text style={ss.topbarSub}>Teller</Text>
      </View>

      <ScrollView
        contentContainerStyle={[ss.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Status card */}
        <View style={ss.infoCard}>
          {busy ? <ActivityIndicator color={INK} style={{ marginBottom: 8 }} /> : null}
          <Text style={ss.infoText}>Last sync: {formatAgo(lastGlobal)}</Text>
          {/* <Text style={ss.infoText}>
            {isTellerSandbox() ? 'Sandbox mode' : 'Live mode'}
          </Text> */}
          {/* <Text style={[ss.infoText, { opacity: 0.6, marginTop: 4 }]}>
            Teller Connect runs in a WebView — use an EAS development build, not Expo Go.
          </Text> */}
        </View>

        {/* Actions */}
        <View style={ss.card}>
          {applicationId.length === 0 ? (
            <Text style={ss.missingKey}>
              Set EXPO_PUBLIC_TELLER_APP_ID to enable Teller Connect.
            </Text>
          ) : null}
          <Pressable
            onPress={() => { setRepairEnrollmentId(undefined); setShowTellerConnect(true) }}
            disabled={!applicationId.trim() || busy}
          >
            {({ pressed }) => (
              <View style={[ss.btn, ss.btnYellow, (!applicationId.trim() || busy) && ss.btnDisabled, pressed && !(!applicationId.trim() || busy) && ss.btnPressed]} pointerEvents="none">
                <Text style={ss.btnText}>Add bank account</Text>
              </View>
            )}
          </Pressable>
          <View style={{ height: 10 }} />
          <Pressable onPress={onSyncAll} disabled={busy}>
            {({ pressed }) => (
              <View style={[ss.btn, ss.btnNeutral, busy && ss.btnDisabled, pressed && !busy && ss.btnPressed]} pointerEvents="none">
                <Text style={ss.btnText}>Sync now</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Enrollments */}
        <Text style={ss.sectionLabel}>Enrollments</Text>
        {enrollments.length === 0 ? (
          <EmptyState
            variant="accounts"
            title="No linked banks yet"
            subtitle="Tap Connect Bank above to link your first account."
          />
        ) : (
          enrollments.map((e) => {
            const isDisconnected = e.status === 'disconnected'
            return (
              <View key={e.enrollmentId} style={[ss.rowCard, isDisconnected && ss.rowCardWarn]}>
                <View style={ss.rowCardHeader}>
                  <Text style={ss.enrollId} numberOfLines={1}>
                    {e.institutionName ?? e.enrollmentId}
                  </Text>
                  <View style={[ss.statusBadge, isDisconnected ? ss.statusRed : ss.statusGreen]}>
                    <Text style={ss.statusText}>
                      {isDisconnected ? 'Disconnected' : 'Connected'}
                    </Text>
                  </View>
                </View>
                <Text style={ss.rowMeta}>Last sync: {formatAgo(e.lastSyncAt)}</Text>
                {isDisconnected && e.lastError ? (
                  <Text style={ss.rowMeta}>{e.lastError}</Text>
                ) : null}
                <View style={ss.rowBtnRow}>
                  <Pressable
                    onPress={() => { setRepairEnrollmentId(e.enrollmentId); setShowTellerConnect(true) }}
                    style={{ flex: 1 }}
                  >
                    {({ pressed }) => (
                      <View style={[ss.btn, ss.btnNeutral, pressed && ss.btnPressed]} pointerEvents="none">
                        <Text style={ss.btnText}>{isDisconnected ? 'Reconnect' : 'Re-auth'}</Text>
                      </View>
                    )}
                  </Pressable>
                  <Pressable onPress={() => onDisconnect(e.enrollmentId)} style={{ flex: 1 }}>
                    {({ pressed }) => (
                      <View style={[ss.btn, ss.btnRed, pressed && ss.btnPressed]} pointerEvents="none">
                        <Text style={ss.btnText}>Disconnect</Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              </View>
            )
          })
        )}

        {/* Linked accounts */}
        <Text style={[ss.sectionLabel, { marginTop: 16 }]}>Linked accounts</Text>
        {bankAccs.length === 0 ? (
          <Text style={ss.empty}>No bank accounts synced yet.</Text>
        ) : (
          bankAccs.map((a) => (
            <View key={a.id} style={ss.rowCard}>
              <Text style={ss.accName} numberOfLines={1}>{a.name ?? a.id}</Text>
              <Text style={ss.rowMeta}>
                {[a.institution, a.type].filter(Boolean).join(' · ') || '—'}
              </Text>
              <Text style={ss.rowMeta}>Last synced: {formatAgo(a.last_synced)}</Text>
              <View style={ss.switchRow}>
                <Text style={ss.switchLabel}>Include in insights</Text>
                <Switch
                  value={a.include_in_insights === 1}
                  onValueChange={(v) => toggleInsights(a.id, v)}
                  trackColor={{ false: MUTED, true: TEAL }}
                  thumbColor={CREAM}
                  ios_backgroundColor={MUTED}
                />
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Teller Connect WebView modal */}
      {showTellerConnect && applicationId.trim().length > 0 ? (
        <Modal
          visible
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => { setShowTellerConnect(false); setRepairEnrollmentId(undefined) }}
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
            onExit={() => { setShowTellerConnect(false); setRepairEnrollmentId(undefined) }}
            onError={(err) => {
              setShowTellerConnect(false)
              setRepairEnrollmentId(undefined)
              Alert.alert('Teller Connect', err)
            }}
          />
        </Modal>
      ) : null}
    </View>
  )
}

const ss = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CREAM },
  topbar: {
    backgroundColor: INK,
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backChev: {
    fontFamily: MONO,
    fontSize: 28,
    fontWeight: '900',
    color: CREAM,
    lineHeight: 28,
  },
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
  topbarSub: {
    fontFamily: MONO,
    fontSize: 13,
    color: '#888888',
    flexShrink: 0,
    marginLeft: 'auto',
  },
  scroll: { padding: 12 },
  infoCard: {
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: MUTED,
    padding: 12,
    marginBottom: 12,
  },
  infoText: {
    fontFamily: MONO,
    fontSize: 15,
    color: INK,
    lineHeight: 20,
  },
  card: {
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: CREAM,
    padding: 14,
    marginBottom: 12,
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  missingKey: {
    fontFamily: MONO,
    fontSize: 13,
    color: RED,
    marginBottom: 10,
    lineHeight: 18,
  },
  btn: {
    borderWidth: 3,
    borderColor: INK,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  btnYellow:   { backgroundColor: YELLOW },
  btnRed:      { backgroundColor: RED },
  btnNeutral:  { backgroundColor: CREAM },
  btnDisabled: { opacity: 0.4 },
  btnPressed:  { transform: [{ translateX: 3 }, { translateY: 3 }], shadowOpacity: 0, elevation: 0 },
  btnText: {
    fontFamily: MONO,
    fontSize: 15,
    fontWeight: '800',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionLabel: {
    fontFamily: MONO,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: INK,
    marginBottom: 8,
  },
  empty: { fontFamily: MONO, fontSize: 15, color: '#666666', paddingVertical: 12 },
  rowCard: {
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: CREAM,
    padding: 14,
    marginBottom: 8,
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
    gap: 5,
  },
  rowCardWarn: { borderColor: RED },
  rowCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  enrollId: {
    fontFamily: MONO,
    fontSize: 15,
    fontWeight: '800',
    color: INK,
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    borderWidth: 2,
    borderColor: INK,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusGreen: { backgroundColor: TEAL },
  statusRed:   { backgroundColor: RED },
  statusText: {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: '800',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rowMeta: {
    fontFamily: MONO,
    fontSize: 13,
    color: '#555555',
  },
  rowBtnRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  accName: {
    fontFamily: MONO,
    fontSize: 15,
    fontWeight: '800',
    color: INK,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    borderTopWidth: 2,
    borderTopColor: INK,
    paddingTop: 10,
  },
  switchLabel: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '800',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
})
