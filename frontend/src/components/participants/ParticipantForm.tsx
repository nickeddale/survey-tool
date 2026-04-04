import { useState, useEffect } from 'react'
import { Plus, Trash2, Copy, Check } from 'lucide-react'
import type { ParticipantResponse, ParticipantCreate, ParticipantUpdate } from '../../types/survey'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KeyValuePair {
  key: string
  value: string
}

interface ParticipantFormProps {
  participant?: ParticipantResponse | null
  onSubmit: (data: ParticipantCreate | ParticipantUpdate) => Promise<void>
  onCancel: () => void
  isLoading?: boolean
  error?: string | null
  /** Token returned on creation — shown once */
  createdToken?: string | null
  onTokenAcknowledged?: () => void
}

// ---------------------------------------------------------------------------
// Token Display (shown once after creation)
// ---------------------------------------------------------------------------

function TokenDisplay({
  token,
  onClose,
}: {
  token: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(token).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="token-display-title"
      data-testid="token-display-dialog"
    >
      <Card className="max-w-md w-full mx-4 shadow-lg">
        <CardContent className="p-6">
          <h2
            id="token-display-title"
            className="text-lg font-semibold text-foreground mb-2"
          >
            Participant Token
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            This token will only be shown once. Copy it now and store it securely.
          </p>
          <div className="flex items-center gap-2 p-3 bg-muted rounded-md mb-4">
            <code
              className="font-mono text-sm flex-1 break-all"
              data-testid="created-token-value"
            >
              {token}
            </code>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              aria-label="Copy token"
              className="h-8 w-8 shrink-0"
              data-testid="copy-token-button"
            >
              {copied ? <Check size={15} className="text-green-600" /> : <Copy size={15} />}
            </Button>
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose} data-testid="token-acknowledge-button">
              I&apos;ve copied the token
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ParticipantForm
// ---------------------------------------------------------------------------

function ParticipantForm({
  participant,
  onSubmit,
  onCancel,
  isLoading,
  error,
  createdToken,
  onTokenAcknowledged,
}: ParticipantFormProps) {
  const isEdit = Boolean(participant)

  // Form fields
  const [email, setEmail] = useState(participant?.email ?? '')
  const [usesRemaining, setUsesRemaining] = useState(
    participant?.uses_remaining != null ? String(participant.uses_remaining) : '',
  )
  const [validFrom, setValidFrom] = useState(
    participant?.valid_from ? participant.valid_from.slice(0, 16) : '',
  )
  const [validUntil, setValidUntil] = useState(
    participant?.valid_until ? participant.valid_until.slice(0, 16) : '',
  )
  const [attributes, setAttributes] = useState<KeyValuePair[]>(() => {
    if (!participant?.attributes) return []
    return Object.entries(participant.attributes).map(([key, value]) => ({
      key,
      value: String(value),
    }))
  })
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (participant) {
      setEmail(participant.email ?? '')
      setUsesRemaining(
        participant.uses_remaining != null ? String(participant.uses_remaining) : '',
      )
      setValidFrom(participant.valid_from ? participant.valid_from.slice(0, 16) : '')
      setValidUntil(participant.valid_until ? participant.valid_until.slice(0, 16) : '')
      setAttributes(
        participant.attributes
          ? Object.entries(participant.attributes).map(([key, value]) => ({
              key,
              value: String(value),
            }))
          : [],
      )
    }
  }, [participant])

  // ---------------------------------------------------------------------------
  // Attribute helpers
  // ---------------------------------------------------------------------------

  function addAttribute() {
    setAttributes((prev) => [...prev, { key: '', value: '' }])
  }

  function removeAttribute(index: number) {
    setAttributes((prev) => prev.filter((_, i) => i !== index))
  }

  function updateAttribute(index: number, field: 'key' | 'value', val: string) {
    setAttributes((prev) =>
      prev.map((pair, i) => (i === index ? { ...pair, [field]: val } : pair)),
    )
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setValidationError(null)

    // Validate attributes — no duplicate or empty keys
    const keys = attributes.map((a) => a.key.trim()).filter(Boolean)
    const uniqueKeys = new Set(keys)
    if (uniqueKeys.size !== keys.length) {
      setValidationError('Attribute keys must be unique.')
      return
    }

    const attrsObj =
      attributes.length > 0
        ? Object.fromEntries(attributes.map((a) => [a.key.trim(), a.value]))
        : null

    const parsedUses = usesRemaining !== '' ? parseInt(usesRemaining, 10) : null
    if (usesRemaining !== '' && (isNaN(parsedUses!) || parsedUses! < 0)) {
      setValidationError('Uses remaining must be a non-negative integer.')
      return
    }

    const payload: ParticipantCreate | ParticipantUpdate = {
      email: email.trim() || null,
      attributes: attrsObj,
      uses_remaining: parsedUses,
      valid_from: validFrom ? new Date(validFrom).toISOString() : null,
      valid_until: validUntil ? new Date(validUntil).toISOString() : null,
    }

    await onSubmit(payload)
  }

  // If a token was just created, show the token display overlay
  if (createdToken) {
    return (
      <TokenDisplay
        token={createdToken}
        onClose={() => onTokenAcknowledged?.()}
      />
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="participant-form-title"
      data-testid="participant-form-dialog"
    >
      <Card className="max-w-lg w-full mx-4 shadow-lg max-h-[90vh] overflow-y-auto">
        <CardContent className="p-6">
          <h2
            id="participant-form-title"
            className="text-lg font-semibold text-foreground mb-4"
          >
            {isEdit ? 'Edit Participant' : 'Add Participant'}
          </h2>

          <form onSubmit={handleSubmit} noValidate>
            {/* Error */}
            {(error || validationError) && (
              <div
                className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md"
                role="alert"
                data-testid="participant-form-error"
              >
                {error ?? validationError}
              </div>
            )}

            {/* Email */}
            <div className="mb-4">
              <label
                htmlFor="participant-email"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Email
              </label>
              <input
                id="participant-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="participant@example.com"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="participant-email-input"
              />
            </div>

            {/* Uses Remaining */}
            <div className="mb-4">
              <label
                htmlFor="participant-uses"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Uses Remaining
                <span className="ml-1 text-xs text-muted-foreground">(leave blank for unlimited)</span>
              </label>
              <input
                id="participant-uses"
                type="number"
                min="0"
                value={usesRemaining}
                onChange={(e) => setUsesRemaining(e.target.value)}
                placeholder="Unlimited"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="participant-uses-input"
              />
            </div>

            {/* Valid From */}
            <div className="mb-4">
              <label
                htmlFor="participant-valid-from"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Valid From
              </label>
              <input
                id="participant-valid-from"
                type="datetime-local"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="participant-valid-from-input"
              />
            </div>

            {/* Valid Until */}
            <div className="mb-4">
              <label
                htmlFor="participant-valid-until"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Valid Until
              </label>
              <input
                id="participant-valid-until"
                type="datetime-local"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="participant-valid-until-input"
              />
            </div>

            {/* Attributes */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-foreground">
                  Attributes
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addAttribute}
                  className="gap-1"
                  data-testid="add-attribute-button"
                >
                  <Plus size={13} />
                  Add
                </Button>
              </div>
              {attributes.length === 0 && (
                <p className="text-xs text-muted-foreground">No attributes configured.</p>
              )}
              <div className="space-y-2">
                {attributes.map((pair, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={pair.key}
                      onChange={(e) => updateAttribute(idx, 'key', e.target.value)}
                      placeholder="Key"
                      className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      data-testid={`attribute-key-${idx}`}
                    />
                    <input
                      type="text"
                      value={pair.value}
                      onChange={(e) => updateAttribute(idx, 'value', e.target.value)}
                      placeholder="Value"
                      className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      data-testid={`attribute-value-${idx}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeAttribute(idx)}
                      aria-label="Remove attribute"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      data-testid={`remove-attribute-${idx}`}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                data-testid="participant-form-submit"
              >
                {isLoading
                  ? isEdit
                    ? 'Saving...'
                    : 'Adding...'
                  : isEdit
                    ? 'Save Changes'
                    : 'Add Participant'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default ParticipantForm
