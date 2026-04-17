/**
 * Tests for useValidation hook.
 *
 * Uses renderHook() from React Testing Library. All hook state-mutating calls
 * are wrapped in act() as required by MEMORY.md (Act() Warning Fixes).
 *
 * Note: This file uses renderHook — no DOM rendering, but act() is still
 * required for state updates.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useValidation } from '../useValidation'
import type { BuilderQuestion } from '../../store/builderStore'
import { getDefaultSettings } from '../../types/questionSettings'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Prevent AuthProvider.initialize() from triggering async state updates
  // outside act() when a refresh token is in localStorage.
  localStorage.removeItem('survey_tool_refresh_token')
})

function makeQuestion(
  questionType: string,
  overrides: Partial<BuilderQuestion> = {}
): BuilderQuestion {
  return {
    id: 'q-1',
    group_id: 'g-1',
    parent_id: null,
    question_type: questionType,
    code: 'Q1',
    title: 'Test question',
    description: null,
    is_required: false,
    sort_order: 1,
    relevance: null,
    validation: null,
    settings: getDefaultSettings(questionType),
    created_at: '2024-01-01T00:00:00Z',
    answer_options: [],
    subquestions: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('useValidation — initial state', () => {
  it('starts with empty errors', () => {
    const { result } = renderHook(() => useValidation())
    expect(result.current.errors).toEqual({})
  })

  it('starts with isValid=true (no errors yet)', () => {
    const { result } = renderHook(() => useValidation())
    expect(result.current.isValid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// validateField
// ---------------------------------------------------------------------------

describe('useValidation — validateField', () => {
  it('sets errors for a required field when value is empty', () => {
    const { result } = renderHook(() => useValidation())
    const question = makeQuestion('short_text', { id: 'q-1', is_required: true })

    act(() => {
      result.current.validateField(question, '')
    })

    expect(result.current.errors['q-1']).toHaveLength(1)
    expect(result.current.errors['q-1'][0]).toBe('This field is required.')
  })

  it('sets empty errors for a valid field value', () => {
    const { result } = renderHook(() => useValidation())
    const question = makeQuestion('short_text', { id: 'q-1', is_required: true })

    act(() => {
      result.current.validateField(question, 'hello')
    })

    expect(result.current.errors['q-1']).toHaveLength(0)
  })

  it('updates errors when called again with different value', () => {
    const { result } = renderHook(() => useValidation())
    const question = makeQuestion('short_text', { id: 'q-1', is_required: true })

    act(() => {
      result.current.validateField(question, '')
    })
    expect(result.current.errors['q-1']).toHaveLength(1)

    act(() => {
      result.current.validateField(question, 'now filled')
    })
    expect(result.current.errors['q-1']).toHaveLength(0)
  })

  it('sets errors keyed by question id', () => {
    const { result } = renderHook(() => useValidation())
    const q1 = makeQuestion('short_text', { id: 'q-1', is_required: true })
    const q2 = makeQuestion('numeric', { id: 'q-2', is_required: true })

    act(() => {
      result.current.validateField(q1, '')
      result.current.validateField(q2, '')
    })

    expect(result.current.errors['q-1']).toBeDefined()
    expect(result.current.errors['q-2']).toBeDefined()
  })

  it('sets isValid=false when there are errors', () => {
    const { result } = renderHook(() => useValidation())
    const question = makeQuestion('short_text', { id: 'q-1', is_required: true })

    act(() => {
      result.current.validateField(question, '')
    })

    expect(result.current.isValid).toBe(false)
  })

  it('sets isValid=true when all errors are cleared by valid values', () => {
    const { result } = renderHook(() => useValidation())
    const question = makeQuestion('short_text', { id: 'q-1', is_required: true })

    act(() => {
      result.current.validateField(question, '')
    })
    expect(result.current.isValid).toBe(false)

    act(() => {
      result.current.validateField(question, 'valid answer')
    })
    expect(result.current.isValid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// validateAll
// ---------------------------------------------------------------------------

describe('useValidation — validateAll', () => {
  it('populates errors for all questions', () => {
    const { result } = renderHook(() => useValidation())
    const questions = [
      makeQuestion('short_text', { id: 'q-1', is_required: true }),
      makeQuestion('numeric', { id: 'q-2', is_required: true }),
    ]

    let valid: boolean
    act(() => {
      valid = result.current.validateAll(questions, {})
    })

    expect(valid!).toBe(false)
    expect(result.current.errors['q-1']).toHaveLength(1)
    expect(result.current.errors['q-2']).toHaveLength(1)
  })

  it('returns true when all questions are valid', () => {
    const { result } = renderHook(() => useValidation())
    const questions = [makeQuestion('short_text', { id: 'q-1', is_required: true })]

    let valid: boolean
    act(() => {
      valid = result.current.validateAll(questions, { 'q-1': 'hello' })
    })

    expect(valid!).toBe(true)
    expect(result.current.errors['q-1']).toHaveLength(0)
  })

  it('uses default empty answer for missing question ids in answers map', () => {
    const { result } = renderHook(() => useValidation())
    const questions = [makeQuestion('short_text', { id: 'q-1', is_required: true })]

    let valid: boolean
    act(() => {
      // No answer for q-1 provided → defaults to ''
      valid = result.current.validateAll(questions, {})
    })

    expect(valid!).toBe(false)
    expect(result.current.errors['q-1']).toHaveLength(1)
  })

  it('validates different question types with correct default answers', () => {
    const { result } = renderHook(() => useValidation())
    const questions = [
      makeQuestion('checkbox', { id: 'q-checkbox', is_required: true }),
      makeQuestion('ranking', { id: 'q-ranking', is_required: false }),
    ]

    act(() => {
      result.current.validateAll(questions, {})
    })

    // checkbox required + empty array → error
    expect(result.current.errors['q-checkbox']).toHaveLength(1)
    // ranking not required + empty array + no options → no error
    expect(result.current.errors['q-ranking']).toHaveLength(0)
  })

  it('replaces previous errors with new results on second call', () => {
    const { result } = renderHook(() => useValidation())
    const questions = [makeQuestion('short_text', { id: 'q-1', is_required: true })]

    act(() => {
      result.current.validateAll(questions, {})
    })
    expect(result.current.errors['q-1']).toHaveLength(1)

    act(() => {
      result.current.validateAll(questions, { 'q-1': 'valid' })
    })
    expect(result.current.errors['q-1']).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// clearErrors
// ---------------------------------------------------------------------------

describe('useValidation — clearErrors', () => {
  it('resets all errors to empty', () => {
    const { result } = renderHook(() => useValidation())
    const question = makeQuestion('short_text', { id: 'q-1', is_required: true })

    act(() => {
      result.current.validateField(question, '')
    })
    expect(result.current.errors['q-1']).toHaveLength(1)

    act(() => {
      result.current.clearErrors()
    })

    expect(result.current.errors).toEqual({})
  })

  it('sets isValid=true after clearing errors', () => {
    const { result } = renderHook(() => useValidation())
    const question = makeQuestion('short_text', { id: 'q-1', is_required: true })

    act(() => {
      result.current.validateField(question, '')
    })
    expect(result.current.isValid).toBe(false)

    act(() => {
      result.current.clearErrors()
    })
    expect(result.current.isValid).toBe(true)
  })
})
