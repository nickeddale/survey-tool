/**
 * LogicEditor — visual condition builder for relevance expressions.
 *
 * Provides a toggle between:
 * - Visual builder: condition rows with question selector, operator selector, value input
 * - Raw expression editor: direct text editing
 *
 * The visual builder supports AND/OR grouping with up to two levels of nesting.
 * A raw expression preview updates in real-time from the visual builder.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { BuilderQuestion } from '../../store/builderStore'
import surveyService from '../../services/surveyService'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OperatorType =
  | '=='
  | '!='
  | '>'
  | '<'
  | '>='
  | '<='
  | 'contains'
  | 'is_empty'
  | 'is_not_empty'

interface ConditionRow {
  type: 'condition'
  id: string
  questionCode: string
  operator: OperatorType
  value: string
}

interface ConditionGroup {
  type: 'group'
  id: string
  logic: 'and' | 'or'
  items: Array<ConditionRow | ConditionGroup>
}

// ---------------------------------------------------------------------------
// Operator definitions per question category
// ---------------------------------------------------------------------------

const TEXT_OPERATORS: Array<{ value: OperatorType; label: string }> = [
  { value: '==', label: 'equals' },
  { value: '!=', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
]

const NUMERIC_OPERATORS: Array<{ value: OperatorType; label: string }> = [
  { value: '==', label: 'equals' },
  { value: '!=', label: 'not equals' },
  { value: '>', label: 'greater than' },
  { value: '<', label: 'less than' },
  { value: '>=', label: 'greater than or equal' },
  { value: '<=', label: 'less than or equal' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
]

const CHOICE_OPERATORS: Array<{ value: OperatorType; label: string }> = [
  { value: '==', label: 'equals' },
  { value: '!=', label: 'not equals' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
]

const BOOLEAN_OPERATORS: Array<{ value: OperatorType; label: string }> = [
  { value: '==', label: 'equals' },
  { value: '!=', label: 'not equals' },
]

function getOperatorsForType(questionType: string): Array<{ value: OperatorType; label: string }> {
  if (['numeric', 'rating', 'date'].includes(questionType)) return NUMERIC_OPERATORS
  if (['radio', 'dropdown', 'checkbox', 'ranking', 'image_picker'].includes(questionType))
    return CHOICE_OPERATORS
  if (questionType === 'boolean') return BOOLEAN_OPERATORS
  return TEXT_OPERATORS
}

// ---------------------------------------------------------------------------
// Expression serializer / parser
// ---------------------------------------------------------------------------

let _idCounter = 0
function genId(): string {
  return `c_${++_idCounter}_${Date.now()}`
}

function serializeItem(item: ConditionRow | ConditionGroup): string {
  if (item.type === 'condition') {
    return serializeCondition(item)
  }
  return serializeGroup(item)
}

function serializeCondition(row: ConditionRow): string {
  if (!row.questionCode) return ''
  if (row.operator === 'is_empty') return `{${row.questionCode}} == ''`
  if (row.operator === 'is_not_empty') return `{${row.questionCode}} != ''`
  if (row.operator === 'contains') return `{${row.questionCode}} contains '${row.value}'`
  const needsQuotes = isNaN(Number(row.value)) || row.value === ''
  const valueStr = needsQuotes ? `'${row.value}'` : row.value
  return `{${row.questionCode}} ${row.operator} ${valueStr}`
}

function serializeGroup(group: ConditionGroup): string {
  const parts = group.items.map(serializeItem).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  const joined = parts.join(` ${group.logic.toUpperCase()} `)
  return `(${joined})`
}

function serializeRootGroup(group: ConditionGroup): string {
  const parts = group.items.map(serializeItem).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  return parts.join(` ${group.logic.toUpperCase()} `)
}

/**
 * Attempts to parse a simple expression string back into a ConditionGroup tree.
 * Returns null if parsing fails (caller falls back to raw mode).
 *
 * Supports patterns:
 *   {CODE} == 'value'
 *   {CODE} != value
 *   {CODE} > 5
 *   {CODE} contains 'text'
 *   {CODE} == ''   (maps to is_empty)
 *   {CODE} != ''   (maps to is_not_empty)
 *   expr1 AND expr2 AND expr3
 *   expr1 OR expr2 OR expr3
 *   (nested groups not parsed — falls back to raw mode)
 */
function parseExpression(expr: string): ConditionGroup | null {
  const trimmed = expr.trim()
  if (!trimmed) {
    return makeEmptyGroup()
  }

  // Try splitting on top-level AND / OR (not inside parentheses)
  // We only support flat AND or flat OR at top level — nested parens fall back to raw
  if (trimmed.includes('(') || trimmed.includes(')')) {
    return null
  }

  // Determine top-level logic connector
  const upperExpr = trimmed
  let logic: 'and' | 'or' = 'and'
  let parts: string[] = []

  if (/ AND /i.test(upperExpr)) {
    logic = 'and'
    parts = trimmed.split(/ AND /i)
  } else if (/ OR /i.test(upperExpr)) {
    logic = 'or'
    parts = trimmed.split(/ OR /i)
  } else {
    parts = [trimmed]
  }

  const items: ConditionRow[] = []
  for (const part of parts) {
    const row = parseCondition(part.trim())
    if (!row) return null
    items.push(row)
  }

  return {
    type: 'group',
    id: genId(),
    logic,
    items,
  }
}

function parseCondition(expr: string): ConditionRow | null {
  // Match {CODE} operator value
  const codeMatch = expr.match(/^\{([^}]+)\}\s*(.+)$/)
  if (!codeMatch) return null

  const questionCode = codeMatch[1]
  const rest = codeMatch[2].trim()

  // is_empty / is_not_empty patterns: == '' or != ''
  if (rest === "== ''") {
    return { type: 'condition', id: genId(), questionCode, operator: 'is_empty', value: '' }
  }
  if (rest === "!= ''") {
    return { type: 'condition', id: genId(), questionCode, operator: 'is_not_empty', value: '' }
  }

  // contains pattern
  const containsMatch = rest.match(/^contains\s+'(.*)'\s*$/i)
  if (containsMatch) {
    return {
      type: 'condition',
      id: genId(),
      questionCode,
      operator: 'contains',
      value: containsMatch[1],
    }
  }

  // Standard binary operators: ==, !=, >=, <=, >, <
  const opMatch = rest.match(/^(==|!=|>=|<=|>|<)\s*(.+)$/)
  if (!opMatch) return null

  const operator = opMatch[1] as OperatorType
  let value = opMatch[2].trim()

  // Strip quotes from string values
  if ((value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))) {
    value = value.slice(1, -1)
  }

  return { type: 'condition', id: genId(), questionCode, operator, value }
}

function makeEmptyGroup(): ConditionGroup {
  return {
    type: 'group',
    id: genId(),
    logic: 'and',
    items: [makeEmptyCondition()],
  }
}

function makeEmptyCondition(): ConditionRow {
  return { type: 'condition', id: genId(), questionCode: '', operator: '==', value: '' }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LogicEditorProps {
  /** The survey ID (for validation API calls) */
  surveyId: string
  /** The current question's sort_order — only show questions with lower sort_order */
  currentSortOrder: number
  /** All questions across all groups, ordered by sort_order */
  previousQuestions: BuilderQuestion[]
  /** Current relevance expression string */
  value: string
  /** Called when the expression changes */
  onChange: (value: string) => void
  /** Disable editing */
  disabled?: boolean
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ConditionRowEditorProps {
  row: ConditionRow
  previousQuestions: BuilderQuestion[]
  onChange: (updated: ConditionRow) => void
  onRemove: () => void
  disabled?: boolean
  isOnly: boolean
}

function ConditionRowEditor({
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

interface ValueInputProps {
  question: BuilderQuestion
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

function ValueInput({ question, value, onChange, disabled }: ValueInputProps) {
  const type = question.question_type

  if (type === 'boolean') {
    return (
      <select
        className="rounded-md border border-input bg-background px-2 py-1 text-sm
          focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label="Boolean value"
      >
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    )
  }

  if (['radio', 'dropdown', 'checkbox', 'ranking', 'image_picker'].includes(type)) {
    if (question.answer_options.length > 0) {
      return (
        <select
          className="rounded-md border border-input bg-background px-2 py-1 text-sm
            focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label="Choice value"
        >
          <option value="">Select option…</option>
          {question.answer_options
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((opt) => (
              <option key={opt.id} value={opt.code}>
                {opt.title}
              </option>
            ))}
        </select>
      )
    }
  }

  if (['numeric', 'rating'].includes(type)) {
    return (
      <input
        type="number"
        className="rounded-md border border-input bg-background px-2 py-1 text-sm
          focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 w-24"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label="Numeric value"
      />
    )
  }

  return (
    <input
      type="text"
      className="rounded-md border border-input bg-background px-2 py-1 text-sm
        focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 flex-1 min-w-0"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder="value"
      aria-label="Condition value"
    />
  )
}

interface ConditionGroupEditorProps {
  group: ConditionGroup
  previousQuestions: BuilderQuestion[]
  onChange: (updated: ConditionGroup) => void
  onRemove?: () => void
  disabled?: boolean
  depth: number
}

function ConditionGroupEditor({
  group,
  previousQuestions,
  onChange,
  onRemove,
  disabled,
  depth,
}: ConditionGroupEditorProps) {
  function updateItem(index: number, updated: ConditionRow | ConditionGroup) {
    const newItems = [...group.items]
    newItems[index] = updated
    onChange({ ...group, items: newItems })
  }

  function removeItem(index: number) {
    const newItems = group.items.filter((_, i) => i !== index)
    onChange({ ...group, items: newItems })
  }

  function addCondition() {
    onChange({ ...group, items: [...group.items, makeEmptyCondition()] })
  }

  function addGroup() {
    onChange({ ...group, items: [...group.items, makeEmptyGroup()] })
  }

  function toggleLogic() {
    onChange({ ...group, logic: group.logic === 'and' ? 'or' : 'and' })
  }

  return (
    <div
      className={`space-y-2 ${depth > 0 ? 'border-l-2 border-muted pl-3 ml-1' : ''}`}
      data-testid={`condition-group-${group.id}`}
    >
      {/* Group header with AND/OR toggle */}
      <div className="flex items-center gap-2">
        {group.items.length > 1 && (
          <button
            type="button"
            className={`text-xs font-semibold px-2 py-0.5 rounded border transition-colors
              ${group.logic === 'and'
                ? 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200'
                : 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200'
              } disabled:opacity-50`}
            onClick={toggleLogic}
            disabled={disabled}
            aria-label={`Logic: ${group.logic.toUpperCase()}`}
            title="Click to toggle AND/OR"
          >
            {group.logic.toUpperCase()}
          </button>
        )}
        {depth > 0 && onRemove && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-destructive transition-colors ml-auto"
            onClick={onRemove}
            disabled={disabled}
            aria-label="Remove group"
          >
            Remove group
          </button>
        )}
      </div>

      {/* Condition items */}
      {group.items.map((item, index) => (
        <div key={item.id}>
          {item.type === 'condition' ? (
            <ConditionRowEditor
              row={item}
              previousQuestions={previousQuestions}
              onChange={(updated) => updateItem(index, updated)}
              onRemove={() => removeItem(index)}
              disabled={disabled}
              isOnly={group.items.length === 1}
            />
          ) : (
            depth < 2 && (
              <ConditionGroupEditor
                group={item}
                previousQuestions={previousQuestions}
                onChange={(updated) => updateItem(index, updated)}
                onRemove={() => removeItem(index)}
                disabled={disabled}
                depth={depth + 1}
              />
            )
          )}
        </div>
      ))}

      {/* Add buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors
            border border-dashed border-muted-foreground/40 rounded px-2 py-0.5"
          onClick={addCondition}
          disabled={disabled}
          aria-label="Add condition"
        >
          + Add condition
        </button>
        {depth < 1 && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors
              border border-dashed border-muted-foreground/40 rounded px-2 py-0.5"
            onClick={addGroup}
            disabled={disabled}
            aria-label="Add group"
          >
            + Add group
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main LogicEditor component
// ---------------------------------------------------------------------------

export function LogicEditor({
  surveyId,
  currentSortOrder,
  previousQuestions,
  value,
  onChange,
  disabled = false,
}: LogicEditorProps) {
  // Filter to only questions that appear before this one
  const eligibleQuestions = previousQuestions.filter(
    (q) => q.sort_order < currentSortOrder,
  )

  // Mode: 'visual' or 'raw'
  const [mode, setMode] = useState<'visual' | 'raw'>('visual')

  // Visual builder state
  const [conditionGroup, setConditionGroup] = useState<ConditionGroup>(() => {
    const parsed = parseExpression(value)
    return parsed ?? makeEmptyGroup()
  })

  // Whether the current expression could be parsed (if not, force raw mode)
  const [canVisual, setCanVisual] = useState(() => parseExpression(value) !== null || !value)

  // Raw expression state (only used in raw mode)
  const [rawValue, setRawValue] = useState(value)

  // Validation state
  const [validationResult, setValidationResult] = useState<{
    valid: boolean
    errors: string[]
    warnings: string[]
  } | null>(null)
  const [isValidating, setIsValidating] = useState(false)

  const validateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // When external value changes (e.g. question selection changes), re-sync
  const prevValueRef = useRef(value)
  useEffect(() => {
    if (value === prevValueRef.current) return
    prevValueRef.current = value

    const parsed = parseExpression(value)
    if (parsed) {
      setConditionGroup(parsed)
      setCanVisual(true)
    } else {
      setCanVisual(!value)
      if (!value) setConditionGroup(makeEmptyGroup())
    }
    setRawValue(value)
  }, [value])

  // Debounced validation call
  const scheduleValidation = useCallback(
    (expr: string) => {
      if (validateTimerRef.current !== null) clearTimeout(validateTimerRef.current)
      if (!expr.trim()) {
        setValidationResult(null)
        return
      }
      setIsValidating(true)
      validateTimerRef.current = setTimeout(async () => {
        validateTimerRef.current = null
        try {
          const result = await surveyService.validateExpression(surveyId, { expression: expr })
          setValidationResult(result)
        } catch {
          setValidationResult(null)
        } finally {
          setIsValidating(false)
        }
      }, 600)
    },
    [surveyId],
  )

  useEffect(() => {
    return () => {
      if (validateTimerRef.current !== null) clearTimeout(validateTimerRef.current)
    }
  }, [])

  // When visual group changes, serialize and propagate
  function handleGroupChange(updated: ConditionGroup) {
    setConditionGroup(updated)
    const serialized = serializeRootGroup(updated)
    onChange(serialized)
    scheduleValidation(serialized)
  }

  // When raw value changes
  function handleRawChange(val: string) {
    setRawValue(val)
    onChange(val)
    scheduleValidation(val)
  }

  // Toggle mode
  function handleModeToggle(newMode: 'visual' | 'raw') {
    if (newMode === 'visual') {
      const parsed = parseExpression(rawValue)
      if (parsed) {
        setConditionGroup(parsed)
        setCanVisual(true)
      } else {
        // Can't parse — stay in raw if expression is non-empty
        if (rawValue.trim()) {
          setCanVisual(false)
          return
        }
        setConditionGroup(makeEmptyGroup())
        setCanVisual(true)
      }
    } else {
      // Going to raw — serialize current visual state
      const serialized = serializeRootGroup(conditionGroup)
      setRawValue(serialized)
    }
    setMode(newMode)
  }

  // Derived preview expression
  const previewExpression =
    mode === 'visual' ? serializeRootGroup(conditionGroup) : rawValue

  return (
    <div className="space-y-2" data-testid="logic-editor">
      {/* Mode toggle */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={`text-xs px-2 py-0.5 rounded transition-colors border ${
            mode === 'visual'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-muted-foreground border-input hover:bg-muted'
          }`}
          onClick={() => handleModeToggle('visual')}
          disabled={disabled || (!canVisual && !!value)}
          title={!canVisual && !!value ? 'Expression cannot be parsed visually — edit in Raw mode' : undefined}
          data-testid="logic-editor-mode-visual"
        >
          Visual
        </button>
        <button
          type="button"
          className={`text-xs px-2 py-0.5 rounded transition-colors border ${
            mode === 'raw'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-muted-foreground border-input hover:bg-muted'
          }`}
          onClick={() => handleModeToggle('raw')}
          disabled={disabled}
          data-testid="logic-editor-mode-raw"
        >
          Raw
        </button>
      </div>

      {/* Visual builder */}
      {mode === 'visual' && (
        <div className="space-y-2">
          {eligibleQuestions.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No previous questions available to reference.
            </p>
          ) : (
            <ConditionGroupEditor
              group={conditionGroup}
              previousQuestions={eligibleQuestions}
              onChange={handleGroupChange}
              disabled={disabled}
              depth={0}
            />
          )}
        </div>
      )}

      {/* Raw expression editor */}
      {mode === 'raw' && (
        <textarea
          className={`w-full rounded-md border px-2 py-1.5 text-sm font-mono resize-none
            focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50
            ${validationResult && !validationResult.valid ? 'border-destructive' : 'border-input'}
            bg-background`}
          rows={2}
          value={rawValue}
          onChange={(e) => handleRawChange(e.target.value)}
          disabled={disabled}
          placeholder="e.g. {Q1} == 'yes'"
          aria-label="Raw relevance expression"
          data-testid="logic-editor-raw-input"
        />
      )}

      {/* Expression preview (shown in visual mode) */}
      {mode === 'visual' && previewExpression && (
        <div className="rounded bg-muted px-2 py-1">
          <span className="text-xs text-muted-foreground font-mono">{previewExpression}</span>
        </div>
      )}

      {/* Validation feedback */}
      {isValidating && (
        <p className="text-xs text-muted-foreground" data-testid="logic-editor-validating">
          Validating…
        </p>
      )}
      {!isValidating && validationResult && (
        <div>
          {validationResult.errors.map((err, i) => (
            <p
              key={i}
              className="text-xs text-destructive"
              role="alert"
              data-testid="logic-editor-error"
            >
              {err}
            </p>
          ))}
          {validationResult.warnings.map((warn, i) => (
            <p
              key={i}
              className="text-xs text-amber-600"
              role="status"
              data-testid="logic-editor-warning"
            >
              {warn}
            </p>
          ))}
          {validationResult.valid && validationResult.errors.length === 0 && previewExpression && (
            <p className="text-xs text-green-600" data-testid="logic-editor-valid">
              Expression is valid
            </p>
          )}
        </div>
      )}
    </div>
  )
}
