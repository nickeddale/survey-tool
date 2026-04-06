import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type { QuestionResponse } from '../../types/survey'

export function AnswerOptionItem({ code, title }: { code: string; title: string }) {
  return (
    <div className="flex items-center gap-2 py-1 pl-4">
      <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{code}</span>
      <span className="text-sm text-foreground">{title}</span>
    </div>
  )
}

export function QuestionItem({ question }: { question: QuestionResponse }) {
  const [expanded, setExpanded] = useState(true)
  const hasOptions = question.answer_options.length > 0
  const hasSubquestions = question.subquestions.length > 0

  return (
    <div className="border border-border rounded-md bg-card" data-testid={`question-item-${question.id}`}>
      <div
        className="flex items-start gap-2 p-3 cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}
        role="button"
        aria-expanded={expanded}
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((prev) => !prev)}
      >
        <div className="mt-0.5 text-muted-foreground">
          {hasOptions || hasSubquestions ? (
            expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span className="inline-block w-3.5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {question.code}
            </span>
            <span className="text-sm font-medium text-foreground">{question.title}</span>
            <span className="text-xs text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
              {question.question_type}
            </span>
            {question.is_required && (
              <span className="text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">required</span>
            )}
          </div>
          {question.description && (
            <p className="mt-1 text-xs text-muted-foreground">{question.description}</p>
          )}
        </div>
      </div>
      {expanded && (hasOptions || hasSubquestions) && (
        <div className="border-t border-border px-3 pb-2 pt-2 space-y-1">
          {hasOptions &&
            question.answer_options.map((opt) => (
              <AnswerOptionItem key={opt.id} code={opt.code} title={opt.title} />
            ))}
          {hasSubquestions &&
            question.subquestions.map((sub) => <QuestionItem key={sub.id} question={sub} />)}
        </div>
      )}
    </div>
  )
}
