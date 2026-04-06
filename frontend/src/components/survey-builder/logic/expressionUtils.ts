/**
 * Pure utility functions for logic expression serialization and parsing.
 * No React imports — fully unit-testable without a DOM environment.
 */

import type { OperatorType, ConditionRow, ConditionGroup } from './types'

// ---------------------------------------------------------------------------
// Operator definitions per question category
// ---------------------------------------------------------------------------

export const TEXT_OPERATORS: Array<{ value: OperatorType; label: string }> = [
  { value: '==', label: 'equals' },
  { value: '!=', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
]

export const NUMERIC_OPERATORS: Array<{ value: OperatorType; label: string }> = [
  { value: '==', label: 'equals' },
  { value: '!=', label: 'not equals' },
  { value: '>', label: 'greater than' },
  { value: '<', label: 'less than' },
  { value: '>=', label: 'greater than or equal' },
  { value: '<=', label: 'less than or equal' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
]

export const CHOICE_OPERATORS: Array<{ value: OperatorType; label: string }> = [
  { value: '==', label: 'equals' },
  { value: '!=', label: 'not equals' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
]

export const BOOLEAN_OPERATORS: Array<{ value: OperatorType; label: string }> = [
  { value: '==', label: 'equals' },
  { value: '!=', label: 'not equals' },
]

export function getOperatorsForType(questionType: string): Array<{ value: OperatorType; label: string }> {
  if (['numeric', 'rating', 'date'].includes(questionType)) return NUMERIC_OPERATORS
  if (['radio', 'dropdown', 'checkbox', 'ranking', 'image_picker'].includes(questionType))
    return CHOICE_OPERATORS
  if (questionType === 'boolean') return BOOLEAN_OPERATORS
  return TEXT_OPERATORS
}

// ---------------------------------------------------------------------------
// ID generator
// ---------------------------------------------------------------------------

let _idCounter = 0
export function genId(): string {
  return `c_${++_idCounter}_${Date.now()}`
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

export function serializeItem(item: ConditionRow | ConditionGroup): string {
  if (item.type === 'condition') {
    return serializeCondition(item)
  }
  return serializeGroup(item)
}

export function serializeCondition(row: ConditionRow): string {
  if (!row.questionCode) return ''
  if (row.operator === 'is_empty') return `{${row.questionCode}} == ''`
  if (row.operator === 'is_not_empty') return `{${row.questionCode}} != ''`
  if (row.operator === 'contains') return `{${row.questionCode}} contains '${row.value}'`
  const needsQuotes = isNaN(Number(row.value)) || row.value === ''
  const valueStr = needsQuotes ? `'${row.value}'` : row.value
  return `{${row.questionCode}} ${row.operator} ${valueStr}`
}

export function serializeGroup(group: ConditionGroup): string {
  const parts = group.items.map(serializeItem).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  const joined = parts.join(` ${group.logic.toUpperCase()} `)
  return `(${joined})`
}

export function serializeRootGroup(group: ConditionGroup): string {
  const parts = group.items.map(serializeItem).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  return parts.join(` ${group.logic.toUpperCase()} `)
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

/**
 * Attempts to parse a simple expression string back into a ConditionGroup tree.
 * Returns null if parsing fails (caller falls back to raw mode).
 *
 * Supports patterns:
 *   {CODE} == 'value'
 *   {CODE} != value
 *   {CODE} > 5
 *   {CODE} contains 'text'
 *   {CODE} == ''   (maps to is_empty)
 *   {CODE} != ''   (maps to is_not_empty)
 *   expr1 AND expr2 AND expr3
 *   expr1 OR expr2 OR expr3
 *   (nested groups not parsed — falls back to raw mode)
 */
export function parseExpression(expr: string): ConditionGroup | null {
  const trimmed = expr.trim()
  if (!trimmed) {
    return makeEmptyGroup()
  }

  // Try splitting on top-level AND / OR (not inside parentheses)
  // We only support flat AND or flat OR at top level — nested parens fall back to raw
  if (trimmed.includes('(') || trimmed.includes(')')) {
    return null
  }

  // Determine top-level logic connector
  const upperExpr = trimmed
  let logic: 'and' | 'or' = 'and'
  let parts: string[] = []

  if (/ AND /i.test(upperExpr)) {
    logic = 'and'
    parts = trimmed.split(/ AND /i)
  } else if (/ OR /i.test(upperExpr)) {
    logic = 'or'
    parts = trimmed.split(/ OR /i)
  } else {
    parts = [trimmed]
  }

  const items: ConditionRow[] = []
  for (const part of parts) {
    const row = parseCondition(part.trim())
    if (!row) return null
    items.push(row)
  }

  return {
    type: 'group',
    id: genId(),
    logic,
    items,
  }
}

export function parseCondition(expr: string): ConditionRow | null {
  // Match {CODE} operator value
  const codeMatch = expr.match(/^\{([^}]+)\}\s*(.+)$/)
  if (!codeMatch) return null

  const questionCode = codeMatch[1]
  const rest = codeMatch[2].trim()

  // is_empty / is_not_empty patterns: == '' or != ''
  if (rest === "== ''") {
    return { type: 'condition', id: genId(), questionCode, operator: 'is_empty', value: '' }
  }
  if (rest === "!= ''") {
    return { type: 'condition', id: genId(), questionCode, operator: 'is_not_empty', value: '' }
  }

  // contains pattern
  const containsMatch = rest.match(/^contains\s+'(.*)'\s*$/i)
  if (containsMatch) {
    return {
      type: 'condition',
      id: genId(),
      questionCode,
      operator: 'contains',
      value: containsMatch[1],
    }
  }

  // Standard binary operators: ==, !=, >=, <=, >, <
  const opMatch = rest.match(/^(==|!=|>=|<=|>|<)\s*(.+)$/)
  if (!opMatch) return null

  const operator = opMatch[1] as OperatorType
  let value = opMatch[2].trim()

  // Strip quotes from string values
  if ((value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))) {
    value = value.slice(1, -1)
  }

  return { type: 'condition', id: genId(), questionCode, operator, value }
}

export function makeEmptyGroup(): ConditionGroup {
  return {
    type: 'group',
    id: genId(),
    logic: 'and',
    items: [makeEmptyCondition()],
  }
}

export function makeEmptyCondition(): ConditionRow {
  return { type: 'condition', id: genId(), questionCode: '', operator: '==', value: '' }
}
