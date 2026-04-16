import type { ResponseDetailFull, ResponseAnswerDetail } from '../../types/survey'
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

function MatrixAnswerGrid({
  answers,
  questionCode,
}: {
  answers: ResponseAnswerDetail[]
  questionCode: string
}) {
  // Collect unique subquestion labels (rows) for this matrix question
  const rows = Array.from(
    new Map(
      answers
        .filter((a) => a.question_code.startsWith(questionCode) && a.subquestion_label)
        .map((a) => [a.subquestion_label!, a])
    ).values()
  )

  if (rows.length === 0) return null

  return (
    <div className="overflow-x-auto mt-1" data-testid={`matrix-grid-${questionCode}`}>
      <table className="w-full text-xs border border-border rounded" role="table">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Subquestion</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Answer</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((answer) => (
            <tr key={answer.question_id} className="bg-card">
              <td className="px-3 py-2 text-muted-foreground">{answer.subquestion_label}</td>
              <td className="px-3 py-2 text-foreground">
                {answer.selected_option_title ?? formatAnswerValue(answer.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
                    <MatrixAnswerGrid answers={group.answers} questionCode={group.questionCode} />
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
