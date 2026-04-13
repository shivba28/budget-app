import type { ReactElement, RefObject } from 'react'
import { PhantomUiBlock } from '@/components/PhantomUiBlock'
import { Card, CardContent } from '@/components/ui/card'

type Props = {
  readonly scrollRef?: RefObject<HTMLDivElement | null>
}

/** First-load placeholder while categories (and related cloud prefs) hydrate. */
export function SettingsLoadingSkeleton({ scrollRef }: Props): ReactElement {
  return (
    <main className="page page--fill settings-page settings-scroll-root">
      <PhantomUiBlock loading className="flex min-h-0 flex-1 flex-col" reveal={0.25}>
        <div className="settings-view-head">
          <span className="page__title block">Settings</span>
        </div>

        <div className="settings-tabs" aria-hidden>
          <span className="settings-tab settings-tab--active">App Settings</span>
          <span className="settings-tab">Bank accounts</span>
          <span className="settings-tab">Budgets</span>
        </div>

        <div ref={scrollRef} className="settings-scroll space-y-3">
          <span className="page__subtitle block">App settings</span>
          <Card className="shadow-xs mb-3">
            <CardContent className="space-y-2 py-4">
              <span className="block text-sm font-medium">Theme</span>
              <span className="block text-xs text-muted-foreground">
                Light or dark appearance for the app.
              </span>
            </CardContent>
          </Card>
          <Card className="shadow-xs">
            <CardContent className="space-y-3 py-4">
              <span className="block text-sm font-medium">Account and security</span>
              <span className="block text-sm text-muted-foreground">
                Signed in as user@example.com
              </span>
            </CardContent>
          </Card>
        </div>
      </PhantomUiBlock>
    </main>
  )
}
