/**
 * ScalarPreview — display-only previews for numeric, rating, boolean, and date question types.
 */

import type { BuilderQuestion } from '../../../store/builderStore'
import type { NumericSettings, RatingSettings, BooleanSettings, DateSettings } from '../../../types/questionSettings'

export interface QuestionPreviewProps {
  question: BuilderQuestion
}

// ---------------------------------------------------------------------------
// Rating icon helpers
// ---------------------------------------------------------------------------

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`w-6 h-6 ${filled ? 'text-yellow-400 fill-current' : 'text-muted-foreground'}`}
      aria-hidden="true"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z" />
    </svg>
  )
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`w-6 h-6 ${filled ? 'text-red-400 fill-current' : 'text-muted-foreground'}`}
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

function ThumbIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`w-6 h-6 ${filled ? 'text-blue-400 fill-current' : 'text-muted-foreground'}`}
      aria-hidden="true"
    >
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
      <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  )
}

function SmileyIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`w-6 h-6 ${filled ? 'text-green-400 fill-current' : 'text-muted-foreground'}`}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" className="stroke-current fill-none" />
      <line x1="9" y1="9" x2="9.01" y2="9" className="stroke-current" strokeWidth="2" strokeLinecap="round" />
      <line x1="15" y1="9" x2="15.01" y2="9" className="stroke-current" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function RatingIcon({ icon, filled }: { icon: string; filled: boolean }) {
  if (icon === 'heart') return <HeartIcon filled={filled} />
  if (icon === 'thumb') return <ThumbIcon filled={filled} />
  if (icon === 'smiley') return <SmileyIcon filled={filled} />
  return <StarIcon filled={filled} />
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScalarPreview({ question }: QuestionPreviewProps) {
  const { question_type, settings } = question

  if (question_type === 'numeric') {
    const s = (settings ?? {}) as Partial<NumericSettings>

    return (
      <div className="flex items-center gap-2" data-testid="preview-numeric">
        {s.prefix && (
          <span className="text-sm text-muted-foreground font-medium">{s.prefix}</span>
        )}
        <input
          type="number"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm
            text-muted-foreground pointer-events-none opacity-60"
          placeholder={s.placeholder ?? ''}
          min={s.min ?? undefined}
          max={s.max ?? undefined}
          step={s.decimal_places && s.decimal_places > 0 ? Math.pow(10, -s.decimal_places) : 1}
          disabled
          aria-label="Numeric answer"
          data-testid="preview-numeric-input"
        />
        {s.suffix && (
          <span className="text-sm text-muted-foreground font-medium">{s.suffix}</span>
        )}
      </div>
    )
  }

  if (question_type === 'rating') {
    const s = (settings ?? {}) as Partial<RatingSettings>
    const min = s.min ?? 1
    const max = s.max ?? 5
    const icon = s.icon ?? 'star'
    const count = Math.max(1, max - min + 1)
    // Show the middle item as "selected" for visual preview
    const midpoint = Math.floor(count / 2)

    return (
      <div data-testid="preview-rating">
        <div className="flex items-center gap-1 pointer-events-none">
          {Array.from({ length: count }, (_, i) => (
            <RatingIcon key={i} icon={icon} filled={i <= midpoint} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {min} – {max}
        </p>
      </div>
    )
  }

  if (question_type === 'boolean') {
    const s = (settings ?? {}) as Partial<BooleanSettings>
    const trueLabel = s.true_label ?? 'Yes'
    const falseLabel = s.false_label ?? 'No'
    const renderAs = s.render_as ?? 'toggle'

    if (renderAs === 'toggle') {
      return (
        <div className="flex items-center gap-3 pointer-events-none" data-testid="preview-boolean">
          <span className="text-sm text-muted-foreground">{falseLabel}</span>
          <div
            className="relative inline-flex h-6 w-11 items-center rounded-full bg-muted border border-border opacity-60"
            role="switch"
            aria-checked="false"
          >
            <span className="inline-block h-4 w-4 transform rounded-full bg-muted-foreground translate-x-1 transition" />
          </div>
          <span className="text-sm text-foreground font-medium">{trueLabel}</span>
        </div>
      )
    }

    if (renderAs === 'radio') {
      return (
        <div className="space-y-2 pointer-events-none" data-testid="preview-boolean">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name={`bool-preview-${question.id}`} className="opacity-60" disabled />
            <span>{trueLabel}</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name={`bool-preview-${question.id}`} className="opacity-60" disabled />
            <span>{falseLabel}</span>
          </label>
        </div>
      )
    }

    // checkbox
    return (
      <div className="pointer-events-none" data-testid="preview-boolean">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="opacity-60" disabled />
          <span>{trueLabel}</span>
        </label>
      </div>
    )
  }

  if (question_type === 'date') {
    const s = (settings ?? {}) as Partial<DateSettings>

    return (
      <div data-testid="preview-date">
        <input
          type={s.include_time ? 'datetime-local' : 'date'}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
            text-muted-foreground pointer-events-none opacity-60"
          placeholder={s.placeholder ?? ''}
          min={s.min_date ?? undefined}
          max={s.max_date ?? undefined}
          disabled
          aria-label="Date answer"
          data-testid="preview-date-input"
        />
        {s.date_format && (
          <p className="text-xs text-muted-foreground mt-1">
            Format: {s.date_format}
          </p>
        )}
      </div>
    )
  }

  return null
}

export default ScalarPreview
