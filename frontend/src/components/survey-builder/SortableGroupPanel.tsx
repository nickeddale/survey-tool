/**
 * SortableGroupPanel — @dnd-kit sortable wrapper around the survey GroupPanel.
 *
 * Must be rendered as a descendant of a SortableContext (provided by
 * SurveyCanvas). Passes drag handle listeners and attributes down to
 * BuilderGroupPanel so the group card has a drag handle.
 */

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GroupPanel as BuilderGroupPanel } from '../survey/GroupPanel'
import type { BuilderGroup, SelectedItem } from '../../store/builderStore'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SortableGroupPanelProps {
  group: BuilderGroup
  readOnly: boolean
  selectedItem: SelectedItem
  onSelectItem: (item: SelectedItem) => void
  isPreviewMode: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SortableGroupPanel({
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
