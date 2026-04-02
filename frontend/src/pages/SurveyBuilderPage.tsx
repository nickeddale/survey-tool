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
 *
 * Drag-and-drop:
 *   Questions are sortable within their group AND draggable between groups.
 *   Uses @dnd-kit/core (DndContext) with closestCorners collision detection.
 *   onDragEnd handles same-group reorder vs cross-group move.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { arrayMove } from '@dnd-kit/sortable'
import { ArrowLeft, Lock, Plus, Type, List, AlignLeft, CheckSquare, ToggleLeft, Hash } from 'lucide-react'
import surveyService from '../services/surveyService'
import { useBuilderStore } from '../store/builderStore'
import type { BuilderQuestion, SelectedItem } from '../store/builderStore'
import { ApiError } from '../types/api'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Skeleton } from '../components/ui/skeleton'
import { GroupPanel } from '../components/survey/GroupPanel'
import { QuestionCard } from '../components/survey/QuestionCard'
import { AnswerOptionsEditor } from '../components/survey-builder/AnswerOptionsEditor'

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
// Sub-components: Center panel — survey canvas with DnD
// ---------------------------------------------------------------------------

interface SurveyCanvasProps {
  readOnly: boolean
  selectedItem: SelectedItem
  onSelectItem: (item: SelectedItem) => void
  surveyId: string
}

function SurveyCanvas({ readOnly, selectedItem, onSelectItem, surveyId }: SurveyCanvasProps) {
  const groups = useBuilderStore((s) => s.groups)
  const reorderQuestions = useBuilderStore((s) => s.reorderQuestions)
  const moveQuestion = useBuilderStore((s) => s.moveQuestion)
  const undo = useBuilderStore((s) => s.undo)

  // Track which question is actively being dragged (for DragOverlay)
  const [activeQuestion, setActiveQuestion] = useState<BuilderQuestion | null>(null)
  // Track which group a dragged item is currently hovering over
  const [overId, setOverId] = useState<string | null>(null)

  // We need a stable ref to groups for use inside callbacks without stale closures
  const groupsRef = useRef(groups)
  groupsRef.current = groups

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        // Require 5px movement before starting drag to allow clicks
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event
    // Find the question being dragged
    const question = groupsRef.current
      .flatMap((g) => g.questions)
      .find((q) => q.id === active.id)
    setActiveQuestion(question ?? null)
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event
    setOverId(over?.id?.toString() ?? null)
  }, [])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      setActiveQuestion(null)
      setOverId(null)

      if (!over) return
      if (active.id === over.id) return

      const currentGroups = groupsRef.current
      const activeId = active.id.toString()
      const overId = over.id.toString()

      // Find the group that contains the dragged question
      const fromGroup = currentGroups.find((g) =>
        g.questions.some((q) => q.id === activeId),
      )
      if (!fromGroup) return

      // Determine if we dropped onto a question or a group
      const isOverQuestion = currentGroups.some((g) =>
        g.questions.some((q) => q.id === overId),
      )
      const isOverGroup = currentGroups.some((g) => g.id === overId)

      // Find the target group
      let toGroup = isOverQuestion
        ? currentGroups.find((g) => g.questions.some((q) => q.id === overId))
        : isOverGroup
          ? currentGroups.find((g) => g.id === overId)
          : null

      if (!toGroup) return

      const isSameGroup = fromGroup.id === toGroup.id

      if (isSameGroup) {
        // Reorder within same group
        const oldIndex = fromGroup.questions.findIndex((q) => q.id === activeId)
        const newIndex = fromGroup.questions.findIndex((q) => q.id === overId)
        if (oldIndex === newIndex) return

        const newOrder = arrayMove(
          fromGroup.questions.map((q) => q.id),
          oldIndex,
          newIndex,
        )

        // Optimistic update
        reorderQuestions(fromGroup.id, newOrder)

        try {
          await surveyService.reorderQuestions(surveyId, fromGroup.id, newOrder)
        } catch {
          // Undo optimistic update on failure
          undo()
        }
      } else {
        // Move question to a different group
        // Determine insert position in target group
        const targetQuestionIndex = isOverQuestion
          ? toGroup.questions.findIndex((q) => q.id === overId)
          : -1

        // Optimistic update: move the question
        moveQuestion(fromGroup.id, toGroup.id, activeId)

        // Build new order for target group with the moved question inserted
        const targetGroupAfterMove = groupsRef.current.find((g) => g.id === toGroup!.id)
        const newTargetOrder = targetGroupAfterMove?.questions.map((q) => q.id) ?? []

        // If we dropped onto a specific question, reorder so the moved item is at that position
        if (targetQuestionIndex !== -1) {
          const movedIdx = newTargetOrder.indexOf(activeId)
          if (movedIdx !== -1) {
            const reordered = arrayMove(newTargetOrder, movedIdx, targetQuestionIndex)
            reorderQuestions(toGroup.id, reordered)
          }
        }

        try {
          await surveyService.moveQuestion(surveyId, activeId, toGroup.id)
          // Reorder target group after move
          const finalTargetGroup = groupsRef.current.find((g) => g.id === toGroup!.id)
          if (finalTargetGroup) {
            await surveyService.reorderQuestions(
              surveyId,
              toGroup.id,
              finalTargetGroup.questions.map((q) => q.id),
            )
          }
        } catch {
          // Undo optimistic update on failure
          undo()
        }
      }
    },
    [surveyId, reorderQuestions, moveQuestion, undo],
  )

  // Determine which groups are "over" (being hovered by the dragged question)
  const overGroupId = overId
    ? groups.some((g) => g.id === overId)
      ? overId
      : groups.find((g) => g.questions.some((q) => q.id === overId))?.id ?? null
    : null

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

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {groups.map((group) => (
            <GroupPanel
              key={group.id}
              group={group}
              selectedItem={selectedItem}
              onSelectItem={onSelectItem}
              readOnly={readOnly}
              isOver={!readOnly && overGroupId === group.id && activeQuestion !== null}
            />
          ))}

          {/* Floating drag overlay — shows preview card while dragging */}
          <DragOverlay>
            {activeQuestion ? (
              <QuestionCard
                question={activeQuestion}
                selectedItem={null}
                onSelectItem={() => {}}
                readOnly={readOnly}
                isOverlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>

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
  surveyId: string
}

function PropertyEditor({ readOnly, selectedItem, surveyId }: PropertyEditorProps) {
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
          <AnswerOptionsEditor
            surveyId={surveyId}
            groupId={selectedQuestion.group_id}
            questionId={selectedQuestion.id}
            questionType={selectedQuestion.question_type}
            options={selectedQuestion.answer_options}
            readOnly={readOnly}
          />
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
          surveyId={surveyId}
        />
        <PropertyEditor readOnly={readOnly} selectedItem={selectedItem} surveyId={surveyId} />
      </div>
    </div>
  )
}

export default SurveyBuilderPage
