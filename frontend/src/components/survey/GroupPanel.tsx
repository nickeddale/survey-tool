/**
 * GroupPanel — renders a question group as a droppable sortable container.
 *
 * Each group uses a SortableContext for its questions so they can be reordered
 * within the group. The group card itself is also a droppable zone to support
 * cross-group question movement (via useDroppable).
 */

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { QuestionCard } from './QuestionCard'
import type { BuilderGroup } from '../../store/builderStore'
import type { SelectedItem } from '../../store/builderStore'

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
                <QuestionCard
                  key={question.id}
                  question={question}
                  selectedItem={selectedItem}
                  onSelectItem={onSelectItem}
                  readOnly={readOnly}
                />
              ))}
            </div>
          )}
        </SortableContext>
      </CardContent>
    </Card>
  )
}

export default GroupPanel
