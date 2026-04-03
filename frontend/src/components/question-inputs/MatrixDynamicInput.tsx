/**
 * MatrixDynamicInput — editable grid with Add Row / Remove Row buttons.
 *
 * Renders an HTML table with answer_options as column headers and
 * user-added rows (not from subquestions). Each cell is a text input.
 * Supports:
 * - row_count: initial number of rows
 * - min_row_count: hide Remove button when at minimum
 * - max_row_count: hide Add button when at maximum (null = unlimited)
 * - add_row_text: label for the Add Row button
 * - remove_row_text: label for the Remove Row button
 *
 * Response format: { values: [{ [colCode]: cellValue, ... }, ...] }
 */

import { useState } from 'react'
import type { BuilderQuestion } from '../../store/builderStore'
import type { MatrixDynamicSettings } from '../../types/questionSettings'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatrixDynamicInputProps {
  value: Record<string, string>[]
  onChange: (value: Record<string, string>[]) => void
  question: BuilderQuestion
  errors?: string[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MatrixDynamicInput({ value, onChange, question, errors: externalErrors }: MatrixDynamicInputProps) {
  const s = (question.settings ?? {}) as Partial<MatrixDynamicSettings>
  const rowCount = s.row_count ?? 1
  const minRowCount = s.min_row_count ?? 0
  const maxRowCount = s.max_row_count ?? null
  const addRowText = s.add_row_text ?? 'Add row'
  const removeRowText = s.remove_row_text ?? 'Remove'

  // Use internal state so cell edits work without parent re-renders.
  // Initialize from value prop if non-empty, otherwise create rowCount empty rows.
  const [rows, setRows] = useState<Record<string, string>[]>(() =>
    value.length > 0 ? value : Array.from({ length: rowCount }, () => ({}))
  )

  const displayErrors = externalErrors ?? []
  const hasErrors = displayErrors.length > 0
  const inputId = `question-${question.id}`
  const errorId = `${inputId}-error`

  const canAddRow = maxRowCount === null || rows.length < maxRowCount
  const canRemoveRow = rows.length > minRowCount

  function handleCellChange(rowIdx: number, colCode: string, cellValue: string) {
    const next = rows.map((row, i) =>
      i === rowIdx ? { ...row, [colCode]: cellValue } : row
    )
    setRows(next)
    onChange(next)
  }

  function handleAddRow() {
    if (!canAddRow) return
    const next = [...rows, {}]
    setRows(next)
    onChange(next)
  }

  function handleRemoveRow(rowIdx: number) {
    if (!canRemoveRow) return
    const next = rows.filter((_, i) => i !== rowIdx)
    setRows(next)
    onChange(next)
  }

  return (
    <div
      className="space-y-3"
      data-testid={`matrix-dynamic-input-${question.id}`}
    >
      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse text-sm"
          aria-invalid={hasErrors}
          aria-describedby={hasErrors ? errorId : undefined}
        >
          <thead>
            <tr>
              {question.answer_options.map((option) => (
                <th
                  key={option.id}
                  className="text-left px-3 py-2 font-medium border-b border-border"
                  data-testid={`matrix-dynamic-col-${option.code}`}
                >
                  {option.title}
                </th>
              ))}
              <th className="px-3 py-2 border-b border-border" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx} data-testid={`matrix-dynamic-row-${rowIdx}`}>
                {question.answer_options.map((option) => (
                  <td key={option.id} className="px-3 py-2" data-testid={`matrix-dynamic-cell-${rowIdx}-${option.code}`}>
                    <input
                      type="text"
                      value={row[option.code] ?? ''}
                      onChange={(e) => handleCellChange(rowIdx, option.code, e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      data-testid={`matrix-dynamic-input-${rowIdx}-${option.code}`}
                    />
                  </td>
                ))}
                <td className="px-3 py-2 text-right">
                  {canRemoveRow && (
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(rowIdx)}
                      className="text-xs text-destructive hover:underline"
                      data-testid={`matrix-dynamic-remove-${rowIdx}`}
                    >
                      {removeRowText}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canAddRow && (
        <button
          type="button"
          onClick={handleAddRow}
          className="text-sm text-primary hover:underline"
          data-testid="matrix-dynamic-add-row"
        >
          {addRowText}
        </button>
      )}

      {hasErrors && (
        <ul id={errorId} role="alert" aria-live="assertive" className="space-y-0.5" data-testid="matrix-dynamic-errors">
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

export default MatrixDynamicInput
