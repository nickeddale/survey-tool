/**
 * GroupPanel — collapsible question group panel for the survey canvas.
 *
 * Features:
 * - Collapsible panel (expand/collapse to show/hide questions)
 * - Drag handle for reordering (visual only; actual DnD wired externally)
 * - Inline title editing (click to edit, Enter/blur to save via PATCH)
 * - Question count badge
 * - Delete with confirmation dialog (warns about cascading question deletion)
 * - Empty group placeholder
 * - Read-only mode disables all editing
 */

import React, { useState, useRef, useCallback } from 'react'
import { GripVertical, ChevronDown, ChevronRight, Trash2, Pencil } from 'lucide-react'
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
import surveyService from '../../services/surveyService'
import { useBuilderStore } from '../../store/builderStore'
import type { BuilderGroup } from '../../store/builderStore'

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
}: GroupPanelProps) {
  const { updateGroup, removeGroup } = useBuilderStore()

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
    [saveTitle, group.title],
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
      <Collapsible
        open={isOpen}
        onOpenChange={setIsOpen}
        data-testid={`group-panel-${group.id}`}
      >
        {/* Panel header */}
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-t-lg border border-border bg-muted/40
            ${isSelected ? 'ring-2 ring-primary ring-offset-1' : ''}
            ${!isOpen ? 'rounded-b-lg' : ''}`}
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
            <div
              className="flex items-center gap-1 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
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
            className="border border-t-0 border-border rounded-b-lg bg-background px-3 py-2 space-y-1 min-h-[2rem]"
            data-testid={`group-content-${group.id}`}
          >
            {group.questions.length === 0 ? (
              <p
                className="text-xs text-muted-foreground italic py-2 text-center"
                data-testid={`group-empty-placeholder-${group.id}`}
              >
                Add questions here
              </p>
            ) : (
              group.questions
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((question) => (
                  <div
                    key={question.id}
                    className="flex items-start gap-2 p-2 rounded-md border border-border
                      hover:bg-muted/50 cursor-pointer transition-colors"
                    data-testid={`group-question-item-${question.id}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectQuestion?.(question.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') onSelectQuestion?.(question.id)
                    }}
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
                          <span className="text-xs text-destructive" aria-label="Required">*</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
            )}
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
              <Button
                variant="outline"
                disabled={isDeleting}
                data-testid="delete-group-cancel"
              >
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
