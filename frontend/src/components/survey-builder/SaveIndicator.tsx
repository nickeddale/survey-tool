/**
 * SaveIndicator — toolbar component showing autosave status.
 *
 * Displays one of three states:
 *   - 'saving'  → spinner + "Saving…"
 *   - 'saved'   → check icon + "All changes saved"
 *   - 'error'   → error icon + "Save failed" + Retry button
 *   - 'idle'    → nothing (hidden)
 */

import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useBuilderStore } from '../../store/builderStore'
import { Button } from '../ui/button'

interface SaveIndicatorProps {
  onRetry?: () => void
}

export function SaveIndicator({ onRetry }: SaveIndicatorProps) {
  const saveStatus = useBuilderStore((s) => s.saveStatus)

  if (saveStatus === 'idle') {
    return null
  }

  if (saveStatus === 'saving') {
    return (
      <div
        className="flex items-center gap-1.5 text-sm text-muted-foreground"
        data-testid="save-indicator-saving"
        aria-live="polite"
        aria-label="Saving changes"
      >
        <Loader2 size={14} className="animate-spin shrink-0" />
        <span>Saving…</span>
      </div>
    )
  }

  if (saveStatus === 'saved') {
    return (
      <div
        className="flex items-center gap-1.5 text-sm text-green-600"
        data-testid="save-indicator-saved"
        aria-live="polite"
        aria-label="All changes saved"
      >
        <CheckCircle2 size={14} className="shrink-0" />
        <span>All changes saved</span>
      </div>
    )
  }

  // error state
  return (
    <div
      className="flex items-center gap-1.5 text-sm text-destructive"
      data-testid="save-indicator-error"
      aria-live="assertive"
      aria-label="Save failed"
    >
      <AlertCircle size={14} className="shrink-0" />
      <span>Save failed</span>
      {onRetry && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-destructive hover:text-destructive"
          onClick={onRetry}
          data-testid="save-indicator-retry"
        >
          Retry
        </Button>
      )}
    </div>
  )
}

export default SaveIndicator
