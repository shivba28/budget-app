import { Pressable, StyleSheet, Text, View } from 'react-native'

import { tokens } from '@/src/theme/tokens'

type PinPadProps = {
  value: string
  maxLength: number
  onChange: (next: string) => void
  disabled?: boolean
}

const KEYS: (string | 'back' | 'empty')[] = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'empty',
  '0',
  'back',
]

const SUB: Record<string, string> = {
  '1': '!@#',
  '2': 'ABC',
  '3': 'DEF',
  '4': 'GHI',
  '5': 'JKL',
  '6': 'MNO',
  '7': 'PQRS',
  '8': 'TUV',
  '9': 'WXYZ',
  '0': '0@#',
}

export function PinPad({ value, maxLength, onChange, disabled }: PinPadProps) {
  const press = (key: string | 'back' | 'empty') => {
    if (disabled) return
    if (key === 'empty') return
    if (key === 'back') {
      onChange(value.slice(0, -1))
      return
    }
    if (value.length >= maxLength) return
    onChange(value + key)
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.grid}>
      {KEYS.map((key, idx) => {
        const isEmpty = key === 'empty'
        const isBack = key === 'back'
        const isZero = key === '0'
        return isEmpty ? (
          <View key={`empty-${idx}`} style={styles.cell}>
            <View style={styles.keyEmpty} />
          </View>
        ) : (
          <View key={`${key}-${idx}`} style={styles.cell}>
            <Pressable
              disabled={disabled}
              onPress={() => press(key)}
              style={styles.pressable}
            >
              {({ pressed }) => (
                <>
                  <View
                    style={[
                      styles.key,
                      isZero && styles.keyAccent,
                      isBack && styles.keyDark,
                      pressed && styles.keyPressed,
                      disabled && styles.keyDisabled,
                    ]}
                    pointerEvents="none"
                  >
                    <Text
                      style={[
                        styles.keyText,
                        isBack && styles.keyTextDark,
                        isBack && styles.keyTextBack,
                      ]}
                    >
                      {isBack ? '⌫' : key}
                    </Text>
                    {!isBack && SUB[key] ? <Text style={styles.sub}>{SUB[key]}</Text> : null}
                  </View>
                </>
              )}
            </Pressable>
          </View>
        )
      })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    alignContent: 'center',
  },
  grid: {
    width: 270,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  cell: {
    width: '33.3333%',
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  pressable: {
    position: 'relative',
    width: '100%',
  },
  key: {
    position: 'relative',
    height: 62,
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    borderRadius: 0,
    backgroundColor: tokens.color.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    shadowColor: tokens.color.border,
    shadowOffset: { width: tokens.shadow.offsetX, height: tokens.shadow.offsetY },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 6,
  },
  keyDisabled: {
    opacity: 0.55,
  },
  keyEmpty: {
    height: 62,
    backgroundColor: 'transparent',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  keyAccent: {
    backgroundColor: tokens.color.accent,
  },
  keyDark: {
    backgroundColor: tokens.color.border,
  },
  keyPressed: {
    transform: [{ translateX: 3 }, { translateY: 3 }],
    shadowOpacity: 0,
    elevation: 0,
  },
  keyText: {
    fontSize: 20,
    fontWeight: '500',
    color: tokens.color.fg,
    fontFamily: tokens.font.mono,
    lineHeight: 20,
    textAlign: 'center',
  },
  keyTextBack: {
    // iOS tends to sit this glyph low; give it a touch more lineHeight
    lineHeight: 22,
  },
  keyTextDark: {
    color: tokens.color.card,
  },
  sub: {
    fontSize: 8,
    letterSpacing: 1,
    color: 'rgba(17,17,17,0.45)',
    textTransform: 'uppercase',
    fontFamily: tokens.font.mono,
    lineHeight: 10,
  },
})
