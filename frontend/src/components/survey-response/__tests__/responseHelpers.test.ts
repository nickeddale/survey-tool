/**
 * Unit tests for responseHelpers.ts
 *
 * Tests applyPipedText and buildVisibleSurvey with pipedTexts shapes
 * that match the backend's pipe_all() output format:
 *   - {code}_title       → resolved question title
 *   - {code}_description → resolved question description
 *   - {code}_{opt_code}_title → resolved answer option label
 */

import { describe, it, expect } from 'vitest'
import { applyPipedText, buildVisibleSurvey } from '../responseHelpers'
import type { SurveyFullResponse } from '../../../types/survey'

// ---------------------------------------------------------------------------
// Minimal survey fixture
// ---------------------------------------------------------------------------

function makeSurvey(overrides: Partial<SurveyFullResponse> = {}): SurveyFullResponse {
  return {
    id: 'survey-1',
    user_id: 'user-1',
    title: 'Test Survey',
    description: null,
    status: 'active',
    welcome_message: null,
    end_message: null,
    default_language: 'en',
    settings: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    questions: [],
    options: [],
    groups: [
      {
        id: 'g1',
        survey_id: 'survey-1',
        title: 'Group 1',
        description: null,
        sort_order: 1,
        relevance: null,
        created_at: '2024-01-01T00:00:00Z',
        questions: [
          {
            id: 'q1',
            group_id: 'g1',
            parent_id: null,
            question_type: 'short_text',
            code: 'NAME',
            title: 'What is your name?',
            description: null,
            is_required: true,
            sort_order: 1,
            relevance: null,
            validation: null,
            settings: null,
            created_at: '2024-01-01T00:00:00Z',
            subquestions: [],
            answer_options: [],
          },
          {
            id: 'q2',
            group_id: 'g1',
            parent_id: null,
            question_type: 'short_text',
            code: 'GREETING',
            title: 'Hello {NAME}, how are you today?',
            description: 'Tell us, {NAME}!',
            is_required: false,
            sort_order: 2,
            relevance: null,
            validation: null,
            settings: null,
            created_at: '2024-01-01T00:00:00Z',
            subquestions: [],
            answer_options: [
              {
                id: 'opt1',
                question_id: 'q2',
                code: 'OPT1',
                title: 'Option for {NAME}',
                sort_order: 1,
                assessment_value: 0,
                created_at: '2024-01-01T00:00:00Z',
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// applyPipedText
// ---------------------------------------------------------------------------

describe('applyPipedText', () => {
  it('returns text unchanged when pipedTexts is empty', () => {
    expect(applyPipedText('Hello {NAME}!', {})).toBe('Hello {NAME}!')
  })

  it('replaces a single placeholder when key exists', () => {
    expect(applyPipedText('Hello {NAME}!', { NAME: 'Alice' })).toBe('Hello Alice!')
  })

  it('replaces multiple placeholders', () => {
    expect(applyPipedText('{A} and {B}', { A: 'foo', B: 'bar' })).toBe('foo and bar')
  })

  it('leaves unknown placeholders intact', () => {
    expect(applyPipedText('Hello {UNKNOWN}!', { NAME: 'Alice' })).toBe('Hello {UNKNOWN}!')
  })

  it('returns text with no placeholders unchanged', () => {
    expect(applyPipedText('No placeholders here', { NAME: 'Alice' })).toBe('No placeholders here')
  })
})

// ---------------------------------------------------------------------------
// buildVisibleSurvey — piping behaviour
// ---------------------------------------------------------------------------

describe('buildVisibleSurvey — piped text substitution', () => {
  it('uses pre-resolved title from pipedTexts keyed by {code}_title', () => {
    const survey = makeSurvey()
    // Backend returns keys like GREETING_title with substitution already applied
    const pipedTexts: Record<string, string> = {
      NAME_title: 'What is your name?',
      GREETING_title: 'Hello Alice, how are you today?',
      GREETING_description: 'Tell us, Alice!',
      'GREETING_OPT1_title': 'Option for Alice',
    }

    const result = buildVisibleSurvey(survey, new Set(), new Set(), pipedTexts)
    const greetingQ = result.groups[0].questions.find((q) => q.code === 'GREETING')!

    expect(greetingQ.title).toBe('Hello Alice, how are you today?')
    expect(greetingQ.description).toBe('Tell us, Alice!')
    expect(greetingQ.answer_options[0].title).toBe('Option for Alice')
  })

  it('falls back to original title when pipedTexts has no entry for this question', () => {
    const survey = makeSurvey()
    const pipedTexts: Record<string, string> = {}

    const result = buildVisibleSurvey(survey, new Set(), new Set(), pipedTexts)
    const greetingQ = result.groups[0].questions.find((q) => q.code === 'GREETING')!

    // No substitution available — raw title with {NAME} token kept as-is
    expect(greetingQ.title).toBe('Hello {NAME}, how are you today?')
  })

  it('falls back to original description when pipedTexts has no entry', () => {
    const survey = makeSurvey()
    const pipedTexts: Record<string, string> = {
      GREETING_title: 'Hello Alice, how are you today?',
      // No GREETING_description entry
    }

    const result = buildVisibleSurvey(survey, new Set(), new Set(), pipedTexts)
    const greetingQ = result.groups[0].questions.find((q) => q.code === 'GREETING')!

    expect(greetingQ.description).toBe('Tell us, {NAME}!')
  })

  it('preserves null description as null', () => {
    const survey = makeSurvey()
    const pipedTexts: Record<string, string> = {
      NAME_title: 'What is your name?',
    }

    const result = buildVisibleSurvey(survey, new Set(), new Set(), pipedTexts)
    const nameQ = result.groups[0].questions.find((q) => q.code === 'NAME')!

    expect(nameQ.description).toBeNull()
  })

  it('falls back to original option title when pipedTexts has no entry', () => {
    const survey = makeSurvey()
    const pipedTexts: Record<string, string> = {
      GREETING_title: 'Hello Alice, how are you today?',
      // No option entry
    }

    const result = buildVisibleSurvey(survey, new Set(), new Set(), pipedTexts)
    const greetingQ = result.groups[0].questions.find((q) => q.code === 'GREETING')!

    expect(greetingQ.answer_options[0].title).toBe('Option for {NAME}')
  })
})

// ---------------------------------------------------------------------------
// buildVisibleSurvey — visibility filtering
// ---------------------------------------------------------------------------

describe('buildVisibleSurvey — visibility filtering', () => {
  it('removes hidden questions', () => {
    const survey = makeSurvey()
    const result = buildVisibleSurvey(survey, new Set(['q2']), new Set(), {})

    const qIds = result.groups[0].questions.map((q) => q.id)
    expect(qIds).toContain('q1')
    expect(qIds).not.toContain('q2')
  })

  it('removes hidden groups entirely', () => {
    const survey = makeSurvey()
    const result = buildVisibleSurvey(survey, new Set(), new Set(['g1']), {})

    expect(result.groups).toHaveLength(0)
  })

  it('preserves all questions when hiddenQuestions is empty', () => {
    const survey = makeSurvey()
    const result = buildVisibleSurvey(survey, new Set(), new Set(), {})

    expect(result.groups[0].questions).toHaveLength(2)
  })

  it('does not mutate the original survey', () => {
    const survey = makeSurvey()
    const originalTitle = survey.groups[0].questions[1].title

    buildVisibleSurvey(survey, new Set(), new Set(), { GREETING_title: 'Hello Alice, how are you today?' })

    expect(survey.groups[0].questions[1].title).toBe(originalTitle)
  })
})
