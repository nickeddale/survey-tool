/**
 * ChoicePreview — display-only previews for radio, checkbox, and dropdown question types.
 */

import type { BuilderQuestion } from '../../../store/builderStore'
import type { RadioSettings, CheckboxSettings, DropdownSettings } from '../../../types/questionSettings'

export interface QuestionPreviewProps {
  question: BuilderQuestion
}

export function ChoicePreview({ question }: QuestionPreviewProps) {
  const { question_type, answer_options, settings } = question

  if (question_type === 'single_choice') {
    const s = (settings ?? {}) as Partial<RadioSettings>
    const columns = s.columns ?? 1
    const gridClass = columns > 1 ? `grid grid-cols-${Math.min(columns, 4)} gap-2` : 'space-y-2'

    return (
      <div className={gridClass} data-testid="preview-radio">
        {answer_options.map((opt) => (
          <label
            key={opt.id}
            className="flex items-center gap-2 text-sm text-foreground pointer-events-none"
          >
            <input
              type="radio"
              name={`radio-preview-${question.id}`}
              className="opacity-60"
              disabled
            />
            <span>{opt.title}</span>
          </label>
        ))}
        {s.has_other && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground pointer-events-none">
            <input
              type="radio"
              name={`radio-preview-${question.id}`}
              className="opacity-60"
              disabled
            />
            <span>{s.other_text ?? 'Other'}</span>
          </label>
        )}
        {answer_options.length === 0 && (
          <p className="text-xs text-muted-foreground italic" data-testid="preview-no-options">
            No answer options defined.
          </p>
        )}
        {s.randomize && (
          <p className="text-xs text-muted-foreground italic mt-1">
            (Options will be randomized for respondents)
          </p>
        )}
      </div>
    )
  }

  if (question_type === 'multiple_choice') {
    const s = (settings ?? {}) as Partial<CheckboxSettings>
    const columns = s.columns ?? 1
    const gridClass = columns > 1 ? `grid grid-cols-${Math.min(columns, 4)} gap-2` : 'space-y-2'

    return (
      <div data-testid="preview-checkbox">
        {(s.min_choices != null || s.max_choices != null) && (
          <p className="text-xs text-muted-foreground mb-2">
            {s.min_choices != null && s.max_choices != null
              ? `Select between ${s.min_choices} and ${s.max_choices} options`
              : s.min_choices != null
                ? `Select at least ${s.min_choices} options`
                : `Select up to ${s.max_choices} options`}
          </p>
        )}
        {s.select_all && (
          <label className="flex items-center gap-2 text-sm text-foreground pointer-events-none mb-2">
            <input type="checkbox" className="opacity-60" disabled />
            <span className="font-medium">{s.select_all_text ?? 'Select all'}</span>
          </label>
        )}
        <div className={gridClass}>
          {answer_options.map((opt) => (
            <label
              key={opt.id}
              className="flex items-center gap-2 text-sm text-foreground pointer-events-none"
            >
              <input type="checkbox" className="opacity-60" disabled />
              <span>{opt.title}</span>
            </label>
          ))}
          {s.has_other && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground pointer-events-none">
              <input type="checkbox" className="opacity-60" disabled />
              <span>{s.other_text ?? 'Other'}</span>
            </label>
          )}
        </div>
        {answer_options.length === 0 && (
          <p className="text-xs text-muted-foreground italic" data-testid="preview-no-options">
            No answer options defined.
          </p>
        )}
        {s.randomize && (
          <p className="text-xs text-muted-foreground italic mt-1">
            (Options will be randomized for respondents)
          </p>
        )}
      </div>
    )
  }

  if (question_type === 'dropdown') {
    const s = (settings ?? {}) as Partial<DropdownSettings>

    return (
      <div data-testid="preview-dropdown">
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
            text-muted-foreground pointer-events-none opacity-60"
          disabled
          aria-label="Dropdown answer"
        >
          <option value="">{s.placeholder ?? 'Select an option'}</option>
          {answer_options.map((opt) => (
            <option key={opt.id} value={opt.code}>
              {opt.title}
            </option>
          ))}
          {s.has_other && (
            <option value="__other__">{s.other_text ?? 'Other'}</option>
          )}
        </select>
        {s.searchable && (
          <p className="text-xs text-muted-foreground italic mt-1">
            (Searchable dropdown)
          </p>
        )}
      </div>
    )
  }

  return null
}

export default ChoicePreview
