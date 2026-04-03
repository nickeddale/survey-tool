/**
 * ExpressionDisplay — read-only computed value placeholder for expression questions.
 *
 * Displays the evaluated expression result (or a placeholder until the expression
 * engine is available in M5). No validation needed.
 */

import type { BuilderQuestion } from '../../store/builderStore'
import type { ExpressionSettings } from '../../types/questionSettings'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExpressionDisplayProps {
  value: string | number | null
  question: BuilderQuestion
  errors?: string[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExpressionDisplay({ value, question }: ExpressionDisplayProps) {
  const s = (question.settings ?? {}) as Partial<ExpressionSettings>
  const displayFormat = s.display_format ?? 'text'
  const inputId = `question-${question.id}`

  function formatValue(val: string | number | null): string {
    if (val === null || val === undefined || val === '') {
      return ''
    }
    const numVal = typeof val === 'string' ? parseFloat(val) : val
    if (displayFormat === 'number' && !isNaN(numVal)) {
      return numVal.toLocaleString()
    }
    if (displayFormat === 'currency' && !isNaN(numVal)) {
      const currency = s.currency ?? 'USD'
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        minimumFractionDigits: s.decimal_places ?? 2,
        maximumFractionDigits: s.decimal_places ?? 2,
      }).format(numVal)
    }
    if (displayFormat === 'percent' && !isNaN(numVal)) {
      return `${numVal.toFixed(s.decimal_places ?? 0)}%`
    }
    return String(val)
  }

  const displayValue = formatValue(value)
  const isEmpty = displayValue === ''

  return (
    <div
      id={inputId}
      className="space-y-1"
      data-testid={`expression-display-${question.id}`}
    >
      <div
        role="status"
        aria-label={question.title}
        aria-readonly="true"
        aria-live="polite"
        className={[
          'rounded-md border bg-muted/30 px-3 py-2 text-sm',
          'border-input cursor-default select-text',
          isEmpty ? 'text-muted-foreground italic' : 'text-foreground',
        ].join(' ')}
        data-testid="expression-display-value"
      >
        {isEmpty ? 'Expression result will appear here' : displayValue}
      </div>
    </div>
  )
}

export default ExpressionDisplay
