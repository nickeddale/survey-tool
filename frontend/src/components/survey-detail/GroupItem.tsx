import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type { QuestionGroupResponse } from '../../types/survey'
import { QuestionItem } from './QuestionTree'

export function GroupItem({ group }: { group: QuestionGroupResponse }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div
      className="border border-border rounded-lg bg-card/50"
      data-testid={`group-item-${group.id}`}
    >
      <div
        className="flex items-center gap-2 p-4 cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}
        role="button"
        aria-expanded={expanded}
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((prev) => !prev)}
      >
        {expanded ? (
          <ChevronDown size={16} className="text-muted-foreground" />
        ) : (
          <ChevronRight size={16} className="text-muted-foreground" />
        )}
        <h3 className="font-medium text-foreground">{group.title}</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {group.questions.length} question{group.questions.length !== 1 ? 's' : ''}
        </span>
      </div>
      {expanded && group.questions.length > 0 && (
        <div className="px-4 pb-4 space-y-2">
          {group.questions.map((q) => (
            <QuestionItem key={q.id} question={q} />
          ))}
        </div>
      )}
      {expanded && group.questions.length === 0 && (
        <div className="px-4 pb-4">
          <p className="text-sm text-muted-foreground italic">No questions in this group.</p>
        </div>
      )}
    </div>
  )
}
