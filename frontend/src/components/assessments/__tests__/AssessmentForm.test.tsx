import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AssessmentForm from '../AssessmentForm'
import type { AssessmentResponse, QuestionGroupResponse, AssessmentCreate } from '../../../types/survey'

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockGroups: QuestionGroupResponse[] = [
  {
    id: 'g1',
    survey_id: 'survey-1',
    title: 'General Questions',
    description: null,
    sort_order: 1,
    relevance: null,
    created_at: '2024-01-01T00:00:00Z',
    questions: [],
  },
  {
    id: 'g2',
    survey_id: 'survey-1',
    title: 'Feedback Section',
    description: null,
    sort_order: 2,
    relevance: null,
    created_at: '2024-01-01T00:00:00Z',
    questions: [],
  },
]

const mockExistingAssessment: AssessmentResponse = {
  id: 'assessment-1',
  survey_id: 'survey-1',
  name: 'High Satisfaction',
  scope: 'total',
  group_id: null,
  min_score: 8,
  max_score: 10,
  message: 'You are very satisfied!',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const mockGroupAssessment: AssessmentResponse = {
  id: 'assessment-2',
  survey_id: 'survey-1',
  name: 'Group Low Score',
  scope: 'group',
  group_id: 'g1',
  min_score: 0,
  max_score: 3,
  message: 'Needs improvement.',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AssessmentForm', () => {
  // -------------------------------------------------------------------------
  // Create mode
  // -------------------------------------------------------------------------

  describe('create mode (no assessment prop)', () => {
    it('renders create title', () => {
      render(
        <AssessmentForm
          surveyId="survey-1"
          groups={mockGroups}
          assessment={null}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      )

      expect(screen.getByRole('heading', { name: 'Create Assessment' })).toBeInTheDocument()
      expect(screen.getByTestId('assessment-form-submit')).toHaveTextContent('Create Assessment')
    })

    it('renders empty fields in create mode', () => {
      render(
        <AssessmentForm
          surveyId="survey-1"
          groups={mockGroups}
          assessment={null}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      )

      expect((screen.getByTestId('assessment-name-input') as HTMLInputElement).value).toBe('')
      expect((screen.getByTestId('assessment-min-score-input') as HTMLInputElement).value).toBe('')
      expect((screen.getByTestId('assessment-max-score-input') as HTMLInputElement).value).toBe('')
      expect((screen.getByTestId('assessment-message-input') as HTMLTextAreaElement).value).toBe('')
    })

    it('defaults scope to total', () => {
      render(
        <AssessmentForm
          surveyId="survey-1"
          groups={mockGroups}
          assessment={null}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      )

      const scopeSelect = screen.getByTestId('assessment-scope-select') as HTMLSelectElement
      expect(scopeSelect.value).toBe('total')
    })

    it('does not show group selector when scope is total', () => {
      render(
        <AssessmentForm
          surveyId="survey-1"
          groups={mockGroups}
          assessment={null}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      )

      expect(screen.queryByTestId('assessment-group-select')).not.toBeInTheDocument()
    })

    it('shows group selector when scope is changed to group', async () => {
      const user = userEvent.setup()

      render(
        <AssessmentForm
          surveyId="survey-1"
          groups={mockGroups}
          assessment={null}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      )

      await act(async () => {
        await user.selectOptions(screen.getByTestId('assessment-scope-select'), 'group')
      })

      expect(screen.getByTestId('assessment-group-select')).toBeInTheDocument()
    })

    it('hides group selector when scope is changed back to total', async () => {
      const user = userEvent.setup()

      render(
        <AssessmentForm
          surveyId="survey-1"
          groups={mockGroups}
          assessment={null}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      )

      await act(async () => {
        await user.selectOptions(screen.getByTestId('assessment-scope-select'), 'group')
      })
      expect(screen.getByTestId('assessment-group-select')).toBeInTheDocument()

      await act(async () => {
        await user.selectOptions(screen.getByTestId('assessment-scope-select'), 'total')
      })
      expect(screen.queryByTestId('assessment-group-select')).not.toBeInTheDocument()
    })

    it('populates group selector with survey groups', async () => {
      const user = userEvent.setup()

      render(
        <AssessmentForm
          surveyId="survey-1"
          groups={mockGroups}
          assessment={null}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      )

      await act(async () => {
        await user.selectOptions(screen.getByTestId('assessment-scope-select'), 'group')
      })

      expect(screen.getByText('General Questions')).toBeInTheDocument()
      expect(screen.getByText('Feedback Section')).toBeInTheDocument()
    })

    it('calls onCancel when Cancel is clicked', async () => {
      const user = userEvent.setup()
      const onCancel = vi.fn()

      render(
        <AssessmentForm
          surveyId="survey-1"
          groups={mockGroups}
          assessment={null}
          onSubmit={vi.fn()}
          onCancel={onCancel}
        />,
      )

      await act(async () => {
        await user.click(screen.getByRole('button', { name: /cancel/i }))
      })

      expect(onCancel).toHaveBeenCalledOnce()
    })

    it('calls onSubmit with correct payload when form is fully filled', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn().mockResolvedValue(undefined)

      render(
        <AssessmentForm
          surveyId="survey-1"
          groups={mockGroups}
          assessment={null}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />,
      )

      await act(async () => {
        await user.type(screen.getByTestId('assessment-name-input'), 'My Assessment')
        await user.type(screen.getByTestId('assessment-min-score-input'), '5')
        await user.type(screen.getByTestId('assessment-max-score-input'), '10')
        await user.type(screen.getByTestId('assessment-message-input'), 'Great job!')
      })

      await act(async () => {
        await user.click(screen.getByTestId('assessment-form-submit'))
      })

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining<Partial<AssessmentCreate>>({
          name: 'My Assessment',
          scope: 'total',
          min_score: 5,
          max_score: 10,
          message: 'Great job!',
        }),
      )
    })

    it('calls onSubmit with group_id when scope is group', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn().mockResolvedValue(undefined)

      render(
        <AssessmentForm
          surveyId="survey-1"
          groups={mockGroups}
          assessment={null}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />,
      )

      await act(async () => {
        await user.type(screen.getByTestId('assessment-name-input'), 'Group Assessment')
        await user.selectOptions(screen.getByTestId('assessment-scope-select'), 'group')
      })

      await act(async () => {
        await user.selectOptions(screen.getByTestId('assessment-group-select'), 'g1')
        await user.type(screen.getByTestId('assessment-min-score-input'), '0')
        await user.type(screen.getByTestId('assessment-max-score-input'), '5')
        await user.type(screen.getByTestId('assessment-message-input'), 'Needs improvement')
      })

      await act(async () => {
        await user.click(screen.getByTestId('assessment-form-submit'))
      })

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining<Partial<AssessmentCreate>>({
          scope: 'group',
          group_id: 'g1',
        }),
      )
    })
  })

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  describe('validation', () => {
    it('shows error when name is empty', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()

      render(
        <AssessmentForm
          surveyId="survey-1"
          groups={mockGroups}
          assessment={null}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />,
      )

      await act(async () => {
        await user.type(screen.getByTestId('assessment-min-score-input'), '0')
        await user.type(screen.getByTestId('assessment-max-score-input'), '10')
        await user.type(screen.getByTestId('assessment-message-input'), 'Test')
        await user.click(screen.getByTestId('assessment-form-submit'))
      })

      expect(screen.getByTestId('assessment-form-error')).toBeInTheDocument()
      expect(screen.getByTestId('assessment-form-error').textContent).toMatch(/name is required/i)
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('shows error when min_score > max_score', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()

      render(
        <AssessmentForm
          surveyId="survey-1"
          groups={mockGroups}
          assessment={null}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />,
      )

      await act(async () => {
        await user.type(screen.getByTestId('assessment-name-input'), 'Test')
        await user.type(screen.getByTestId('assessment-min-score-input'), '10')
        await user.type(screen.getByTestId('assessment-max-score-input'), '5')
        await user.type(screen.getByTestId('assessment-message-input'), 'Test')
        await user.click(screen.getByTestId('assessment-form-submit'))
      })

      expect(screen.getByTestId('assessment-form-error')).toBeInTheDocument()
      expect(screen.getByTestId('assessment-form-error').textContent).toMatch(/min score.*max score/i)
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('shows error when scope is group but no group is selected', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()

      render(
        <AssessmentForm
          surveyId="survey-1"
          groups={mockGroups}
          assessment={null}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />,
      )

      await act(async () => {
        await user.type(screen.getByTestId('assessment-name-input'), 'Test')
        await user.selectOptions(screen.getByTestId('assessment-scope-select'), 'group')
        await user.type(screen.getByTestId('assessment-min-score-input'), '0')
        await user.type(screen.getByTestId('assessment-max-score-input'), '5')
        await user.type(screen.getByTestId('assessment-message-input'), 'Test message')
        await user.click(screen.getByTestId('assessment-form-submit'))
      })

      expect(screen.getByTestId('assessment-form-error')).toBeInTheDocument()
      expect(screen.getByTestId('assessment-form-error').textContent).toMatch(/group is required/i)
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('shows error when message is empty', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()

      render(
        <AssessmentForm
          surveyId="survey-1"
          groups={mockGroups}
          assessment={null}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />,
      )

      await act(async () => {
        await user.type(screen.getByTestId('assessment-name-input'), 'Test')
        await user.type(screen.getByTestId('assessment-min-score-input'), '0')
        await user.type(screen.getByTestId('assessment-max-score-input'), '10')
        await user.click(screen.getByTestId('assessment-form-submit'))
      })

      expect(screen.getByTestId('assessment-form-error')).toBeInTheDocument()
      expect(screen.getByTestId('assessment-form-error').textContent).toMatch(/message is required/i)
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('displays external API error passed via error prop', () => {
      render(
        <AssessmentForm
          surveyId="survey-1"
          groups={mockGroups}
          assessment={null}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          error="Server error occurred"
        />,
      )

      expect(screen.getByTestId('assessment-form-error')).toBeInTheDocument()
      expect(screen.getByTestId('assessment-form-error').textContent).toContain('Server error occurred')
    })

    it('shows loading state on submit button when isLoading is true', () => {
      render(
        <AssessmentForm
          surveyId="survey-1"
          groups={mockGroups}
          assessment={null}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          isLoading={true}
        />,
      )

      expect(screen.getByTestId('assessment-form-submit')).toHaveTextContent('Saving...')
      expect(screen.getByTestId('assessment-form-submit')).toBeDisabled()
    })
  })

  // -------------------------------------------------------------------------
  // Edit mode
  // -------------------------------------------------------------------------

  describe('edit mode (assessment prop provided)', () => {
    it('renders edit title', () => {
      render(
        <AssessmentForm
          surveyId="survey-1"
          groups={mockGroups}
          assessment={mockExistingAssessment}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      )

      expect(screen.getByText('Edit Assessment')).toBeInTheDocument()
      expect(screen.getByTestId('assessment-form-submit')).toHaveTextContent('Save Changes')
    })

    it('pre-fills name field from assessment', () => {
      render(
        <AssessmentForm
          surveyId="survey-1"
          groups={mockGroups}
          assessment={mockExistingAssessment}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      )

      const nameInput = screen.getByTestId('assessment-name-input') as HTMLInputElement
      expect(nameInput.value).toBe('High Satisfaction')
    })

    it('pre-fills scope from assessment', () => {
      render(
        <AssessmentForm
          surveyId="survey-1"
          groups={mockGroups}
          assessment={mockExistingAssessment}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      )

      const scopeSelect = screen.getByTestId('assessment-scope-select') as HTMLSelectElement
      expect(scopeSelect.value).toBe('total')
    })

    it('pre-fills min/max score from assessment', () => {
      render(
        <AssessmentForm
          surveyId="survey-1"
          groups={mockGroups}
          assessment={mockExistingAssessment}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      )

      const minInput = screen.getByTestId('assessment-min-score-input') as HTMLInputElement
      const maxInput = screen.getByTestId('assessment-max-score-input') as HTMLInputElement
      expect(minInput.value).toBe('8')
      expect(maxInput.value).toBe('10')
    })

    it('pre-fills message from assessment', () => {
      render(
        <AssessmentForm
          surveyId="survey-1"
          groups={mockGroups}
          assessment={mockExistingAssessment}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      )

      const messageInput = screen.getByTestId('assessment-message-input') as HTMLTextAreaElement
      expect(messageInput.value).toBe('You are very satisfied!')
    })

    it('shows group selector pre-filled when editing a group-scoped assessment', () => {
      render(
        <AssessmentForm
          surveyId="survey-1"
          groups={mockGroups}
          assessment={mockGroupAssessment}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      )

      const groupSelect = screen.getByTestId('assessment-group-select') as HTMLSelectElement
      expect(groupSelect.value).toBe('g1')
    })
  })
})
