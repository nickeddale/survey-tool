import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import type { QuotaCondition, QuotaOperator, QuestionResponse } from '../../types/survey'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OPERATOR_OPTIONS: { value: QuotaOperator; label: string }[] = [
  { value: 'eq', label: 'Equals' },
  { value: 'neq', label: 'Not Equals' },
  { value: 'gt', label: 'Greater Than' },
  { value: 'lt', label: 'Less Than' },
  { value: 'gte', label: 'Greater Than or Equal' },
  { value: 'lte', label: 'Less Than or Equal' },
  { value: 'in', label: 'In (comma separated)' },
  { value: 'contains', label: 'Contains' },
]

const SELECT_CLASS =
  'px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConditionRow {
  question_id: string
  operator: QuotaOperator
  value: string
}

interface ConditionBuilderProps {
  conditions: ConditionRow[]
  questions: QuestionResponse[]
  onChange: (conditions: ConditionRow[]) => void
}

// ---------------------------------------------------------------------------
// ConditionBuilder
// ---------------------------------------------------------------------------

function ConditionBuilder({ conditions, questions, onChange }: ConditionBuilderProps) {
  function addCondition() {
    onChange([
      ...conditions,
      { question_id: '', operator: 'eq', value: '' },
    ])
  }

  function removeCondition(index: number) {
    onChange(conditions.filter((_, i) => i !== index))
  }

  function updateCondition(index: number, patch: Partial<ConditionRow>) {
    onChange(
      conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-foreground">Conditions</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addCondition}
          data-testid="add-condition-button"
        >
          <Plus size={14} />
          Add Condition
        </Button>
      </div>

      {conditions.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-2">
          No conditions — quota applies to all responses.
        </p>
      ) : (
        <div className="space-y-2" data-testid="condition-list">
          {conditions.map((condition, index) => (
            <div
              key={index}
              className="flex items-center gap-2 flex-wrap"
              data-testid={`condition-row-${index}`}
            >
              {/* Question selector */}
              <select
                value={condition.question_id}
                onChange={(e) => updateCondition(index, { question_id: e.target.value })}
                aria-label={`Condition ${index + 1} question`}
                className={`${SELECT_CLASS} flex-1 min-w-[160px]`}
              >
                <option value="">Select question...</option>
                {questions.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.code} — {q.title}
                  </option>
                ))}
              </select>

              {/* Operator selector */}
              <select
                value={condition.operator}
                onChange={(e) =>
                  updateCondition(index, { operator: e.target.value as QuotaOperator })
                }
                aria-label={`Condition ${index + 1} operator`}
                className={`${SELECT_CLASS} w-[180px]`}
              >
                {OPERATOR_OPTIONS.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>

              {/* Value input */}
              <Input
                value={condition.value}
                onChange={(e) => updateCondition(index, { value: e.target.value })}
                placeholder={
                  condition.operator === 'in'
                    ? 'val1, val2, ...'
                    : 'Value'
                }
                aria-label={`Condition ${index + 1} value`}
                className="flex-1 min-w-[120px]"
              />

              {/* Remove button */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeCondition(index)}
                aria-label={`Remove condition ${index + 1}`}
                className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ConditionBuilder

// Helper to convert ConditionRow[] (string values) → QuotaCondition[] (typed values)
export function conditionRowsToQuotaConditions(rows: ConditionRow[]): QuotaCondition[] {
  return rows.map((row) => {
    let value: QuotaCondition['value'] = row.value
    if (row.operator === 'in') {
      value = row.value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    }
    return {
      question_id: row.question_id,
      operator: row.operator,
      value,
    }
  })
}

// Helper to convert QuotaCondition[] → ConditionRow[] (string values for form)
export function quotaConditionsToConditionRows(conditions: QuotaCondition[]): ConditionRow[] {
  return conditions.map((c) => ({
    question_id: c.question_id,
    operator: c.operator,
    value: Array.isArray(c.value) ? c.value.join(', ') : String(c.value),
  }))
}
