/**
 * PropertyEditor — right panel for editing properties of the selected item.
 *
 * When a group is selected, shows group title and description fields.
 * When a question is selected, renders the QuestionEditor component.
 * When nothing is selected, shows a placeholder message.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { useBuilderStore } from '../../store/builderStore'
import type { SelectedItem } from '../../store/builderStore'
import { QuestionEditor } from './QuestionEditor'
import surveyService from '../../services/surveyService'

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
  const updateGroup = useBuilderStore((s) => s.updateGroup)
  const setSaveStatus = useBuilderStore((s) => s.setSaveStatus)

  const selectedGroup =
    selectedItem?.type === 'group' ? (groups.find((g) => g.id === selectedItem.id) ?? null) : null

  const isQuestionSelected = selectedItem?.type === 'question'

  // Controlled state for group fields
  const [groupTitle, setGroupTitle] = useState(selectedGroup?.title ?? '')
  const [groupDescription, setGroupDescription] = useState(selectedGroup?.description ?? '')

  // Track selected group ID to reset form state when selection changes
  const currentGroupIdRef = useRef<string | null>(null)

  // Debounce timer ref
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  // Sync local state when selected group changes
  useEffect(() => {
    if (!selectedGroup) {
      currentGroupIdRef.current = null
      return
    }
    if (selectedGroup.id !== currentGroupIdRef.current) {
      currentGroupIdRef.current = selectedGroup.id
      setGroupTitle(selectedGroup.title)
      setGroupDescription(selectedGroup.description ?? '')
      // Cancel any pending debounce from previous group
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [selectedGroup])

  // Debounced PATCH helper for group fields
  const schedulePatch = useCallback(
    (groupId: string, updates: Record<string, unknown>) => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current)
      }
      setSaveStatus('saving')
      debounceTimerRef.current = setTimeout(async () => {
        debounceTimerRef.current = null
        try {
          await surveyService.updateGroup(surveyId, groupId, updates)
          setSaveStatus('saved')
        } catch {
          setSaveStatus('error', 'Failed to save changes. Please try again.')
        }
      }, 500)
    },
    [surveyId, setSaveStatus]
  )

  function handleGroupTitleChange(value: string) {
    if (!selectedGroup) return
    setGroupTitle(value)
    updateGroup(selectedGroup.id, { title: value })
    schedulePatch(selectedGroup.id, { title: value })
  }

  function handleGroupDescriptionChange(value: string) {
    if (!selectedGroup) return
    setGroupDescription(value)
    updateGroup(selectedGroup.id, { description: value })
    schedulePatch(selectedGroup.id, { description: value })
  }

  return (
    <aside
      className="w-72 border-l border-border bg-muted/10 overflow-y-auto flex flex-col"
      data-testid="property-editor"
    >
      <div className="px-3 py-3 border-b border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Properties
        </p>
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
              value={groupTitle}
              onChange={(e) => handleGroupTitleChange(e.target.value)}
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
                value={groupDescription}
                onChange={(e) => handleGroupDescriptionChange(e.target.value)}
                disabled={readOnly}
                aria-label="Group description"
                data-testid="property-group-description"
              />
            </div>
          )}
        </div>
      )}

      {isQuestionSelected && <QuestionEditor surveyId={surveyId} readOnly={readOnly} />}
    </aside>
  )
}
