/**
 * Unit tests for TranslationEditor component.
 *
 * Tests:
 * - Renders source fields as read-only
 * - Renders editable target fields
 * - Language selector changes target language
 * - Changing a field triggers debounced PATCH
 * - Save indicator updates correctly
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { TranslationEditor } from '../TranslationEditor'
import type { SurveyFullResponse } from '../../../types/survey'
import surveyService from '../../../services/surveyService'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../services/surveyService', () => ({
  default: {
    updateSurveyTranslations: vi.fn().mockResolvedValue({}),
    updateGroupTranslations: vi.fn().mockResolvedValue({}),
    updateQuestionTranslations: vi.fn().mockResolvedValue({}),
    updateOptionTranslations: vi.fn().mockResolvedValue({}),
  },
}))

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockSurvey: SurveyFullResponse = {
  id: 'survey-1',
  user_id: 'user-1',
  title: 'My Survey',
  description: 'English description',
  status: 'draft',
  welcome_message: 'Welcome!',
  end_message: 'Thank you!',
  default_language: 'en',
  settings: null,
  translations: {
    fr: { title: 'Mon Enquête', description: 'Description française' },
  },
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  groups: [],
  questions: [],
  options: [],
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderSurveyTarget(overrides: Partial<typeof mockSurvey> = {}) {
  const survey = { ...mockSurvey, ...overrides }
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <TranslationEditor
        surveyId="survey-1"
        target={{ type: 'survey', survey }}
        defaultLanguage="en"
        availableLanguages={['fr', 'es']}
      />
    </MemoryRouter>
  )
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TranslationEditor', () => {
  describe('rendering', () => {
    it('renders source fields as read-only', () => {
      renderSurveyTarget()
      const sourceTitleField = screen.getByTestId('source-field-title')
      expect(sourceTitleField).toBeInTheDocument()
      expect(sourceTitleField).toHaveAttribute('readonly')
    })

    it('shows source field values from the entity', () => {
      renderSurveyTarget()
      const sourceTitleField = screen.getByTestId('source-field-title')
      expect(sourceTitleField).toHaveValue('My Survey')
    })

    it('renders editable target fields', () => {
      renderSurveyTarget()
      const targetTitleField = screen.getByTestId('target-field-title')
      expect(targetTitleField).toBeInTheDocument()
      expect(targetTitleField).not.toHaveAttribute('readonly')
    })

    it('pre-fills target fields from existing translations', () => {
      renderSurveyTarget()
      const targetTitleField = screen.getByTestId('target-field-title')
      expect(targetTitleField).toHaveValue('Mon Enquête')
    })

    it('renders target language selector', () => {
      renderSurveyTarget()
      const select = screen.getByTestId('target-lang-select')
      expect(select).toBeInTheDocument()
    })

    it('renders survey-specific fields (welcome_message, end_message)', () => {
      renderSurveyTarget()
      expect(screen.getByTestId('source-field-welcome_message')).toBeInTheDocument()
      expect(screen.getByTestId('source-field-end_message')).toBeInTheDocument()
    })
  })

  describe('language selection', () => {
    it('changes target language when selector changes', async () => {
      const user = userEvent.setup()
      renderSurveyTarget()

      const select = screen.getByTestId('target-lang-select')
      await user.selectOptions(select, 'es')

      // Target title field should now be empty (no Spanish translations)
      const targetTitleField = screen.getByTestId('target-field-title')
      expect(targetTitleField).toHaveValue('')
    })
  })

  describe('saving translations', () => {
    it('calls updateSurveyTranslations after debounce when field changes', async () => {
      const user = userEvent.setup()
      renderSurveyTarget()

      const targetTitleField = screen.getByTestId('target-field-title')
      await user.clear(targetTitleField)
      await user.type(targetTitleField, 'Nouveau titre')

      // Wait for debounce (800ms) + network call
      await waitFor(
        () => {
          expect(surveyService.updateSurveyTranslations).toHaveBeenCalledWith(
            'survey-1',
            expect.objectContaining({
              lang: 'fr',
              translations: expect.objectContaining({ title: 'Nouveau titre' }),
            })
          )
        },
        { timeout: 2000 }
      )
    }, 5000)

    it('sends null for empty field to remove translation', async () => {
      const user = userEvent.setup()
      renderSurveyTarget()

      const targetTitleField = screen.getByTestId('target-field-title')
      await user.clear(targetTitleField)

      await waitFor(
        () => {
          expect(surveyService.updateSurveyTranslations).toHaveBeenCalledWith(
            'survey-1',
            expect.objectContaining({
              translations: expect.objectContaining({ title: null }),
            })
          )
        },
        { timeout: 2000 }
      )
    }, 5000)
  })

  describe('entity types', () => {
    it('renders only group-specific fields for group target', () => {
      const group = {
        id: 'group-1',
        survey_id: 'survey-1',
        title: 'Group Title',
        description: 'Group desc',
        sort_order: 1,
        relevance: null,
        translations: {},
        created_at: '2024-01-01T00:00:00Z',
        questions: [],
      }
      render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <TranslationEditor
            surveyId="survey-1"
            target={{ type: 'group', survey: mockSurvey, group }}
            defaultLanguage="en"
            availableLanguages={['fr']}
          />
        </MemoryRouter>
      )
      expect(screen.getByTestId('source-field-title')).toBeInTheDocument()
      expect(screen.getByTestId('source-field-description')).toBeInTheDocument()
      expect(screen.queryByTestId('source-field-welcome_message')).not.toBeInTheDocument()
    })

    it('renders only title for answer option target', () => {
      const option = {
        id: 'option-1',
        question_id: 'question-1',
        code: 'A',
        title: 'Option A',
        sort_order: 1,
        assessment_value: 0,
        translations: {},
        created_at: '2024-01-01T00:00:00Z',
      }
      const group = {
        id: 'group-1',
        survey_id: 'survey-1',
        title: 'Group',
        description: null,
        sort_order: 1,
        relevance: null,
        translations: {},
        created_at: '2024-01-01T00:00:00Z',
        questions: [],
      }
      const question = {
        id: 'question-1',
        group_id: 'group-1',
        parent_id: null,
        question_type: 'single_choice',
        code: 'Q1',
        title: 'Question',
        description: null,
        is_required: false,
        sort_order: 1,
        relevance: null,
        validation: null,
        settings: null,
        translations: {},
        created_at: '2024-01-01T00:00:00Z',
        subquestions: [],
        answer_options: [option],
      }
      render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <TranslationEditor
            surveyId="survey-1"
            target={{ type: 'option', survey: mockSurvey, group, question, option }}
            defaultLanguage="en"
            availableLanguages={['fr']}
          />
        </MemoryRouter>
      )
      expect(screen.getByTestId('source-field-title')).toBeInTheDocument()
      expect(screen.queryByTestId('source-field-description')).not.toBeInTheDocument()
    })
  })
})
