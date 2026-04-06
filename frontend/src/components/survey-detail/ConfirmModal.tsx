import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'
import type { ConfirmModalProps } from './types'

export function ConfirmModal({
  title,
  message,
  confirmLabel,
  confirmVariant = 'primary',
  isLoading,
  error,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      data-testid="confirm-modal"
    >
      <Card className="max-w-md w-full mx-4 shadow-lg">
        <CardContent className="p-6">
          <h2 id="modal-title" className="text-lg font-semibold text-foreground mb-2">
            {title}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">{message}</p>
          {error && (
            <div className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md" role="alert">
              {error}
            </div>
          )}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              variant={confirmVariant === 'danger' ? 'destructive' : 'default'}
              onClick={onConfirm}
              disabled={isLoading}
              data-testid="confirm-button"
            >
              {isLoading ? 'Please wait...' : confirmLabel}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
