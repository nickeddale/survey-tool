/**
 * Shared types for the LogicEditor sub-components.
 * Pure type-only file — no runtime imports to avoid circular dependency chains.
 */

import type { BuilderQuestion } from '../../../store/builderStore'

export type OperatorType =
  | '=='
  | '!='
  | '>'
  | '<'
  | '>='
  | '<='
  | 'contains'
  | 'is_empty'
  | 'is_not_empty'

export interface ConditionRow {
  type: 'condition'
  id: string
  questionCode: string
  operator: OperatorType
  value: string
}

export interface ConditionGroup {
  type: 'group'
  id: string
  logic: 'and' | 'or'
  items: Array<ConditionRow | ConditionGroup>
}

export interface LogicEditorProps {
  /** The survey ID (for validation API calls) */
  surveyId: string
  /** The current question's sort_order — only show questions with lower sort_order */
  currentSortOrder: number
  /** All questions across all groups, ordered by sort_order */
  previousQuestions: BuilderQuestion[]
  /** Current relevance expression string */
  value: string
  /** Called when the expression changes */
  onChange: (value: string) => void
  /** Disable editing */
  disabled?: boolean
}

export interface ConditionRowEditorProps {
  row: ConditionRow
  previousQuestions: BuilderQuestion[]
  onChange: (updated: ConditionRow) => void
  onRemove: () => void
  disabled?: boolean
  isOnly: boolean
}

export interface ValueInputProps {
  question: BuilderQuestion
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export interface ConditionGroupEditorProps {
  group: ConditionGroup
  previousQuestions: BuilderQuestion[]
  onChange: (updated: ConditionGroup) => void
  onRemove?: () => void
  disabled?: boolean
  depth: number
}
