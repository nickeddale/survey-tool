import { useState, useEffect } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import ConditionBuilder, {
  conditionRowsToQuotaConditions,
  quotaConditionsToConditionRows,
  type ConditionRow,
} from './ConditionBuilder'
import type { QuotaResponse, QuotaCreate, QuotaAction, QuestionResponse } from '../../types/survey'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTION_OPTIONS: { value: QuotaAction; label: string }[] = [
  { value: 'terminate', label: 'Terminate (disqualify respondent)' },
  { value: 'hide_question', label: 'Hide Question' },
]

const SELECT_CLASS =
  'px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuotaFormProps {
  surveyId: string
  questions: QuestionResponse[]
  quota?: QuotaResponse | null
  onSubmit: (data: QuotaCreate) => Promise<void>
  onCancel: () => void
  isLoading?: boolean
  error?: string | null
}

// ---------------------------------------------------------------------------
// QuotaForm
// ---------------------------------------------------------------------------

function QuotaForm({
  questions,
  quota,
  onSubmit,
  onCancel,
  isLoading,
  error,
}: QuotaFormProps) {
  const isEdit = Boolean(quota)

  const [name, setName] = useState(quota?.name ?? '')
  const [limit, setLimit] = useState<string>(quota ? String(quota.limit) : '')
  const [action, setAction] = useState<QuotaAction>(quota?.action ?? 'terminate')
  const [isActive, setIsActive] = useState(quota?.is_active ?? true)
  const [conditions, setConditions] = useState<ConditionRow[]>(
    quota ? quotaConditionsToConditionRows(quota.conditions) : [],
  )
  const [validationError, setValidationError] = useState<string | null>(null)

  // Re-populate when quota changes (e.g., switching which quota to edit)
  useEffect(() => {
    if (quota) {
      setName(quota.name)
      setLimit(String(quota.limit))
      setAction(quota.action)
      setIsActive(quota.is_active)
      setConditions(quotaConditionsToConditionRows(quota.conditions))
    } else {
      setName('')
      setLimit('')
      setAction('terminate')
      setIsActive(true)
      setConditions([])
    }
    setValidationError(null)
  }, [quota])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setValidationError(null)

    const parsedLimit = parseInt(limit, 10)
    if (!name.trim()) {
      setValidationError('Name is required.')
      return
    }
    if (isNaN(parsedLimit) || parsedLimit < 1) {
      setValidationError('Limit must be a positive integer.')
      return
    }
    // Validate conditions: each must have a question selected
    const incompleteCondition = conditions.find((c) => !c.question_id)
    if (incompleteCondition) {
      setValidationError('All conditions must have a question selected.')
      return
    }

    const payload: QuotaCreate = {
      name: name.trim(),
      limit: parsedLimit,
      action,
      conditions: conditionRowsToQuotaConditions(conditions),
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
      aria-labelledby="quota-form-title"
      data-testid="quota-form-dialog"
    >
      <div className="bg-background rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2
            id="quota-form-title"
            className="text-lg font-semibold text-foreground mb-4"
          >
            {isEdit ? 'Edit Quota' : 'Create Quota'}
          </h2>

          {displayError && (
            <div
              className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md"
              role="alert"
              data-testid="quota-form-error"
            >
              {displayError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="space-y-4">
              {/* Name */}
              <div>
                <Label htmlFor="quota-name">Name</Label>
                <Input
                  id="quota-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Age 18-35 limit"
                  required
                  className="mt-1"
                  data-testid="quota-name-input"
                />
              </div>

              {/* Limit */}
              <div>
                <Label htmlFor="quota-limit">Limit</Label>
                <Input
                  id="quota-limit"
                  type="number"
                  min={1}
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  placeholder="e.g. 100"
                  required
                  className="mt-1"
                  data-testid="quota-limit-input"
                />
              </div>

              {/* Action */}
              <div>
                <Label htmlFor="quota-action">Action when reached</Label>
                <select
                  id="quota-action"
                  value={action}
                  onChange={(e) => setAction(e.target.value as QuotaAction)}
                  className={`${SELECT_CLASS} mt-1`}
                  data-testid="quota-action-select"
                >
                  {ACTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-3">
                <input
                  id="quota-is-active"
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                  data-testid="quota-active-checkbox"
                />
                <Label htmlFor="quota-is-active" className="cursor-pointer">
                  Active
                </Label>
              </div>

              {/* Conditions */}
              <div className="border border-border rounded-md p-3">
                <ConditionBuilder
                  conditions={conditions}
                  questions={questions}
                  onChange={setConditions}
                />
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
                data-testid="quota-form-submit"
              >
                {isLoading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Quota'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default QuotaForm
