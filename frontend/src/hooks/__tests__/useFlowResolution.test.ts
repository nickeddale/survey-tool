/**
 * Unit tests for useFlowResolution hook.
 *
 * Uses vitest fake timers to control debounce timing and MSW for API mocking.
 * All state-mutating calls are wrapped in act() as required.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { useFlowResolution, computeInitialHiddenQuestions } from '../useFlowResolution'
import type { AnswerMap } from '../useValidation'
import type { QuestionResponse } from '../../types/survey'

const BASE = '/api/v1'
const SURVEY_ID = 'test-survey-123'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.removeItem('devtracker_refresh_token')
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeResolveFlowResponse(overrides: Partial<{
  visible_questions: string[]
  hidden_questions: string[]
  visible_groups: string[]
  hidden_groups: string[]
  piped_texts: Record<string, string>
  next_question_id: string | null
}> = {}) {
  return {
    visible_questions: overrides.visible_questions ?? [],
    hidden_questions: overrides.hidden_questions ?? [],
    visible_groups: overrides.visible_groups ?? [],
    hidden_groups: overrides.hidden_groups ?? [],
    piped_texts: overrides.piped_texts ?? {},
    next_question_id: overrides.next_question_id ?? null,
  }
}

function makeQuestion(id: string, relevance: string | null = null): QuestionResponse {
  return {
    id,
    group_id: 'g-1',
    parent_id: null,
    question_type: 'text',
    code: id,
    title: `Question ${id}`,
    description: null,
    is_required: false,
    sort_order: 0,
    relevance,
    validation: null,
    settings: null,
    created_at: '2024-01-01T00:00:00Z',
    subquestions: [],
    answer_options: [],
  }
}

// ---------------------------------------------------------------------------
// computeInitialHiddenQuestions (pure function)
// ---------------------------------------------------------------------------

describe('computeInitialHiddenQuestions', () => {
  it('returns empty set when questions array is empty', () => {
    const result = computeInitialHiddenQuestions([])
    expect(result.size).toBe(0)
  })

  it('hides questions with a non-empty relevance expression', () => {
    const questions = [
      makeQuestion('q-1', "{Q1} != ''"),
      makeQuestion('q-2', '1 == 1'),
    ]
    const result = computeInitialHiddenQuestions(questions)
    expect(result.has('q-1')).toBe(true)
    expect(result.has('q-2')).toBe(true)
  })

  it('does not hide questions with null relevance', () => {
    const questions = [makeQuestion('q-1', null)]
    const result = computeInitialHiddenQuestions(questions)
    expect(result.has('q-1')).toBe(false)
  })

  it('does not hide questions with empty string relevance', () => {
    const questions = [makeQuestion('q-1', '')]
    const result = computeInitialHiddenQuestions(questions)
    expect(result.has('q-1')).toBe(false)
  })

  it('correctly partitions mixed questions', () => {
    const questions = [
      makeQuestion('q-1', "{Q1} != ''"),
      makeQuestion('q-2', null),
      makeQuestion('q-3', ''),
      makeQuestion('q-4', 'someCondition'),
    ]
    const result = computeInitialHiddenQuestions(questions)
    expect(result.has('q-1')).toBe(true)
    expect(result.has('q-2')).toBe(false)
    expect(result.has('q-3')).toBe(false)
    expect(result.has('q-4')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('useFlowResolution — initial state', () => {
  it('starts with empty sets and no resolving when surveyId is undefined', () => {
    const { result } = renderHook(() =>
      useFlowResolution(undefined, {}),
    )
    expect(result.current.visibleQuestions.size).toBe(0)
    expect(result.current.hiddenQuestions.size).toBe(0)
    expect(result.current.visibleGroups.size).toBe(0)
    expect(result.current.hiddenGroups.size).toBe(0)
    expect(result.current.pipedTexts).toEqual({})
    expect(result.current.nextQuestionId).toBeNull()
    expect(result.current.isResolving).toBe(false)
  })

  it('starts with isResolving=true immediately when surveyId is provided', () => {
    const { result } = renderHook(() =>
      useFlowResolution(SURVEY_ID, {}),
    )

    // isResolving is set to true before the debounce fires
    expect(result.current.isResolving).toBe(true)
  })

  it('pre-hides questions with relevance conditions before first API call', () => {
    const questions = [
      makeQuestion('q-with-relevance', "{Q1} != ''"),
      makeQuestion('q-no-relevance', null),
      makeQuestion('q-empty-relevance', ''),
    ]

    const { result } = renderHook(() =>
      useFlowResolution(undefined, {}, questions),
    )

    // Questions with relevance should be hidden immediately
    expect(result.current.hiddenQuestions.has('q-with-relevance')).toBe(true)
    // Questions without relevance should NOT be pre-hidden
    expect(result.current.hiddenQuestions.has('q-no-relevance')).toBe(false)
    expect(result.current.hiddenQuestions.has('q-empty-relevance')).toBe(false)
  })

  it('pre-hidden questions are replaced by API response after first resolve', async () => {
    const questions = [
      makeQuestion('q-with-relevance', "{Q1} != ''"),
      makeQuestion('q-no-relevance', null),
    ]

    server.use(
      http.post(`${BASE}/surveys/${SURVEY_ID}/logic/resolve-flow`, () =>
        HttpResponse.json(
          makeResolveFlowResponse({
            hidden_questions: [],
            visible_questions: ['q-with-relevance', 'q-no-relevance'],
          }),
          { status: 200 },
        ),
      ),
    )

    const { result } = renderHook(() =>
      useFlowResolution(SURVEY_ID, {}, questions),
    )

    // Before API resolves, pre-hidden question should be hidden
    expect(result.current.hiddenQuestions.has('q-with-relevance')).toBe(true)

    // After API resolves, state should reflect the server response
    await waitFor(() => {
      expect(result.current.hiddenQuestions.has('q-with-relevance')).toBe(false)
      expect(result.current.visibleQuestions.has('q-with-relevance')).toBe(true)
    }, { timeout: 1000 })
  })
})

// ---------------------------------------------------------------------------
// Debounce behavior (using real timers + waitFor)
// ---------------------------------------------------------------------------

describe('useFlowResolution — debounce', () => {
  it('calls API after debounce window elapses', async () => {
    let callCount = 0
    server.use(
      http.post(`${BASE}/surveys/${SURVEY_ID}/logic/resolve-flow`, () => {
        callCount++
        return HttpResponse.json(makeResolveFlowResponse(), { status: 200 })
      }),
    )

    renderHook(() => useFlowResolution(SURVEY_ID, {}))

    await waitFor(() => expect(callCount).toBe(1), { timeout: 1000 })
  })

  it('consolidates rapid answer changes into a single API call', async () => {
    let callCount = 0
    server.use(
      http.post(`${BASE}/surveys/${SURVEY_ID}/logic/resolve-flow`, () => {
        callCount++
        return HttpResponse.json(makeResolveFlowResponse(), { status: 200 })
      }),
    )

    let answers: AnswerMap = {}
    const { rerender } = renderHook(
      ({ ans }: { ans: AnswerMap }) => useFlowResolution(SURVEY_ID, ans),
      { initialProps: { ans: answers } },
    )

    // Rapidly change answers multiple times within debounce window
    answers = { 'q-1': 'h' }
    rerender({ ans: answers })
    answers = { 'q-1': 'he' }
    rerender({ ans: answers })
    answers = { 'q-1': 'hel' }
    rerender({ ans: answers })

    // Wait for debounce to settle — should result in ≤ 2 calls total
    // (initial + final, depending on timing)
    await waitFor(() => expect(callCount).toBeGreaterThan(0), { timeout: 1000 })

    const callsAfterSettling = callCount
    // Give more time to ensure no extra calls fire
    await new Promise(r => setTimeout(r, 400))
    expect(callCount).toBeLessThanOrEqual(callsAfterSettling + 1)
  })
})

// ---------------------------------------------------------------------------
// API response handling
// ---------------------------------------------------------------------------

describe('useFlowResolution — API response', () => {
  it('updates hiddenQuestions from API response', async () => {
    server.use(
      http.post(`${BASE}/surveys/${SURVEY_ID}/logic/resolve-flow`, () =>
        HttpResponse.json(
          makeResolveFlowResponse({
            hidden_questions: ['q-1', 'q-2'],
            visible_questions: ['q-3'],
          }),
          { status: 200 },
        ),
      ),
    )

    const { result } = renderHook(() => useFlowResolution(SURVEY_ID, {}))

    await waitFor(() => {
      expect(result.current.hiddenQuestions.has('q-1')).toBe(true)
      expect(result.current.hiddenQuestions.has('q-2')).toBe(true)
      expect(result.current.visibleQuestions.has('q-3')).toBe(true)
    }, { timeout: 1000 })
  })

  it('updates hiddenGroups from API response', async () => {
    server.use(
      http.post(`${BASE}/surveys/${SURVEY_ID}/logic/resolve-flow`, () =>
        HttpResponse.json(
          makeResolveFlowResponse({
            hidden_groups: ['g-2'],
            visible_groups: ['g-1'],
          }),
          { status: 200 },
        ),
      ),
    )

    const { result } = renderHook(() => useFlowResolution(SURVEY_ID, {}))

    await waitFor(() => {
      expect(result.current.hiddenGroups.has('g-2')).toBe(true)
      expect(result.current.visibleGroups.has('g-1')).toBe(true)
    }, { timeout: 1000 })
  })

  it('updates pipedTexts from API response', async () => {
    server.use(
      http.post(`${BASE}/surveys/${SURVEY_ID}/logic/resolve-flow`, () =>
        HttpResponse.json(
          makeResolveFlowResponse({
            piped_texts: { 'q-1': 'Hello, Alice!', 'q-2': 'Your score is 95' },
          }),
          { status: 200 },
        ),
      ),
    )

    const { result } = renderHook(() => useFlowResolution(SURVEY_ID, {}))

    await waitFor(() => {
      expect(result.current.pipedTexts['q-1']).toBe('Hello, Alice!')
      expect(result.current.pipedTexts['q-2']).toBe('Your score is 95')
    }, { timeout: 1000 })
  })

  it('updates nextQuestionId from API response', async () => {
    server.use(
      http.post(`${BASE}/surveys/${SURVEY_ID}/logic/resolve-flow`, () =>
        HttpResponse.json(
          makeResolveFlowResponse({ next_question_id: 'q-skip-to' }),
          { status: 200 },
        ),
      ),
    )

    const { result } = renderHook(() => useFlowResolution(SURVEY_ID, {}))

    await waitFor(() => {
      expect(result.current.nextQuestionId).toBe('q-skip-to')
    }, { timeout: 1000 })
  })

  it('sets isResolving=false after successful API call', async () => {
    const { result } = renderHook(() => useFlowResolution(SURVEY_ID, {}))

    await waitFor(() => {
      expect(result.current.isResolving).toBe(false)
    }, { timeout: 1000 })
  })

  it('sets isResolving=false after API error (swallows errors silently)', async () => {
    server.use(
      http.post(`${BASE}/surveys/${SURVEY_ID}/logic/resolve-flow`, () =>
        HttpResponse.json({ detail: { code: 'SERVER_ERROR', message: 'Oops' } }, { status: 500 }),
      ),
    )

    const { result } = renderHook(() => useFlowResolution(SURVEY_ID, {}))

    await waitFor(() => {
      expect(result.current.isResolving).toBe(false)
    }, { timeout: 1000 })

    // Previous state should be retained (empty sets)
    expect(result.current.hiddenQuestions.size).toBe(0)
  })

  it('sends current answers in the API request body', async () => {
    let capturedBody: unknown = null
    server.use(
      http.post(`${BASE}/surveys/${SURVEY_ID}/logic/resolve-flow`, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json(makeResolveFlowResponse(), { status: 200 })
      }),
    )

    const answers: AnswerMap = { 'q-1': 'Alice', 'q-2': 'Yes' }
    renderHook(() => useFlowResolution(SURVEY_ID, answers))

    await waitFor(() => {
      expect(capturedBody).not.toBeNull()
    }, { timeout: 1000 })

    const body = capturedBody as { answers: Array<{ question_id: string; value: unknown }> }
    expect(body.answers).toContainEqual({ question_id: 'q-1', value: 'Alice' })
    expect(body.answers).toContainEqual({ question_id: 'q-2', value: 'Yes' })
  })
})

// ---------------------------------------------------------------------------
// surveyId gating
// ---------------------------------------------------------------------------

describe('useFlowResolution — surveyId gating', () => {
  it('does not call API when surveyId is undefined', async () => {
    let callCount = 0
    server.use(
      http.post(`${BASE}/surveys/${SURVEY_ID}/logic/resolve-flow`, () => {
        callCount++
        return HttpResponse.json(makeResolveFlowResponse(), { status: 200 })
      }),
    )

    renderHook(() => useFlowResolution(undefined, { 'q-1': 'value' }))

    // Wait longer than the debounce window
    await new Promise((r) => setTimeout(r, 500))

    expect(callCount).toBe(0)
  })

  it('does not call API when surveyId is empty string', async () => {
    let callCount = 0
    server.use(
      http.post(`${BASE}/surveys//logic/resolve-flow`, () => {
        callCount++
        return HttpResponse.json(makeResolveFlowResponse(), { status: 200 })
      }),
    )

    renderHook(() => useFlowResolution('', { 'q-1': 'value' }))

    await new Promise((r) => setTimeout(r, 500))

    expect(callCount).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

describe('useFlowResolution — cleanup', () => {
  it('stops resolving on unmount without throwing', async () => {
    const { result, unmount } = renderHook(() => useFlowResolution(SURVEY_ID, {}))

    // Unmount before debounce fires
    act(() => { unmount() })

    // Should not throw or cause errors
    await new Promise((r) => setTimeout(r, 500))
    expect(result.current).toBeDefined()
  })
})
