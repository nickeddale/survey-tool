/**
 * Unit tests for SurveyForm component.
 *
 * Tests rendering, progress bar, navigation button visibility,
 * and that question inputs are rendered for each question type.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SurveyFullResponse } from '../../../types/survey'
import { SurveyForm } from '../SurveyForm'
import type { AnswerMap, ValidationErrors } from '../../../hooks/useValidation'

// ---------------------------------------------------------------------------
// Mock survey data
// ---------------------------------------------------------------------------

const mockSurvey: SurveyFullResponse = {
  id: 'survey-1',
  user_id: 'user-1',
  title: 'Test Survey',
  description: 'A test survey',
  status: 'active',
  welcome_message: 'Welcome!',
  end_message: 'Thanks!',
  default_language: 'en',
  settings: { one_page_per_group: true },
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  groups: [
    {
      id: 'g1',
      survey_id: 'survey-1',
      title: 'Group 1',
      description: 'First group',
      sort_order: 1,
      relevance: null,
      created_at: '2024-01-01T00:00:00Z',
      questions: [
        {
          id: 'q1',
          group_id: 'g1',
          parent_id: null,
          question_type: 'short_text',
          code: 'Q1',
          title: 'What is your name?',
          description: 'Please enter your full name',
          is_required: true,
          sort_order: 1,
          relevance: null,
          validation: null,
          settings: null,
          created_at: '2024-01-01T00:00:00Z',
          subquestions: [],
          answer_options: [],
        },
      ],
    },
    {
      id: 'g2',
      survey_id: 'survey-1',
      title: 'Group 2',
      description: null,
      sort_order: 2,
      relevance: null,
      created_at: '2024-01-01T00:00:00Z',
      questions: [
        {
          id: 'q2',
          group_id: 'g2',
          parent_id: null,
          question_type: 'single_choice',
          code: 'Q2',
          title: 'How do you rate us?',
          description: null,
          is_required: false,
          sort_order: 1,
          relevance: null,
          validation: null,
          settings: null,
          created_at: '2024-01-01T00:00:00Z',
          subquestions: [],
          answer_options: [
            { id: 'o1', question_id: 'q2', code: 'A1', title: 'Good', sort_order: 1, assessment_value: 1, created_at: '2024-01-01T00:00:00Z' },
          ],
        },
      ],
    },
  ],
  questions: [],
  options: [],
}

const mockSinglePageSurvey: SurveyFullResponse = {
  ...mockSurvey,
  settings: { one_page_per_group: false },
}

const defaultAnswers: AnswerMap = {}
const defaultErrors: ValidationErrors = {}
const noop = () => {}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

interface RenderFormProps {
  currentPage?: number
  answers?: AnswerMap
  errors?: ValidationErrors
  isSubmitting?: boolean
  onChange?: (qid: string, value: unknown) => void
  onNext?: () => void
  onPrev?: () => void
  onSubmit?: () => void
  survey?: SurveyFullResponse
}

function renderForm({
  currentPage = 0,
  answers = defaultAnswers,
  errors = defaultErrors,
  isSubmitting = false,
  onChange = noop,
  onNext = noop,
  onPrev = noop,
  onSubmit = noop,
  survey = mockSurvey,
}: RenderFormProps = {}) {
  return render(
    <SurveyForm
      survey={survey}
      currentPage={currentPage}
      answers={answers}
      errors={errors}
      isSubmitting={isSubmitting}
      onChange={onChange as never}
      onNext={onNext}
      onPrev={onPrev}
      onSubmit={onSubmit}
    />,
  )
}

// ---------------------------------------------------------------------------
// Basic rendering
// ---------------------------------------------------------------------------

describe('basic rendering', () => {
  it('renders the survey form', () => {
    renderForm()

    expect(screen.getByTestId('survey-form')).toBeInTheDocument()
  })

  it('renders questions for the current group (page 0)', () => {
    renderForm()

    expect(screen.getByTestId('form-group-g1')).toBeInTheDocument()
    expect(screen.getByTestId('form-group-title')).toHaveTextContent('Group 1')
    expect(screen.queryByTestId('form-group-g2')).not.toBeInTheDocument()
  })

  it('renders questions for page 1 when currentPage=1', () => {
    renderForm({ currentPage: 1 })

    expect(screen.getByTestId('form-group-g2')).toBeInTheDocument()
    expect(screen.getByTestId('form-group-title')).toHaveTextContent('Group 2')
    expect(screen.queryByTestId('form-group-g1')).not.toBeInTheDocument()
  })

  it('renders group description when present', () => {
    renderForm()

    expect(screen.getByTestId('form-group-description')).toHaveTextContent('First group')
  })

  it('renders question title', () => {
    renderForm()

    expect(screen.getByTestId('form-question-title')).toHaveTextContent('What is your name?')
  })

  it('renders question description when present', () => {
    renderForm()

    expect(screen.getByTestId('form-question-description')).toHaveTextContent('Please enter your full name')
  })

  it('shows required indicator for required questions', () => {
    renderForm()

    expect(screen.getByTestId('form-required-indicator')).toBeInTheDocument()
    expect(screen.getByTestId('form-required-indicator')).toHaveTextContent('*')
  })

  it('renders short_text input for short_text questions', () => {
    renderForm()

    expect(screen.getByTestId('short-text-input-q1')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

describe('progress bar', () => {
  it('shows progress bar in paged mode with multiple groups', () => {
    renderForm()

    expect(screen.getByTestId('form-progress-bar')).toBeInTheDocument()
  })

  it('shows correct progress on first page (1 of 2 → 50%)', () => {
    renderForm({ currentPage: 0 })

    expect(screen.getByTestId('form-progress-pct')).toHaveTextContent('50%')
  })

  it('shows correct progress on last page (2 of 2 → 100%)', () => {
    renderForm({ currentPage: 1 })

    expect(screen.getByTestId('form-progress-pct')).toHaveTextContent('100%')
  })

  it('does not show progress bar in single-page mode', () => {
    renderForm({ survey: mockSinglePageSurvey })

    expect(screen.queryByTestId('form-progress-bar')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Navigation buttons
// ---------------------------------------------------------------------------

describe('navigation buttons', () => {
  it('shows Previous button disabled on first page', () => {
    renderForm({ currentPage: 0 })

    expect(screen.getByTestId('form-previous-button')).toBeDisabled()
  })

  it('shows Previous button enabled on non-first pages', () => {
    renderForm({ currentPage: 1 })

    expect(screen.getByTestId('form-previous-button')).not.toBeDisabled()
  })

  it('shows Next button (not Submit) on non-last pages', () => {
    renderForm({ currentPage: 0 })

    expect(screen.getByTestId('form-next-button')).toBeInTheDocument()
    expect(screen.queryByTestId('form-submit-button')).not.toBeInTheDocument()
  })

  it('shows Submit button (not Next) on last page', () => {
    renderForm({ currentPage: 1 })

    expect(screen.getByTestId('form-submit-button')).toBeInTheDocument()
    expect(screen.queryByTestId('form-next-button')).not.toBeInTheDocument()
  })

  it('shows Submit button in single-page mode', () => {
    renderForm({ survey: mockSinglePageSurvey })

    expect(screen.getByTestId('form-submit-button')).toBeInTheDocument()
    expect(screen.queryByTestId('form-next-button')).not.toBeInTheDocument()
  })

  it('shows page indicator in paged mode', () => {
    renderForm({ currentPage: 0 })

    expect(screen.getByTestId('form-page-indicator')).toHaveTextContent('1 / 2')
  })

  it('shows page indicator updating with page', () => {
    renderForm({ currentPage: 1 })

    expect(screen.getByTestId('form-page-indicator')).toHaveTextContent('2 / 2')
  })

  it('disables buttons when isSubmitting', () => {
    renderForm({ currentPage: 1, isSubmitting: true })

    expect(screen.getByTestId('form-submit-button')).toBeDisabled()
    expect(screen.getByTestId('form-previous-button')).toBeDisabled()
  })

  it('shows Submitting text on submit button when submitting', () => {
    renderForm({ currentPage: 1, isSubmitting: true })

    expect(screen.getByTestId('form-submit-button')).toHaveTextContent(/submitting/i)
  })
})

// ---------------------------------------------------------------------------
// Button callbacks
// ---------------------------------------------------------------------------

describe('button callbacks', () => {
  it('calls onNext when Next button is clicked', async () => {
    const user = userEvent.setup()
    const onNext = vi.fn()
    renderForm({ onNext })

    await user.click(screen.getByTestId('form-next-button'))

    expect(onNext).toHaveBeenCalledOnce()
  })

  it('calls onPrev when Previous button is clicked on non-first page', async () => {
    const user = userEvent.setup()
    const onPrev = vi.fn()
    renderForm({ currentPage: 1, onPrev })

    await user.click(screen.getByTestId('form-previous-button'))

    expect(onPrev).toHaveBeenCalledOnce()
  })

  it('calls onSubmit when Submit button is clicked', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderForm({ currentPage: 1, onSubmit })

    await user.click(screen.getByTestId('form-submit-button'))

    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('calls onChange when a question answer changes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderForm({ onChange })

    const input = screen.getByTestId('short-text-input')
    await user.type(input, 'A')

    expect(onChange).toHaveBeenCalledWith('q1', 'A')
  })
})

// ---------------------------------------------------------------------------
// Validation errors display
// ---------------------------------------------------------------------------

describe('validation errors', () => {
  it('passes external errors to question inputs', () => {
    const errors: ValidationErrors = { q1: ['This field is required.'] }
    renderForm({ errors })

    // ShortTextInput renders errors when externalErrors prop is provided
    expect(screen.getByTestId('validation-errors')).toBeInTheDocument()
    expect(screen.getByTestId('validation-errors')).toHaveTextContent('This field is required.')
  })
})

// ---------------------------------------------------------------------------
// Single-page mode
// ---------------------------------------------------------------------------

describe('single-page mode', () => {
  it('renders all groups in single-page mode', () => {
    renderForm({ survey: mockSinglePageSurvey })

    expect(screen.getByTestId('form-all-groups')).toBeInTheDocument()
    expect(screen.getByTestId('form-group-g1')).toBeInTheDocument()
    expect(screen.getByTestId('form-group-g2')).toBeInTheDocument()
  })

  it('does not show page indicator in single-page mode', () => {
    renderForm({ survey: mockSinglePageSurvey })

    // No page indicator in single-page mode (one_page_per_group is false)
    // The form-page-indicator is only shown when onePagePerGroup is true
    // Since single-page mode means one page total, indicator isn't needed
    expect(screen.queryByTestId('form-page-indicator')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// single_choice question type regression (ISS-165)
// ---------------------------------------------------------------------------

describe('single_choice question type', () => {
  it('renders RadioInput for single_choice questions (not the unsupported fallback)', () => {
    // Navigate to page 1 which has the single_choice question (group g2)
    renderForm({ currentPage: 1 })

    expect(screen.getByTestId('radio-input-q2')).toBeInTheDocument()
    expect(screen.queryByTestId('unknown-question-type')).not.toBeInTheDocument()
  })

  it('renders single_choice RadioInput in single-page mode', () => {
    renderForm({ survey: mockSinglePageSurvey })

    expect(screen.getByTestId('radio-input-q2')).toBeInTheDocument()
    expect(screen.queryByTestId('unknown-question-type')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Empty group
// ---------------------------------------------------------------------------

describe('empty group', () => {
  it('shows empty message when group has no questions', () => {
    const emptyGroupSurvey: SurveyFullResponse = {
      ...mockSurvey,
      groups: [
        {
          id: 'g-empty',
          survey_id: 'survey-1',
          title: 'Empty Group',
          description: null,
          sort_order: 1,
          relevance: null,
          created_at: '2024-01-01T00:00:00Z',
          questions: [],
        },
      ],
    }
    renderForm({ survey: emptyGroupSurvey })

    expect(screen.getByTestId('form-group-empty')).toBeInTheDocument()
  })
})
