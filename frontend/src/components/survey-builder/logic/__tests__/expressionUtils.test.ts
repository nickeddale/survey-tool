import { describe, it, expect } from 'vitest'
import {
  serializeCondition,
  serializeGroup,
  serializeRootGroup,
  parseExpression,
} from '../expressionUtils'
import type { ConditionGroup, ConditionRow } from '../types'

function makeCondition(questionCode: string, operator: string, value: string): ConditionRow {
  return {
    type: 'condition' as const,
    id: 'test',
    questionCode,
    operator: operator as ConditionRow['operator'],
    value,
  }
}

function makeGroup(logic: 'and' | 'or', items: (ConditionRow | ConditionGroup)[]): ConditionGroup {
  return { type: 'group', id: 'test', logic, items }
}

describe('serializeCondition', () => {
  it('serializes equality condition', () => {
    expect(serializeCondition(makeCondition('Q1', '==', 'yes'))).toBe("{Q1} == 'yes'")
  })

  it('serializes contains with lowercase keyword', () => {
    expect(serializeCondition(makeCondition('Q1', 'contains', 'hello'))).toBe(
      "{Q1} contains 'hello'"
    )
  })

  it('serializes is_empty as == empty string', () => {
    expect(serializeCondition(makeCondition('Q1', 'is_empty', ''))).toBe("{Q1} == ''")
  })

  it('serializes is_not_empty as != empty string', () => {
    expect(serializeCondition(makeCondition('Q1', 'is_not_empty', ''))).toBe("{Q1} != ''")
  })

  it('serializes numeric value without quotes', () => {
    expect(serializeCondition(makeCondition('Q1', '>', '5'))).toBe('{Q1} > 5')
  })
})

describe('serializeGroup', () => {
  it('returns empty string for group with no valid items', () => {
    const group = makeGroup('and', [makeCondition('', '==', '')])
    expect(serializeGroup(group)).toBe('')
  })

  it('returns single condition without parentheses', () => {
    const group = makeGroup('and', [makeCondition('Q1', '==', 'yes')])
    expect(serializeGroup(group)).toBe("{Q1} == 'yes'")
  })

  it('joins multiple conditions with lowercase "and"', () => {
    const group = makeGroup('and', [
      makeCondition('Q1', '==', 'yes'),
      makeCondition('Q2', '==', 'no'),
    ])
    expect(serializeGroup(group)).toBe("({Q1} == 'yes' and {Q2} == 'no')")
  })

  it('joins multiple conditions with lowercase "or"', () => {
    const group = makeGroup('or', [
      makeCondition('Q1', '==', 'yes'),
      makeCondition('Q2', '==', 'no'),
    ])
    expect(serializeGroup(group)).toBe("({Q1} == 'yes' or {Q2} == 'no')")
  })

  it('does NOT use uppercase AND', () => {
    const group = makeGroup('and', [makeCondition('Q1', '==', 'a'), makeCondition('Q2', '==', 'b')])
    expect(serializeGroup(group)).not.toContain('AND')
  })

  it('does NOT use uppercase OR', () => {
    const group = makeGroup('or', [makeCondition('Q1', '==', 'a'), makeCondition('Q2', '==', 'b')])
    expect(serializeGroup(group)).not.toContain('OR')
  })
})

describe('serializeRootGroup', () => {
  it('returns empty string for empty group', () => {
    const group = makeGroup('and', [makeCondition('', '==', '')])
    expect(serializeRootGroup(group)).toBe('')
  })

  it('returns single condition without joining', () => {
    const group = makeGroup('and', [makeCondition('Q1', '==', 'yes')])
    expect(serializeRootGroup(group)).toBe("{Q1} == 'yes'")
  })

  it('joins multiple conditions with lowercase "and" and no outer parens', () => {
    const group = makeGroup('and', [
      makeCondition('Q1', '==', 'yes'),
      makeCondition('Q2', '==', 'no'),
    ])
    expect(serializeRootGroup(group)).toBe("{Q1} == 'yes' and {Q2} == 'no'")
  })

  it('joins multiple conditions with lowercase "or" and no outer parens', () => {
    const group = makeGroup('or', [
      makeCondition('Q1', '==', 'yes'),
      makeCondition('Q2', '==', 'no'),
    ])
    expect(serializeRootGroup(group)).toBe("{Q1} == 'yes' or {Q2} == 'no'")
  })

  it('does NOT use uppercase AND', () => {
    const group = makeGroup('and', [
      makeCondition('Q1', '==', 'a'),
      makeCondition('Q2', '==', 'b'),
      makeCondition('Q3', '==', 'c'),
    ])
    expect(serializeRootGroup(group)).not.toContain('AND')
  })

  it('does NOT use uppercase OR', () => {
    const group = makeGroup('or', [makeCondition('Q1', '==', 'a'), makeCondition('Q2', '==', 'b')])
    expect(serializeRootGroup(group)).not.toContain('OR')
  })
})

describe('parseExpression', () => {
  it('parses lowercase "and" expressions', () => {
    const result = parseExpression("{Q1} == 'yes' and {Q2} == 'no'")
    expect(result).not.toBeNull()
    expect(result?.logic).toBe('and')
    expect(result?.items).toHaveLength(2)
  })

  it('parses lowercase "or" expressions', () => {
    const result = parseExpression("{Q1} == 'yes' or {Q2} == 'no'")
    expect(result).not.toBeNull()
    expect(result?.logic).toBe('or')
    expect(result?.items).toHaveLength(2)
  })

  it('round-trips: serialize then parse returns same structure', () => {
    const group = makeGroup('and', [
      makeCondition('Q1', '==', 'yes'),
      makeCondition('Q2', '==', 'no'),
    ])
    const serialized = serializeRootGroup(group)
    const parsed = parseExpression(serialized)
    expect(parsed).not.toBeNull()
    expect(parsed?.logic).toBe('and')
    expect(parsed?.items).toHaveLength(2)
  })
})
