/**
 * GroupPanel — collapsible question group panel for the survey canvas.
 *
 * Features:
 * - Collapsible panel (expand/collapse to show/hide questions)
 * - Drag handle for reordering (visual only; actual DnD wired externally)
 * - Inline title editing (click to edit, Enter/blur to save via PATCH)
 * - Question count badge
 * - Delete with confirmation dialog (warns about cascading question deletion)
 * - Empty group placeholder (droppable zone via useDroppable)
 * - Sortable questions list via SortableContext + QuestionCard
 * - Add Question dropdown (question type selection)
 * - Read-only mode disables all editing
 */

import React, { useState, useRef, useCallback } from 'react'
import type { DraggableSyntheticListeners } from '@dnd-kit/core'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { GripVertical, ChevronDown, ChevronRight, Trash2, Pencil, Plus } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '../ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { QuestionCard } from '../survey/QuestionCard'
import { QuestionPreview } from './QuestionPreview'
import surveyService from '../../services/surveyService'
import { useBuilderStore } from '../../store/builderStore'
import type { BuilderGroup, SelectedItem } from '../../store/builderStore'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUESTION_TYPES = [
  { type: 'short_text', label: 'Short Text' },
  { type: 'long_text', label: 'Long Text' },
  { type: 'single_choice', label: 'Single Choice' },
  { type: 'multiple_choice', label: 'Multiple Choice' },
  { type: 'dropdown', label: 'Dropdown' },
  { type: 'numeric', label: 'Number' },
]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface GroupPanelProps {
  surveyId: string
  group: BuilderGroup
  readOnly?: boolean
  /** Called when the group header is clicked to select (for property editor) */
  onSelect?: (groupId: string) => void
  isSelected?: boolean
  /** Called when a question item is clicked */
  onSelectQuestion?: (questionId: string) => void
  /** @dnd-kit sortable drag handle listeners — passed from SurveyCanvas */
  dragListeners?: DraggableSyntheticListeners
  /** @dnd-kit sortable drag handle attributes — passed from SurveyCanvas */
  dragAttributes?: React.HTMLAttributes<HTMLElement>
  /** Whether this group is currently being dragged */
  isDragging?: boolean
  /** True while a question is being dragged over this group */
  isOver?: boolean
  /** When true, renders QuestionPreview instead of QuestionCard for each question */
  isPreviewMode?: boolean
  /** Called when the user selects a question type from the Add Question dropdown */
  onAddQuestion?: (groupId: string, questionType: string) => void
  /** selectedItem — passed through to QuestionCard for selection highlight */
  selectedItem?: SelectedItem
  /** onSelectItem — passed through to QuestionCard */
  onSelectItem?: (item: SelectedItem) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GroupPanel({
  surveyId,
  group,
  readOnly = false,
  onSelect,
  isSelected = false,
  onSelectQuestion,
  dragListeners,
  dragAttributes,
  isDragging = false,
  isOver = false,
  isPreviewMode = false,
  onAddQuestion,
  selectedItem,
  onSelectItem,
}: GroupPanelProps) {
  const { updateGroup, removeGroup } = useBuilderStore()

  // Make the group card a droppable container so questions can be dropped into it
  const { setNodeRef: setDroppableRef } = useDroppable({ id: group.id })

  const questionIds = group.questions.map((q) => q.id)

  // ---- Collapsible state ---------------------------------------------------
  const [isOpen, setIsOpen] = useState(true)

  // ---- Inline title editing ------------------------------------------------
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState(group.title)
  const [isSavingTitle, setIsSavingTitle] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)

  const startEditTitle = useCallback(() => {
    if (readOnly) return
    setEditTitle(group.title)
    setIsEditingTitle(true)
    // Focus input on next tick after it renders
    setTimeout(() => titleInputRef.current?.focus(), 0)
  }, [readOnly, group.title])

  const saveTitle = useCallback(async () => {
    const trimmed = editTitle.trim()
    if (!trimmed || trimmed === group.title) {
      setIsEditingTitle(false)
      setEditTitle(group.title)
      return
    }
    setIsSavingTitle(true)
    try {
      await surveyService.updateGroup(surveyId, group.id, { title: trimmed })
      updateGroup(group.id, { title: trimmed })
    } finally {
      setIsSavingTitle(false)
      setIsEditingTitle(false)
    }
  }, [editTitle, group.title, group.id, surveyId, updateGroup])

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        saveTitle()
      } else if (e.key === 'Escape') {
        setIsEditingTitle(false)
        setEditTitle(group.title)
      }
    },
    [saveTitle, group.title]
  )

  // ---- Delete confirmation -------------------------------------------------
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDeleteConfirm = useCallback(async () => {
    setIsDeleting(true)
    try {
      await surveyService.deleteGroup(surveyId, group.id)
      removeGroup(group.id)
    } finally {
      setIsDeleting(false)
      setShowDeleteDialog(false)
    }
  }, [surveyId, group.id, removeGroup])

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen} data-testid={`group-panel-${group.id}`}>
        {/* Panel header */}
        <div
          ref={setDroppableRef}
          className={`flex items-center gap-2 px-3 py-2 rounded-t-lg border border-border bg-muted/40
            ${isSelected ? 'ring-2 ring-primary ring-offset-1' : ''}
            ${!isOpen ? 'rounded-b-lg' : ''}
            ${isDragging ? 'opacity-50' : ''}
            ${isOver && !readOnly ? 'ring-2 ring-primary/40 bg-primary/5' : ''}`}
          onClick={() => onSelect?.(group.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onSelect?.(group.id)
          }}
          aria-label={`Group: ${group.title}`}
          data-testid={`group-panel-header-${group.id}`}
        >
          {/* Drag handle */}
          {!readOnly && (
            <span
              className="text-muted-foreground cursor-grab shrink-0"
              aria-hidden="true"
              data-testid={`group-drag-handle-${group.id}`}
              {...(dragListeners ?? {})}
              {...(dragAttributes ?? {})}
            >
              <GripVertical size={16} />
            </span>
          )}

          {/* Collapse toggle */}
          <CollapsibleTrigger asChild>
            <button
              className="text-muted-foreground hover:text-foreground shrink-0"
              aria-label={isOpen ? 'Collapse group' : 'Expand group'}
              data-testid={`group-collapse-toggle-${group.id}`}
              onClick={(e) => e.stopPropagation()}
            >
              {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          </CollapsibleTrigger>

          {/* Title — inline edit or static */}
          <div className="flex-1 min-w-0">
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={handleTitleKeyDown}
                disabled={isSavingTitle}
                className="w-full text-sm font-medium bg-background border border-input rounded px-1.5 py-0.5
                  focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                aria-label="Edit group title"
                data-testid={`group-title-input-${group.id}`}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                className={`text-sm font-medium truncate block ${!readOnly ? 'cursor-text hover:text-primary' : ''}`}
                data-testid={`group-title-${group.id}`}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  startEditTitle()
                }}
              >
                {group.title}
              </span>
            )}
          </div>

          {/* Question count badge */}
          <Badge
            variant="secondary"
            className="shrink-0 text-xs"
            data-testid={`group-question-count-${group.id}`}
          >
            {group.questions.length} {group.questions.length === 1 ? 'question' : 'questions'}
          </Badge>

          {/* Action buttons */}
          {!readOnly && (
            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              {/* Add Question dropdown */}
              {onAddQuestion && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      data-testid={`add-question-button-${group.id}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Plus size={12} />
                      Question
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuLabel>Question Type</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {QUESTION_TYPES.map(({ type, label }) => (
                      <DropdownMenuItem
                        key={type}
                        onClick={(e) => {
                          e.stopPropagation()
                          onAddQuestion(group.id, type)
                        }}
                        data-testid={`group-add-question-type-${group.id}-${type}`}
                      >
                        {label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                aria-label="Rename group"
                data-testid={`group-rename-button-${group.id}`}
                onClick={(e) => {
                  e.stopPropagation()
                  startEditTitle()
                }}
              >
                <Pencil size={13} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                aria-label="Delete group"
                data-testid={`group-delete-button-${group.id}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setShowDeleteDialog(true)
                }}
              >
                <Trash2 size={13} />
              </Button>
            </div>
          )}
        </div>

        {/* Collapsible content — questions list */}
        <CollapsibleContent>
          <div
            className={`border border-t-0 border-border rounded-b-lg bg-background px-3 py-2 space-y-1 min-h-[2rem]
              ${isOver && !readOnly ? 'ring-2 ring-primary/40 bg-primary/5' : ''}`}
            data-testid={`group-content-${group.id}`}
          >
            <SortableContext items={questionIds} strategy={verticalListSortingStrategy}>
              {group.questions.length === 0 ? (
                <p
                  className={`text-xs italic py-2 text-center ${
                    isOver && !readOnly ? 'text-primary' : 'text-muted-foreground'
                  }`}
                  data-testid={`group-empty-placeholder-${group.id}`}
                >
                  {isOver && !readOnly ? 'Drop question here' : 'Add questions here'}
                </p>
              ) : (
                group.questions
                  .slice()
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((question) =>
                    isPreviewMode ? (
                      <QuestionPreview key={question.id} question={question} />
                    ) : (
                      <div
                        key={question.id}
                        data-testid={`group-question-item-${question.id}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelectQuestion?.(question.id)
                        }}
                      >
                        {selectedItem !== undefined && onSelectItem ? (
                          <QuestionCard
                            question={question}
                            selectedItem={selectedItem}
                            onSelectItem={onSelectItem}
                            readOnly={readOnly}
                          />
                        ) : (
                          <div
                            className="flex items-start gap-2 p-2 rounded-md border border-border
                              hover:bg-muted/50 cursor-pointer transition-colors"
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation()
                                onSelectQuestion?.(question.id)
                              }
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-mono text-muted-foreground bg-muted px-1 py-0.5 rounded">
                                  {question.code}
                                </span>
                                <span className="text-sm font-medium truncate">
                                  {question.title}
                                </span>
                                <span className="text-xs text-muted-foreground bg-muted/60 px-1 py-0.5 rounded">
                                  {question.question_type}
                                </span>
                                {question.is_required && (
                                  <span className="text-xs text-destructive" aria-label="Required">
                                    *
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  )
              )}
            </SortableContext>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent data-testid="delete-group-dialog">
          <DialogHeader>
            <DialogTitle>Delete Group</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the group &quot;{group.title}&quot;? This will also
              permanently delete all questions in this group. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isDeleting} data-testid="delete-group-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={handleDeleteConfirm}
              data-testid="delete-group-confirm"
            >
              {isDeleting ? 'Deleting…' : 'Delete Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default GroupPanel
