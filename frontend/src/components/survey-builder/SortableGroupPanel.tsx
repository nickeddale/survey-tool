/**
 * SortableGroupPanel — @dnd-kit sortable wrapper around the survey-builder GroupPanel.
 *
 * Must be rendered as a descendant of a SortableContext (provided by
 * SurveyCanvas). Passes drag handle listeners and attributes down to
 * GroupPanel so the group card has a drag handle.
 */

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GroupPanel } from './GroupPanel'
import type { BuilderGroup, SelectedItem } from '../../store/builderStore'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SortableGroupPanelProps {
  surveyId: string
  group: BuilderGroup
  readOnly: boolean
  selectedItem: SelectedItem
  onSelectItem: (item: SelectedItem) => void
  isPreviewMode: boolean
  /** Called when user clicks '+' in the group header to add a question */
  onAddQuestion?: (groupId: string, questionType: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SortableGroupPanel({
  surveyId,
  group,
  readOnly,
  selectedItem,
  onSelectItem,
  isPreviewMode,
  onAddQuestion,
}: SortableGroupPanelProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({ id: `group:${group.id}` })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const isGroupSelected = selectedItem?.type === 'group' && selectedItem.id === group.id

  function handleSelect(groupId: string) {
    onSelectItem(isGroupSelected ? null : { type: 'group', id: groupId })
  }

  return (
    <div ref={setNodeRef} style={style}>
      <GroupPanel
        surveyId={surveyId}
        group={group}
        readOnly={readOnly}
        onSelect={handleSelect}
        isSelected={isGroupSelected}
        dragListeners={listeners}
        dragAttributes={attributes}
        isDragging={isDragging}
        isOver={isOver}
        isPreviewMode={isPreviewMode}
        onAddQuestion={onAddQuestion}
        selectedItem={selectedItem}
        onSelectItem={onSelectItem}
      />
    </div>
  )
}
