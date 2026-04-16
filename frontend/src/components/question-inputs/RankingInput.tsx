/**
 * RankingInput — drag-and-drop sortable list for ranking questions.
 *
 * Respondent orders all options by dragging. Produces an ordered array of
 * option ids. Requires all items to be ranked (complete permutation).
 */

import { useState, useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { BuilderQuestion } from '../../store/builderStore'
import type { RankingSettings } from '../../types/questionSettings'
import type { AnswerOptionResponse } from '../../types/survey'
import { ValidationErrors } from '../common/ValidationErrors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RankingInputProps {
  value: string[]
  onChange: (value: string[]) => void
  question: BuilderQuestion
  errors?: string[]
}

// ---------------------------------------------------------------------------
// Shuffle helper (Fisher-Yates with session-stable seed)
// ---------------------------------------------------------------------------

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

function shuffleWithSeed<T>(arr: T[], seed: number): T[] {
  const result = [...arr]
  const rand = seededRandom(seed)
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

const sessionSeeds: Record<string, number> = {}
function getSessionSeed(questionId: string): number {
  if (!(questionId in sessionSeeds)) {
    sessionSeeds[questionId] = Math.floor(Math.random() * 2147483646) + 1
  }
  return sessionSeeds[questionId]
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(
  orderedIds: string[],
  allOptions: AnswerOptionResponse[],
  isRequired: boolean
): string[] {
  const errs: string[] = []
  if (isRequired && orderedIds.length === 0) {
    errs.push('This field is required.')
    return errs
  }
  const allOptionIds = allOptions.map((o) => o.id)
  const allRanked = allOptionIds.every((id) => orderedIds.includes(id))
  if (allOptionIds.length > 0 && !allRanked) {
    errs.push('Please rank all options.')
  }
  return errs
}

// ---------------------------------------------------------------------------
// Sortable item sub-component
// ---------------------------------------------------------------------------

interface SortableItemProps {
  id: string
  rank: number
  label: string
}

function SortableItem({ id, rank, label }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={[
        'flex items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm',
        isDragging ? 'shadow-lg border-primary' : 'border-input',
      ].join(' ')}
      data-testid={`ranking-item-${id}`}
      aria-roledescription="sortable item"
    >
      <button
        type="button"
        className="cursor-grab text-muted-foreground hover:text-foreground focus:outline-none"
        aria-label={`Drag to reorder ${label}`}
        data-testid={`ranking-drag-handle-${id}`}
        {...attributes}
        {...listeners}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="4" r="1.5" />
          <circle cx="11" cy="4" r="1.5" />
          <circle cx="5" cy="8" r="1.5" />
          <circle cx="11" cy="8" r="1.5" />
          <circle cx="5" cy="12" r="1.5" />
          <circle cx="11" cy="12" r="1.5" />
        </svg>
      </button>
      <span
        className="w-6 text-center text-xs font-medium text-muted-foreground"
        aria-hidden="true"
      >
        {rank}
      </span>
      <span className="flex-1">{label}</span>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RankingInput({
  value,
  onChange,
  question,
  errors: externalErrors,
}: RankingInputProps) {
  const s = (question.settings ?? {}) as Partial<RankingSettings>
  const randomizeInitial = s.randomize_initial_order ?? false

  const [touched, setTouched] = useState(false)
  const [internalErrors, setInternalErrors] = useState<string[]>([])

  const displayErrors = externalErrors ?? (touched ? internalErrors : [])
  const hasErrors = displayErrors.length > 0
  const inputId = `question-${question.id}`
  const errorId = `${inputId}-error`

  // Build the initial ordered list: use value if populated, otherwise use options order
  const initialOrder = useMemo(() => {
    const allOptions = question.answer_options
    if (value.length > 0) return value

    if (randomizeInitial && allOptions.length > 0) {
      const seed = getSessionSeed(question.id)
      return shuffleWithSeed(allOptions, seed).map((o) => o.id)
    }
    return allOptions.map((o) => o.id)
  }, [question.id, question.answer_options, randomizeInitial]) // eslint-disable-line react-hooks/exhaustive-deps

  // Effective ordered ids (use initialOrder if value is empty)
  const orderedIds = value.length > 0 ? value : initialOrder

  const optionMap = useMemo(() => {
    const map: Record<string, string> = {}
    question.answer_options.forEach((o) => {
      map[o.id] = o.title
    })
    return map
  }, [question.answer_options])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = orderedIds.indexOf(active.id as string)
      const newIndex = orderedIds.indexOf(over.id as string)
      const newOrder = arrayMove(orderedIds, oldIndex, newIndex)
      onChange(newOrder)
      if (touched) {
        setInternalErrors(validate(newOrder, question.answer_options, question.is_required))
      }
    }
  }

  function handleBlur() {
    setTouched(true)
    setInternalErrors(validate(orderedIds, question.answer_options, question.is_required))
  }

  return (
    <div className="space-y-2" data-testid={`ranking-input-${question.id}`} onBlur={handleBlur}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
          <ol
            className="space-y-1.5"
            aria-label={question.title}
            aria-invalid={hasErrors}
            aria-describedby={hasErrors ? errorId : undefined}
            data-testid="ranking-list"
          >
            {orderedIds.map((id, index) => (
              <SortableItem key={id} id={id} rank={index + 1} label={optionMap[id] ?? id} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      <ValidationErrors errors={displayErrors} id={errorId} />
    </div>
  )
}

export default RankingInput
