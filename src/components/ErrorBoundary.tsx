import { Component, type ReactNode } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

const CREAM = '#FAFAF5'
const INK = '#111111'
const RED = '#FF5E5E'
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

type Props = {
  children: ReactNode
  fallbackLabel?: string
}

type State = {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const label = this.props.fallbackLabel ?? 'Something went wrong.'

    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.bang}>!</Text>
            <Text style={styles.title}>{label}</Text>
          </View>
          <ScrollView style={styles.msgScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.msg} selectable>
              {error.message}
            </Text>
          </ScrollView>
          <Pressable onPress={this.reset}>
            {({ pressed }) => (
              <View style={[styles.btn, pressed && styles.btnPressed]} pointerEvents="none">
                <Text style={styles.btnText}>Try again</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>
    )
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CREAM,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: CREAM,
    padding: 14,
    shadowColor: INK,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bang: {
    width: 32,
    height: 32,
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: RED,
    fontFamily: MONO,
    fontSize: 18,
    fontWeight: '900',
    color: INK,
    textAlign: 'center',
    lineHeight: 28,
  },
  title: {
    fontFamily: MONO,
    fontSize: 15,
    fontWeight: '900',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  msgScroll: {
    maxHeight: 120,
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: '#F0EDE4',
    padding: 8,
  },
  msg: {
    fontFamily: MONO,
    fontSize: 11,
    color: '#555555',
    lineHeight: 16,
  },
  btn: {
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: CREAM,
    paddingVertical: 10,
    alignItems: 'center',
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  btnPressed: {
    transform: [{ translateX: 3 }, { translateY: 3 }],
    shadowOpacity: 0,
    elevation: 0,
  },
  btnText: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '900',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
})
