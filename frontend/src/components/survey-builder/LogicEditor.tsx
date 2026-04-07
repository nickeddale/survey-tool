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
import type { ValidateExpressionResult } from '../../types/survey'
import { ExpressionPreview } from './ExpressionPreview'
import type { ConditionGroup } from './logic/types'
import {
  parseExpression,
  serializeRootGroup,
  makeEmptyGroup,
} from './logic/expressionUtils'
import { ConditionGroupEditor } from './logic/ConditionGroupEditor'
import { ValidationFeedback } from './logic/ValidationFeedback'

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

  // Validation state — uses structured errors/warnings matching backend schema
  const [validationResult, setValidationResult] = useState<ValidateExpressionResult | null>(null)
  const [isValidating, setIsValidating] = useState(false)

  // Test Expression panel toggle
  const [showTestPanel, setShowTestPanel] = useState(false)

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
      }, 500)
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
            ${validationResult && validationResult.errors.length > 0 ? 'border-destructive' : 'border-input'}
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
        <div className="flex items-center gap-1.5" data-testid="logic-editor-validating">
          <svg
            className="animate-spin h-3 w-3 text-muted-foreground"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="text-xs text-muted-foreground">Validating…</span>
        </div>
      )}
      {!isValidating && validationResult && (
        <ValidationFeedback
          validationResult={validationResult}
          previewExpression={previewExpression}
          showTestPanel={showTestPanel}
          disabled={disabled}
          onToggleTest={() => setShowTestPanel((v) => !v)}
        />
      )}

      {/* Test Expression panel */}
      {showTestPanel && validationResult && validationResult.errors.length === 0 && previewExpression && (
        <ExpressionPreview
          surveyId={surveyId}
          expression={previewExpression}
          parsedVariables={validationResult.parsed_variables}
          disabled={disabled}
        />
      )}
    </div>
  )
}
