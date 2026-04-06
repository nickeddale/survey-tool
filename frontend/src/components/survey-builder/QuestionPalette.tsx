/**
 * QuestionPalette — left panel showing available question types.
 *
 * Renders a list of question type buttons. In read-only mode the buttons are
 * disabled and visually muted. In edit mode clicking a button is wired
 * externally (the buttons currently serve as visual affordances; drag-to-add
 * is planned for a future iteration).
 */

import { Type, List, AlignLeft, CheckSquare, ToggleLeft, Hash } from 'lucide-react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const QUESTION_TYPES = [
  { type: 'text', label: 'Short Text', icon: Type },
  { type: 'textarea', label: 'Long Text', icon: AlignLeft },
  { type: 'radio', label: 'Single Choice', icon: ToggleLeft },
  { type: 'checkbox', label: 'Multiple Choice', icon: CheckSquare },
  { type: 'select', label: 'Dropdown', icon: List },
  { type: 'number', label: 'Number', icon: Hash },
]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface QuestionPaletteProps {
  readOnly: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuestionPalette({ readOnly }: QuestionPaletteProps) {
  return (
    <aside
      className="w-56 border-r border-border bg-muted/30 flex flex-col overflow-y-auto"
      data-testid="question-palette"
    >
      <div className="px-3 py-3 border-b border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Question Types</p>
      </div>
      <div className="p-2 space-y-1">
        {QUESTION_TYPES.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            className={`w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm text-left transition-colors
              ${readOnly
                ? 'text-muted-foreground cursor-not-allowed opacity-50'
                : 'hover:bg-muted text-foreground cursor-pointer'
              }`}
            disabled={readOnly}
            aria-label={`Add ${label} question`}
            data-question-type={type}
          >
            <Icon size={14} className="shrink-0" />
            {label}
          </button>
        ))}
      </div>
    </aside>
  )
}
