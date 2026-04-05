import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { Cloud, CloudOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDriveSyncStatus } from '@/hooks/useDriveSyncStatus'

function formatRelativeTime(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (sec < 15) return 'just now'
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86_400) return `${Math.floor(sec / 3600)}h ago`
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

type DriveSyncIndicatorProps = {
  /** `header` = inline chip for page title rows (Transactions / Insights). */
  readonly variant?: 'compact' | 'full' | 'header'
}

export function DriveSyncIndicator({
  variant = 'compact',
}: DriveSyncIndicatorProps): ReactElement {
  const { display, lastAttemptAt, errorMessage } = useDriveSyncStatus()

  const title =
    display === 'error' && errorMessage
      ? `Google Drive backup: ${errorMessage}`
      : display === 'ok' && lastAttemptAt
        ? `Last backed up to Google Drive ${formatRelativeTime(lastAttemptAt)}`
        : 'Google Drive backup has not completed yet'

  const line1 =
    display === 'never'
      ? 'Drive not synced yet'
      : display === 'ok' && lastAttemptAt
        ? `Backed up ${formatRelativeTime(lastAttemptAt)}`
        : 'Backup failed'

  const Icon = display === 'error' ? CloudOff : Cloud
  const dotClass =
    display === 'ok'
      ? 'bg-emerald-500'
      : display === 'error'
        ? 'bg-amber-500'
        : 'bg-muted-foreground/50'

  if (variant === 'full') {
    return (
      <div
        className="flex gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-left"
        role="status"
        aria-live="polite"
      >
        <span className="relative mt-0.5 inline-flex shrink-0">
          <Icon className="size-5 text-muted-foreground" strokeWidth={2} aria-hidden />
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-background',
              dotClass,
            )}
            aria-hidden
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Google Drive backup</p>
          <p className="text-xs text-muted-foreground leading-snug">{line1}</p>
          {display === 'error' && errorMessage ? (
            <p className="mt-1 text-xs text-destructive leading-snug">{errorMessage}</p>
          ) : null}
        </div>
      </div>
    )
  }

  const chipClasses =
    variant === 'header'
      ? cn(
          'inline-flex shrink-0 max-w-[min(11rem,calc(100vw-8rem))] items-center gap-1.5 rounded-full border border-border/80 bg-background/90 px-2.5 py-1 text-[0.65rem] font-medium leading-tight shadow-sm',
          'text-muted-foreground transition-colors hover:text-foreground',
        )
      : cn(
          'flex max-w-[min(220px,calc(100vw-6rem))] items-center gap-1.5 rounded-full border border-border/80 bg-background/85 px-2.5 py-1 text-[0.65rem] font-medium leading-tight shadow-sm backdrop-blur-sm',
          'text-muted-foreground transition-colors hover:text-foreground',
        )

  return (
    <Link
      to="/app/settings"
      className={chipClasses}
      title={title}
      aria-label={title}
    >
      <span className="relative inline-flex shrink-0">
        <Icon className="size-3.5 opacity-90" strokeWidth={2} aria-hidden />
        <span
          className={cn(
            'absolute -bottom-px -right-px size-1.5 rounded-full ring-1 ring-background',
            dotClass,
          )}
          aria-hidden
        />
      </span>
      <span className="min-w-0 truncate">
        {display === 'never'
          ? 'Drive'
          : display === 'ok' && lastAttemptAt
            ? formatRelativeTime(lastAttemptAt)
            : 'Sync issue'}
      </span>
    </Link>
  )
}
