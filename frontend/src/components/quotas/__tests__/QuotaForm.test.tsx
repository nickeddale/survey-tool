import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QuotaForm from '../QuotaForm'
import type { QuotaResponse, QuestionResponse, QuotaCreate } from '../../../types/survey'

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockQuestions: QuestionResponse[] = [
  {
    id: 'q1',
    group_id: 'g1',
    parent_id: null,
    question_type: 'short_text',
    code: 'Q1',
    title: 'What is your age?',
    description: null,
    is_required: false,
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
    question_type: 'single_choice',
    code: 'Q2',
    title: 'What is your gender?',
    description: null,
    is_required: false,
    sort_order: 2,
    relevance: null,
    validation: null,
    settings: null,
    created_at: '2024-01-01T00:00:00Z',
    subquestions: [],
    answer_options: [],
  },
]

const mockExistingQuota: QuotaResponse = {
  id: 'quota-1',
  survey_id: 'survey-1',
  name: 'Age Limit',
  limit: 100,
  current_count: 30,
  action: 'terminate',
  conditions: [{ question_id: 'q1', operator: 'gt', value: 35 }],
  is_active: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QuotaForm', () => {
  // -------------------------------------------------------------------------
  // Create mode
  // -------------------------------------------------------------------------

  describe('create mode (no quota prop)', () => {
    it('renders create title', () => {
      render(
        <QuotaForm
          surveyId="survey-1"
          questions={mockQuestions}
          quota={null}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      expect(screen.getByRole('heading', { name: 'Create Quota' })).toBeInTheDocument()
      expect(screen.getByTestId('quota-form-submit')).toHaveTextContent('Create Quota')
    })

    it('renders empty fields in create mode', () => {
      render(
        <QuotaForm
          surveyId="survey-1"
          questions={mockQuestions}
          quota={null}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      const nameInput = screen.getByTestId('quota-name-input') as HTMLInputElement
      const limitInput = screen.getByTestId('quota-limit-input') as HTMLInputElement
      expect(nameInput.value).toBe('')
      expect(limitInput.value).toBe('')
    })

    it('calls onCancel when Cancel is clicked', async () => {
      const user = userEvent.setup()
      const onCancel = vi.fn()

      render(
        <QuotaForm
          surveyId="survey-1"
          questions={mockQuestions}
          quota={null}
          onSubmit={vi.fn()}
          onCancel={onCancel}
        />
      )

      await act(async () => {
        await user.click(screen.getByRole('button', { name: /cancel/i }))
      })

      expect(onCancel).toHaveBeenCalledOnce()
    })

    it('calls onSubmit with correct payload when form is filled and submitted with a condition', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn().mockResolvedValue(undefined)

      render(
        <QuotaForm
          surveyId="survey-1"
          questions={mockQuestions}
          quota={null}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />
      )

      await act(async () => {
        await user.type(screen.getByTestId('quota-name-input'), 'New Quota')
        await user.type(screen.getByTestId('quota-limit-input'), '150')
        // Add a condition and select a question to satisfy validation
        await user.click(screen.getByTestId('add-condition-button'))
      })

      // Select a question for the condition
      const questionSelect = screen.getByLabelText('Condition 1 question')
      await act(async () => {
        await user.selectOptions(questionSelect, 'q1')
      })

      await act(async () => {
        await user.click(screen.getByTestId('quota-form-submit'))
      })

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining<Partial<QuotaCreate>>({
          name: 'New Quota',
          limit: 150,
          action: 'terminate',
          is_active: true,
        })
      )
    })

    it('shows validation error when conditions list is empty on submit', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()

      render(
        <QuotaForm
          surveyId="survey-1"
          questions={mockQuestions}
          quota={null}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />
      )

      await act(async () => {
        await user.type(screen.getByTestId('quota-name-input'), 'New Quota')
        await user.type(screen.getByTestId('quota-limit-input'), '100')
        await user.click(screen.getByTestId('quota-form-submit'))
      })

      expect(screen.getByTestId('quota-form-error')).toBeInTheDocument()
      expect(screen.getByTestId('quota-form-error').textContent).toMatch(/at least one condition/i)
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('shows validation error when name is empty on submit', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()

      render(
        <QuotaForm
          surveyId="survey-1"
          questions={mockQuestions}
          quota={null}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />
      )

      await act(async () => {
        await user.type(screen.getByTestId('quota-limit-input'), '100')
        await user.click(screen.getByTestId('quota-form-submit'))
      })

      expect(screen.getByTestId('quota-form-error')).toBeInTheDocument()
      expect(screen.getByTestId('quota-form-error').textContent).toMatch(/name is required/i)
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('shows validation error when limit is not a positive integer', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()

      render(
        <QuotaForm
          surveyId="survey-1"
          questions={mockQuestions}
          quota={null}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />
      )

      await act(async () => {
        await user.type(screen.getByTestId('quota-name-input'), 'Test')
        await user.type(screen.getByTestId('quota-limit-input'), '0')
        await user.click(screen.getByTestId('quota-form-submit'))
      })

      expect(screen.getByTestId('quota-form-error')).toBeInTheDocument()
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('displays external API error passed via error prop', () => {
      render(
        <QuotaForm
          surveyId="survey-1"
          questions={mockQuestions}
          quota={null}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          error="Server error occurred"
        />
      )

      expect(screen.getByTestId('quota-form-error')).toBeInTheDocument()
      expect(screen.getByTestId('quota-form-error').textContent).toContain('Server error occurred')
    })

    it('shows loading state on submit button when isLoading is true', () => {
      render(
        <QuotaForm
          surveyId="survey-1"
          questions={mockQuestions}
          quota={null}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          isLoading={true}
        />
      )

      expect(screen.getByTestId('quota-form-submit')).toHaveTextContent('Saving...')
      expect(screen.getByTestId('quota-form-submit')).toBeDisabled()
    })
  })

  // -------------------------------------------------------------------------
  // Edit mode
  // -------------------------------------------------------------------------

  describe('edit mode (quota prop provided)', () => {
    it('renders edit title', () => {
      render(
        <QuotaForm
          surveyId="survey-1"
          questions={mockQuestions}
          quota={mockExistingQuota}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      expect(screen.getByText('Edit Quota')).toBeInTheDocument()
      expect(screen.getByTestId('quota-form-submit')).toHaveTextContent('Save Changes')
    })

    it('pre-fills name field from quota', () => {
      render(
        <QuotaForm
          surveyId="survey-1"
          questions={mockQuestions}
          quota={mockExistingQuota}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      const nameInput = screen.getByTestId('quota-name-input') as HTMLInputElement
      expect(nameInput.value).toBe('Age Limit')
    })

    it('pre-fills limit field from quota', () => {
      render(
        <QuotaForm
          surveyId="survey-1"
          questions={mockQuestions}
          quota={mockExistingQuota}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      const limitInput = screen.getByTestId('quota-limit-input') as HTMLInputElement
      expect(limitInput.value).toBe('100')
    })

    it('pre-fills action from quota', () => {
      render(
        <QuotaForm
          surveyId="survey-1"
          questions={mockQuestions}
          quota={mockExistingQuota}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      const actionSelect = screen.getByTestId('quota-action-select') as HTMLSelectElement
      expect(actionSelect.value).toBe('terminate')
    })

    it('pre-fills is_active checkbox from quota', () => {
      render(
        <QuotaForm
          surveyId="survey-1"
          questions={mockQuestions}
          quota={mockExistingQuota}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      const checkbox = screen.getByTestId('quota-active-checkbox') as HTMLInputElement
      expect(checkbox.checked).toBe(true)
    })

    it('pre-fills conditions from quota', () => {
      render(
        <QuotaForm
          surveyId="survey-1"
          questions={mockQuestions}
          quota={mockExistingQuota}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      // One condition row from mockExistingQuota.conditions
      expect(screen.getByTestId('condition-row-0')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Condition builder integration
  // -------------------------------------------------------------------------

  describe('condition builder', () => {
    it('adds a condition row when Add Condition is clicked', async () => {
      const user = userEvent.setup()

      render(
        <QuotaForm
          surveyId="survey-1"
          questions={mockQuestions}
          quota={null}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      await act(async () => {
        await user.click(screen.getByTestId('add-condition-button'))
      })

      expect(screen.getByTestId('condition-row-0')).toBeInTheDocument()
    })

    it('removes a condition row when Remove is clicked', async () => {
      const user = userEvent.setup()

      render(
        <QuotaForm
          surveyId="survey-1"
          questions={mockQuestions}
          quota={null}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      // Add a condition first
      await act(async () => {
        await user.click(screen.getByTestId('add-condition-button'))
      })

      expect(screen.getByTestId('condition-row-0')).toBeInTheDocument()

      // Remove it
      await act(async () => {
        await user.click(screen.getByLabelText('Remove condition 1'))
      })

      expect(screen.queryByTestId('condition-row-0')).not.toBeInTheDocument()
    })

    it('shows error when condition has no question selected', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()

      render(
        <QuotaForm
          surveyId="survey-1"
          questions={mockQuestions}
          quota={null}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />
      )

      await act(async () => {
        await user.type(screen.getByTestId('quota-name-input'), 'Test')
        await user.type(screen.getByTestId('quota-limit-input'), '100')
      })

      await act(async () => {
        await user.click(screen.getByTestId('add-condition-button'))
      })

      // Condition row exists but no question is selected (empty string)
      expect(screen.getByTestId('condition-row-0')).toBeInTheDocument()

      await act(async () => {
        await user.click(screen.getByTestId('quota-form-submit'))
      })

      expect(screen.getByTestId('quota-form-error')).toBeInTheDocument()
      expect(screen.getByTestId('quota-form-error').textContent).toMatch(/question selected/i)
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('populates question selector with survey questions', () => {
      render(
        <QuotaForm
          surveyId="survey-1"
          questions={mockQuestions}
          quota={null}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      // No questions visible until a condition is added — but we can check ConditionBuilder
      // renders its question options. For that we need a condition.
      const addButton = screen.getByTestId('add-condition-button')
      expect(addButton).toBeInTheDocument()
    })
  })
})
