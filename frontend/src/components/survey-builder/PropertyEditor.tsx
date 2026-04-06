/**
 * PropertyEditor — right panel for editing properties of the selected item.
 *
 * When a group is selected, shows group title and description fields.
 * When a question is selected, renders the QuestionEditor component.
 * When nothing is selected, shows a placeholder message.
 */

import { useBuilderStore } from '../../store/builderStore'
import type { SelectedItem } from '../../store/builderStore'
import { QuestionEditor } from './QuestionEditor'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PropertyEditorProps {
  surveyId: string
  readOnly: boolean
  selectedItem: SelectedItem
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PropertyEditor({ readOnly, selectedItem, surveyId }: PropertyEditorProps) {
  const groups = useBuilderStore((s) => s.groups)

  const selectedGroup =
    selectedItem?.type === 'group' ? groups.find((g) => g.id === selectedItem.id) ?? null : null

  const isQuestionSelected = selectedItem?.type === 'question'

  return (
    <aside
      className="w-72 border-l border-border bg-muted/10 overflow-y-auto flex flex-col"
      data-testid="property-editor"
    >
      <div className="px-3 py-3 border-b border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Properties</p>
      </div>

      {!selectedGroup && !isQuestionSelected && (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-muted-foreground text-center">
            Select a group or question to edit its properties.
          </p>
        </div>
      )}

      {selectedGroup && (
        <div className="p-3 space-y-3" data-testid="group-properties">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Group Title</p>
            <input
              type="text"
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm
                focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
              defaultValue={selectedGroup.title}
              disabled={readOnly}
              aria-label="Group title"
              data-testid="property-group-title"
            />
          </div>
          {selectedGroup.description !== undefined && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
              <textarea
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm
                  focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed
                  resize-none"
                rows={3}
                defaultValue={selectedGroup.description ?? ''}
                disabled={readOnly}
                aria-label="Group description"
                data-testid="property-group-description"
              />
            </div>
          )}
        </div>
      )}

      {isQuestionSelected && (
        <QuestionEditor surveyId={surveyId} readOnly={readOnly} />
      )}
    </aside>
  )
}
