import type { ReactElement } from 'react'
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

type ErrorRetryProps = {
  readonly message: string
  readonly onRetry: () => void
  readonly retryLabel?: string
}

export function ErrorRetry({
  message,
  onRetry,
  retryLabel = 'Try again',
}: ErrorRetryProps): ReactElement {
  return (
    <Alert variant="destructive" className="border-border">
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      <AlertAction>
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          {retryLabel}
        </Button>
      </AlertAction>
    </Alert>
  )
}
