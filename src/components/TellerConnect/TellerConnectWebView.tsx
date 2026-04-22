import { useCallback, useRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import { SafeAreaView } from 'react-native-safe-area-context'

import { buildTellerConnectHtml } from '@/src/components/TellerConnect/tellerHtml'
import type { TellerEnrollment } from '@/src/lib/teller/enrollmentTypes'
import { tokens } from '@/src/theme/tokens'

export type TellerConnectWebViewProps = {
  applicationId: string
  environment: 'sandbox' | 'development' | 'production'
  enrollmentId?: string
  onSuccess: (enrollment: TellerEnrollment) => void
  onExit: () => void
  onError: (error: string) => void
}

function isAllowedNavigationUrl(url: string): boolean {
  if (!url || url === 'about:blank') return true
  // Keep everything inside the in-app WebView, but block non-HTTPS schemes
  // (tel:, mailto:, custom deep links, etc).
  if (!url.startsWith('https://')) return false
  return true
}

function parseTellerSuccessPayload(payload: unknown): TellerEnrollment | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (typeof p.accessToken !== 'string' || p.accessToken.length === 0) return null

  const user = p.user
  if (!user || typeof user !== 'object') return null
  const uid = (user as { id?: unknown }).id
  if (typeof uid !== 'string' || uid.length === 0) return null

  const en = p.enrollment
  if (!en || typeof en !== 'object') return null
  const eid = (en as { id?: unknown }).id
  if (typeof eid !== 'string' || eid.length === 0) return null

  const inst = (en as { institution?: unknown }).institution
  let institutionName = 'Unknown'
  if (inst && typeof inst === 'object') {
    const nm = (inst as { name?: unknown }).name
    if (typeof nm === 'string' && nm.trim().length > 0) institutionName = nm.trim()
  }

  return {
    accessToken: p.accessToken,
    userId: uid,
    enrollmentId: eid,
    institutionName,
  }
}

export function TellerConnectWebView({
  applicationId,
  environment,
  enrollmentId,
  onSuccess,
  onExit,
  onError,
}: TellerConnectWebViewProps) {
  const webRef = useRef<WebView>(null)

  const tellerHtml = buildTellerConnectHtml(applicationId, environment, enrollmentId)

  const handleShouldStart = useCallback((request: { url: string }) => {
    return isAllowedNavigationUrl(request.url)
  }, [])

  const handleNavigationStateChange = useCallback(
    (navState: { url?: string }) => {
      const u = navState.url ?? ''
      if (!isAllowedNavigationUrl(u)) {
        webRef.current?.stopLoading()
      }
    },
    [],
  )

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(event.nativeEvent.data)
      } catch {
        return
      }

      if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) return
      const msg = parsed as { type: string; payload?: unknown }

      if (msg.type === 'teller_success' && msg.payload !== undefined) {
        const enrollment = parseTellerSuccessPayload(msg.payload)
        if (enrollment) {
          onSuccess(enrollment)
        } else {
          onError('Received malformed enrollment from Teller Connect')
        }
        return
      }

      if (msg.type === 'teller_exit') {
        onExit()
        return
      }

      if (msg.type === 'teller_error') {
        const raw = (msg as { message?: unknown }).message
        const m = typeof raw === 'string' && raw.length > 0 ? raw : 'Teller Connect error'
        onError(m)
      }
    },
    [onError, onExit, onSuccess],
  )

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarTitle}>Teller Connect</Text>
        <Pressable onPress={onExit} style={styles.closeHit} hitSlop={12}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
      <WebView
        ref={webRef}
        style={styles.web}
        source={{ html: tellerHtml, baseUrl: 'https://connect.teller.io' }}
        originWhitelist={['https://*']}
        onMessage={handleMessage}
        onNavigationStateChange={handleNavigationStateChange}
        javaScriptEnabled
        javaScriptCanOpenWindowsAutomatically={false}
        domStorageEnabled
        thirdPartyCookiesEnabled={false}
        allowsInlineMediaPlayback={false}
        mediaPlaybackRequiresUserAction
        sharedCookiesEnabled={false}
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={handleShouldStart}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.color.bg },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space[4],
    paddingVertical: tokens.space[3],
    borderBottomWidth: tokens.border.w3,
    borderBottomColor: tokens.color.border,
  },
  toolbarTitle: {
    fontFamily: tokens.font.mono,
    fontSize: 14,
    fontWeight: '800',
    color: tokens.color.fg,
  },
  closeHit: { paddingVertical: 4, paddingHorizontal: 8 },
  closeText: {
    fontFamily: tokens.font.mono,
    fontSize: 14,
    fontWeight: '700',
    color: tokens.color.accent,
  },
  web: { flex: 1, backgroundColor: '#fff' },
})
