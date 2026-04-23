import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useAuthStore } from '@/src/auth/authStore'

const CREAM = '#FAFAF5'
const INK = '#111111'
const MUTED = '#E8E8E0'
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

const links: { href: '/app/categories' | '/app/budgets' | '/app/manual-accounts' | '/app/bank-accounts'; label: string; icon: string }[] = [
  { href: '/app/categories',    label: 'Categories',            icon: '🏷' },
  { href: '/app/budgets',       label: 'Budgets',               icon: '📊' },
  { href: '/app/manual-accounts', label: 'Manual accounts',     icon: '✍️' },
  { href: '/app/bank-accounts', label: 'Bank accounts (Teller)', icon: '🏦' },
]

export default function SettingsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const signOut = useAuthStore((s) => s.signOut)

  const onSignOut = () => {
    const { Alert } = require('react-native')
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

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topbar}>
        <Text style={styles.topbarTitle}>Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Data card */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Data</Text>
          {links.map((l, i) => (
            <Pressable
              key={l.href}
              onPress={() => router.push(l.href)}
              style={({ pressed }) => pressed && { opacity: 0.7 }}
            >
              <View style={[styles.linkRow, i === 0 && styles.linkRowFirst]}>
                <View style={styles.linkLeft}>
                  <Text style={styles.linkIcon}>{l.icon}</Text>
                  <Text style={styles.linkLabel}>{l.label}</Text>
                </View>
                <Text style={styles.linkChev}>›</Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* Security card */}
        <View style={styles.card}>
          <Text style={styles.bodyText}>
            Unlock uses biometrics when available, with your PIN as backup.
          </Text>
          <View style={styles.spacer} />
          <Pressable
            onPress={onSignOut}
            style={({ pressed }) => pressed && { opacity: 0.8 }}
          >
            <View style={styles.btn}>
              <Text style={styles.btnText}>Remove PIN &amp; lock again</Text>
            </View>
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
    paddingTop: 10,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  topbarTitle: {
    fontFamily: MONO,
    fontSize: 17,
    fontWeight: '700',
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
  linkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  linkIcon: {
    fontSize: 16,
    width: 22,
    textAlign: 'center',
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
    backgroundColor: '#FF5E5E',
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
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
