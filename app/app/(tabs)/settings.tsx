import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'

import { useAuthStore } from '@/src/auth/authStore'
import { BrutalButton, BrutalCard, BrutalScreen } from '@/src/components/Brutalist'
import { tokens } from '@/src/theme/tokens'

const links: {
  href:
    | '/app/categories'
    | '/app/budgets'
    | '/app/manual-accounts'
    | '/app/bank-accounts'
  label: string
}[] = [
  { href: '/app/categories', label: 'Categories' },
  { href: '/app/budgets', label: 'Budgets' },
  { href: '/app/manual-accounts', label: 'Manual accounts' },
  {
    href: '/app/bank-accounts',
    label: 'Bank accounts (Teller)',
  },
]

export default function Settings() {
  const router = useRouter()
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
    <BrutalScreen title="Settings" subtitle="Data & security (local only)">
      <BrutalCard>
        <Text style={styles.section}>DATA</Text>
        {links.map((l) => (
          <Pressable
            key={l.href}
            onPress={() => router.push(l.href)}
            style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.75 }]}
          >
            <Text style={styles.linkText}>{l.label}</Text>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        ))}
      </BrutalCard>
      <View style={styles.spacer} />
      <BrutalCard>
        <Text style={styles.body}>
          Unlock uses device biometrics when enrolled, with your 4-digit PIN as backup.
          Nothing is sent to a server.
        </Text>
        <View style={styles.spacer} />
        <BrutalButton title="Remove PIN & lock again" variant="neutral" onPress={onSignOut} />
      </BrutalCard>
    </BrutalScreen>
  )
}

const styles = StyleSheet.create({
  section: {
    textTransform: 'uppercase',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: tokens.color.fg,
    marginBottom: tokens.space[3],
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: tokens.space[3],
    borderTopWidth: tokens.border.w2,
    borderColor: tokens.color.border,
  },
  linkText: {
    fontFamily: tokens.font.mono,
    fontSize: 15,
    fontWeight: '700',
    color: tokens.color.fg,
  },
  chev: {
    fontSize: 22,
    color: tokens.color.fg,
    fontWeight: '700',
  },
  body: {
    fontFamily: tokens.font.mono,
    fontSize: 14,
    lineHeight: 20,
    color: tokens.color.fg,
  },
  spacer: {
    height: tokens.space[5],
  },
})
