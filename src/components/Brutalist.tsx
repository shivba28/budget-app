import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'

import { tokens } from '@/src/theme/tokens'

type BrutalButtonProps = {
  title: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  variant?: 'accent' | 'neutral'
}

export function BrutalButton({
  title,
  onPress,
  disabled,
  loading,
  variant = 'accent',
}: BrutalButtonProps) {
  const bg =
    variant === 'accent' ? tokens.color.accent : tokens.color.card
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: pressed ? 0.85 : 1 },
        (disabled || loading) && styles.btnDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tokens.color.fg} />
      ) : (
        <Text style={styles.btnText}>{title}</Text>
      )}
    </Pressable>
  )
}

type BrutalScreenProps = {
  title: string
  subtitle?: string
  children?: ReactNode
  footer?: ReactNode
  style?: ViewStyle
}

export function BrutalBackRow({
  onBack,
  label = 'Back',
}: {
  onBack: () => void
  label?: string
}) {
  return (
    <Pressable
      onPress={onBack}
      style={({ pressed }) => [styles.backRow, pressed && { opacity: 0.75 }]}
    >
      <Text style={styles.backChev}>←</Text>
      <Text style={styles.backText}>{label}</Text>
    </Pressable>
  )
}

export function BrutalScreen({
  title,
  subtitle,
  children,
  footer,
  style,
}: BrutalScreenProps) {
  return (
    <View style={[styles.screen, style]}>
      <Text style={styles.labelCaps}>SECTION</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={styles.body}>{children}</View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  )
}

export function BrutalCard({
  children,
  style,
}: {
  children: ReactNode
  style?: ViewStyle
}) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function BrutalTextField({
  label,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{label}</Text>
      <TextInput
        placeholderTextColor="rgba(17,17,17,0.45)"
        style={fieldStyles.input}
        {...props}
      />
    </View>
  )
}

const fieldStyles = StyleSheet.create({
  wrap: { marginBottom: tokens.space[4] },
  label: {
    fontFamily: tokens.font.mono,
    fontSize: 12,
    fontWeight: '700',
    color: tokens.color.fg,
    marginBottom: tokens.space[2],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space[4],
    paddingVertical: tokens.space[3],
    fontSize: 16,
    fontWeight: '600',
    color: tokens.color.fg,
    backgroundColor: tokens.color.card,
  },
})

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: tokens.color.bg,
    paddingHorizontal: tokens.space[5],
    paddingTop: tokens.space[6],
  },
  labelCaps: {
    textTransform: 'uppercase',
    fontSize: 11,
    fontWeight: '800',
    color: tokens.color.fg,
    letterSpacing: 1,
    marginBottom: tokens.space[2],
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: tokens.color.fg,
    marginBottom: tokens.space[2],
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500',
    color: tokens.color.fg,
    opacity: 0.85,
    marginBottom: tokens.space[5],
    fontFamily: tokens.font.mono,
  },
  body: {
    flex: 1,
  },
  footer: {
    paddingBottom: tokens.space[6],
    gap: tokens.space[3],
  },
  card: {
    backgroundColor: tokens.color.card,
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    padding: tokens.space[5],
    shadowColor: tokens.color.border,
    shadowOffset: {
      width: tokens.shadow.offsetX,
      height: tokens.shadow.offsetY,
    },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  btn: {
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    paddingVertical: tokens.space[4],
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnText: {
    fontSize: 16,
    fontWeight: '800',
    color: tokens.color.fg,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[2],
    marginBottom: tokens.space[4],
    alignSelf: 'flex-start',
  },
  backChev: {
    fontSize: 20,
    fontWeight: '900',
    color: tokens.color.fg,
  },
  backText: {
    fontFamily: tokens.font.mono,
    fontSize: 14,
    fontWeight: '700',
    color: tokens.color.fg,
  },
})
