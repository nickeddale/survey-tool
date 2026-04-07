/**
 * SurveyCanvas — center panel of the survey builder.
 *
 * Contains all drag-and-drop context providers (@dnd-kit DndContext +
 * SortableContext) and handles:
 *   - Group reorder (drag group handle to new position)
 *   - Question reorder within a group
 *   - Cross-group question movement
 *   - Add Group button (empty state and bottom of list)
 *
 * DnD state (activeGroup, activeQuestion) is local so the DragOverlay renders
 * correctly. All persistence calls go through surveyService and fall back via
 * the builderStore undo action on failure.
 */

import { useCallback, useRef, useState } from 'react'
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
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import surveyService from '../../services/surveyService'
import { useBuilderStore } from '../../store/builderStore'
import type { BuilderGroup, BuilderQuestion, SelectedItem } from '../../store/builderStore'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'
import { QuestionCard } from '../survey/QuestionCard'
import { QuestionPreview } from './QuestionPreview'
import { GroupDragPreview } from './GroupDragPreview'
import { SortableGroupPanel } from './SortableGroupPanel'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SurveyCanvasProps {
  surveyId: string
  readOnly: boolean
  selectedItem: SelectedItem
  onSelectItem: (item: SelectedItem) => void
  isPreviewMode: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const QUESTION_TYPE_LABELS: Record<string, string> = {
  text: 'Short Text',
  textarea: 'Long Text',
  radio: 'Single Choice',
  checkbox: 'Multiple Choice',
  select: 'Dropdown',
  number: 'Number',
}

export function SurveyCanvas({ surveyId, readOnly, selectedItem, onSelectItem, isPreviewMode }: SurveyCanvasProps) {
  const groups = useBuilderStore((s) => s.groups)
  const addGroup = useBuilderStore((s) => s.addGroup)
  const addQuestion = useBuilderStore((s) => s.addQuestion)
  const reorderGroups = useBuilderStore((s) => s.reorderGroups)
  const reorderQuestions = useBuilderStore((s) => s.reorderQuestions)
  const moveQuestion = useBuilderStore((s) => s.moveQuestion)
  const undo = useBuilderStore((s) => s.undo)
  const setSaveStatus = useBuilderStore((s) => s.setSaveStatus)
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

  const handleAddQuestion = useCallback(async (groupId: string, questionType: string) => {
    if (readOnly) return
    const label = QUESTION_TYPE_LABELS[questionType] ?? 'New Question'
    try {
      const newQuestion = await surveyService.createQuestion(surveyId, groupId, {
        question_type: questionType,
        title: `New ${label}`,
      })
      addQuestion(groupId, {
        ...newQuestion,
        answer_options: newQuestion.answer_options ?? [],
        subquestions: [],
      })
    } catch {
      setSaveStatus('error', 'Failed to add question. Please try again.')
    }
  }, [readOnly, surveyId, addQuestion, setSaveStatus])

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
        setSaveStatus('saving')
        try {
          await surveyService.reorderGroups(surveyId, { group_ids: newOrder })
          setSaveStatus('saved')
        } catch {
          // Revert to previous order on failure
          undo()
          setSaveStatus('error', 'Failed to save group order. Please try again.')
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

        setSaveStatus('saving')
        try {
          await surveyService.reorderQuestions(surveyId, fromGroup.id, newOrder)
          setSaveStatus('saved')
        } catch {
          undo()
          setSaveStatus('error', 'Failed to save question order. Please try again.')
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

        setSaveStatus('saving')
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
          setSaveStatus('saved')
        } catch {
          undo()
          setSaveStatus('error', 'Failed to move question. Please try again.')
        }
      }
    },
    [surveyId, reorderGroups, reorderQuestions, moveQuestion, undo, setSaveStatus],
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
                onAddQuestion={handleAddQuestion}
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
