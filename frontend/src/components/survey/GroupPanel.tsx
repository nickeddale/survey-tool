/**
 * GroupPanel — renders a question group as a droppable sortable container.
 *
 * Each group uses a SortableContext for its questions so they can be reordered
 * within the group. The group card itself is also a droppable zone to support
 * cross-group question movement (via useDroppable).
 *
 * Supports group-level drag-and-drop reordering via dragListeners/dragAttributes
 * passed from the parent SortableGroupPanel wrapper.
 */

import type { DraggableSyntheticListeners } from '@dnd-kit/core'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { GripVertical, Plus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { QuestionCard } from './QuestionCard'
import { QuestionPreview } from '../survey-builder/QuestionPreview'
import type { BuilderGroup } from '../../store/builderStore'
import type { SelectedItem } from '../../store/builderStore'

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
// Types
// ---------------------------------------------------------------------------

export interface GroupPanelProps {
  group: BuilderGroup
  selectedItem: SelectedItem
  onSelectItem: (item: SelectedItem) => void
  readOnly: boolean
  /** True while a question is being dragged over this group */
  isOver?: boolean
  /** @dnd-kit drag handle listeners for group-level reordering */
  dragListeners?: DraggableSyntheticListeners
  /** @dnd-kit drag handle attributes for group-level reordering */
  dragAttributes?: React.HTMLAttributes<HTMLElement>
  /** When true, renders QuestionPreview instead of QuestionCard for each question */
  isPreviewMode?: boolean
  /** Called when the user clicks the '+' button to add a question to this group */
  onAddQuestion?: (groupId: string, questionType: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GroupPanel({
  group,
  selectedItem,
  onSelectItem,
  readOnly,
  isOver = false,
  dragListeners,
  dragAttributes,
  isPreviewMode = false,
  onAddQuestion,
}: GroupPanelProps) {
  const isGroupSelected = selectedItem?.type === 'group' && selectedItem.id === group.id

  // Make the group card a droppable container so questions can be dropped into it
  const { setNodeRef } = useDroppable({ id: group.id })

  const questionIds = group.questions.map((q) => q.id)

  return (
    <Card
      ref={setNodeRef}
      className={`transition-shadow transition-colors
        ${isGroupSelected ? 'ring-2 ring-primary' : ''}
        ${isOver && !readOnly ? 'ring-2 ring-primary/40 bg-primary/5' : ''}`}
      data-testid={`canvas-group-${group.id}`}
    >
      <CardHeader
        className="pb-2 select-none"
        data-testid={`group-panel-header-${group.id}`}
        onClick={() =>
          onSelectItem(isGroupSelected ? null : { type: 'group', id: group.id })
        }
      >
        <div className="flex items-center gap-2">
          {/* Group drag handle */}
          {!readOnly && (
            <button
              {...(dragListeners ?? {})}
              {...(dragAttributes ?? {})}
              className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground
                p-0.5 rounded focus:outline-none focus:ring-1 focus:ring-ring"
              aria-label="Drag to reorder group"
              data-testid={`group-drag-handle-${group.id}`}
              onClick={(e) => e.stopPropagation()}
              tabIndex={-1}
            >
              <GripVertical size={16} />
            </button>
          )}
          <div className="flex items-center justify-between flex-1 cursor-pointer">
            <CardTitle className="text-base">{group.title}</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {group.questions.length} question{group.questions.length !== 1 ? 's' : ''}
              </span>
              {!readOnly && (
                onAddQuestion ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs"
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
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    data-testid={`add-question-button-${group.id}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Plus size={12} />
                    Question
                  </Button>
                )
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <SortableContext items={questionIds} strategy={verticalListSortingStrategy}>
          {group.questions.length === 0 ? (
            <div
              className={`py-3 text-center rounded-md border-2 border-dashed transition-colors
                ${isOver && !readOnly
                  ? 'border-primary/60 bg-primary/5 text-primary text-xs'
                  : 'border-border text-muted-foreground'
                }`}
              data-testid={`empty-group-dropzone-${group.id}`}
            >
              <p className="text-xs italic">
                {isOver && !readOnly ? 'Drop question here' : 'No questions in this group.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {group.questions.map((question) => (
                isPreviewMode ? (
                  <QuestionPreview
                    key={question.id}
                    question={question}
                  />
                ) : (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    selectedItem={selectedItem}
                    onSelectItem={onSelectItem}
                    readOnly={readOnly}
                  />
                )
              ))}
            </div>
          )}
        </SortableContext>
      </CardContent>
    </Card>
  )
}

export default GroupPanel
