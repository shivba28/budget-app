import type { ReactElement } from 'react'
import { PhantomUiBlock } from '@/components/PhantomUiBlock'

/** Auth-route bootstrap (session / PIN state) — mirrors login card layout. */
export function AuthLoadingLayout(): ReactElement {
  return (
    <main className="page page--fill flex min-h-0 flex-1 flex-col justify-center px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <PhantomUiBlock
          loading
          className="rounded-xl border border-border/80 bg-card p-6 shadow-xs"
          reveal={0.2}
        >
          <div className="flex justify-center">
            <span className="flex size-24 items-center justify-center rounded-xl bg-muted/40 text-xs text-muted-foreground">
              Logo
            </span>
          </div>
          <div className="mt-4 space-y-2 text-center">
            <span className="block text-2xl font-semibold tracking-tight">
              Budget Tracker
            </span>
            <span className="block text-base leading-relaxed text-muted-foreground">
              Sign in with Google to start using the app.
            </span>
          </div>
          <div className="mt-6">
            <span className="block h-11 w-full rounded-md bg-primary text-center text-sm font-medium leading-[2.75rem] text-primary-foreground">
              Continue with Google
            </span>
          </div>
        </PhantomUiBlock>
      </div>
    </main>
  )
}
