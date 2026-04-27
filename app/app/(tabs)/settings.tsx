import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useAuthStore } from '@/src/auth/authStore'

const CREAM = '#FAFAF5'
const INK = '#111111'
const MUTED = '#E8E8E0'
const YELLOW = '#F5C842'
const RED = '#FF5E5E'
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

type SettingsLink = {
  href:
    | '/app/categories'
    | '/app/budgets'
    | '/app/manual-accounts'
    | '/app/bank-accounts'
    | '/app/alerts'
  label: string
  icon: keyof typeof Ionicons.glyphMap
}

const links: SettingsLink[] = [
  { href: '/app/categories', label: 'Categories', icon: 'pricetag-outline' },
  { href: '/app/budgets', label: 'Budgets', icon: 'bar-chart-outline' },
  { href: '/app/alerts', label: 'Budget alerts', icon: 'notifications-outline' },
  { href: '/app/manual-accounts', label: 'Manual accounts', icon: 'create-outline' },
  { href: '/app/bank-accounts', label: 'Bank accounts (Teller)', icon: 'business-outline' },
]


export default function SettingsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const signOut = useAuthStore((s) => s.signOut)
  const clearAllData = useAuthStore((s) => s.clearAllData)

  const onSignOut = () => {
    Alert.alert(
      'Reset lock',
      'This removes your PIN from this device. You will set a new PIN next.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await signOut()
              router.replace('/setup-pin')
            })()
          },
        },
      ],
    )
  }

  const onClearAllData = () => {
    Alert.alert(
      'Erase all data?',
      'This permanently deletes every transaction, account, trip or event, budget, and your PIN. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase everything',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await clearAllData()
              router.replace('/onboarding')
            })()
          },
        },
      ],
    )
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.topbar, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.topbarTitle}>Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 76 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Data card */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Data</Text>
          <Pressable
            onPress={() => router.push('/app/csv-import')}
            style={({ pressed }) => pressed && { opacity: 0.7 }}
          >
            <View style={[styles.linkRow, styles.linkRowFirst]}>
              <View style={styles.linkLeft}>
                <View style={styles.linkIconWrap}>
                  <Ionicons name="download-outline" size={20} color={INK} />
                </View>
                <Text style={styles.linkLabel}>Import</Text>
              </View>
              <Text style={styles.linkChev}>›</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => router.push('/app/export')}
            style={({ pressed }) => pressed && { opacity: 0.7 }}
          >
            <View style={styles.linkRow}>
              <View style={styles.linkLeft}>
                <View style={styles.linkIconWrap}>
                  <Ionicons name="cloud-upload-outline" size={20} color={INK} />
                </View>
                <Text style={styles.linkLabel}>Export</Text>
              </View>
              <Text style={styles.linkChev}>›</Text>
            </View>
          </Pressable>

          {links.map((l) => (
            <Pressable
              key={l.href}
              onPress={() => router.push(l.href)}
              style={({ pressed }) => pressed && { opacity: 0.7 }}
            >
              <View style={styles.linkRow}>
                <View style={styles.linkLeft}>
                  <View style={styles.linkIconWrap}>
                    <Ionicons name={l.icon} size={20} color={INK} />
                  </View>
                  <Text style={styles.linkLabel}>{l.label}</Text>
                </View>
                <Text style={styles.linkChev}>›</Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* Security card */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Security</Text>
          <Text style={styles.bodyText}>
            Unlock uses biometrics when available, with your PIN as backup.
          </Text>
          <View style={styles.spacer} />
          <Pressable onPress={onSignOut}>
            {({ pressed }) => (
              <View style={[styles.btn, styles.btnRed, pressed && styles.btnPressed]} pointerEvents="none">
                <Text style={styles.btnText}>Remove PIN &amp; lock again</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Danger zone */}
        <View style={[styles.card, styles.dangerCard]}>
          <Text style={[styles.sectionLabel, { color: RED }]}>Danger zone</Text>
          <Text style={styles.bodyText}>
            Permanently erase all local data including transactions, accounts, trips &amp; events, budgets, and
            your PIN. This cannot be undone.
          </Text>
          <View style={styles.spacer} />
          <Pressable onPress={onClearAllData}>
            {({ pressed }) => (
              <View style={[styles.btn, styles.btnRed, pressed && styles.btnPressed]} pointerEvents="none">
                <Ionicons name="trash-outline" size={16} color={INK} style={{ marginRight: 6 }} />
                <Text style={styles.btnText}>Erase all data &amp; sign out</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* App info card */}
        <View style={[styles.card, styles.mutedCard]}>
          <Text style={styles.sectionLabel}>App</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Version</Text>
            <Text style={styles.infoVal}>1.0.0</Text>
          </View>
          <View style={[styles.infoRow, styles.infoRowSpaced]}>
            <Text style={styles.infoKey}>Storage</Text>
            <Text style={styles.infoVal}>Local SQLite</Text>
          </View>
        </View>
      </ScrollView>
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
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  topbarTitle: {
    fontFamily: MONO,
    fontSize: 18,
    fontWeight: '800',
    color: CREAM,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  body: {
    padding: 12,
    gap: 10,
  },
  card: {
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: CREAM,
    padding: 10,
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  dangerCard: {
    borderColor: RED,
  },
  mutedCard: {
    backgroundColor: MUTED,
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
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: INK,
  },
  linkRowFirst: {},
  linkRowLast: {
    borderBottomWidth: 0,
  },
  linkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  linkIconWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkLabel: {
    fontFamily: MONO,
    fontSize: 15,
    fontWeight: '800',
    color: INK,
  },
  linkChev: {
    fontSize: 20,
    fontWeight: '900',
    color: INK,
    marginLeft: 6,
  },
  bodyText: {
    fontFamily: MONO,
    fontSize: 13,
    lineHeight: 20,
    color: '#666666',
  },
  spacer: {
    height: 10,
  },
  btn: {
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: CREAM,
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  btnYellow: { backgroundColor: YELLOW },
  btnRed: { backgroundColor: RED },
  btnPressed: { transform: [{ translateX: 3 }, { translateY: 3 }], shadowOpacity: 0, elevation: 0 },
  btnText: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '800',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoRowSpaced: {
    marginTop: 5,
  },
  infoKey: {
    fontFamily: MONO,
    fontSize: 13,
    color: '#666666',
  },
  infoVal: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '800',
    color: INK,
  },
})
