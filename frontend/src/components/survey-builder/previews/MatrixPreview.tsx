/**
 * MatrixPreview — display-only previews for all matrix question types.
 *
 * - matrix / matrix_single: grid of radio buttons, rows × columns
 * - matrix_multiple: grid of checkboxes, rows × columns
 * - matrix_dropdown: grid of per-column cell type inputs (non-functional)
 * - matrix_dynamic: editable rows with add/remove controls (non-functional)
 *
 * Supports transpose setting (swap rows/columns display).
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

  if (question_type === 'matrix' || question_type === 'matrix_single') {
    const s = (settings ?? {}) as Partial<MatrixSettings>
    const transpose = s.transpose ?? false

    if (transpose) {
      // Transposed: answer options as rows, subquestions as columns
      return (
        <div className="overflow-x-auto" data-testid="preview-matrix">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="text-left p-2 font-medium text-muted-foreground w-1/3" />
                {subquestions.map((sub) => (
                  <th
                    key={sub.id}
                    className="text-center p-2 font-medium text-muted-foreground text-xs"
                  >
                    {sub.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {answer_options.length === 0 ? (
                <tr>
                  <td
                    colSpan={subquestions.length + 1}
                    className="p-3 text-center text-xs text-muted-foreground italic"
                  >
                    No answer options (columns) defined.
                  </td>
                </tr>
              ) : (
                answer_options.map((opt, idx) => (
                  <tr
                    key={opt.id}
                    className={s.alternate_rows && idx % 2 === 1 ? 'bg-muted/30' : ''}
                  >
                    <td className="p-2 text-sm">{opt.title}</td>
                    {subquestions.map((sub) => (
                      <td key={sub.id} className="p-2 text-center">
                        <input
                          type="radio"
                          name={`matrix-preview-${question.id}-col-${sub.id}`}
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
          {s.randomize_rows && (
            <p className="text-xs text-muted-foreground italic mt-1">
              (Rows will be randomized for respondents)
            </p>
          )}
        </div>
      )
    }

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

  if (question_type === 'matrix_multiple') {
    const s = (settings ?? {}) as Partial<MatrixSettings>
    const transpose = s.transpose ?? false

    if (transpose) {
      return (
        <div className="overflow-x-auto" data-testid="preview-matrix-multiple">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="text-left p-2 font-medium text-muted-foreground w-1/3" />
                {subquestions.map((sub) => (
                  <th
                    key={sub.id}
                    className="text-center p-2 font-medium text-muted-foreground text-xs"
                  >
                    {sub.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {answer_options.length === 0 ? (
                <tr>
                  <td
                    colSpan={subquestions.length + 1}
                    className="p-3 text-center text-xs text-muted-foreground italic"
                  >
                    No answer options defined.
                  </td>
                </tr>
              ) : (
                answer_options.map((opt, idx) => (
                  <tr
                    key={opt.id}
                    className={s.alternate_rows && idx % 2 === 1 ? 'bg-muted/30' : ''}
                  >
                    <td className="p-2 text-sm">{opt.title}</td>
                    {subquestions.map((sub) => (
                      <td key={sub.id} className="p-2 text-center">
                        <input
                          type="checkbox"
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
          {s.randomize_rows && (
            <p className="text-xs text-muted-foreground italic mt-1">
              (Rows will be randomized for respondents)
            </p>
          )}
        </div>
      )
    }

    return (
      <div className="overflow-x-auto" data-testid="preview-matrix-multiple">
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
                        type="checkbox"
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
    const columnTypes = s.column_types ?? {}
    const transpose = s.transpose ?? false

    const getColCellType = (colCode: string): string =>
      (columnTypes && columnTypes[colCode]) ?? cellType

    const PreviewCell = ({
      colCode,
      subTitle,
      optTitle,
    }: {
      colCode: string
      subTitle: string
      optTitle: string
    }) => {
      const ct = getColCellType(colCode)
      if (ct === 'text' || ct === 'number') {
        return (
          <input
            type={ct}
            className="w-full rounded border border-input bg-background px-2 py-1 text-xs
              pointer-events-none opacity-60"
            disabled
            aria-label={`${subTitle} - ${optTitle}`}
          />
        )
      }
      if (ct === 'checkbox' || ct === 'boolean') {
        return (
          <div className="flex justify-center">
            <input
              type="checkbox"
              className="opacity-60 pointer-events-none"
              disabled
              aria-label={`${subTitle} - ${optTitle}`}
            />
          </div>
        )
      }
      if (ct === 'radio') {
        return (
          <div className="flex justify-center">
            <input
              type="radio"
              className="opacity-60 pointer-events-none"
              disabled
              aria-label={`${subTitle} - ${optTitle}`}
            />
          </div>
        )
      }
      // dropdown (default) and rating
      return (
        <select
          className="w-full rounded border border-input bg-background px-2 py-1 text-xs
            pointer-events-none opacity-60"
          disabled
          aria-label={`${subTitle} - ${optTitle}`}
        >
          <option>Select…</option>
        </select>
      )
    }

    if (transpose) {
      return (
        <div className="overflow-x-auto" data-testid="preview-matrix-dropdown">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="text-left p-2 font-medium text-muted-foreground w-1/3" />
                {subquestions.map((sub) => (
                  <th
                    key={sub.id}
                    className="text-center p-2 font-medium text-muted-foreground text-xs"
                  >
                    {sub.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {answer_options.map((opt, idx) => (
                <tr key={opt.id} className={s.alternate_rows && idx % 2 === 1 ? 'bg-muted/30' : ''}>
                  <td className="p-2 text-sm">{opt.title}</td>
                  {subquestions.map((sub) => (
                    <td key={sub.id} className="p-2">
                      <PreviewCell colCode={opt.code} subTitle={sub.title} optTitle={opt.title} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

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
                      <PreviewCell colCode={opt.code} subTitle={sub.title} optTitle={opt.title} />
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
