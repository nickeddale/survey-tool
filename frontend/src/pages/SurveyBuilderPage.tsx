/**
 * SurveyBuilderPage — three-panel layout for building/editing surveys.
 *
 * Layout:
 *   Left panel  – Question type palette (drag-to-add question types)
 *   Center panel – Survey canvas (groups and questions list)
 *   Right panel  – Property editor (fields for selected group or question)
 *
 * On mount: fetches the full survey via GET /api/v1/surveys/:id and loads it
 * into the builder Zustand store. Non-draft surveys are rendered read-only.
 */

import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Lock, Plus, Type, List, AlignLeft, CheckSquare, ToggleLeft, Hash } from 'lucide-react'
import surveyService from '../services/surveyService'
import { useBuilderStore } from '../store/builderStore'
import type { SelectedItem } from '../store/builderStore'
import { ApiError } from '../types/api'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Skeleton } from '../components/ui/skeleton'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-green-100 text-green-800',
  closed: 'bg-yellow-100 text-yellow-800',
  archived: 'bg-red-100 text-red-800',
}

const QUESTION_TYPES = [
  { type: 'text', label: 'Short Text', icon: Type },
  { type: 'textarea', label: 'Long Text', icon: AlignLeft },
  { type: 'radio', label: 'Single Choice', icon: ToggleLeft },
  { type: 'checkbox', label: 'Multiple Choice', icon: CheckSquare },
  { type: 'select', label: 'Dropdown', icon: List },
  { type: 'number', label: 'Number', icon: Hash },
]

// ---------------------------------------------------------------------------
// Sub-components: Loading skeleton
// ---------------------------------------------------------------------------

function BuilderSkeleton() {
  return (
    <div
      className="flex flex-col h-screen"
      aria-label="Loading survey builder"
      aria-busy="true"
      data-testid="builder-loading-skeleton"
    >
      {/* Top bar skeleton */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background">
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-6 w-48 rounded" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      {/* Panels skeleton */}
      <div className="flex flex-1 overflow-hidden">
        <Skeleton className="w-56 h-full" />
        <div className="flex-1 p-4 space-y-3">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
        <Skeleton className="w-72 h-full" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components: Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground'
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded text-sm font-medium capitalize ${cls}`}
      data-testid="status-badge"
    >
      {status}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Sub-components: Left panel — question type palette
// ---------------------------------------------------------------------------

function QuestionPalette({ readOnly }: { readOnly: boolean }) {
  return (
    <aside
      className="w-56 border-r border-border bg-muted/30 flex flex-col overflow-y-auto"
      data-testid="question-palette"
    >
      <div className="px-3 py-3 border-b border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Question Types</p>
      </div>
      <div className="p-2 space-y-1">
        {QUESTION_TYPES.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            className={`w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm text-left transition-colors
              ${readOnly
                ? 'text-muted-foreground cursor-not-allowed opacity-50'
                : 'hover:bg-muted text-foreground cursor-pointer'
              }`}
            disabled={readOnly}
            aria-label={`Add ${label} question`}
            data-question-type={type}
          >
            <Icon size={14} className="shrink-0" />
            {label}
          </button>
        ))}
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Sub-components: Center panel — survey canvas
// ---------------------------------------------------------------------------

interface SurveyCanvasProps {
  readOnly: boolean
  selectedItem: SelectedItem
  onSelectItem: (item: SelectedItem) => void
}

function SurveyCanvas({ readOnly, selectedItem, onSelectItem }: SurveyCanvasProps) {
  const groups = useBuilderStore((s) => s.groups)

  return (
    <main
      className="flex-1 overflow-y-auto p-4 bg-background"
      data-testid="survey-canvas"
    >
      <div className="max-w-2xl mx-auto space-y-4">
        {groups.length === 0 && (
          <Card data-testid="canvas-empty-state">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground text-sm mb-4">
                No question groups yet.
                {readOnly ? '' : ' Add a group to get started.'}
              </p>
              {!readOnly && (
                <Button
                  size="sm"
                  disabled={readOnly}
                  data-testid="add-group-button"
                >
                  <Plus size={14} />
                  Add Group
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {groups.map((group) => {
          const isGroupSelected = selectedItem?.type === 'group' && selectedItem.id === group.id

          return (
            <Card
              key={group.id}
              className={`transition-shadow ${isGroupSelected ? 'ring-2 ring-primary' : ''}`}
              data-testid={`canvas-group-${group.id}`}
            >
              <CardHeader
                className="pb-2 cursor-pointer select-none"
                onClick={() =>
                  onSelectItem(isGroupSelected ? null : { type: 'group', id: group.id })
                }
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{group.title}</CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {group.questions.length} question{group.questions.length !== 1 ? 's' : ''}
                    </span>
                    {!readOnly && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs"
                        disabled={readOnly}
                        data-testid={`add-question-button-${group.id}`}
                        onClick={(e) => {
                          e.stopPropagation()
                        }}
                      >
                        <Plus size={12} />
                        Question
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                {group.questions.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">No questions in this group.</p>
                ) : (
                  <div className="space-y-2">
                    {group.questions.map((question) => {
                      const isQuestionSelected =
                        selectedItem?.type === 'question' && selectedItem.id === question.id
                      return (
                        <div
                          key={question.id}
                          className={`flex items-start gap-2 p-2 rounded-md border border-border cursor-pointer
                            transition-colors hover:bg-muted/50
                            ${isQuestionSelected ? 'bg-primary/5 border-primary/50 ring-1 ring-primary/30' : ''}`}
                          onClick={() =>
                            onSelectItem(
                              isQuestionSelected ? null : { type: 'question', id: question.id },
                            )
                          }
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              onSelectItem(
                                isQuestionSelected ? null : { type: 'question', id: question.id },
                              )
                            }
                          }}
                          data-testid={`canvas-question-${question.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-mono text-muted-foreground bg-muted px-1 py-0.5 rounded">
                                {question.code}
                              </span>
                              <span className="text-sm font-medium truncate">{question.title}</span>
                              <span className="text-xs text-muted-foreground bg-muted/60 px-1 py-0.5 rounded">
                                {question.question_type}
                              </span>
                              {question.is_required && (
                                <span className="text-xs text-destructive">*</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}

        {groups.length > 0 && !readOnly && (
          <Button
            variant="outline"
            className="w-full"
            disabled={readOnly}
            data-testid="add-group-button"
          >
            <Plus size={14} />
            Add Group
          </Button>
        )}
      </div>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Sub-components: Right panel — property editor
// ---------------------------------------------------------------------------

interface PropertyEditorProps {
  readOnly: boolean
  selectedItem: SelectedItem
}

function PropertyEditor({ readOnly, selectedItem }: PropertyEditorProps) {
  const groups = useBuilderStore((s) => s.groups)

  const selectedGroup =
    selectedItem?.type === 'group' ? groups.find((g) => g.id === selectedItem.id) ?? null : null

  const selectedQuestion =
    selectedItem?.type === 'question'
      ? groups.flatMap((g) => g.questions).find((q) => q.id === selectedItem.id) ?? null
      : null

  return (
    <aside
      className="w-72 border-l border-border bg-muted/10 overflow-y-auto flex flex-col"
      data-testid="property-editor"
    >
      <div className="px-3 py-3 border-b border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Properties</p>
      </div>

      {!selectedGroup && !selectedQuestion && (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-muted-foreground text-center">
            Select a group or question to edit its properties.
          </p>
        </div>
      )}

      {selectedGroup && (
        <div className="p-3 space-y-3" data-testid="group-properties">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Group Title</p>
            <input
              type="text"
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm
                focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
              defaultValue={selectedGroup.title}
              disabled={readOnly}
              aria-label="Group title"
              data-testid="property-group-title"
            />
          </div>
          {selectedGroup.description !== undefined && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
              <textarea
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm
                  focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed
                  resize-none"
                rows={3}
                defaultValue={selectedGroup.description ?? ''}
                disabled={readOnly}
                aria-label="Group description"
                data-testid="property-group-description"
              />
            </div>
          )}
        </div>
      )}

      {selectedQuestion && (
        <div className="p-3 space-y-3" data-testid="question-properties">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Question Title</p>
            <input
              type="text"
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm
                focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
              defaultValue={selectedQuestion.title}
              disabled={readOnly}
              aria-label="Question title"
              data-testid="property-question-title"
            />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Code</p>
            <input
              type="text"
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm font-mono
                focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
              defaultValue={selectedQuestion.code}
              disabled={readOnly}
              aria-label="Question code"
              data-testid="property-question-code"
            />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Type</p>
            <p className="text-sm text-foreground capitalize">{selectedQuestion.question_type}</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="prop-required"
              defaultChecked={selectedQuestion.is_required}
              disabled={readOnly}
              data-testid="property-question-required"
            />
            <label htmlFor="prop-required" className="text-sm">Required</label>
          </div>
          {selectedQuestion.answer_options.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Answer Options ({selectedQuestion.answer_options.length})
              </p>
              <div className="space-y-1">
                {selectedQuestion.answer_options.map((opt) => (
                  <div
                    key={opt.id}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2 py-1 rounded"
                  >
                    <span className="font-mono">{opt.code}</span>
                    <span className="flex-1 truncate">{opt.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function SurveyBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const {
    surveyId,
    title,
    status,
    selectedItem,
    isLoading,
    error,
    loadSurvey,
    setLoading,
    setError,
    setSelectedItem,
  } = useBuilderStore()

  const readOnly = status !== '' && status !== 'draft'

  // -------------------------------------------------------------------------
  // Fetch survey on mount
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!id) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await surveyService.getSurvey(id!)
        if (!cancelled) {
          loadSurvey(data)
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError) {
            setError(err.message)
          } else {
            setError('Failed to load survey. Please try again.')
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Render: loading
  // -------------------------------------------------------------------------

  if (isLoading) {
    return <BuilderSkeleton />
  }

  // -------------------------------------------------------------------------
  // Render: error
  // -------------------------------------------------------------------------

  if (error || !surveyId) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4" data-testid="builder-error">
        <div className="p-4 text-sm text-destructive bg-destructive/10 rounded-md max-w-md text-center" role="alert">
          {error ?? 'Failed to load survey.'}
        </div>
        <Button variant="outline" onClick={() => navigate('/surveys')}>
          Back to Surveys
        </Button>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render: full builder
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-screen overflow-hidden" data-testid="survey-builder-page">
      {/* Top bar */}
      <header
        className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background shrink-0"
        data-testid="builder-top-bar"
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => navigate(`/surveys/${id}`)}
          aria-label="Back to survey"
        >
          <ArrowLeft size={18} />
        </Button>

        <h1 className="text-lg font-semibold text-foreground truncate flex-1" data-testid="builder-title">
          {title}
        </h1>

        <StatusBadge status={status} />

        {readOnly && (
          <Badge
            variant="outline"
            className="gap-1 border-amber-400 text-amber-700 bg-amber-50"
            data-testid="read-only-badge"
          >
            <Lock size={12} />
            Read-only
          </Badge>
        )}
      </header>

      {/* Three-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        <QuestionPalette readOnly={readOnly} />
        <SurveyCanvas
          readOnly={readOnly}
          selectedItem={selectedItem}
          onSelectItem={setSelectedItem}
        />
        <PropertyEditor readOnly={readOnly} selectedItem={selectedItem} />
      </div>
    </div>
  )
}

export default SurveyBuilderPage
