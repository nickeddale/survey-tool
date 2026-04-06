/**
 * Unit tests for expressionUtils.ts — pure serialization/parsing functions.
 * No DOM environment required. Round-trip tests validate both directions.
 */

import { describe, it, expect } from 'vitest'
import {
  parseExpression,
  parseCondition,
  serializeCondition,
  serializeGroup,
  serializeRootGroup,
  getOperatorsForType,
  makeEmptyCondition,
  makeEmptyGroup,
  TEXT_OPERATORS,
  NUMERIC_OPERATORS,
  CHOICE_OPERATORS,
  BOOLEAN_OPERATORS,
} from '../logic/expressionUtils'
import type { ConditionRow, ConditionGroup } from '../logic/types'

// ---------------------------------------------------------------------------
// getOperatorsForType
// ---------------------------------------------------------------------------

describe('getOperatorsForType', () => {
  it('returns NUMERIC_OPERATORS for numeric type', () => {
    expect(getOperatorsForType('numeric')).toBe(NUMERIC_OPERATORS)
  })

  it('returns NUMERIC_OPERATORS for rating type', () => {
    expect(getOperatorsForType('rating')).toBe(NUMERIC_OPERATORS)
  })

  it('returns NUMERIC_OPERATORS for date type', () => {
    expect(getOperatorsForType('date')).toBe(NUMERIC_OPERATORS)
  })

  it('returns CHOICE_OPERATORS for radio type', () => {
    expect(getOperatorsForType('radio')).toBe(CHOICE_OPERATORS)
  })

  it('returns CHOICE_OPERATORS for dropdown type', () => {
    expect(getOperatorsForType('dropdown')).toBe(CHOICE_OPERATORS)
  })

  it('returns CHOICE_OPERATORS for checkbox type', () => {
    expect(getOperatorsForType('checkbox')).toBe(CHOICE_OPERATORS)
  })

  it('returns BOOLEAN_OPERATORS for boolean type', () => {
    expect(getOperatorsForType('boolean')).toBe(BOOLEAN_OPERATORS)
  })

  it('returns TEXT_OPERATORS for short_text type', () => {
    expect(getOperatorsForType('short_text')).toBe(TEXT_OPERATORS)
  })

  it('returns TEXT_OPERATORS for unknown types', () => {
    expect(getOperatorsForType('unknown_type')).toBe(TEXT_OPERATORS)
  })
})

// ---------------------------------------------------------------------------
// serializeCondition
// ---------------------------------------------------------------------------

describe('serializeCondition', () => {
  it('returns empty string when questionCode is empty', () => {
    const row: ConditionRow = { type: 'condition', id: 'x', questionCode: '', operator: '==', value: 'yes' }
    expect(serializeCondition(row)).toBe('')
  })

  it('serializes is_empty operator', () => {
    const row: ConditionRow = { type: 'condition', id: 'x', questionCode: 'Q1', operator: 'is_empty', value: '' }
    expect(serializeCondition(row)).toBe("{Q1} == ''")
  })

  it('serializes is_not_empty operator', () => {
    const row: ConditionRow = { type: 'condition', id: 'x', questionCode: 'Q1', operator: 'is_not_empty', value: '' }
    expect(serializeCondition(row)).toBe("{Q1} != ''")
  })

  it('serializes contains operator', () => {
    const row: ConditionRow = { type: 'condition', id: 'x', questionCode: 'Q1', operator: 'contains', value: 'hello' }
    expect(serializeCondition(row)).toBe("{Q1} contains 'hello'")
  })

  it('serializes == with string value (quotes)', () => {
    const row: ConditionRow = { type: 'condition', id: 'x', questionCode: 'Q1', operator: '==', value: 'yes' }
    expect(serializeCondition(row)).toBe("{Q1} == 'yes'")
  })

  it('serializes == with numeric value (no quotes)', () => {
    const row: ConditionRow = { type: 'condition', id: 'x', questionCode: 'Q1', operator: '==', value: '42' }
    expect(serializeCondition(row)).toBe('{Q1} == 42')
  })

  it('serializes > operator', () => {
    const row: ConditionRow = { type: 'condition', id: 'x', questionCode: 'Q2', operator: '>', value: '5' }
    expect(serializeCondition(row)).toBe('{Q2} > 5')
  })

  it('serializes != with string value', () => {
    const row: ConditionRow = { type: 'condition', id: 'x', questionCode: 'Q3', operator: '!=', value: 'no' }
    expect(serializeCondition(row)).toBe("{Q3} != 'no'")
  })

  it('serializes empty string value with quotes', () => {
    const row: ConditionRow = { type: 'condition', id: 'x', questionCode: 'Q1', operator: '==', value: '' }
    expect(serializeCondition(row)).toBe("{Q1} == ''")
  })
})

// ---------------------------------------------------------------------------
// parseCondition
// ---------------------------------------------------------------------------

describe('parseCondition', () => {
  it('returns null for malformed expression', () => {
    expect(parseCondition('not a valid expression')).toBeNull()
  })

  it('parses is_empty from == empty string pattern', () => {
    const result = parseCondition("{Q1} == ''")
    expect(result).not.toBeNull()
    expect(result!.operator).toBe('is_empty')
    expect(result!.questionCode).toBe('Q1')
    expect(result!.value).toBe('')
  })

  it('parses is_not_empty from != empty string pattern', () => {
    const result = parseCondition("{Q1} != ''")
    expect(result).not.toBeNull()
    expect(result!.operator).toBe('is_not_empty')
  })

  it('parses contains operator', () => {
    const result = parseCondition("{Q1} contains 'hello'")
    expect(result).not.toBeNull()
    expect(result!.operator).toBe('contains')
    expect(result!.value).toBe('hello')
  })

  it('parses == with quoted string value', () => {
    const result = parseCondition("{Q1} == 'yes'")
    expect(result).not.toBeNull()
    expect(result!.operator).toBe('==')
    expect(result!.value).toBe('yes')
    expect(result!.questionCode).toBe('Q1')
  })

  it('parses == with numeric value', () => {
    const result = parseCondition('{Q1} == 42')
    expect(result).not.toBeNull()
    expect(result!.value).toBe('42')
  })

  it('parses > operator', () => {
    const result = parseCondition('{Q2} > 5')
    expect(result).not.toBeNull()
    expect(result!.operator).toBe('>')
    expect(result!.value).toBe('5')
  })

  it('parses >= operator', () => {
    const result = parseCondition('{Q2} >= 10')
    expect(result).not.toBeNull()
    expect(result!.operator).toBe('>=')
    expect(result!.value).toBe('10')
  })
})

// ---------------------------------------------------------------------------
// parseExpression
// ---------------------------------------------------------------------------

describe('parseExpression', () => {
  it('returns empty group for empty string', () => {
    const result = parseExpression('')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('group')
    expect(result!.items).toHaveLength(1)
  })

  it('returns null for expression with parentheses', () => {
    expect(parseExpression("({Q1} == 'yes') AND ({Q2} == 'no')")).toBeNull()
  })

  it('parses single condition', () => {
    const result = parseExpression("{Q1} == 'yes'")
    expect(result).not.toBeNull()
    expect(result!.items).toHaveLength(1)
    expect(result!.items[0].type).toBe('condition')
  })

  it('parses AND expression', () => {
    const result = parseExpression("{Q1} == 'yes' AND {Q2} == 'no'")
    expect(result).not.toBeNull()
    expect(result!.logic).toBe('and')
    expect(result!.items).toHaveLength(2)
  })

  it('parses OR expression', () => {
    const result = parseExpression("{Q1} == 'yes' OR {Q2} == 'no'")
    expect(result).not.toBeNull()
    expect(result!.logic).toBe('or')
    expect(result!.items).toHaveLength(2)
  })

  it('returns null for malformed condition in expression', () => {
    expect(parseExpression('not a valid expression')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// serializeRootGroup
// ---------------------------------------------------------------------------

describe('serializeRootGroup', () => {
  it('returns empty string for group with no non-empty items', () => {
    const group = makeEmptyGroup()
    // The single empty condition has empty questionCode, so serializes to ''
    expect(serializeRootGroup(group)).toBe('')
  })

  it('serializes single condition without wrapping parens', () => {
    const row: ConditionRow = { type: 'condition', id: 'x', questionCode: 'Q1', operator: '==', value: 'yes' }
    const group: ConditionGroup = { type: 'group', id: 'g1', logic: 'and', items: [row] }
    expect(serializeRootGroup(group)).toBe("{Q1} == 'yes'")
  })

  it('serializes AND group without extra wrapping parens', () => {
    const row1: ConditionRow = { type: 'condition', id: 'r1', questionCode: 'Q1', operator: '==', value: 'yes' }
    const row2: ConditionRow = { type: 'condition', id: 'r2', questionCode: 'Q2', operator: '>', value: '5' }
    const group: ConditionGroup = { type: 'group', id: 'g1', logic: 'and', items: [row1, row2] }
    expect(serializeRootGroup(group)).toBe("{Q1} == 'yes' AND {Q2} > 5")
  })

  it('serializes OR group', () => {
    const row1: ConditionRow = { type: 'condition', id: 'r1', questionCode: 'Q1', operator: '==', value: 'a' }
    const row2: ConditionRow = { type: 'condition', id: 'r2', questionCode: 'Q1', operator: '==', value: 'b' }
    const group: ConditionGroup = { type: 'group', id: 'g1', logic: 'or', items: [row1, row2] }
    expect(serializeRootGroup(group)).toBe("{Q1} == 'a' OR {Q1} == 'b'")
  })
})

// ---------------------------------------------------------------------------
// serializeGroup (sub-group — wraps in parens when multiple items)
// ---------------------------------------------------------------------------

describe('serializeGroup', () => {
  it('wraps multiple items in parentheses', () => {
    const row1: ConditionRow = { type: 'condition', id: 'r1', questionCode: 'Q1', operator: '==', value: 'yes' }
    const row2: ConditionRow = { type: 'condition', id: 'r2', questionCode: 'Q2', operator: '==', value: 'no' }
    const group: ConditionGroup = { type: 'group', id: 'g1', logic: 'and', items: [row1, row2] }
    expect(serializeGroup(group)).toBe("({Q1} == 'yes' AND {Q2} == 'no')")
  })

  it('does not wrap single item', () => {
    const row: ConditionRow = { type: 'condition', id: 'r1', questionCode: 'Q1', operator: '==', value: 'yes' }
    const group: ConditionGroup = { type: 'group', id: 'g1', logic: 'and', items: [row] }
    expect(serializeGroup(group)).toBe("{Q1} == 'yes'")
  })
})

// ---------------------------------------------------------------------------
// Round-trip tests: serialize(parse(expr)) === expr
// ---------------------------------------------------------------------------

describe('round-trip: serialize(parse(expr)) === expr', () => {
  it('round-trips single condition', () => {
    const expr = "{Q1} == 'yes'"
    const parsed = parseExpression(expr)
    expect(parsed).not.toBeNull()
    expect(serializeRootGroup(parsed!)).toBe(expr)
  })

  it('round-trips AND expression', () => {
    const expr = "{Q1} == 'yes' AND {Q2} > 5"
    const parsed = parseExpression(expr)
    expect(parsed).not.toBeNull()
    expect(serializeRootGroup(parsed!)).toBe(expr)
  })

  it('round-trips OR expression', () => {
    const expr = "{Q1} == 'a' OR {Q1} == 'b'"
    const parsed = parseExpression(expr)
    expect(parsed).not.toBeNull()
    expect(serializeRootGroup(parsed!)).toBe(expr)
  })

  it('round-trips is_empty', () => {
    const expr = "{Q1} == ''"
    const parsed = parseExpression(expr)
    expect(parsed).not.toBeNull()
    expect(serializeRootGroup(parsed!)).toBe(expr)
  })

  it('round-trips is_not_empty', () => {
    const expr = "{Q1} != ''"
    const parsed = parseExpression(expr)
    expect(parsed).not.toBeNull()
    expect(serializeRootGroup(parsed!)).toBe(expr)
  })

  it('round-trips contains', () => {
    const expr = "{Q1} contains 'hello'"
    const parsed = parseExpression(expr)
    expect(parsed).not.toBeNull()
    expect(serializeRootGroup(parsed!)).toBe(expr)
  })
})

// ---------------------------------------------------------------------------
// Round-trip tests: parse(serialize(group)) deep-equals group (modulo IDs)
// ---------------------------------------------------------------------------

describe('round-trip: parse(serialize(group)) matches group structure', () => {
  it('preserves logic and condition values', () => {
    const row1: ConditionRow = { type: 'condition', id: 'r1', questionCode: 'Q1', operator: '==', value: 'yes' }
    const row2: ConditionRow = { type: 'condition', id: 'r2', questionCode: 'Q2', operator: '>', value: '5' }
    const group: ConditionGroup = { type: 'group', id: 'g1', logic: 'and', items: [row1, row2] }

    const serialized = serializeRootGroup(group)
    const parsed = parseExpression(serialized)
    expect(parsed).not.toBeNull()
    expect(parsed!.logic).toBe('and')
    expect(parsed!.items).toHaveLength(2)

    const parsedRow1 = parsed!.items[0] as ConditionRow
    expect(parsedRow1.questionCode).toBe('Q1')
    expect(parsedRow1.operator).toBe('==')
    expect(parsedRow1.value).toBe('yes')

    const parsedRow2 = parsed!.items[1] as ConditionRow
    expect(parsedRow2.questionCode).toBe('Q2')
    expect(parsedRow2.operator).toBe('>')
    expect(parsedRow2.value).toBe('5')
  })
})

// ---------------------------------------------------------------------------
// makeEmptyCondition / makeEmptyGroup
// ---------------------------------------------------------------------------

describe('makeEmptyCondition', () => {
  it('creates condition with empty questionCode and == operator', () => {
    const c = makeEmptyCondition()
    expect(c.type).toBe('condition')
    expect(c.questionCode).toBe('')
    expect(c.operator).toBe('==')
    expect(c.value).toBe('')
    expect(c.id).toBeTruthy()
  })
})

describe('makeEmptyGroup', () => {
  it('creates group with and logic and one empty condition', () => {
    const g = makeEmptyGroup()
    expect(g.type).toBe('group')
    expect(g.logic).toBe('and')
    expect(g.items).toHaveLength(1)
    expect(g.items[0].type).toBe('condition')
  })
})
