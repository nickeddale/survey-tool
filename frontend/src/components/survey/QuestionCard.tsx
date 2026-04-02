/**
 * QuestionCard — sortable card for a single question in the survey builder.
 *
 * Uses @dnd-kit/sortable to make each question draggable within and between groups.
 * The card shows question metadata and a drag handle.
 */

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import type { BuilderQuestion } from '../../store/builderStore'
import type { SelectedItem } from '../../store/builderStore'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuestionCardProps {
  question: BuilderQuestion
  selectedItem: SelectedItem
  onSelectItem: (item: SelectedItem) => void
  readOnly: boolean
  /** When true, renders a static (non-interactive) overlay preview. */
  isOverlay?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuestionCard({
  question,
  selectedItem,
  onSelectItem,
  readOnly,
  isOverlay = false,
}: QuestionCardProps) {
  const isSelected = selectedItem?.type === 'question' && selectedItem.id === question.id

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: question.id,
    disabled: readOnly || isOverlay,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  function handleClick() {
    if (isOverlay) return
    onSelectItem(isSelected ? null : { type: 'question', id: question.id })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (isOverlay) return
    if (e.key === 'Enter' || e.key === ' ') {
      onSelectItem(isSelected ? null : { type: 'question', id: question.id })
    }
  }

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={isOverlay ? undefined : style}
      className={`flex items-start gap-2 p-2 rounded-md border border-border cursor-pointer
        transition-colors hover:bg-muted/50
        ${isSelected ? 'bg-primary/5 border-primary/50 ring-1 ring-primary/30' : ''}
        ${isOverlay ? 'shadow-lg bg-background ring-1 ring-primary/50' : ''}
        ${isDragging ? 'ring-1 ring-primary/30' : ''}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      data-testid={`canvas-question-${question.id}`}
    >
      {/* Drag handle */}
      {!readOnly && (
        <button
          {...(isOverlay ? {} : { ...attributes, ...listeners })}
          className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground
            p-0.5 rounded focus:outline-none focus:ring-1 focus:ring-ring"
          aria-label="Drag to reorder question"
          data-testid={`drag-handle-${question.id}`}
          onClick={(e) => e.stopPropagation()}
          tabIndex={-1}
        >
          <GripVertical size={14} />
        </button>
      )}

      {/* Question content */}
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
}

export default QuestionCard
