/**
 * DateInput — date (and optional datetime) input for date questions.
 *
 * Handles: include_time (date vs datetime-local), min_date/max_date enforcement,
 * placeholder support, required validation on blur.
 */

import { useState } from 'react'
import type { BuilderQuestion } from '../../store/builderStore'
import type { DateSettings } from '../../types/questionSettings'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DateInputProps {
  value: string
  onChange: (value: string) => void
  question: BuilderQuestion
  errors?: string[]
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validate(value: string, s: Partial<DateSettings>, isRequired: boolean): string[] {
  const errs: string[] = []
  if (value.trim() === '') {
    if (isRequired) errs.push('This field is required.')
    return errs
  }

  const date = new Date(value)
  if (isNaN(date.getTime())) {
    errs.push('Please enter a valid date.')
    return errs
  }

  if (s.min_date) {
    const minDate = new Date(s.min_date)
    if (!isNaN(minDate.getTime()) && date < minDate) {
      errs.push(`Date must be on or after ${s.min_date}.`)
    }
  }

  if (s.max_date) {
    const maxDate = new Date(s.max_date)
    if (!isNaN(maxDate.getTime()) && date > maxDate) {
      errs.push(`Date must be on or before ${s.max_date}.`)
    }
  }

  return errs
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DateInput({ value, onChange, question, errors: externalErrors }: DateInputProps) {
  const s = (question.settings ?? {}) as Partial<DateSettings>
  const includeTime = s.include_time ?? false
  const minDate = s.min_date ?? undefined
  const maxDate = s.max_date ?? undefined
  const placeholder = s.placeholder ?? ''

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
    <div className="space-y-1" data-testid={`date-input-${question.id}`}>
      <input
        id={inputId}
        type={includeTime ? 'datetime-local' : 'date'}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        min={minDate}
        max={maxDate}
        aria-invalid={hasErrors}
        aria-describedby={hasErrors ? errorId : undefined}
        className={[
          'w-full rounded-md border bg-background px-3 py-2 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-ring',
          hasErrors ? 'border-destructive focus:ring-destructive' : 'border-input',
        ].join(' ')}
        data-testid="date-input"
      />

      {hasErrors && (
        <ul id={errorId} role="alert" aria-live="assertive" className="space-y-0.5" data-testid="date-errors">
          {displayErrors.map((err, i) => (
            <li key={i} className="text-xs text-destructive">
              {err}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default DateInput
