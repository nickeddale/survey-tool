import type { ConditionRowEditorProps, OperatorType } from './types'
import { getOperatorsForType, TEXT_OPERATORS } from './expressionUtils'
import { ValueInput } from './ValueInput'

export function ConditionRowEditor({
  row,
  previousQuestions,
  onChange,
  onRemove,
  disabled,
  isOnly,
}: ConditionRowEditorProps) {
  const selectedQuestion = previousQuestions.find((q) => q.code === row.questionCode) ?? null
  const operators = selectedQuestion
    ? getOperatorsForType(selectedQuestion.question_type)
    : TEXT_OPERATORS

  // When question changes, reset operator to first valid one
  function handleQuestionChange(code: string) {
    const q = previousQuestions.find((q) => q.code === code) ?? null
    const ops = q ? getOperatorsForType(q.question_type) : TEXT_OPERATORS
    const validOp = ops.find((o) => o.value === row.operator) ? row.operator : ops[0].value
    onChange({ ...row, questionCode: code, operator: validOp, value: '' })
  }

  function handleOperatorChange(op: OperatorType) {
    onChange({ ...row, operator: op, value: '' })
  }

  function handleValueChange(val: string) {
    onChange({ ...row, value: val })
  }

  const isEmptyOp = row.operator === 'is_empty' || row.operator === 'is_not_empty'

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Question selector */}
      <select
        className="rounded-md border border-input bg-background px-2 py-1 text-sm
          focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 min-w-0 flex-1"
        value={row.questionCode}
        onChange={(e) => handleQuestionChange(e.target.value)}
        disabled={disabled}
        aria-label="Select question"
      >
        <option value="">Select question…</option>
        {previousQuestions.map((q) => (
          <option key={q.id} value={q.code}>
            {q.code}: {q.title}
          </option>
        ))}
      </select>

      {/* Operator selector */}
      <select
        className="rounded-md border border-input bg-background px-2 py-1 text-sm
          focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        value={row.operator}
        onChange={(e) => handleOperatorChange(e.target.value as OperatorType)}
        disabled={disabled || !row.questionCode}
        aria-label="Select operator"
      >
        {operators.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>

      {/* Value input — adapts to question type */}
      {!isEmptyOp && selectedQuestion && (
        <ValueInput
          question={selectedQuestion}
          value={row.value}
          onChange={handleValueChange}
          disabled={disabled}
        />
      )}

      {/* Remove button */}
      {!isOnly && (
        <button
          type="button"
          className="text-muted-foreground hover:text-destructive transition-colors text-xs px-1"
          onClick={onRemove}
          disabled={disabled}
          aria-label="Remove condition"
        >
          ✕
        </button>
      )}
    </div>
  )
}
