/**
 * GroupDragPreview — miniature group card shown in the DragOverlay while a
 * group is being dragged.
 *
 * Renders the group title and a truncated list of up to 3 questions with a
 * "+N more…" indicator when there are more than 3.
 */

import type { BuilderGroup } from '../../store/builderStore'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface GroupDragPreviewProps {
  group: BuilderGroup
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GroupDragPreview({ group }: GroupDragPreviewProps) {
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
