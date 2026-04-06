/**
 * ImagePickerInput — image grid for image_picker questions.
 *
 * Supports single-select (radio semantics) and multi-select (checkbox semantics).
 * Shows selection indicator via border/overlay. Configurable image dimensions
 * and optional labels. Respects min/max_choices for multi-select.
 */

import { useState } from 'react'
import type { BuilderQuestion } from '../../store/builderStore'
import type { ImagePickerSettings } from '../../types/questionSettings'
import { ValidationErrors } from '../common/ValidationErrors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImagePickerInputProps {
  value: string[]
  onChange: (value: string[]) => void
  question: BuilderQuestion
  errors?: string[]
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(
  selected: string[],
  isRequired: boolean,
  isMultiSelect: boolean,
  minChoices: number | null,
  maxChoices: number | null,
): string[] {
  const errs: string[] = []

  if (isRequired && selected.length === 0) {
    errs.push('This field is required.')
    return errs
  }

  if (isMultiSelect) {
    if (minChoices !== null && selected.length > 0 && selected.length < minChoices) {
      errs.push(`Please select at least ${minChoices} image${minChoices !== 1 ? 's' : ''}.`)
    }
    if (maxChoices !== null && selected.length > maxChoices) {
      errs.push(`Please select at most ${maxChoices} image${maxChoices !== 1 ? 's' : ''}.`)
    }
  }

  return errs
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImagePickerInput({ value, onChange, question, errors: externalErrors }: ImagePickerInputProps) {
  const s = (question.settings ?? {}) as Partial<ImagePickerSettings>
  const multiSelect = s.multi_select ?? false
  const minChoices = s.min_choices ?? null
  const maxChoices = s.max_choices ?? null
  const imageWidth = s.image_width ?? 200
  const imageHeight = s.image_height ?? 150
  const showLabels = s.show_labels ?? true

  const [touched, setTouched] = useState(false)
  const [internalErrors, setInternalErrors] = useState<string[]>([])

  const displayErrors = externalErrors ?? (touched ? internalErrors : [])
  const hasErrors = displayErrors.length > 0
  const inputId = `question-${question.id}`
  const errorId = `${inputId}-error`

  function handleSelect(optionId: string) {
    let next: string[]

    if (multiSelect) {
      if (value.includes(optionId)) {
        next = value.filter((v) => v !== optionId)
      } else {
        next = [...value, optionId]
      }
    } else {
      next = value.includes(optionId) ? [] : [optionId]
    }

    onChange(next)
    if (touched) {
      setInternalErrors(validate(next, question.is_required, multiSelect, minChoices, maxChoices))
    }
  }

  function handleBlur() {
    setTouched(true)
    setInternalErrors(validate(value, question.is_required, multiSelect, minChoices, maxChoices))
  }

  const role = multiSelect ? 'group' : 'radiogroup'

  return (
    <div
      className="space-y-3"
      data-testid={`image-picker-input-${question.id}`}
      onBlur={handleBlur}
    >
      <div
        className="flex flex-wrap gap-3"
        role={role}
        aria-label={question.title}
        aria-invalid={hasErrors}
        aria-describedby={hasErrors ? errorId : undefined}
        data-testid="image-picker-grid"
      >
        {question.answer_options.map((option) => {
          const isSelected = value.includes(option.id)
          return (
            <button
              key={option.id}
              type="button"
              role={multiSelect ? 'checkbox' : 'radio'}
              aria-checked={isSelected}
              aria-label={option.title}
              onClick={() => handleSelect(option.id)}
              className={[
                'relative flex flex-col items-center rounded-md border-2 overflow-hidden cursor-pointer',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                isSelected
                  ? 'border-primary ring-2 ring-primary ring-offset-1'
                  : 'border-input hover:border-primary/50',
              ].join(' ')}
              style={{ width: imageWidth, minWidth: imageWidth }}
              data-testid={`image-picker-option-${option.id}`}
            >
              <div
                className="relative w-full overflow-hidden bg-muted"
                style={{ height: imageHeight }}
              >
                {option.image_url ? (
                  <img
                    src={option.image_url}
                    alt={option.title}
                    className="w-full h-full object-cover"
                    data-testid={`image-picker-img-${option.id}`}
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-muted-foreground text-xs"
                    data-testid={`image-picker-placeholder-${option.id}`}
                  >
                    No image
                  </div>
                )}

                {isSelected && (
                  <div
                    className="absolute inset-0 bg-primary/20 flex items-center justify-center"
                    aria-hidden="true"
                    data-testid={`image-picker-overlay-${option.id}`}
                  >
                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="white"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <polyline points="1,6 4.5,9.5 11,2" />
                      </svg>
                    </div>
                  </div>
                )}
              </div>

              {showLabels && (
                <span
                  className="w-full px-2 py-1 text-xs text-center truncate"
                  data-testid={`image-picker-label-${option.id}`}
                >
                  {option.title}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <ValidationErrors errors={displayErrors} id={errorId} />
    </div>
  )
}

export default ImagePickerInput
