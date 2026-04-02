/**
 * AnswerOptionsEditor — editable sortable list of answer options for choice-type questions.
 *
 * Shown only for question types: radio, dropdown, checkbox, ranking, image_picker.
 * Each option row has: drag handle, inline-editable title, code display,
 * assessment value input, image URL field (image_picker only), delete button.
 * Add Option button creates a new option with auto-generated code (A1, A2, ...).
 * Drag-and-drop reordering via @dnd-kit/sortable.
 * All changes auto-saved via optimistic updates with undo on failure.
 */

import { useCallback, useRef, useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
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
import { GripVertical, Plus, Trash2, AlertCircle } from 'lucide-react'
import { Button } from '../ui/button'
import { useBuilderStore } from '../../store/builderStore'
import surveyService from '../../services/surveyService'
import type { AnswerOptionResponse } from '../../types/survey'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHOICE_TYPES = new Set(['radio', 'dropdown', 'checkbox', 'ranking', 'image_picker'])

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnswerOptionsEditorProps {
  surveyId: string
  groupId: string
  questionId: string
  questionType: string
  options: AnswerOptionResponse[]
  readOnly?: boolean
}

interface SortableOptionRowProps {
  option: AnswerOptionResponse
  questionType: string
  readOnly: boolean
  onTitleChange: (optionId: string, title: string) => void
  onAssessmentChange: (optionId: string, value: number) => void
  onImageUrlChange: (optionId: string, imageUrl: string) => void
  onDelete: (optionId: string) => void
}

// ---------------------------------------------------------------------------
// SortableOptionRow
// ---------------------------------------------------------------------------

function SortableOptionRow({
  option,
  questionType,
  readOnly,
  onTitleChange,
  onAssessmentChange,
  onImageUrlChange,
  onDelete,
}: SortableOptionRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: option.id,
    disabled: readOnly,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const isImagePicker = questionType === 'image_picker'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col gap-1 p-2 rounded-md border border-border bg-background"
      data-testid={`option-row-${option.id}`}
    >
      <div className="flex items-center gap-1.5">
        {/* Drag handle */}
        {!readOnly && (
          <button
            {...attributes}
            {...listeners}
            className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground
              p-0.5 rounded focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label={`Drag to reorder option ${option.code}`}
            data-testid={`option-drag-handle-${option.id}`}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={14} />
          </button>
        )}

        {/* Code badge */}
        <span
          className="shrink-0 text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded"
          data-testid={`option-code-${option.id}`}
        >
          {option.code}
        </span>

        {/* Title — inline editable */}
        <input
          type="text"
          className="flex-1 min-w-0 rounded border border-input bg-background px-2 py-0.5 text-sm
            focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
          defaultValue={option.title}
          disabled={readOnly}
          aria-label={`Option ${option.code} title`}
          data-testid={`option-title-${option.id}`}
          onBlur={(e) => {
            const val = e.target.value.trim()
            if (val !== option.title) {
              onTitleChange(option.id, val || option.title)
            }
          }}
        />

        {/* Assessment value */}
        <input
          type="number"
          className="w-16 shrink-0 rounded border border-input bg-background px-2 py-0.5 text-sm text-right
            focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
          defaultValue={option.assessment_value}
          disabled={readOnly}
          aria-label={`Option ${option.code} assessment value`}
          data-testid={`option-assessment-${option.id}`}
          onBlur={(e) => {
            const val = parseFloat(e.target.value)
            if (!isNaN(val) && val !== option.assessment_value) {
              onAssessmentChange(option.id, val)
            }
          }}
        />

        {/* Delete button */}
        {!readOnly && (
          <button
            className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-destructive
              focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
            aria-label={`Delete option ${option.code}`}
            data-testid={`option-delete-${option.id}`}
            onClick={() => onDelete(option.id)}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Image URL field for image_picker type */}
      {isImagePicker && (
        <div className="flex items-center gap-1.5 pl-6">
          <input
            type="url"
            className="flex-1 min-w-0 rounded border border-input bg-background px-2 py-0.5 text-xs
              focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed
              text-muted-foreground"
            placeholder="Image URL..."
            disabled={readOnly}
            aria-label={`Option ${option.code} image URL`}
            data-testid={`option-image-url-${option.id}`}
            onBlur={(e) => {
              const val = e.target.value.trim()
              onImageUrlChange(option.id, val)
            }}
          />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AnswerOptionsEditor
// ---------------------------------------------------------------------------

export function AnswerOptionsEditor({
  surveyId,
  groupId,
  questionId,
  questionType,
  options,
  readOnly = false,
}: AnswerOptionsEditorProps) {
  const addOption = useBuilderStore((s) => s.addOption)
  const removeOption = useBuilderStore((s) => s.removeOption)
  const updateOption = useBuilderStore((s) => s.updateOption)
  const reorderOptions = useBuilderStore((s) => s.reorderOptions)
  const undo = useBuilderStore((s) => s.undo)

  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Ref for current options (avoids stale closure in DnD handler)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Only show for choice-type questions
  if (!CHOICE_TYPES.has(questionType)) {
    return null
  }

  // ---------------------------------------------------------------------------
  // Auto-generate next option code (A1, A2, ...)
  // ---------------------------------------------------------------------------

  function nextOptionCode(): string {
    const existing = new Set(options.map((o) => o.code))
    let n = options.length + 1
    let code = `A${n}`
    while (existing.has(code)) {
      n++
      code = `A${n}`
    }
    return code
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleAddOption = useCallback(async () => {
    const code = nextOptionCode()
    const sortOrder = options.length + 1
    const optimisticOption: AnswerOptionResponse = {
      id: `optimistic-${Date.now()}`,
      question_id: questionId,
      code,
      title: `Option ${code}`,
      sort_order: sortOrder,
      assessment_value: 0,
      created_at: new Date().toISOString(),
    }

    addOption(groupId, questionId, optimisticOption)

    try {
      const created = await surveyService.createOption(surveyId, questionId, {
        code,
        title: optimisticOption.title,
        sort_order: sortOrder,
        assessment_value: 0,
      })
      // Replace optimistic option with real one
      removeOption(groupId, questionId, optimisticOption.id)
      addOption(groupId, questionId, created)
    } catch {
      undo()
    }
  }, [surveyId, groupId, questionId, options, addOption, removeOption, undo])

  const handleTitleChange = useCallback(
    async (optionId: string, title: string) => {
      updateOption(groupId, questionId, optionId, { title })
      try {
        await surveyService.updateOption(surveyId, questionId, optionId, { title })
      } catch {
        undo()
      }
    },
    [surveyId, groupId, questionId, updateOption, undo],
  )

  const handleAssessmentChange = useCallback(
    async (optionId: string, assessment_value: number) => {
      updateOption(groupId, questionId, optionId, { assessment_value })
      try {
        await surveyService.updateOption(surveyId, questionId, optionId, { assessment_value })
      } catch {
        undo()
      }
    },
    [surveyId, groupId, questionId, updateOption, undo],
  )

  const handleImageUrlChange = useCallback(
    async (optionId: string, image_url: string) => {
      updateOption(groupId, questionId, optionId, {})
      try {
        await surveyService.updateOption(surveyId, questionId, optionId, {
          image_url: image_url || null,
        })
      } catch {
        undo()
      }
    },
    [surveyId, groupId, questionId, updateOption, undo],
  )

  const handleDeleteRequest = useCallback((optionId: string) => {
    setDeleteError(null)
    setConfirmDeleteId(optionId)
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    const optionId = confirmDeleteId
    if (!optionId) return
    setConfirmDeleteId(null)

    removeOption(groupId, questionId, optionId)
    try {
      await surveyService.deleteOption(surveyId, questionId, optionId)
    } catch (err: unknown) {
      undo()
      // Show error if responses exist (409 Conflict)
      const status = (err as { status?: number })?.status
      if (status === 409) {
        setDeleteError('Cannot delete: responses already exist for this option.')
      } else {
        setDeleteError('Failed to delete option. Please try again.')
      }
    }
  }, [confirmDeleteId, surveyId, groupId, questionId, removeOption, undo])

  const handleDeleteCancel = useCallback(() => {
    setConfirmDeleteId(null)
  }, [])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const currentOptions = optionsRef.current
      const oldIndex = currentOptions.findIndex((o) => o.id === active.id)
      const newIndex = currentOptions.findIndex((o) => o.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const newOrder = arrayMove(
        currentOptions.map((o) => o.id),
        oldIndex,
        newIndex,
      )

      reorderOptions(groupId, questionId, newOrder)
      try {
        await surveyService.reorderOptions(surveyId, questionId, newOrder)
      } catch {
        undo()
      }
    },
    [surveyId, groupId, questionId, reorderOptions, undo],
  )

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const optionIds = options.map((o) => o.id)
  const confirmOption = confirmDeleteId ? options.find((o) => o.id === confirmDeleteId) : null

  return (
    <div className="space-y-2" data-testid="answer-options-editor">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          Answer Options ({options.length})
        </p>
        {!readOnly && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={handleAddOption}
            data-testid="add-option-button"
          >
            <Plus size={12} />
            Add Option
          </Button>
        )}
      </div>

      {deleteError && (
        <div
          className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/10 px-2 py-1.5 rounded"
          role="alert"
          data-testid="option-delete-error"
        >
          <AlertCircle size={12} />
          {deleteError}
        </div>
      )}

      {/* Confirm delete dialog */}
      {confirmOption && (
        <div
          className="flex items-center justify-between gap-2 p-2 rounded-md border border-destructive/30 bg-destructive/5 text-xs"
          data-testid="option-delete-confirm"
          role="dialog"
          aria-label={`Confirm delete option ${confirmOption.code}`}
        >
          <span className="text-muted-foreground">
            Delete <span className="font-semibold text-foreground">{confirmOption.code}</span>?
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-5 px-2 text-xs"
              onClick={handleDeleteCancel}
              data-testid="option-delete-cancel"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-5 px-2 text-xs"
              onClick={handleDeleteConfirm}
              data-testid="option-delete-confirm-button"
            >
              Delete
            </Button>
          </div>
        </div>
      )}

      {options.length === 0 && !readOnly && (
        <p className="text-xs text-muted-foreground italic" data-testid="options-empty-state">
          No options yet. Click &quot;Add Option&quot; to get started.
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={optionIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {options.map((option) => (
              <SortableOptionRow
                key={option.id}
                option={option}
                questionType={questionType}
                readOnly={readOnly}
                onTitleChange={handleTitleChange}
                onAssessmentChange={handleAssessmentChange}
                onImageUrlChange={handleImageUrlChange}
                onDelete={handleDeleteRequest}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

export default AnswerOptionsEditor
