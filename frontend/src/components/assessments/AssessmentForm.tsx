import { useState, useEffect } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import type {
  AssessmentResponse,
  AssessmentCreate,
  AssessmentScope,
  QuestionGroupResponse,
  QuestionResponse,
} from '../../types/survey'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCOPE_OPTIONS: { value: AssessmentScope; label: string }[] = [
  { value: 'total', label: 'Total (entire survey)' },
  { value: 'group', label: 'Group (specific question group)' },
  { value: 'question', label: 'Question (single question)' },
  { value: 'subquestion', label: 'Subquestion (matrix row)' },
]

// Matrix question types that have named subquestions (exclude matrix_dynamic)
const MATRIX_TYPES = ['matrix_single', 'matrix_multiple', 'matrix_dropdown']

const SELECT_CLASS =
  'px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AssessmentFormProps {
  surveyId: string
  groups: QuestionGroupResponse[]
  questions?: QuestionResponse[]
  assessment?: AssessmentResponse | null
  onSubmit: (data: AssessmentCreate) => Promise<void>
  onCancel: () => void
  isLoading?: boolean
  error?: string | null
}

// ---------------------------------------------------------------------------
// AssessmentForm
// ---------------------------------------------------------------------------

function AssessmentForm({
  groups,
  questions = [],
  assessment,
  onSubmit,
  onCancel,
  isLoading,
  error,
}: AssessmentFormProps) {
  const isEdit = Boolean(assessment)

  const [name, setName] = useState(assessment?.name ?? '')
  const [scope, setScope] = useState<AssessmentScope>(assessment?.scope ?? 'total')
  const [groupId, setGroupId] = useState<string>(assessment?.group_id ?? '')
  const [questionId, setQuestionId] = useState<string>(assessment?.question_id ?? '')
  const [subquestionId, setSubquestionId] = useState<string>(assessment?.subquestion_id ?? '')
  const [minScore, setMinScore] = useState<string>(
    assessment != null ? String(assessment.min_score) : ''
  )
  const [maxScore, setMaxScore] = useState<string>(
    assessment != null ? String(assessment.max_score) : ''
  )
  const [message, setMessage] = useState(assessment?.message ?? '')
  const [validationError, setValidationError] = useState<string | null>(null)

  // Re-populate when assessment changes (e.g., switching which assessment to edit)
  useEffect(() => {
    if (assessment) {
      setName(assessment.name)
      setScope(assessment.scope)
      setGroupId(assessment.group_id ?? '')
      setQuestionId(assessment.question_id ?? '')
      setSubquestionId(assessment.subquestion_id ?? '')
      setMinScore(String(assessment.min_score))
      setMaxScore(String(assessment.max_score))
      setMessage(assessment.message)
    } else {
      setName('')
      setScope('total')
      setGroupId('')
      setQuestionId('')
      setSubquestionId('')
      setMinScore('')
      setMaxScore('')
      setMessage('')
    }
    setValidationError(null)
  }, [assessment])

  // Matrix questions filtered for subquestion scope
  const matrixQuestions = questions.filter((q) => MATRIX_TYPES.includes(q.question_type))

  // Subquestions of the currently selected matrix question
  const selectedMatrixQuestion = matrixQuestions.find((q) => q.id === questionId)
  const availableSubquestions = selectedMatrixQuestion?.subquestions ?? []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setValidationError(null)

    if (!name.trim()) {
      setValidationError('Name is required.')
      return
    }

    const parsedMin = parseFloat(minScore)
    const parsedMax = parseFloat(maxScore)

    if (minScore === '' || isNaN(parsedMin)) {
      setValidationError('Min score is required.')
      return
    }
    if (maxScore === '' || isNaN(parsedMax)) {
      setValidationError('Max score is required.')
      return
    }
    if (parsedMin > parsedMax) {
      setValidationError('Min score must be less than or equal to max score.')
      return
    }
    if (scope === 'group' && !groupId) {
      setValidationError('Group is required when scope is Group.')
      return
    }
    if (scope === 'question' && !questionId) {
      setValidationError('Question is required when scope is Question.')
      return
    }
    if (scope === 'subquestion' && !questionId) {
      setValidationError('Question is required when scope is Subquestion.')
      return
    }
    if (scope === 'subquestion' && !subquestionId) {
      setValidationError('Subquestion is required when scope is Subquestion.')
      return
    }
    if (!message.trim()) {
      setValidationError('Message is required.')
      return
    }

    const payload: AssessmentCreate = {
      name: name.trim(),
      scope,
      group_id: scope === 'group' ? groupId : null,
      question_id: scope === 'question' || scope === 'subquestion' ? questionId : null,
      subquestion_id: scope === 'subquestion' ? subquestionId : null,
      min_score: parsedMin,
      max_score: parsedMax,
      message: message.trim(),
    }

    await onSubmit(payload)
  }

  const displayError = validationError ?? error

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assessment-form-title"
      data-testid="assessment-form-dialog"
    >
      <div className="bg-background rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 id="assessment-form-title" className="text-lg font-semibold text-foreground mb-4">
            {isEdit ? 'Edit Assessment' : 'Create Assessment'}
          </h2>

          {displayError && (
            <div
              className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md"
              role="alert"
              data-testid="assessment-form-error"
            >
              {displayError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="space-y-4">
              {/* Name */}
              <div>
                <Label htmlFor="assessment-name">Name</Label>
                <Input
                  id="assessment-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. High Satisfaction"
                  required
                  className="mt-1"
                  data-testid="assessment-name-input"
                />
              </div>

              {/* Scope */}
              <div>
                <Label htmlFor="assessment-scope">Scope</Label>
                <select
                  id="assessment-scope"
                  value={scope}
                  onChange={(e) => {
                    const newScope = e.target.value as AssessmentScope
                    setScope(newScope)
                    if (newScope !== 'group') {
                      setGroupId('')
                    }
                    if (newScope !== 'question' && newScope !== 'subquestion') {
                      setQuestionId('')
                    }
                    if (newScope !== 'subquestion') {
                      setSubquestionId('')
                    }
                  }}
                  className={`${SELECT_CLASS} mt-1`}
                  data-testid="assessment-scope-select"
                >
                  {SCOPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Group selector (only shown when scope=group) */}
              {scope === 'group' && (
                <div>
                  <Label htmlFor="assessment-group">Question Group</Label>
                  <select
                    id="assessment-group"
                    value={groupId}
                    onChange={(e) => setGroupId(e.target.value)}
                    className={`${SELECT_CLASS} mt-1`}
                    data-testid="assessment-group-select"
                  >
                    <option value="">Select a group...</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Question selector (only shown when scope=question) */}
              {scope === 'question' && (
                <div>
                  <Label htmlFor="assessment-question">Question</Label>
                  <select
                    id="assessment-question"
                    value={questionId}
                    onChange={(e) => setQuestionId(e.target.value)}
                    className={`${SELECT_CLASS} mt-1`}
                    data-testid="assessment-question-select"
                  >
                    <option value="">Select a question...</option>
                    {questions.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.code ? `${q.code}: ` : ''}
                        {q.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Matrix question selector + subquestion selector (only shown when scope=subquestion) */}
              {scope === 'subquestion' && (
                <>
                  <div>
                    <Label htmlFor="assessment-matrix-question">Matrix Question</Label>
                    <select
                      id="assessment-matrix-question"
                      value={questionId}
                      onChange={(e) => {
                        setQuestionId(e.target.value)
                        setSubquestionId('')
                      }}
                      className={`${SELECT_CLASS} mt-1`}
                      data-testid="assessment-matrix-question-select"
                    >
                      <option value="">Select a matrix question...</option>
                      {matrixQuestions.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.code ? `${q.code}: ` : ''}
                          {q.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  {questionId && (
                    <div>
                      <Label htmlFor="assessment-subquestion">Subquestion</Label>
                      <select
                        id="assessment-subquestion"
                        value={subquestionId}
                        onChange={(e) => setSubquestionId(e.target.value)}
                        className={`${SELECT_CLASS} mt-1`}
                        data-testid="assessment-subquestion-select"
                      >
                        <option value="">Select a subquestion...</option>
                        {availableSubquestions.map((sq) => (
                          <option key={sq.id} value={sq.id}>
                            {sq.code ? `${sq.code}: ` : ''}
                            {sq.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}

              {/* Score range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="assessment-min-score">Min Score</Label>
                  <Input
                    id="assessment-min-score"
                    type="number"
                    value={minScore}
                    onChange={(e) => setMinScore(e.target.value)}
                    placeholder="e.g. 0"
                    required
                    className="mt-1"
                    data-testid="assessment-min-score-input"
                  />
                </div>
                <div>
                  <Label htmlFor="assessment-max-score">Max Score</Label>
                  <Input
                    id="assessment-max-score"
                    type="number"
                    value={maxScore}
                    onChange={(e) => setMaxScore(e.target.value)}
                    placeholder="e.g. 10"
                    required
                    className="mt-1"
                    data-testid="assessment-max-score-input"
                  />
                </div>
              </div>

              {/* Message */}
              <div>
                <Label htmlFor="assessment-message">Message</Label>
                <textarea
                  id="assessment-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Message shown when score falls in this range..."
                  rows={3}
                  className="mt-1 px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full resize-none"
                  data-testid="assessment-message-input"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end mt-6">
              <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} data-testid="assessment-form-submit">
                {isLoading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Assessment'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default AssessmentForm
