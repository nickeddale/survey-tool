import type { ConditionGroupEditorProps, ConditionRow, ConditionGroup } from './types'
import { makeEmptyCondition, makeEmptyGroup } from './expressionUtils'
import { ConditionRowEditor } from './ConditionRowEditor'

export function ConditionGroupEditor({
  group,
  previousQuestions,
  onChange,
  onRemove,
  disabled,
  depth,
}: ConditionGroupEditorProps) {
  function updateItem(index: number, updated: ConditionRow | ConditionGroup) {
    const newItems = [...group.items]
    newItems[index] = updated
    onChange({ ...group, items: newItems })
  }

  function removeItem(index: number) {
    const newItems = group.items.filter((_, i) => i !== index)
    onChange({ ...group, items: newItems })
  }

  function addCondition() {
    onChange({ ...group, items: [...group.items, makeEmptyCondition()] })
  }

  function addGroup() {
    onChange({ ...group, items: [...group.items, makeEmptyGroup()] })
  }

  function toggleLogic() {
    onChange({ ...group, logic: group.logic === 'and' ? 'or' : 'and' })
  }

  return (
    <div
      className={`space-y-2 ${depth > 0 ? 'border-l-2 border-muted pl-3 ml-1' : ''}`}
      data-testid={`condition-group-${group.id}`}
    >
      {/* Group header with AND/OR toggle */}
      <div className="flex items-center gap-2">
        {group.items.length > 1 && (
          <button
            type="button"
            className={`text-xs font-semibold px-2 py-0.5 rounded border transition-colors
              ${
                group.logic === 'and'
                  ? 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200'
                  : 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200'
              } disabled:opacity-50`}
            onClick={toggleLogic}
            disabled={disabled}
            aria-label={`Logic: ${group.logic.toUpperCase()}`}
            title="Click to toggle AND/OR"
          >
            {group.logic.toUpperCase()}
          </button>
        )}
        {depth > 0 && onRemove && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-destructive transition-colors ml-auto"
            onClick={onRemove}
            disabled={disabled}
            aria-label="Remove group"
          >
            Remove group
          </button>
        )}
      </div>

      {/* Condition items */}
      {group.items.map((item, index) => (
        <div key={item.id}>
          {item.type === 'condition' ? (
            <ConditionRowEditor
              row={item}
              previousQuestions={previousQuestions}
              onChange={(updated) => updateItem(index, updated)}
              onRemove={() => removeItem(index)}
              disabled={disabled}
              isOnly={group.items.length === 1}
            />
          ) : (
            depth < 2 && (
              <ConditionGroupEditor
                group={item}
                previousQuestions={previousQuestions}
                onChange={(updated) => updateItem(index, updated)}
                onRemove={() => removeItem(index)}
                disabled={disabled}
                depth={depth + 1}
              />
            )
          )}
        </div>
      ))}

      {/* Add buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors
            border border-dashed border-muted-foreground/40 rounded px-2 py-0.5"
          onClick={addCondition}
          disabled={disabled}
          aria-label="Add condition"
        >
          + Add condition
        </button>
        {depth < 1 && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors
              border border-dashed border-muted-foreground/40 rounded px-2 py-0.5"
            onClick={addGroup}
            disabled={disabled}
            aria-label="Add group"
          >
            + Add group
          </button>
        )}
      </div>
    </div>
  )
}
