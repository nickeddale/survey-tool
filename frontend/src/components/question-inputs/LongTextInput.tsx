/**
 * LongTextInput — interactive textarea for long_text questions.
 *
 * Handles: configurable rows, placeholder, max_length character counter,
 * required validation on blur.
 */

import { useState } from 'react'
import type { BuilderQuestion } from '../../store/builderStore'
import type { LongTextSettings } from '../../types/questionSettings'
import { ValidationErrors } from '../common/ValidationErrors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LongTextInputProps {
  value: string
  onChange: (value: string) => void
  question: BuilderQuestion
  errors?: string[]
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validate(value: string, s: Partial<LongTextSettings>, isRequired: boolean): string[] {
  const errs: string[] = []
  if (isRequired && value.trim() === '') {
    errs.push('This field is required.')
    return errs
  }
  if (value === '') return errs
  if (s.max_length && value.length > s.max_length) {
    errs.push(`Maximum ${s.max_length} characters allowed.`)
  }
  return errs
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LongTextInput({ value, onChange, question, errors: externalErrors }: LongTextInputProps) {
  const s = (question.settings ?? {}) as Partial<LongTextSettings>
  const rows = s.rows ?? 4
  const maxLength = s.max_length ?? null
  const placeholder = s.placeholder ?? ''

  const [touched, setTouched] = useState(false)
  const [internalErrors, setInternalErrors] = useState<string[]>([])

  const displayErrors = externalErrors ?? (touched ? internalErrors : [])
  const hasErrors = displayErrors.length > 0
  const textareaId = `question-${question.id}`
  const errorId = `${textareaId}-error`

  function handleBlur() {
    setTouched(true)
    setInternalErrors(validate(value, s, question.is_required))
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value)
    if (touched) {
      setInternalErrors(validate(e.target.value, s, question.is_required))
    }
  }

  return (
    <div className="space-y-1" data-testid={`long-text-input-${question.id}`}>
      <textarea
        id={textareaId}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        rows={rows}
        placeholder={placeholder}
        maxLength={maxLength ?? undefined}
        aria-invalid={hasErrors}
        aria-describedby={hasErrors ? errorId : undefined}
        className={[
          'w-full rounded-md border bg-background px-3 py-2 text-sm resize-y',
          'focus:outline-none focus:ring-2 focus:ring-ring',
          hasErrors ? 'border-destructive focus:ring-destructive' : 'border-input',
        ].join(' ')}
        data-testid="long-text-input"
      />

      {maxLength !== null && (
        <p
          className={`text-xs text-right ${value.length > maxLength ? 'text-destructive' : 'text-muted-foreground'}`}
          aria-live="polite"
          data-testid="long-text-char-counter"
        >
          {value.length}/{maxLength}
        </p>
      )}

      <ValidationErrors errors={displayErrors} id={errorId} />
    </div>
  )
}

export default LongTextInput
