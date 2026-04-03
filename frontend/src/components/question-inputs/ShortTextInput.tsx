/**
 * ShortTextInput — interactive single-line input for short_text questions.
 *
 * Handles: input_type (text/email/url/tel), placeholder, max_length counter,
 * required / email / url format validation on blur.
 */

import { useState } from 'react'
import type { BuilderQuestion } from '../../store/builderStore'
import type { ShortTextSettings } from '../../types/questionSettings'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TextInputProps {
  value: string
  onChange: (value: string) => void
  question: BuilderQuestion
  errors?: string[]
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL_RE = /^https?:\/\/.+/

function validate(value: string, s: Partial<ShortTextSettings>, isRequired: boolean): string[] {
  const errs: string[] = []
  if (isRequired && value.trim() === '') {
    errs.push('This field is required.')
    return errs
  }
  if (value === '') return errs
  if (s.max_length && value.length > s.max_length) {
    errs.push(`Maximum ${s.max_length} characters allowed.`)
  }
  if (s.input_type === 'email' && !EMAIL_RE.test(value)) {
    errs.push('Please enter a valid email address.')
  }
  if (s.input_type === 'url' && !URL_RE.test(value)) {
    errs.push('Please enter a valid URL (starting with http:// or https://).')
  }
  return errs
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ShortTextInput({ value, onChange, question, errors: externalErrors }: TextInputProps) {
  const s = (question.settings ?? {}) as Partial<ShortTextSettings>
  const inputType = s.input_type ?? 'text'
  const maxLength = s.max_length ?? null
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
    <div className="space-y-1" data-testid={`short-text-input-${question.id}`}>
      <input
        id={inputId}
        type={inputType}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        maxLength={maxLength ?? undefined}
        aria-invalid={hasErrors}
        aria-describedby={hasErrors ? errorId : undefined}
        className={[
          'w-full rounded-md border bg-background px-3 py-2 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-ring',
          hasErrors ? 'border-destructive focus:ring-destructive' : 'border-input',
        ].join(' ')}
        data-testid="short-text-input"
      />

      {maxLength !== null && (
        <p
          className={`text-xs text-right ${value.length > maxLength ? 'text-destructive' : 'text-muted-foreground'}`}
          aria-live="polite"
          data-testid="short-text-char-counter"
        >
          {value.length}/{maxLength}
        </p>
      )}

      {hasErrors && (
        <ul id={errorId} role="alert" aria-live="assertive" className="space-y-0.5" data-testid="short-text-errors">
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

export default ShortTextInput
