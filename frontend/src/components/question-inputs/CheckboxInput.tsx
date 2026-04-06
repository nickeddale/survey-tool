/**
 * CheckboxInput — interactive checkbox input for checkbox questions.
 *
 * Handles: columns layout (CSS grid), optional Select All checkbox,
 * Fisher-Yates shuffle when randomize=true, optional 'Other' checkbox+text input,
 * min/max_choices enforcement, required validation on blur.
 */

import { useState, useMemo } from 'react'
import type { BuilderQuestion } from '../../store/builderStore'
import type { CheckboxSettings } from '../../types/questionSettings'
import { ValidationErrors } from '../common/ValidationErrors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckboxInputProps {
  value: string[]
  onChange: (value: string[]) => void
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

function validate(
  selected: string[],
  otherText: string,
  hasOtherSelected: boolean,
  isRequired: boolean,
  minChoices: number | null,
  maxChoices: number | null,
): string[] {
  const errs: string[] = []
  const OTHER_VALUE = '__other__'
  const realCount = selected.filter((v) => v !== OTHER_VALUE).length + (hasOtherSelected ? 1 : 0)

  if (isRequired && selected.length === 0) {
    errs.push('This field is required.')
    return errs
  }
  if (hasOtherSelected && otherText.trim() === '') {
    errs.push('Please specify a value for "Other".')
  }
  if (minChoices !== null && realCount > 0 && realCount < minChoices) {
    errs.push(`Please select at least ${minChoices} option${minChoices !== 1 ? 's' : ''}.`)
  }
  if (maxChoices !== null && realCount > maxChoices) {
    errs.push(`Please select at most ${maxChoices} option${maxChoices !== 1 ? 's' : ''}.`)
  }
  return errs
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CheckboxInput({ value, onChange, question, errors: externalErrors }: CheckboxInputProps) {
  const s = (question.settings ?? {}) as Partial<CheckboxSettings>
  const columns = s.columns ?? 1
  const hasOther = s.has_other ?? false
  const otherLabel = s.other_text ?? 'Other'
  const randomize = s.randomize ?? false
  const selectAll = s.select_all ?? false
  const selectAllText = s.select_all_text ?? 'Select all'
  const minChoices = s.min_choices ?? null
  const maxChoices = s.max_choices ?? null

  const OTHER_VALUE = '__other__'

  const [touched, setTouched] = useState(false)
  const [otherText, setOtherText] = useState('')
  const [internalErrors, setInternalErrors] = useState<string[]>([])

  const isOtherSelected = value.includes(OTHER_VALUE)

  const displayErrors = externalErrors ?? (touched ? internalErrors : [])
  const hasErrors = displayErrors.length > 0
  const inputId = `question-${question.id}`
  const errorId = `${inputId}-error`

  const orderedOptions = useMemo(() => {
    if (!randomize) return question.answer_options
    const seed = getSessionSeed(question.id)
    return shuffleWithSeed(question.answer_options, seed)
  }, [question.answer_options, question.id, randomize])

  const allOptionIds = orderedOptions.map((o) => o.id)
  const regularSelected = value.filter((v) => v !== OTHER_VALUE)
  const isAllSelected = allOptionIds.length > 0 && allOptionIds.every((id) => regularSelected.includes(id))

  function handleCheckboxChange(optionId: string, checked: boolean) {
    let next: string[]
    if (checked) {
      next = [...value, optionId]
    } else {
      next = value.filter((v) => v !== optionId)
    }
    onChange(next)
    if (touched) {
      setInternalErrors(
        validate(next, otherText, next.includes(OTHER_VALUE), question.is_required, minChoices, maxChoices),
      )
    }
  }

  function handleSelectAll(checked: boolean) {
    let next: string[]
    if (checked) {
      const otherPart = value.filter((v) => v === OTHER_VALUE)
      next = [...allOptionIds, ...otherPart]
    } else {
      next = value.filter((v) => v === OTHER_VALUE)
    }
    onChange(next)
    if (touched) {
      setInternalErrors(
        validate(next, otherText, next.includes(OTHER_VALUE), question.is_required, minChoices, maxChoices),
      )
    }
  }

  function handleOtherTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value
    setOtherText(text)
    if (touched) {
      setInternalErrors(
        validate(value, text, isOtherSelected, question.is_required, minChoices, maxChoices),
      )
    }
  }

  function handleBlur() {
    setTouched(true)
    setInternalErrors(
      validate(value, otherText, isOtherSelected, question.is_required, minChoices, maxChoices),
    )
  }

  return (
    <div className="space-y-2" data-testid={`checkbox-input-${question.id}`} onBlur={handleBlur}>
      {selectAll && (
        <label className="flex items-center gap-2 cursor-pointer text-sm font-medium" data-testid="checkbox-select-all-label">
          <input
            type="checkbox"
            checked={isAllSelected}
            onChange={(e) => handleSelectAll(e.target.checked)}
            className="accent-primary"
            data-testid="checkbox-select-all"
          />
          {selectAllText}
        </label>
      )}

      <div
        style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '0.5rem' }}
        data-testid="checkbox-options-grid"
        aria-invalid={hasErrors}
        aria-describedby={hasErrors ? errorId : undefined}
      >
        {orderedOptions.map((option) => (
          <label
            key={option.id}
            className="flex items-center gap-2 cursor-pointer text-sm"
            data-testid={`checkbox-option-${option.id}`}
          >
            <input
              type="checkbox"
              name={inputId}
              value={option.id}
              checked={value.includes(option.id)}
              onChange={(e) => handleCheckboxChange(option.id, e.target.checked)}
              className="accent-primary"
              data-testid={`checkbox-input-${option.id}`}
            />
            {option.title}
          </label>
        ))}

        {hasOther && (
          <label
            className="flex items-center gap-2 cursor-pointer text-sm"
            data-testid="checkbox-option-other"
          >
            <input
              type="checkbox"
              name={inputId}
              value={OTHER_VALUE}
              checked={isOtherSelected}
              onChange={(e) => handleCheckboxChange(OTHER_VALUE, e.target.checked)}
              className="accent-primary"
              data-testid="checkbox-input-other"
            />
            {otherLabel}
          </label>
        )}
      </div>

      {isOtherSelected && (
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
          data-testid="checkbox-other-text"
        />
      )}

      <ValidationErrors errors={displayErrors} id={errorId} />
    </div>
  )
}

export default CheckboxInput
