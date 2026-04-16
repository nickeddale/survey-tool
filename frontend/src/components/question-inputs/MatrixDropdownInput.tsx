/**
 * MatrixDropdownInput — matrix grid with a dropdown select per row.
 *
 * Renders an HTML table with subquestions as rows. Each row has a single
 * dropdown column where the user selects from answer_options. Supports:
 * - alternate_rows: alternating row background colors
 * - randomize_rows: Fisher-Yates shuffle of subquestion display order
 * - is_all_rows_required: validates that every row has a selection
 *
 * Response format: { [sqCode]: selectedOptionCode }
 */

import { useState, useMemo } from 'react'
import { Star, Heart, ThumbsUp, Smile } from 'lucide-react'
import type { BuilderQuestion } from '../../store/builderStore'
import type { MatrixDropdownSettings, RatingSettings } from '../../types/questionSettings'
import { ValidationErrors } from '../common/ValidationErrors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatrixDropdownInputProps {
  value: Record<string, string>
  onChange: (value: Record<string, string>) => void
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
// Rating cell helpers
// ---------------------------------------------------------------------------

type IconName = RatingSettings['icon']

function RatingIcon({ icon, filled }: { icon: IconName; filled: boolean }) {
  const className = filled ? 'fill-current text-yellow-500' : 'text-muted-foreground'
  const props = { size: 18, className }
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

interface RatingCellProps {
  sqCode: string
  value: string
  onChange: (sqCode: string, rating: string) => void
  ratingMin: number
  ratingMax: number
  ratingStep: number
  icon: IconName
}

function RatingCell({
  sqCode,
  value,
  onChange,
  ratingMin,
  ratingMax,
  ratingStep,
  icon,
}: RatingCellProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null)
  const numericValue = value !== '' ? parseFloat(value) : null

  const ratingValues: number[] = []
  for (let v = ratingMin; v <= ratingMax; v += ratingStep) {
    ratingValues.push(v)
  }

  return (
    <div
      className="flex items-center gap-0.5"
      role="radiogroup"
      data-testid={`matrix-dropdown-rating-${sqCode}`}
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
            onClick={() => onChange(sqCode, String(rating))}
            onMouseEnter={() => setHoverValue(rating)}
            onMouseLeave={() => setHoverValue(null)}
            className="cursor-pointer p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            data-testid={`matrix-dropdown-rating-${sqCode}-${rating}`}
            data-filled={isFilled}
          >
            <RatingIcon icon={icon} filled={isFilled} />
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validate(
  value: Record<string, string>,
  subquestionCodes: string[],
  isAllRowsRequired: boolean
): string[] {
  const errs: string[] = []
  if (isAllRowsRequired) {
    const unanswered = subquestionCodes.filter((code) => !value[code])
    if (unanswered.length > 0) {
      errs.push('Please answer all rows.')
    }
  }
  return errs
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MatrixDropdownInput({
  value,
  onChange,
  question,
  errors: externalErrors,
}: MatrixDropdownInputProps) {
  const s = (question.settings ?? {}) as Partial<MatrixDropdownSettings>
  const alternateRows = s.alternate_rows ?? true
  const isAllRowsRequired = s.is_all_rows_required ?? false
  const randomizeRows = s.randomize_rows ?? false
  const columnTypes = s.column_types ?? {}

  function getCellType(columnCode: string): 'dropdown' | 'rating' {
    const colType = columnTypes[columnCode]
    return colType === 'rating' ? 'rating' : 'dropdown'
  }

  const [touched, setTouched] = useState(false)
  const [internalErrors, setInternalErrors] = useState<string[]>([])

  const displayErrors = externalErrors ?? (touched ? internalErrors : [])
  const hasErrors = displayErrors.length > 0
  const inputId = `question-${question.id}`
  const errorId = `${inputId}-error`

  const orderedSubquestions = useMemo(() => {
    if (!randomizeRows) return question.subquestions
    const seed = getSessionSeed(question.id)
    return shuffleWithSeed(question.subquestions, seed)
  }, [question.subquestions, question.id, randomizeRows])

  const subquestionCodes = question.subquestions.map((sq) => sq.code)

  function handleCellChange(sqCode: string, optionCode: string) {
    const next = { ...value, [sqCode]: optionCode }
    onChange(next)
    if (touched) {
      setInternalErrors(validate(next, subquestionCodes, isAllRowsRequired))
    }
  }

  function handleBlur() {
    setTouched(true)
    setInternalErrors(validate(value, subquestionCodes, isAllRowsRequired))
  }

  return (
    <div
      className="space-y-2"
      data-testid={`matrix-dropdown-input-${question.id}`}
      onBlur={handleBlur}
    >
      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse text-sm"
          aria-invalid={hasErrors}
          aria-describedby={hasErrors ? errorId : undefined}
        >
          <thead>
            <tr>
              <th className="text-left px-3 py-2 font-medium border-b border-border">Question</th>
              <th className="text-left px-3 py-2 font-medium border-b border-border">Answer</th>
            </tr>
          </thead>
          <tbody>
            {orderedSubquestions.map((sq, rowIdx) => {
              const isAltRow = alternateRows && rowIdx % 2 === 1
              return (
                <tr
                  key={sq.id}
                  className={isAltRow ? 'bg-muted/40' : ''}
                  data-testid={`matrix-dropdown-row-${sq.code}`}
                >
                  <td className="px-3 py-2 font-medium">{sq.title}</td>
                  <td className="px-3 py-2" data-testid={`matrix-dropdown-cell-${sq.code}`}>
                    {getCellType(sq.code) === 'rating' ? (
                      <RatingCell
                        sqCode={sq.code}
                        value={value[sq.code] ?? ''}
                        onChange={handleCellChange}
                        ratingMin={1}
                        ratingMax={5}
                        ratingStep={1}
                        icon="star"
                      />
                    ) : (
                      <select
                        value={value[sq.code] ?? ''}
                        onChange={(e) => handleCellChange(sq.code, e.target.value)}
                        className="rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        data-testid={`matrix-dropdown-select-${sq.code}`}
                      >
                        <option value="">— Select —</option>
                        {question.answer_options.map((option) => (
                          <option key={option.id} value={option.code}>
                            {option.title}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <ValidationErrors errors={displayErrors} id={errorId} />
    </div>
  )
}

export default MatrixDropdownInput
