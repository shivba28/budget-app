import { Platform, StyleSheet, Text, TextInput, View } from 'react-native'
import type { StyleProp, TextStyle, ViewStyle } from 'react-native'
import { BottomSheetTextInput } from '@gorhom/bottom-sheet'

import {
  evaluateExpression,
  formatExpressionResult,
  isArithmeticExpression,
} from '@/src/lib/evaluateExpression'

const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })
const INK = '#111111'
const YELLOW = '#F5C842'

type Props = {
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  /** Style applied directly to the TextInput element. */
  inputStyle?: StyleProp<TextStyle>
  /** Style applied to the outer wrapper View (useful when label is shown). */
  wrapperStyle?: StyleProp<ViewStyle>
  /** Render using BottomSheetTextInput — required inside bottom-sheet modals. */
  bottomSheet?: boolean
  /** Optional label rendered above the input (uppercase mono). */
  label?: string
}

/**
 * A text input that evaluates arithmetic on the fly.
 * Type "50+20" → shows "= 70" badge below.
 * On blur the expression is replaced with the numeric result.
 */
export function CalculatorAmountInput({
  value,
  onChangeText,
  placeholder = '0.00',
  inputStyle,
  wrapperStyle,
  bottomSheet = false,
  label,
}: Props) {
  const evaluated = evaluateExpression(value)
  const showPreview = isArithmeticExpression(value) && evaluated !== null

  const handleBlur = () => {
    if (showPreview && evaluated !== null) {
      onChangeText(formatExpressionResult(evaluated))
    }
  }

  const inputProps = {
    value,
    onChangeText,
    onBlur: handleBlur,
    // numbers-and-punctuation on iOS exposes +−×÷ without needing a second keyboard
    keyboardType: (Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default') as 'default',
    placeholder,
    placeholderTextColor: '#999999',
    style: inputStyle,
  }

  return (
    <View style={wrapperStyle}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {bottomSheet ? (
        <BottomSheetTextInput {...inputProps} />
      ) : (
        <TextInput {...inputProps} />
      )}
      {showPreview ? (
        <View style={styles.preview}>
          <Text style={styles.previewText}>= {formatExpressionResult(evaluated)}</Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  label: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: INK,
    marginBottom: 3,
    marginTop: 10,
  },
  preview: {
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: YELLOW,
    borderWidth: 2,
    borderColor: INK,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  previewText: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '800',
    color: INK,
  },
})
