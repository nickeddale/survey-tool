/**
 * RadioInput — interactive radio button input for radio questions.
 *
 * Handles: columns layout (CSS grid), Fisher-Yates shuffle when randomize=true,
 * optional 'Other' free-text field, required validation on blur.
 */

import { useState, useMemo } from 'react'
import type { BuilderQuestion } from '../../store/builderStore'
import type { RadioSettings } from '../../types/questionSettings'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RadioInputProps {
  value: string
  onChange: (value: string) => void
  question: BuilderQuestion
  errors?: string[]
}

// ---------------------------------------------------------------------------
// Shuffle helper (Fisher-Yates with session-stable seed)
// ---------------------------------------------------------------------------

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

function shuffleWithSeed<T>(arr: T[], seed: number): T[] {
  const result = [...arr]
  const rand = seededRandom(seed)
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// Session-stable seed per question (computed once per session)
const sessionSeeds: Record<string, number> = {}
function getSessionSeed(questionId: string): number {
  if (!(questionId in sessionSeeds)) {
    sessionSeeds[questionId] = Math.floor(Math.random() * 2147483646) + 1
  }
  return sessionSeeds[questionId]
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

export function RadioInput({ value, onChange, question, errors: externalErrors }: RadioInputProps) {
  const s = (question.settings ?? {}) as Partial<RadioSettings>
  const columns = s.columns ?? 1
  const hasOther = s.has_other ?? false
  const otherLabel = s.other_text ?? 'Other'
  const randomize = s.randomize ?? false

  const OTHER_VALUE = '__other__'

  const [touched, setTouched] = useState(false)
  const [otherText, setOtherText] = useState('')
  const [internalErrors, setInternalErrors] = useState<string[]>([])

  const isOther = value === OTHER_VALUE

  const displayErrors = externalErrors ?? (touched ? internalErrors : [])
  const hasErrors = displayErrors.length > 0
  const inputId = `question-${question.id}`
  const errorId = `${inputId}-error`

  const orderedOptions = useMemo(() => {
    if (!randomize) return question.answer_options
    const seed = getSessionSeed(question.id)
    return shuffleWithSeed(question.answer_options, seed)
  }, [question.answer_options, question.id, randomize])

  function handleRadioChange(optionValue: string) {
    onChange(optionValue)
    if (touched) {
      setInternalErrors(validate(optionValue, otherText, optionValue === OTHER_VALUE, question.is_required))
    }
  }

  function handleOtherTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value
    setOtherText(text)
    onChange(OTHER_VALUE)
    if (touched) {
      setInternalErrors(validate(OTHER_VALUE, text, true, question.is_required))
    }
  }

  function handleBlur() {
    setTouched(true)
    setInternalErrors(validate(value, otherText, isOther, question.is_required))
  }

  return (
    <div className="space-y-2" data-testid={`radio-input-${question.id}`}>
      <div
        style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '0.5rem' }}
        data-testid="radio-options-grid"
        role="radiogroup"
        aria-invalid={hasErrors}
        aria-describedby={hasErrors ? errorId : undefined}
        onBlur={handleBlur}
      >
        {orderedOptions.map((option) => (
          <label
            key={option.id}
            className="flex items-center gap-2 cursor-pointer text-sm"
            data-testid={`radio-option-${option.id}`}
          >
            <input
              type="radio"
              name={inputId}
              value={option.id}
              checked={value === option.id}
              onChange={() => handleRadioChange(option.id)}
              className="accent-primary"
              data-testid={`radio-input-${option.id}`}
            />
            {option.title}
          </label>
        ))}

        {hasOther && (
          <label
            className="flex items-center gap-2 cursor-pointer text-sm"
            data-testid="radio-option-other"
          >
            <input
              type="radio"
              name={inputId}
              value={OTHER_VALUE}
              checked={isOther}
              onChange={() => handleRadioChange(OTHER_VALUE)}
              className="accent-primary"
              data-testid="radio-input-other"
            />
            {otherLabel}
          </label>
        )}
      </div>

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
          data-testid="radio-other-text"
        />
      )}

      {hasErrors && (
        <ul id={errorId} role="alert" aria-live="assertive" className="space-y-0.5" data-testid="radio-errors">
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

export default RadioInput
