import type {
  ResponseDetailFull,
  ResponseAnswerDetail,
  MatrixColumnHeader,
} from '../../types/survey'
import { Badge } from '../ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RESPONSE_STATUS_STYLES: Record<string, string> = {
  incomplete: 'bg-yellow-100 text-yellow-800',
  complete: 'bg-green-100 text-green-800',
  disqualified: 'bg-red-100 text-red-800',
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ResponseStatusBadge({ status }: { status: string }) {
  const cls = RESPONSE_STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground'
  return (
    <Badge
      variant="secondary"
      className={`capitalize ${cls} hover:${cls}`}
      data-testid="response-detail-status-badge"
    >
      {status}
    </Badge>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// Answer value rendering
// ---------------------------------------------------------------------------

/**
 * Formats an answer value into a human-readable string.
 * Handles objects (key: value pairs), arrays (comma-joined), and primitives.
 */
export function formatAnswerValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) {
    return value.map((v) => formatAnswerValue(v)).join(', ')
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${formatAnswerValue(v)}`)
      .join(', ')
  }
  return String(value)
}

// ---------------------------------------------------------------------------
// Matrix grid table styles (shared)
// ---------------------------------------------------------------------------

const TABLE_CLS = 'w-full text-xs border border-border rounded'
const TH_CLS = 'px-3 py-2 font-medium text-muted-foreground text-left'
const TH_CENTER_CLS = 'px-3 py-2 font-medium text-muted-foreground text-center'
const TD_LABEL_CLS = 'px-3 py-2 text-muted-foreground whitespace-nowrap'
const TD_CLS = 'px-3 py-2 text-center text-foreground'

// ---------------------------------------------------------------------------
// MatrixSingleAnswerGrid — radio grid (matrix / matrix_single)
// Each subquestion is a row; each answer option is a column.
// Selected cells show a checkmark; others are empty.
// ---------------------------------------------------------------------------

function MatrixSingleAnswerGrid({
  answers,
  columnHeaders,
  questionCode,
}: {
  answers: ResponseAnswerDetail[]
  columnHeaders: MatrixColumnHeader[]
  questionCode: string
}) {
  if (answers.length === 0 || columnHeaders.length === 0) return null

  // Map option code -> title for quick lookup
  const colTitleByCode = new Map(columnHeaders.map((c) => [c.code, c.title]))

  return (
    <div className="overflow-x-auto mt-1" data-testid={`matrix-grid-${questionCode}`}>
      <table className={TABLE_CLS} role="table">
        <thead className="bg-muted/50">
          <tr>
            <th className={TH_CLS}>Subquestion</th>
            {columnHeaders.map((col) => (
              <th key={col.code} className={TH_CENTER_CLS}>
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {answers.map((answer) => {
            const selectedCode = answer.value != null ? String(answer.value) : null
            return (
              <tr key={answer.question_id} className="bg-card">
                <td className={TD_LABEL_CLS}>{answer.subquestion_label ?? answer.question_code}</td>
                {columnHeaders.map((col) => {
                  const isSelected = selectedCode === col.code
                  return (
                    <td key={col.code} className={TD_CLS}>
                      {isSelected ? (
                        <span
                          title={colTitleByCode.get(col.code)}
                          aria-label="selected"
                          className="text-green-600 font-bold"
                        >
                          ✓
                        </span>
                      ) : (
                        <span className="text-muted-foreground/30">·</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MatrixMultipleAnswerGrid — checkbox grid (matrix_multiple)
// Each subquestion is a row; each answer option is a column.
// Selected cells show a checkmark (value is array of option codes per subquestion).
// ---------------------------------------------------------------------------

function MatrixMultipleAnswerGrid({
  answers,
  columnHeaders,
  questionCode,
}: {
  answers: ResponseAnswerDetail[]
  columnHeaders: MatrixColumnHeader[]
  questionCode: string
}) {
  if (answers.length === 0 || columnHeaders.length === 0) return null

  return (
    <div className="overflow-x-auto mt-1" data-testid={`matrix-grid-${questionCode}`}>
      <table className={TABLE_CLS} role="table">
        <thead className="bg-muted/50">
          <tr>
            <th className={TH_CLS}>Subquestion</th>
            {columnHeaders.map((col) => (
              <th key={col.code} className={TH_CENTER_CLS}>
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {answers.map((answer) => {
            // value is an array of selected option codes for this subquestion
            const selected = new Set(Array.isArray(answer.value) ? (answer.value as string[]) : [])
            return (
              <tr key={answer.question_id} className="bg-card">
                <td className={TD_LABEL_CLS}>{answer.subquestion_label ?? answer.question_code}</td>
                {columnHeaders.map((col) => (
                  <td key={col.code} className={TD_CLS}>
                    {selected.has(col.code) ? (
                      <span aria-label="selected" className="text-green-600 font-bold">
                        ✓
                      </span>
                    ) : (
                      <span className="text-muted-foreground/30">·</span>
                    )}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MatrixDropdownAnswerGrid — per-cell values (matrix_dropdown)
// Each subquestion is a row; each answer option (column) has a per-cell value.
// value shape: {"SQ001": {"col1": "val1", "col2": "val2"}, ...}
// We receive one answer per subquestion.
// ---------------------------------------------------------------------------

function MatrixDropdownAnswerGrid({
  answers,
  columnHeaders,
  questionCode,
}: {
  answers: ResponseAnswerDetail[]
  columnHeaders: MatrixColumnHeader[]
  questionCode: string
}) {
  if (answers.length === 0 || columnHeaders.length === 0) return null

  return (
    <div className="overflow-x-auto mt-1" data-testid={`matrix-grid-${questionCode}`}>
      <table className={TABLE_CLS} role="table">
        <thead className="bg-muted/50">
          <tr>
            <th className={TH_CLS}>Subquestion</th>
            {columnHeaders.map((col) => (
              <th key={col.code} className={TH_CLS}>
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {answers.map((answer) => {
            const rowValues =
              answer.value != null &&
              typeof answer.value === 'object' &&
              !Array.isArray(answer.value)
                ? (answer.value as Record<string, unknown>)
                : {}
            return (
              <tr key={answer.question_id} className="bg-card">
                <td className={TD_LABEL_CLS}>{answer.subquestion_label ?? answer.question_code}</td>
                {columnHeaders.map((col) => {
                  const cellVal = rowValues[col.code]
                  return (
                    <td key={col.code} className="px-3 py-2 text-foreground">
                      {cellVal != null ? (
                        <span>{formatAnswerValue(cellVal)}</span>
                      ) : (
                        <span className="text-muted-foreground italic text-xs">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MatrixDynamicAnswerGrid — row-based dynamic grid (matrix_dynamic)
// value shape: [{"col1": "val1", "col2": "val2"}, ...]
// Stored as a single answer on the parent question (not subquestions).
// ---------------------------------------------------------------------------

function MatrixDynamicAnswerGrid({
  answer,
  columnHeaders,
  questionCode,
}: {
  answer: ResponseAnswerDetail
  columnHeaders: MatrixColumnHeader[]
  questionCode: string
}) {
  const rows = Array.isArray(answer.value) ? (answer.value as Record<string, unknown>[]) : []
  if (rows.length === 0 || columnHeaders.length === 0) return null

  return (
    <div className="overflow-x-auto mt-1" data-testid={`matrix-grid-${questionCode}`}>
      <table className={TABLE_CLS} role="table">
        <thead className="bg-muted/50">
          <tr>
            <th className={TH_CLS}>#</th>
            {columnHeaders.map((col) => (
              <th key={col.code} className={TH_CLS}>
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, i) => (
            <tr key={i} className="bg-card">
              <td className={TD_LABEL_CLS}>{i + 1}</td>
              {columnHeaders.map((col) => {
                const cellVal = row[col.code]
                return (
                  <td key={col.code} className="px-3 py-2 text-foreground">
                    {cellVal != null ? (
                      <span>{formatAnswerValue(cellVal)}</span>
                    ) : (
                      <span className="text-muted-foreground italic text-xs">—</span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MatrixAnswerGrid — dispatcher for all matrix types
// ---------------------------------------------------------------------------

function MatrixAnswerGrid({
  answers,
  questionCode,
  questionType,
}: {
  answers: ResponseAnswerDetail[]
  questionCode: string
  questionType: string
}) {
  // Collect column headers from any subquestion answer that has them
  // (all subquestions share the same parent, so first non-null set wins)
  let columnHeaders: MatrixColumnHeader[] = []
  for (const a of answers) {
    if (a.matrix_column_headers && a.matrix_column_headers.length > 0) {
      columnHeaders = a.matrix_column_headers
      break
    }
  }

  // matrix_dynamic: single answer with array value — answers[0] is the parent answer
  if (questionType === 'matrix_dynamic') {
    const parentAnswer = answers[0]
    if (!parentAnswer) return null
    // For matrix_dynamic, column headers come from the answer itself if subquestions
    // aren't used — fall back to deriving column names from the first row object keys
    const derivedHeaders: MatrixColumnHeader[] =
      columnHeaders.length > 0
        ? columnHeaders
        : Array.isArray(parentAnswer.value) && (parentAnswer.value as unknown[]).length > 0
          ? Object.keys((parentAnswer.value as Record<string, unknown>[])[0]).map((k) => ({
              code: k,
              title: k,
            }))
          : []
    return (
      <MatrixDynamicAnswerGrid
        answer={parentAnswer}
        columnHeaders={derivedHeaders}
        questionCode={questionCode}
      />
    )
  }

  // Subquestion-based matrix types
  const subquestionAnswers = answers.filter(
    (a) => a.subquestion_label != null || a.question_code.includes('_SQ')
  )
  // If no subquestion structure found (parent-stored format: single answer with object value),
  // fall back to flat text rendering so data is still visible
  if (subquestionAnswers.length === 0) {
    return (
      <div className="pl-2">
        {answers.map((answer) => (
          <span key={answer.question_id} className="text-sm text-foreground">
            {formatAnswerValue(answer.value)}
          </span>
        ))}
      </div>
    )
  }

  if (questionType === 'matrix_multiple') {
    return (
      <MatrixMultipleAnswerGrid
        answers={subquestionAnswers}
        columnHeaders={columnHeaders}
        questionCode={questionCode}
      />
    )
  }

  if (questionType === 'matrix_dropdown') {
    return (
      <MatrixDropdownAnswerGrid
        answers={subquestionAnswers}
        columnHeaders={columnHeaders}
        questionCode={questionCode}
      />
    )
  }

  // Default: matrix / matrix_single (radio grid)
  return (
    <MatrixSingleAnswerGrid
      answers={subquestionAnswers}
      columnHeaders={columnHeaders}
      questionCode={questionCode}
    />
  )
}

function AnswerValue({ answer }: { answer: ResponseAnswerDetail }) {
  // Choice answers — show option label
  if (answer.selected_option_title) {
    return <span className="text-sm text-foreground">{answer.selected_option_title}</span>
  }

  // Multiple choice — show values array
  if (answer.values && answer.values.length > 0) {
    return (
      <ul className="text-sm text-foreground list-disc pl-4">
        {answer.values.map((v, i) => (
          <li key={i}>{String(v)}</li>
        ))}
      </ul>
    )
  }

  // Null/empty
  if (answer.value === null || answer.value === undefined || answer.value === '') {
    return <span className="text-sm text-muted-foreground italic">No answer</span>
  }

  // Object or array values (e.g. matrix answers stored as plain objects)
  if (typeof answer.value === 'object') {
    return <span className="text-sm text-foreground">{formatAnswerValue(answer.value)}</span>
  }

  return <span className="text-sm text-foreground">{String(answer.value)}</span>
}

// ---------------------------------------------------------------------------
// Answer grouping by question code prefix (for matrix rows) or direct display
// ---------------------------------------------------------------------------

interface AnswerGroup {
  questionCode: string
  questionTitle: string
  questionType: string
  isMatrixParent: boolean
  answers: ResponseAnswerDetail[]
}

function groupAnswers(answers: ResponseAnswerDetail[]): AnswerGroup[] {
  const groups = new Map<string, AnswerGroup>()

  for (const answer of answers) {
    // Matrix subquestions have codes like Q5_SQ001 — group by the parent code
    const matrixMatch = answer.question_code.match(/^([A-Za-z0-9]+)_SQ\d+$/)
    const groupKey = matrixMatch ? matrixMatch[1] : answer.question_code

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        questionCode: groupKey,
        questionTitle: matrixMatch
          ? (answer.question_title.split(' — ')[0] ?? answer.question_title)
          : answer.question_title,
        questionType: answer.question_type,
        isMatrixParent: !!matrixMatch,
        answers: [],
      })
    }
    groups.get(groupKey)!.answers.push(answer)
  }

  // Matrix answers (all types) may be stored on the parent question itself (not subquestions),
  // in which case they need to be flagged as matrix parents so MatrixAnswerGrid is used.
  // Subquestion-based answers already have isMatrixParent=true from the _SQ regex match above.
  const MATRIX_TYPES = [
    'matrix',
    'matrix_single',
    'matrix_multiple',
    'matrix_dropdown',
    'matrix_dynamic',
  ]
  for (const group of groups.values()) {
    if (MATRIX_TYPES.includes(group.questionType) && !group.isMatrixParent) {
      group.isMatrixParent = true
    }
  }

  return Array.from(groups.values())
}

// ---------------------------------------------------------------------------
// ResponseDetail
// ---------------------------------------------------------------------------

interface ResponseDetailProps {
  response: ResponseDetailFull
}

function ResponseDetail({ response }: ResponseDetailProps) {
  const answerGroups = groupAnswers(response.answers)

  return (
    <div data-testid="response-detail">
      {/* Metadata card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-3">
            Response Details
            <ResponseStatusBadge status={response.status} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Response ID
              </p>
              <p className="text-sm font-mono text-foreground break-all">{response.id}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Started
              </p>
              <p className="text-sm text-foreground">{formatDate(response.started_at)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Completed
              </p>
              <p className="text-sm text-foreground">{formatDate(response.completed_at)}</p>
            </div>
            {response.ip_address && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  IP Address
                </p>
                <p className="text-sm text-foreground">{response.ip_address}</p>
              </div>
            )}
            {response.participant_id && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Participant ID
                </p>
                <p className="text-sm font-mono text-foreground break-all">
                  {response.participant_id}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Answers section */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">
          Answers
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({answerGroups.length} question{answerGroups.length !== 1 ? 's' : ''})
          </span>
        </h2>

        {answerGroups.length === 0 ? (
          <Card data-testid="no-answers-state">
            <CardContent className="text-center py-10">
              <p className="text-muted-foreground text-sm">
                No answers recorded for this response.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3" data-testid="answers-list">
            {answerGroups.map((group) => (
              <Card key={group.questionCode} data-testid={`answer-group-${group.questionCode}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded mt-0.5">
                      {group.questionCode}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{group.questionTitle}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{group.questionType}</p>
                    </div>
                  </div>

                  {group.isMatrixParent ? (
                    <MatrixAnswerGrid
                      answers={group.answers}
                      questionCode={group.questionCode}
                      questionType={group.questionType}
                    />
                  ) : (
                    <div className="pl-2">
                      {group.answers.map((answer) => (
                        <AnswerValue key={answer.question_id} answer={answer} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ResponseDetail
