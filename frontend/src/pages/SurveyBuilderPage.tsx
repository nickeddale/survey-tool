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
 *   Groups are sortable by dragging the group drag handle.
 *   Questions are sortable within their group AND draggable between groups.
 *   Uses @dnd-kit/core (DndContext) with closestCorners collision detection.
 *   onDragEnd handles group reorder, same-group question reorder, and
 *   cross-group question move.
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
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowLeft, Eye, EyeOff, Lock, Plus, Type, List, AlignLeft, CheckSquare, ToggleLeft, Hash } from 'lucide-react'
import surveyService from '../services/surveyService'
import { useBuilderStore } from '../store/builderStore'
import type { BuilderGroup, BuilderQuestion, SelectedItem } from '../store/builderStore'
import { ApiError } from '../types/api'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Skeleton } from '../components/ui/skeleton'
import { QuestionEditor } from '../components/survey-builder/QuestionEditor'
import { GroupPanel as BuilderGroupPanel } from '../components/survey/GroupPanel'
import { QuestionCard } from '../components/survey/QuestionCard'
import { QuestionPreview } from '../components/survey-builder/QuestionPreview'

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
// Sub-components: Group drag overlay preview (miniature group card)
// ---------------------------------------------------------------------------

function GroupDragPreview({ group }: { group: BuilderGroup }) {
  return (
    <div
      className="opacity-90 shadow-xl rounded-lg border border-border bg-background overflow-hidden"
      data-testid="group-drag-overlay"
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border">
        <span className="text-sm font-medium truncate flex-1">{group.title}</span>
        <span className="text-xs text-muted-foreground shrink-0">
          {group.questions.length} {group.questions.length === 1 ? 'question' : 'questions'}
        </span>
      </div>
      {group.questions.length > 0 && (
        <div className="px-3 py-2 space-y-1 max-h-40 overflow-hidden">
          {group.questions.slice(0, 3).map((q) => (
            <div
              key={q.id}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <span className="font-mono bg-muted px-1 py-0.5 rounded">{q.code}</span>
              <span className="truncate">{q.title}</span>
            </div>
          ))}
          {group.questions.length > 3 && (
            <p className="text-xs text-muted-foreground italic">
              +{group.questions.length - 3} more…
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components: Sortable group panel wrapper
// ---------------------------------------------------------------------------

interface SortableGroupPanelProps {
  group: BuilderGroup
  readOnly: boolean
  selectedItem: SelectedItem
  onSelectItem: (item: SelectedItem) => void
  isPreviewMode: boolean
}

function SortableGroupPanel({
  group,
  readOnly,
  selectedItem,
  onSelectItem,
  isPreviewMode,
}: SortableGroupPanelProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `group:${group.id}` })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <BuilderGroupPanel
        group={group}
        selectedItem={selectedItem}
        onSelectItem={onSelectItem}
        readOnly={readOnly}
        dragListeners={listeners}
        dragAttributes={attributes}
        isPreviewMode={isPreviewMode}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components: Center panel — survey canvas with DnD
// ---------------------------------------------------------------------------

interface SurveyCanvasProps {
  surveyId: string
  readOnly: boolean
  selectedItem: SelectedItem
  onSelectItem: (item: SelectedItem) => void
  isPreviewMode: boolean
}

function SurveyCanvas({ surveyId, readOnly, selectedItem, onSelectItem, isPreviewMode }: SurveyCanvasProps) {
  const groups = useBuilderStore((s) => s.groups)
  const addGroup = useBuilderStore((s) => s.addGroup)
  const reorderGroups = useBuilderStore((s) => s.reorderGroups)
  const reorderQuestions = useBuilderStore((s) => s.reorderQuestions)
  const moveQuestion = useBuilderStore((s) => s.moveQuestion)
  const undo = useBuilderStore((s) => s.undo)
  const [isAddingGroup, setIsAddingGroup] = useState(false)

  // Track which question or group is actively being dragged (for DragOverlay)
  const [activeQuestion, setActiveQuestion] = useState<BuilderQuestion | null>(null)
  const [activeGroup, setActiveGroup] = useState<BuilderGroup | null>(null)

  // Stable ref to groups for use inside callbacks without stale closures
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

  const handleAddGroup = useCallback(async () => {
    if (readOnly || isAddingGroup) return
    setIsAddingGroup(true)
    try {
      const newGroup = await surveyService.createGroup(surveyId, {
        title: `Group ${groups.length + 1}`,
      })
      addGroup({
        ...newGroup,
        questions: [],
      })
    } finally {
      setIsAddingGroup(false)
    }
  }, [readOnly, isAddingGroup, surveyId, groups.length, addGroup])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event
    const activeId = active.id.toString()

    if (activeId.startsWith('group:')) {
      // Dragging a group — set activeGroup for DragOverlay
      const groupId = activeId.slice('group:'.length)
      const group = groupsRef.current.find((g) => g.id === groupId)
      setActiveGroup(group ?? null)
    } else {
      // Dragging a question — set activeQuestion for DragOverlay
      const question = groupsRef.current
        .flatMap((g) => g.questions)
        .find((q) => q.id === activeId)
      setActiveQuestion(question ?? null)
    }
  }, [])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      setActiveQuestion(null)
      setActiveGroup(null)

      if (!over) return
      if (active.id === over.id) return

      const activeId = active.id.toString()
      const overId = over.id.toString()
      const currentGroups = groupsRef.current

      // --- Group reorder ---
      if (activeId.startsWith('group:')) {
        const activeGroupId = activeId.slice('group:'.length)
        const overGroupId = overId.startsWith('group:') ? overId.slice('group:'.length) : null
        if (!overGroupId) return

        const sortedGroups = [...currentGroups].sort((a, b) => a.sort_order - b.sort_order)
        const oldIndex = sortedGroups.findIndex((g) => g.id === activeGroupId)
        const newIndex = sortedGroups.findIndex((g) => g.id === overGroupId)
        if (oldIndex === -1 || newIndex === -1) return

        const newOrder = arrayMove(
          sortedGroups.map((g) => g.id),
          oldIndex,
          newIndex,
        )

        // Optimistic update
        reorderGroups(newOrder)

        // Persist to API
        try {
          await surveyService.reorderGroups(surveyId, { group_ids: newOrder })
        } catch {
          // Revert to previous order on failure
          undo()
        }
        return
      }

      // --- Question reorder / move ---

      // Find the group that contains the dragged question
      const fromGroup = currentGroups.find((g) =>
        g.questions.some((q) => q.id === activeId),
      )
      if (!fromGroup) return

      // Determine if we dropped onto a question or a group
      const isOverQuestion = currentGroups.some((g) =>
        g.questions.some((q) => q.id === overId),
      )
      const isOverGroup = currentGroups.some((g) => `group:${g.id}` === overId || g.id === overId)

      // Find the target group
      const toGroup = isOverQuestion
        ? currentGroups.find((g) => g.questions.some((q) => q.id === overId))
        : isOverGroup
          ? currentGroups.find((g) => `group:${g.id}` === overId || g.id === overId)
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
          undo()
        }
      } else {
        // Move question to a different group
        const targetQuestionIndex = isOverQuestion
          ? toGroup.questions.findIndex((q) => q.id === overId)
          : -1

        // Optimistic update: move the question
        moveQuestion(fromGroup.id, toGroup.id, activeId)

        // Build new order for target group with the moved question inserted
        const targetGroupAfterMove = groupsRef.current.find((g) => g.id === toGroup.id)
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
          const finalTargetGroup = groupsRef.current.find((g) => g.id === toGroup.id)
          if (finalTargetGroup) {
            await surveyService.reorderQuestions(
              surveyId,
              toGroup.id,
              finalTargetGroup.questions.map((q) => q.id),
            )
          }
        } catch {
          undo()
        }
      }
    },
    [surveyId, reorderGroups, reorderQuestions, moveQuestion, undo],
  )

  const sortedGroups = [...groups].sort((a, b) => a.sort_order - b.sort_order)

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
                  disabled={readOnly || isAddingGroup}
                  onClick={handleAddGroup}
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
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sortedGroups.map((g) => `group:${g.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {sortedGroups.map((group) => (
              <SortableGroupPanel
                key={group.id}
                group={group}
                readOnly={readOnly}
                selectedItem={selectedItem}
                onSelectItem={onSelectItem}
                isPreviewMode={isPreviewMode}
              />
            ))}
          </SortableContext>

          {/* Floating drag overlay — shows preview card while dragging a question or group */}
          <DragOverlay>
            {activeGroup ? (
              <GroupDragPreview group={activeGroup} />
            ) : activeQuestion ? (
              isPreviewMode ? (
                <QuestionPreview question={activeQuestion} />
              ) : (
                <QuestionCard
                  question={activeQuestion}
                  selectedItem={null}
                  onSelectItem={() => {}}
                  readOnly={readOnly}
                  isOverlay
                />
              )
            ) : null}
          </DragOverlay>
        </DndContext>

        {groups.length > 0 && !readOnly && (
          <Button
            variant="outline"
            className="w-full"
            disabled={readOnly || isAddingGroup}
            onClick={handleAddGroup}
            data-testid="add-group-button"
          >
            <Plus size={14} />
            {isAddingGroup ? 'Adding…' : 'Add Group'}
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
  surveyId: string
  readOnly: boolean
  selectedItem: SelectedItem
}

function PropertyEditor({ readOnly, selectedItem, surveyId }: PropertyEditorProps) {
  const groups = useBuilderStore((s) => s.groups)

  const selectedGroup =
    selectedItem?.type === 'group' ? groups.find((g) => g.id === selectedItem.id) ?? null : null

  const isQuestionSelected = selectedItem?.type === 'question'

  return (
    <aside
      className="w-72 border-l border-border bg-muted/10 overflow-y-auto flex flex-col"
      data-testid="property-editor"
    >
      <div className="px-3 py-3 border-b border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Properties</p>
      </div>

      {!selectedGroup && !isQuestionSelected && (
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

      {isQuestionSelected && (
        <QuestionEditor surveyId={surveyId} readOnly={readOnly} />
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
  const [isPreviewMode, setIsPreviewMode] = useState(false)

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

        <Button
          variant={isPreviewMode ? 'default' : 'outline'}
          size="sm"
          className="h-8 gap-1"
          onClick={() => setIsPreviewMode((prev) => !prev)}
          aria-pressed={isPreviewMode}
          data-testid="preview-mode-toggle"
        >
          {isPreviewMode ? <EyeOff size={14} /> : <Eye size={14} />}
          {isPreviewMode ? 'Exit Preview' : 'Preview'}
        </Button>

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
          surveyId={surveyId ?? ''}
          readOnly={readOnly}
          selectedItem={selectedItem}
          onSelectItem={setSelectedItem}
          isPreviewMode={isPreviewMode}
        />
        <PropertyEditor surveyId={surveyId ?? ''} readOnly={readOnly} selectedItem={selectedItem} />
      </div>
    </div>
  )
}

export default SurveyBuilderPage
