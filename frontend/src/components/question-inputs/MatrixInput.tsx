/**
 * MatrixInput — interactive radio-button matrix for matrix questions.
 *
 * Renders an HTML table with subquestions as rows and answer_options as
 * column headers. Each cell contains a radio button. Supports:
 * - alternate_rows: alternating row background colors
 * - randomize_rows: Fisher-Yates shuffle of subquestion display order
 * - is_all_rows_required: validates that every row has been answered
 *
 * Response format: { value: { [sqCode]: optionCode } }
 */

import { useState, useMemo } from 'react'
import type { BuilderQuestion } from '../../store/builderStore'
import type { MatrixSettings } from '../../types/questionSettings'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatrixInputProps {
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
// Validation helpers
// ---------------------------------------------------------------------------

function validate(
  value: Record<string, string>,
  subquestionCodes: string[],
  isAllRowsRequired: boolean,
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

export function MatrixInput({ value, onChange, question, errors: externalErrors }: MatrixInputProps) {
  const s = (question.settings ?? {}) as Partial<MatrixSettings>
  const alternateRows = s.alternate_rows ?? true
  const isAllRowsRequired = s.is_all_rows_required ?? false
  const randomizeRows = s.randomize_rows ?? false

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
      data-testid={`matrix-input-${question.id}`}
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
                  className="text-center px-3 py-2 font-medium border-b border-border"
                  data-testid={`matrix-col-${option.code}`}
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
                  data-testid={`matrix-row-${sq.code}`}
                >
                  <td className="px-3 py-2 font-medium">{sq.title}</td>
                  {question.answer_options.map((option) => (
                    <td
                      key={option.id}
                      className="text-center px-3 py-2"
                      data-testid={`matrix-cell-${sq.code}-${option.code}`}
                    >
                      <input
                        type="radio"
                        name={`${inputId}-${sq.code}`}
                        value={option.code}
                        checked={value[sq.code] === option.code}
                        onChange={() => handleCellChange(sq.code, option.code)}
                        className="accent-primary"
                        data-testid={`matrix-radio-${sq.code}-${option.code}`}
                      />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {hasErrors && (
        <ul id={errorId} role="alert" aria-live="assertive" className="space-y-0.5" data-testid="matrix-errors">
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

export default MatrixInput
