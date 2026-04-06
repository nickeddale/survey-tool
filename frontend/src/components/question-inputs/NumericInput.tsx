/**
 * NumericInput — interactive number input for numeric questions.
 *
 * Handles: prefix/suffix labels, min/max/decimal_places constraints,
 * required validation and range validation on blur.
 */

import { useState } from 'react'
import type { BuilderQuestion } from '../../store/builderStore'
import type { NumericSettings } from '../../types/questionSettings'
import { ValidationErrors } from '../common/ValidationErrors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NumericInputProps {
  value: string
  onChange: (value: string) => void
  question: BuilderQuestion
  errors?: string[]
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validate(value: string, s: Partial<NumericSettings>, isRequired: boolean): string[] {
  const errs: string[] = []
  if (value.trim() === '') {
    if (isRequired) errs.push('This field is required.')
    return errs
  }

  const num = parseFloat(value)
  if (isNaN(num)) {
    errs.push('Please enter a valid number.')
    return errs
  }

  if (s.min !== null && s.min !== undefined && num < s.min) {
    errs.push(`Value must be at least ${s.min}.`)
  }
  if (s.max !== null && s.max !== undefined && num > s.max) {
    errs.push(`Value must be at most ${s.max}.`)
  }

  const decimalPlaces = s.decimal_places ?? 0
  const decimalMatch = value.match(/\.(\d+)$/)
  const actualDecimals = decimalMatch ? decimalMatch[1].length : 0
  if (actualDecimals > decimalPlaces) {
    errs.push(`Maximum ${decimalPlaces} decimal place${decimalPlaces === 1 ? '' : 's'} allowed.`)
  }

  return errs
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NumericInput({ value, onChange, question, errors: externalErrors }: NumericInputProps) {
  const s = (question.settings ?? {}) as Partial<NumericSettings>
  const prefix = s.prefix ?? null
  const suffix = s.suffix ?? null
  const placeholder = s.placeholder ?? ''
  const min = s.min ?? undefined
  const max = s.max ?? undefined
  const decimalPlaces = s.decimal_places ?? 0
  const step = decimalPlaces > 0 ? Math.pow(10, -decimalPlaces) : 1

  const [touched, setTouched] = useState(false)
  const [internalErrors, setInternalErrors] = useState<string[]>([])

  const displayErrors = externalErrors ?? (touched ? internalErrors : [])
  const hasErrors = displayErrors.length > 0
  const inputId = `question-${question.id}`
  const errorId = `${inputId}-error`

  function handleBlur() {
    setTouched(true)
    setInternalErrors(validate(value, s, question.is_required))
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value)
    if (touched) {
      setInternalErrors(validate(e.target.value, s, question.is_required))
    }
  }

  return (
    <div className="space-y-1" data-testid={`numeric-input-${question.id}`}>
      <div className="flex items-center gap-2">
        {prefix && (
          <span className="text-sm text-muted-foreground" data-testid="numeric-prefix">
            {prefix}
          </span>
        )}
        <input
          id={inputId}
          type="number"
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          aria-invalid={hasErrors}
          aria-describedby={hasErrors ? errorId : undefined}
          className={[
            'w-full rounded-md border bg-background px-3 py-2 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-ring',
            hasErrors ? 'border-destructive focus:ring-destructive' : 'border-input',
          ].join(' ')}
          data-testid="numeric-input"
        />
        {suffix && (
          <span className="text-sm text-muted-foreground" data-testid="numeric-suffix">
            {suffix}
          </span>
        )}
      </div>

      <ValidationErrors errors={displayErrors} id={errorId} />
    </div>
  )
}

export default NumericInput
