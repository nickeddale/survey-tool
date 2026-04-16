/**
 * MatrixDropdownInput — matrix grid with per-column cell type inputs.
 *
 * Renders an HTML table with subquestions as rows and answer_options as
 * column headers. Each cell renders the appropriate input based on column_types
 * from settings (dropdown, text, number, checkbox, radio, boolean, rating).
 * Defaults to dropdown if no column_types declared.
 *
 * Supports:
 * - alternate_rows: alternating row background colors
 * - randomize_rows: Fisher-Yates shuffle of subquestion display order
 * - is_all_rows_required: validates that every row has at least one filled column
 * - transpose: swap rows and columns in display
 * - column_types: per-column cell type overrides
 *
 * Response format: { value: { [sqCode]: { [colCode]: cellValue } } }
 */

import { useState, useMemo } from 'react'
import { Star, Heart, ThumbsUp, Smile } from 'lucide-react'
import type { BuilderQuestion } from '../../store/builderStore'
import type { MatrixDropdownSettings, RatingSettings } from '../../types/questionSettings'
import { ValidationErrors } from '../common/ValidationErrors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MatrixDropdownValue = Record<string, Record<string, unknown>>

export interface MatrixDropdownInputProps {
  value: MatrixDropdownValue
  onChange: (value: MatrixDropdownValue) => void
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

// RatingCellWidget — fits CellInput's onChange(val: unknown) API
interface RatingCellWidgetProps {
  sqCode: string
  colCode: string
  value: string
  onChange: (val: unknown) => void
}

function RatingCellWidget({ sqCode, colCode, value, onChange }: RatingCellWidgetProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null)
  const numericValue = value !== '' ? parseFloat(value) : null
  const ratingValues = [1, 2, 3, 4, 5]

  return (
    <div
      className="flex items-center gap-0.5"
      role="radiogroup"
      data-testid={`matrix-dropdown-rating-${sqCode}-${colCode}`}
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
            onClick={() => onChange(String(rating))}
            onMouseEnter={() => setHoverValue(rating)}
            onMouseLeave={() => setHoverValue(null)}
            className="cursor-pointer p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            data-testid={`matrix-dropdown-rating-${sqCode}-${colCode}-${rating}`}
            data-filled={isFilled}
          >
            <RatingIcon icon="star" filled={isFilled} />
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
  value: MatrixDropdownValue,
  subquestionCodes: string[],
  isAllRowsRequired: boolean
): string[] {
  const errs: string[] = []
  if (isAllRowsRequired) {
    const unanswered = subquestionCodes.filter((code) => {
      const rowVal = value[code]
      return !rowVal || Object.keys(rowVal).length === 0
    })
    if (unanswered.length > 0) {
      errs.push('Please answer all rows.')
    }
  }
  return errs
}

// ---------------------------------------------------------------------------
// Cell input rendering
// ---------------------------------------------------------------------------

interface CellInputProps {
  cellType: string
  colCode: string
  sqCode: string
  value: unknown
  options: { id: string; code: string; title: string }[]
  onChange: (val: unknown) => void
  inputId: string
}

function CellInput({
  cellType,
  colCode,
  sqCode,
  value,
  options,
  onChange,
  inputId,
}: CellInputProps) {
  const baseClass =
    'rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

  switch (cellType) {
    case 'text':
      return (
        <input
          type="text"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full ${baseClass}`}
        />
      )
    case 'number':
      return (
        <input
          type="number"
          value={(value as number) ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className={`w-full ${baseClass}`}
        />
      )
    case 'boolean':
      return (
        <input
          type="checkbox"
          checked={(value as boolean) ?? false}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-primary"
        />
      )
    case 'checkbox': {
      const selected = (value as string[]) ?? []
      return (
        <div className="flex flex-col gap-1">
          {options.map((opt) => (
            <label key={opt.id} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(opt.code)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...selected, opt.code]
                    : selected.filter((c) => c !== opt.code)
                  onChange(next)
                }}
                className="accent-primary"
                data-testid={`matrix-dropdown-checkbox-${sqCode}-${colCode}-${opt.code}`}
              />
              {opt.title}
            </label>
          ))}
        </div>
      )
    }
    case 'radio': {
      const radioName = `${inputId}-${sqCode}-${colCode}`
      return (
        <div className="flex flex-col gap-1">
          {options.map((opt) => (
            <label key={opt.id} className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name={radioName}
                value={opt.code}
                checked={value === opt.code}
                onChange={() => onChange(opt.code)}
                className="accent-primary"
                data-testid={`matrix-dropdown-radio-${sqCode}-${colCode}-${opt.code}`}
              />
              {opt.title}
            </label>
          ))}
        </div>
      )
    }
    case 'rating':
      return (
        <RatingCellWidget
          sqCode={sqCode}
          colCode={colCode}
          value={value !== '' && value != null ? String(value) : ''}
          onChange={onChange}
        />
      )
    default:
      // dropdown (default)
      return (
        <select
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full ${baseClass}`}
          data-testid={`matrix-dropdown-select-${sqCode}-${colCode}`}
        >
          <option value="">— Select —</option>
          {options.map((option) => (
            <option key={option.id} value={option.code}>
              {option.title}
            </option>
          ))}
        </select>
      )
  }
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
  const transpose = s.transpose ?? false
  const defaultCellType = s.cell_type ?? 'dropdown'
  const columnTypes = s.column_types ?? {}

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

  function handleCellChange(sqCode: string, colCode: string, cellValue: unknown) {
    const currentRow = value[sqCode] ?? {}
    const nextValue: MatrixDropdownValue = {
      ...value,
      [sqCode]: { ...currentRow, [colCode]: cellValue },
    }
    onChange(nextValue)
    if (touched) {
      setInternalErrors(validate(nextValue, subquestionCodes, isAllRowsRequired))
    }
  }

  function handleBlur() {
    setTouched(true)
    setInternalErrors(validate(value, subquestionCodes, isAllRowsRequired))
  }

  function getCellType(colCode: string): string {
    return (columnTypes && columnTypes[colCode]) ?? defaultCellType
  }

  if (transpose) {
    // Transposed: answer options (columns) as rows, subquestions as columns
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
                <th className="text-left px-3 py-2 font-medium border-b border-border" />
                {orderedSubquestions.map((sq) => (
                  <th
                    key={sq.id}
                    className="text-left px-3 py-2 font-medium border-b border-border"
                  >
                    {sq.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {question.answer_options.map((option, rowIdx) => {
                const isAltRow = alternateRows && rowIdx % 2 === 1
                const cellType = getCellType(option.code)
                return (
                  <tr
                    key={option.id}
                    className={isAltRow ? 'bg-muted/40' : ''}
                    data-testid={`matrix-dropdown-row-${option.code}`}
                  >
                    <td className="px-3 py-2 font-medium">{option.title}</td>
                    {orderedSubquestions.map((sq) => (
                      <td
                        key={sq.id}
                        className="px-3 py-2"
                        data-testid={`matrix-dropdown-cell-${sq.code}-${option.code}`}
                      >
                        <CellInput
                          cellType={cellType}
                          colCode={option.code}
                          sqCode={sq.code}
                          value={(value[sq.code] ?? {})[option.code]}
                          options={question.answer_options}
                          onChange={(val) => handleCellChange(sq.code, option.code, val)}
                          inputId={inputId}
                        />
                      </td>
                    ))}
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
              <th className="text-left px-3 py-2 font-medium border-b border-border" />
              {question.answer_options.map((option) => (
                <th
                  key={option.id}
                  className="text-left px-3 py-2 font-medium border-b border-border"
                  data-testid={`matrix-dropdown-col-${option.code}`}
                >
                  {option.title}
                </th>
              ))}
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
                  {question.answer_options.map((option) => {
                    const cellType = getCellType(option.code)
                    return (
                      <td
                        key={option.id}
                        className="px-3 py-2"
                        data-testid={`matrix-dropdown-cell-${sq.code}-${option.code}`}
                      >
                        <CellInput
                          cellType={cellType}
                          colCode={option.code}
                          sqCode={sq.code}
                          value={(value[sq.code] ?? {})[option.code]}
                          options={question.answer_options}
                          onChange={(val) => handleCellChange(sq.code, option.code, val)}
                          inputId={inputId}
                        />
                      </td>
                    )
                  })}
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
