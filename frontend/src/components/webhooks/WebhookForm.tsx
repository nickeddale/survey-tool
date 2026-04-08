import { useState, useEffect } from 'react'
import { Copy, Check } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import type { WebhookResponse, WebhookCreate, WebhookEvent, SurveyResponse } from '../../types/survey'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EVENT_OPTIONS: { value: WebhookEvent; label: string; description: string }[] = [
  {
    value: 'response.started',
    label: 'Response Started',
    description: 'Triggered when a new survey response is started.',
  },
  {
    value: 'response.completed',
    label: 'Response Completed',
    description: 'Triggered when a respondent completes a survey.',
  },
  {
    value: 'survey.activated',
    label: 'Survey Activated',
    description: 'Triggered when a survey status changes to active.',
  },
  {
    value: 'survey.closed',
    label: 'Survey Closed',
    description: 'Triggered when a survey is closed.',
  },
  {
    value: 'quota.reached',
    label: 'Quota Reached',
    description: 'Triggered when a survey quota limit is reached.',
  },
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WebhookFormProps {
  webhook?: WebhookResponse | null
  surveys: SurveyResponse[]
  onSubmit: (data: WebhookCreate) => Promise<void>
  onCancel: () => void
  isLoading?: boolean
  error?: string | null
  /** Secret revealed on creation — only set when webhook was just created */
  createdSecret?: string | null
}

// ---------------------------------------------------------------------------
// WebhookForm
// ---------------------------------------------------------------------------

function WebhookForm({
  webhook,
  surveys,
  onSubmit,
  onCancel,
  isLoading,
  error,
  createdSecret,
}: WebhookFormProps) {
  const isEdit = Boolean(webhook)

  const [url, setUrl] = useState(webhook?.url ?? '')
  const [selectedEvents, setSelectedEvents] = useState<WebhookEvent[]>(
    webhook?.events ?? [],
  )
  const [surveyId, setSurveyId] = useState<string>(webhook?.survey_id ?? '')
  const [isActive, setIsActive] = useState(webhook?.is_active ?? true)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Re-populate when webhook changes (e.g., switching which webhook to edit)
  useEffect(() => {
    if (webhook) {
      setUrl(webhook.url)
      setSelectedEvents(webhook.events)
      setSurveyId(webhook.survey_id ?? '')
      setIsActive(webhook.is_active)
    } else {
      setUrl('')
      setSelectedEvents([])
      setSurveyId('')
      setIsActive(true)
    }
    setValidationError(null)
  }, [webhook])

  function toggleEvent(event: WebhookEvent) {
    setSelectedEvents((prev) =>
      prev.includes(event)
        ? prev.filter((e) => e !== event)
        : [...prev, event],
    )
  }

  async function handleCopySecret() {
    if (!createdSecret) return
    try {
      await navigator.clipboard.writeText(createdSecret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard not available in test env — ignore
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setValidationError(null)

    if (!url.trim()) {
      setValidationError('URL is required.')
      return
    }

    // Validate URL format (must start with http:// or https://)
    try {
      const parsed = new URL(url.trim())
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setValidationError('URL must use http or https protocol.')
        return
      }
    } catch {
      setValidationError('Please enter a valid URL.')
      return
    }

    if (selectedEvents.length === 0) {
      setValidationError('At least one event must be selected.')
      return
    }

    const payload: WebhookCreate = {
      url: url.trim(),
      events: selectedEvents,
      survey_id: surveyId || null,
      is_active: isActive,
    }

    await onSubmit(payload)
  }

  const displayError = validationError ?? error

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="webhook-form-title"
      data-testid="webhook-form-dialog"
    >
      <div className="bg-background rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2
            id="webhook-form-title"
            className="text-lg font-semibold text-foreground mb-4"
          >
            {isEdit ? 'Edit Webhook' : 'Create Webhook'}
          </h2>

          {displayError && (
            <div
              className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md"
              role="alert"
              data-testid="webhook-form-error"
            >
              {displayError}
            </div>
          )}

          {/* Secret display — only shown immediately after creation */}
          {createdSecret && (
            <div
              className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md"
              data-testid="webhook-secret-display"
            >
              <p className="text-sm font-medium text-green-800 mb-1">
                Webhook secret (copy now — it won&apos;t be shown again)
              </p>
              <div className="flex items-center gap-2">
                <code
                  className="flex-1 text-xs font-mono bg-white border border-green-200 rounded px-2 py-1 text-green-900 break-all"
                  data-testid="webhook-secret-value"
                >
                  {createdSecret}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={handleCopySecret}
                  aria-label="Copy secret to clipboard"
                  data-testid="webhook-secret-copy"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </Button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="space-y-4">
              {/* URL */}
              <div>
                <Label htmlFor="webhook-url">Endpoint URL</Label>
                <Input
                  id="webhook-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/webhook"
                  required
                  className="mt-1"
                  data-testid="webhook-url-input"
                />
              </div>

              {/* Events */}
              <div>
                <Label className="mb-2 block">Events</Label>
                <div className="space-y-2" data-testid="webhook-events-list">
                  {EVENT_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className="flex items-start gap-3 cursor-pointer"
                      data-testid={`webhook-event-label-${opt.value}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedEvents.includes(opt.value)}
                        onChange={() => toggleEvent(opt.value)}
                        className="h-4 w-4 mt-0.5 rounded border-border shrink-0"
                        data-testid={`webhook-event-${opt.value}`}
                      />
                      <div>
                        <span className="text-sm font-medium text-foreground">{opt.label}</span>
                        <p className="text-xs text-muted-foreground">{opt.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Survey selector */}
              <div>
                <Label htmlFor="webhook-survey">Survey scope</Label>
                <select
                  id="webhook-survey"
                  value={surveyId}
                  onChange={(e) => setSurveyId(e.target.value)}
                  className="px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full mt-1"
                  data-testid="webhook-survey-select"
                >
                  <option value="">All surveys</option>
                  {surveys.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Secret masked in edit mode */}
              {isEdit && (
                <div>
                  <Label>Secret</Label>
                  <Input
                    type="password"
                    value="••••••••••••••••••••••••••••••••"
                    readOnly
                    disabled
                    className="mt-1 font-mono"
                    data-testid="webhook-secret-masked"
                    aria-label="Webhook secret (masked)"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    The secret is not shown after creation.
                  </p>
                </div>
              )}

              {/* Active toggle */}
              <div className="flex items-center gap-3">
                <input
                  id="webhook-is-active"
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                  data-testid="webhook-active-checkbox"
                />
                <Label htmlFor="webhook-is-active" className="cursor-pointer">
                  Active
                </Label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isLoading}
                data-testid="webhook-form-cancel"
              >
                {createdSecret ? 'Done' : 'Cancel'}
              </Button>
              {!createdSecret && (
                <Button
                  type="submit"
                  disabled={isLoading}
                  data-testid="webhook-form-submit"
                >
                  {isLoading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Webhook'}
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default WebhookForm
