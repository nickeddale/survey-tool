/**
 * DropdownInput — interactive select/combobox input for dropdown questions.
 *
 * Handles: placeholder option, optional search filter (when searchable=true),
 * optional 'Other' option that reveals a text input, required validation on blur.
 */

import { useState, useMemo } from 'react'
import type { BuilderQuestion } from '../../store/builderStore'
import type { DropdownSettings } from '../../types/questionSettings'
import { ValidationErrors } from '../common/ValidationErrors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DropdownInputProps {
  value: string
  onChange: (value: string) => void
  question: BuilderQuestion
  errors?: string[]
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validate(value: string, otherText: string, isOther: boolean, isRequired: boolean): string[] {
  const errs: string[] = []
  if (isRequired && value === '') {
    errs.push('This field is required.')
  }
  if (isOther && otherText.trim() === '') {
    errs.push('Please specify a value for "Other".')
  }
  return errs
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DropdownInput({ value, onChange, question, errors: externalErrors }: DropdownInputProps) {
  const s = (question.settings ?? {}) as Partial<DropdownSettings>
  const placeholder = s.placeholder ?? 'Select an option'
  const searchable = s.searchable ?? false
  const hasOther = s.has_other ?? false
  const otherLabel = s.other_text ?? 'Other'

  const OTHER_VALUE = '__other__'

  const [touched, setTouched] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [otherText, setOtherText] = useState('')
  const [internalErrors, setInternalErrors] = useState<string[]>([])

  const isOther = value === OTHER_VALUE

  const displayErrors = externalErrors ?? (touched ? internalErrors : [])
  const hasErrors = displayErrors.length > 0
  const inputId = `question-${question.id}`
  const errorId = `${inputId}-error`

  const filteredOptions = useMemo(() => {
    if (!searchable || searchQuery.trim() === '') return question.answer_options
    const q = searchQuery.toLowerCase()
    return question.answer_options.filter((o) => o.title.toLowerCase().includes(q))
  }, [question.answer_options, searchable, searchQuery])

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newValue = e.target.value
    onChange(newValue)
    if (touched) {
      setInternalErrors(validate(newValue, otherText, newValue === OTHER_VALUE, question.is_required))
    }
  }

  function handleOtherTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value
    setOtherText(text)
    if (touched) {
      setInternalErrors(validate(OTHER_VALUE, text, true, question.is_required))
    }
  }

  function handleBlur() {
    setTouched(true)
    setInternalErrors(validate(value, otherText, isOther, question.is_required))
  }

  return (
    <div className="space-y-2" data-testid={`dropdown-input-${question.id}`}>
      {searchable && (
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search options..."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          data-testid="dropdown-search"
        />
      )}

      <select
        id={inputId}
        value={value}
        onChange={handleSelectChange}
        onBlur={handleBlur}
        aria-invalid={hasErrors}
        aria-describedby={hasErrors ? errorId : undefined}
        className={[
          'w-full rounded-md border bg-background px-3 py-2 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-ring',
          hasErrors ? 'border-destructive focus:ring-destructive' : 'border-input',
        ].join(' ')}
        data-testid="dropdown-select"
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {filteredOptions.map((option) => (
          <option key={option.id} value={option.id} data-testid={`dropdown-option-${option.id}`}>
            {option.title}
          </option>
        ))}
        {hasOther && (
          <option value={OTHER_VALUE} data-testid="dropdown-option-other">
            {otherLabel}
          </option>
        )}
      </select>

      {isOther && (
        <input
          type="text"
          value={otherText}
          onChange={handleOtherTextChange}
          placeholder="Please specify..."
          className={[
            'w-full rounded-md border bg-background px-3 py-2 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-ring',
            hasErrors ? 'border-destructive focus:ring-destructive' : 'border-input',
          ].join(' ')}
          data-testid="dropdown-other-text"
        />
      )}

      <ValidationErrors errors={displayErrors} id={errorId} />
    </div>
  )
}

export default DropdownInput
