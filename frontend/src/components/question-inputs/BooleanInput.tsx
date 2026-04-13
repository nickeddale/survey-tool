/**
 * BooleanInput — toggle, radio, or checkbox input for boolean questions.
 *
 * Handles: render_as (toggle/radio/checkbox), custom true_label/false_label,
 * required validation on blur.
 */

import { useState } from 'react'
import type { BuilderQuestion } from '../../store/builderStore'
import type { BooleanSettings } from '../../types/questionSettings'
import { ValidationErrors } from '../common/ValidationErrors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BooleanInputProps {
  value: string
  onChange: (value: string) => void
  question: BuilderQuestion
  errors?: string[]
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validate(value: string, isRequired: boolean): string[] {
  const errs: string[] = []
  if (isRequired && value === '') {
    errs.push('This field is required.')
  }
  return errs
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BooleanInput({
  value,
  onChange,
  question,
  errors: externalErrors,
}: BooleanInputProps) {
  const s = (question.settings ?? {}) as Partial<BooleanSettings>
  const trueLabel = s.true_label ?? 'Yes'
  const falseLabel = s.false_label ?? 'No'
  const renderAs = s.render_as ?? 'toggle'

  const [touched, setTouched] = useState(false)
  const [internalErrors, setInternalErrors] = useState<string[]>([])

  const displayErrors = externalErrors ?? (touched ? internalErrors : [])
  const hasErrors = displayErrors.length > 0
  const inputId = `question-${question.id}`
  const errorId = `${inputId}-error`

  function handleChange(newValue: string) {
    onChange(newValue)
    if (touched) {
      setInternalErrors(validate(newValue, question.is_required))
    }
  }

  function handleBlur() {
    setTouched(true)
    setInternalErrors(validate(value, question.is_required))
  }

  // ------------------------------------------------------------------
  // Toggle (checkbox styled as switch)
  // ------------------------------------------------------------------
  if (renderAs === 'toggle') {
    const isChecked = value === 'true'
    return (
      <div className="space-y-1" data-testid={`boolean-input-${question.id}`}>
        <label
          className="flex items-center gap-3 cursor-pointer"
          data-testid="boolean-toggle-label"
        >
          <button
            type="button"
            role="switch"
            aria-checked={isChecked}
            aria-invalid={hasErrors}
            aria-describedby={hasErrors ? errorId : undefined}
            onClick={() => handleChange(isChecked ? 'false' : 'true')}
            onBlur={handleBlur}
            className={[
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isChecked ? 'bg-primary' : 'bg-input',
            ].join(' ')}
            data-testid="boolean-toggle"
          >
            <span
              className={[
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                isChecked ? 'translate-x-6' : 'translate-x-1',
              ].join(' ')}
            />
          </button>
          <span className="text-sm" data-testid="boolean-toggle-current-label">
            {isChecked ? trueLabel : falseLabel}
          </span>
        </label>

        <ValidationErrors errors={displayErrors} id={errorId} />
      </div>
    )
  }

  // ------------------------------------------------------------------
  // Radio buttons
  // ------------------------------------------------------------------
  if (renderAs === 'radio') {
    return (
      <div className="space-y-1" data-testid={`boolean-input-${question.id}`}>
        <div
          role="radiogroup"
          aria-invalid={hasErrors}
          aria-describedby={hasErrors ? errorId : undefined}
          onBlur={handleBlur}
          className="flex items-center gap-4"
          data-testid="boolean-radio-group"
        >
          <label
            className="flex items-center gap-2 cursor-pointer text-sm"
            data-testid="boolean-radio-true-label"
          >
            <input
              type="radio"
              name={inputId}
              value="true"
              checked={value === 'true'}
              onChange={() => handleChange('true')}
              className="accent-primary"
              data-testid="boolean-radio-true"
            />
            {trueLabel}
          </label>
          <label
            className="flex items-center gap-2 cursor-pointer text-sm"
            data-testid="boolean-radio-false-label"
          >
            <input
              type="radio"
              name={inputId}
              value="false"
              checked={value === 'false'}
              onChange={() => handleChange('false')}
              className="accent-primary"
              data-testid="boolean-radio-false"
            />
            {falseLabel}
          </label>
        </div>

        <ValidationErrors errors={displayErrors} id={errorId} />
      </div>
    )
  }

  // ------------------------------------------------------------------
  // Checkbox (single checkbox)
  // ------------------------------------------------------------------
  return (
    <div className="space-y-1" data-testid={`boolean-input-${question.id}`}>
      <label
        className="flex items-center gap-2 cursor-pointer text-sm"
        data-testid="boolean-checkbox-label"
      >
        <input
          id={inputId}
          type="checkbox"
          checked={value === 'true'}
          onChange={(e) => handleChange(e.target.checked ? 'true' : 'false')}
          onBlur={handleBlur}
          aria-invalid={hasErrors}
          aria-describedby={hasErrors ? errorId : undefined}
          className="accent-primary"
          data-testid="boolean-checkbox"
        />
        {value === 'true' ? trueLabel : falseLabel}
      </label>

      <ValidationErrors errors={displayErrors} id={errorId} />
    </div>
  )
}

export default BooleanInput
