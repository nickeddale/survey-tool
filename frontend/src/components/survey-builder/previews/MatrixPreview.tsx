/**
 * MatrixPreview — display-only previews for matrix, matrix_dropdown, and matrix_dynamic question types.
 *
 * - matrix: grid of radio buttons with subquestions as rows, answer_options as columns
 * - matrix_dropdown: grid of select cells with subquestions as rows, answer_options as columns
 * - matrix_dynamic: rows with cell inputs and add/remove row controls (non-functional)
 */

import type { BuilderQuestion } from '../../../store/builderStore'
import type {
  MatrixSettings,
  MatrixDropdownSettings,
  MatrixDynamicSettings,
} from '../../../types/questionSettings'

export interface QuestionPreviewProps {
  question: BuilderQuestion
}

export function MatrixPreview({ question }: QuestionPreviewProps) {
  const { question_type, answer_options, subquestions, settings } = question

  if (question_type === 'matrix') {
    const s = (settings ?? {}) as Partial<MatrixSettings>

    return (
      <div className="overflow-x-auto" data-testid="preview-matrix">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left p-2 font-medium text-muted-foreground w-1/3" />
              {answer_options.map((opt) => (
                <th
                  key={opt.id}
                  className="text-center p-2 font-medium text-muted-foreground text-xs"
                >
                  {opt.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subquestions.length === 0 ? (
              <tr>
                <td
                  colSpan={answer_options.length + 1}
                  className="p-3 text-center text-xs text-muted-foreground italic"
                  data-testid="preview-no-rows"
                >
                  No subquestions (rows) defined.
                </td>
              </tr>
            ) : (
              subquestions.map((sub, idx) => (
                <tr key={sub.id} className={s.alternate_rows && idx % 2 === 1 ? 'bg-muted/30' : ''}>
                  <td className="p-2 text-sm">{sub.title}</td>
                  {answer_options.map((opt) => (
                    <td key={opt.id} className="p-2 text-center">
                      <input
                        type="radio"
                        name={`matrix-preview-${question.id}-row-${sub.id}`}
                        className="opacity-60 pointer-events-none"
                        disabled
                        aria-label={`${sub.title} - ${opt.title}`}
                      />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
        {answer_options.length === 0 && subquestions.length > 0 && (
          <p className="text-xs text-muted-foreground italic mt-1">
            No answer options (columns) defined.
          </p>
        )}
        {s.randomize_rows && (
          <p className="text-xs text-muted-foreground italic mt-1">
            (Rows will be randomized for respondents)
          </p>
        )}
      </div>
    )
  }

  if (question_type === 'matrix_dropdown') {
    const s = (settings ?? {}) as Partial<MatrixDropdownSettings>
    const cellType = s.cell_type ?? 'dropdown'

    return (
      <div className="overflow-x-auto" data-testid="preview-matrix-dropdown">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left p-2 font-medium text-muted-foreground w-1/3" />
              {answer_options.map((opt) => (
                <th
                  key={opt.id}
                  className="text-center p-2 font-medium text-muted-foreground text-xs"
                >
                  {opt.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subquestions.length === 0 ? (
              <tr>
                <td
                  colSpan={answer_options.length + 1}
                  className="p-3 text-center text-xs text-muted-foreground italic"
                  data-testid="preview-no-rows"
                >
                  No subquestions (rows) defined.
                </td>
              </tr>
            ) : (
              subquestions.map((sub, idx) => (
                <tr key={sub.id} className={s.alternate_rows && idx % 2 === 1 ? 'bg-muted/30' : ''}>
                  <td className="p-2 text-sm">{sub.title}</td>
                  {answer_options.map((opt) => (
                    <td key={opt.id} className="p-2">
                      {cellType === 'dropdown' ? (
                        <select
                          className="w-full rounded border border-input bg-background px-2 py-1 text-xs
                            pointer-events-none opacity-60"
                          disabled
                          aria-label={`${sub.title} - ${opt.title}`}
                        >
                          <option>Select…</option>
                        </select>
                      ) : cellType === 'text' ? (
                        <input
                          type="text"
                          className="w-full rounded border border-input bg-background px-2 py-1 text-xs
                            pointer-events-none opacity-60"
                          disabled
                          aria-label={`${sub.title} - ${opt.title}`}
                        />
                      ) : cellType === 'checkbox' ? (
                        <div className="flex justify-center">
                          <input
                            type="checkbox"
                            className="opacity-60 pointer-events-none"
                            disabled
                            aria-label={`${sub.title} - ${opt.title}`}
                          />
                        </div>
                      ) : (
                        <div className="flex justify-center">
                          <input
                            type="radio"
                            name={`matrix-dd-preview-${question.id}-row-${sub.id}`}
                            className="opacity-60 pointer-events-none"
                            disabled
                            aria-label={`${sub.title} - ${opt.title}`}
                          />
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
        {s.randomize_rows && (
          <p className="text-xs text-muted-foreground italic mt-1">
            (Rows will be randomized for respondents)
          </p>
        )}
      </div>
    )
  }

  if (question_type === 'matrix_dynamic') {
    const s = (settings ?? {}) as Partial<MatrixDynamicSettings>
    const cellType = s.cell_type ?? 'text'
    const rowCount = s.row_count ?? 1
    const displayRows = Math.max(1, rowCount)

    return (
      <div data-testid="preview-matrix-dynamic">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {answer_options.map((opt) => (
                  <th
                    key={opt.id}
                    className="text-left p-2 font-medium text-muted-foreground text-xs border-b border-border"
                  >
                    {opt.title}
                  </th>
                ))}
                <th className="p-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: displayRows }, (_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {answer_options.map((opt) => (
                    <td key={opt.id} className="p-2">
                      {cellType === 'dropdown' ? (
                        <select
                          className="w-full rounded border border-input bg-background px-2 py-1 text-xs
                            pointer-events-none opacity-60"
                          disabled
                        >
                          <option>Select…</option>
                        </select>
                      ) : cellType === 'checkbox' ? (
                        <input
                          type="checkbox"
                          className="opacity-60 pointer-events-none"
                          disabled
                        />
                      ) : cellType === 'radio' ? (
                        <input type="radio" className="opacity-60 pointer-events-none" disabled />
                      ) : (
                        <input
                          type="text"
                          className="w-full rounded border border-input bg-background px-2 py-1 text-xs
                            pointer-events-none opacity-60"
                          disabled
                        />
                      )}
                    </td>
                  ))}
                  <td className="p-2 text-center">
                    <span className="text-xs text-muted-foreground opacity-60 cursor-not-allowed">
                      {s.remove_row_text ?? 'Remove'}
                    </span>
                  </td>
                </tr>
              ))}
              {answer_options.length === 0 && (
                <tr>
                  <td className="p-3 text-center text-xs text-muted-foreground italic">
                    No columns defined.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-2">
          <span
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border
              text-xs text-muted-foreground opacity-60 cursor-not-allowed bg-muted/30"
            aria-disabled="true"
          >
            + {s.add_row_text ?? 'Add row'}
          </span>
        </div>
      </div>
    )
  }

  return null
}

export default MatrixPreview
