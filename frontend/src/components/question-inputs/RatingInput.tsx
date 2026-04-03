/**
 * RatingInput — clickable icon-based rating input for rating questions.
 *
 * Handles: star/heart/thumb/smiley icons from lucide-react, min–max range
 * with configurable step, hover preview state, click-to-select, required validation.
 */

import { useState } from 'react'
import { Star, Heart, ThumbsUp, Smile } from 'lucide-react'
import type { BuilderQuestion } from '../../store/builderStore'
import type { RatingSettings } from '../../types/questionSettings'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RatingInputProps {
  value: string
  onChange: (value: string) => void
  question: BuilderQuestion
  errors?: string[]
}

// ---------------------------------------------------------------------------
// Icon helpers
// ---------------------------------------------------------------------------

type IconName = RatingSettings['icon']

function RatingIcon({ icon, filled, size = 24 }: { icon: IconName; filled: boolean; size?: number }) {
  const className = filled ? 'fill-current text-yellow-500' : 'text-muted-foreground'
  const props = { size, className }
  switch (icon) {
    case 'heart':
      return <Heart {...props} />
    case 'thumb':
      return <ThumbsUp {...props} />
    case 'smiley':
      return <Smile {...props} />
    case 'star':
    default:
      return <Star {...props} />
  }
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

export function RatingInput({ value, onChange, question, errors: externalErrors }: RatingInputProps) {
  const s = (question.settings ?? {}) as Partial<RatingSettings>
  const min = s.min ?? 1
  const max = s.max ?? 5
  const step = s.step ?? 1
  const icon = s.icon ?? 'star'

  const [touched, setTouched] = useState(false)
  const [hoverValue, setHoverValue] = useState<number | null>(null)
  const [internalErrors, setInternalErrors] = useState<string[]>([])

  const numericValue = value !== '' ? parseFloat(value) : null

  const displayErrors = externalErrors ?? (touched ? internalErrors : [])
  const hasErrors = displayErrors.length > 0
  const inputId = `question-${question.id}`
  const errorId = `${inputId}-error`

  // Build array of rating values
  const ratingValues: number[] = []
  for (let v = min; v <= max; v += step) {
    ratingValues.push(v)
  }

  function handleClick(rating: number) {
    const newValue = String(rating)
    onChange(newValue)
    setTouched(true)
    setInternalErrors(validate(newValue, question.is_required))
  }

  function handleBlur() {
    setTouched(true)
    setInternalErrors(validate(value, question.is_required))
  }

  function handleMouseEnter(rating: number) {
    setHoverValue(rating)
  }

  function handleMouseLeave() {
    setHoverValue(null)
  }

  return (
    <div className="space-y-1" data-testid={`rating-input-${question.id}`}>
      <div
        className="flex items-center gap-1"
        role="radiogroup"
        aria-invalid={hasErrors}
        aria-describedby={hasErrors ? errorId : undefined}
        onBlur={handleBlur}
        data-testid="rating-icons-group"
      >
        {ratingValues.map((rating) => {
          const activeValue = hoverValue ?? numericValue
          const isFilled = activeValue !== null && rating <= activeValue
          return (
            <button
              key={rating}
              type="button"
              role="radio"
              aria-checked={numericValue === rating}
              aria-label={`Rate ${rating}`}
              onClick={() => handleClick(rating)}
              onMouseEnter={() => handleMouseEnter(rating)}
              onMouseLeave={handleMouseLeave}
              className="cursor-pointer p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              data-testid={`rating-icon-${rating}`}
              data-filled={isFilled}
            >
              <RatingIcon icon={icon} filled={isFilled} />
            </button>
          )
        })}
      </div>

      {hasErrors && (
        <ul id={errorId} role="alert" aria-live="assertive" className="space-y-0.5" data-testid="rating-errors">
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

export default RatingInput
