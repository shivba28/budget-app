import { Pressable, StyleSheet, Text, View } from 'react-native'

import { tokens } from '@/src/theme/tokens'

type PinPadProps = {
  value: string
  maxLength: number
  onChange: (next: string) => void
}

const ROWS: (string | 'back' | 'spacer')[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['spacer', '0', 'back'],
]

export function PinPad({ value, maxLength, onChange }: PinPadProps) {
  const press = (key: string | 'back' | 'spacer') => {
    if (key === 'spacer') return
    if (key === 'back') {
      onChange(value.slice(0, -1))
      return
    }
    if (value.length >= maxLength) return
    onChange(value + key)
  }

  return (
    <View style={styles.wrap}>
      {ROWS.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((key, ki) =>
            key === 'spacer' ? (
              <View key={ki} style={styles.key} />
            ) : (
              <Pressable
                key={ki}
                onPress={() => press(key)}
                style={({ pressed }) => [
                  styles.key,
                  pressed && styles.keyPressed,
                ]}
              >
                <Text style={styles.keyText}>
                  {key === 'back' ? '⌫' : key}
                </Text>
              </Pressable>
            ),
          )}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: tokens.space[3],
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.space[3],
  },
  key: {
    flex: 1,
    aspectRatio: 1.4,
    maxHeight: 64,
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: tokens.color.border,
    shadowOffset: {
      width: tokens.shadow.offsetX,
      height: tokens.shadow.offsetY,
    },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  keyPressed: {
    opacity: 0.75,
  },
  keyText: {
    fontSize: 22,
    fontWeight: '800',
    color: tokens.color.fg,
    fontFamily: tokens.font.mono,
  },
})
