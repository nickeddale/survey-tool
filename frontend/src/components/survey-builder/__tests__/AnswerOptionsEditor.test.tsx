/**
 * Unit tests for AnswerOptionsEditor component.
 *
 * Tests cover:
 *  - Renders for choice-type questions (radio, dropdown, checkbox, ranking, image_picker)
 *  - Hidden for non-choice-type questions (text, textarea, number)
 *  - Add Option creates new option with auto-generated code
 *  - Inline title editing triggers updateOption
 *  - Assessment value editing triggers updateOption
 *  - Delete option with confirm flow
 *  - Image URL field shown only for image_picker
 *  - Drag handles shown in edit mode, hidden in readOnly
 *  - Optimistic updates with undo on API failure
 *
 * Uses vi.mock for @dnd-kit and surveyService to isolate component behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useBuilderStore } from '../../../store/builderStore'
import type { AnswerOptionResponse } from '../../../types/survey'
import { AnswerOptionsEditor } from '../AnswerOptionsEditor'

// ---------------------------------------------------------------------------
// Mock @dnd-kit to prevent JSDOM pointer event errors
// ---------------------------------------------------------------------------

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual('@dnd-kit/core')
  return {
    ...actual,
    DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useSensor: vi.fn(() => ({})),
    useSensors: vi.fn((...sensors: unknown[]) => sensors),
    PointerSensor: class PointerSensor {},
    KeyboardSensor: class KeyboardSensor {},
    closestCenter: vi.fn(),
  }
})

vi.mock('@dnd-kit/sortable', async () => {
  const actual = await vi.importActual('@dnd-kit/sortable')
  return {
    ...actual,
    useSortable: vi.fn(() => ({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: null,
      isDragging: false,
    })),
    SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    sortableKeyboardCoordinates: vi.fn(),
    arrayMove: actual.arrayMove,
    verticalListSortingStrategy: actual.verticalListSortingStrategy,
  }
})

// ---------------------------------------------------------------------------
// Mock surveyService
// ---------------------------------------------------------------------------

vi.mock('../../../services/surveyService', () => ({
  default: {
    createOption: vi.fn(),
    updateOption: vi.fn().mockResolvedValue({}),
    deleteOption: vi.fn().mockResolvedValue(undefined),
    reorderOptions: vi.fn().mockResolvedValue(undefined),
  },
}))

import surveyService from '../../../services/surveyService'

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makeOption(id: string, code: string, title: string, sortOrder = 1): AnswerOptionResponse {
  return {
    id,
    question_id: 'q1',
    code,
    title,
    sort_order: sortOrder,
    assessment_value: 0,
    created_at: '2024-01-08T10:00:00Z',
  }
}

const defaultProps = {
  surveyId: 'survey-1',
  groupId: 'g1',
  questionId: 'q1',
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  useBuilderStore.getState().reset()
  vi.mocked(surveyService.createOption).mockResolvedValue(makeOption('opt-new', 'A1', 'Option A1'))
  vi.mocked(surveyService.updateOption).mockResolvedValue(makeOption('o1', 'A1', 'Updated'))
  vi.mocked(surveyService.deleteOption).mockResolvedValue(undefined)
  vi.mocked(surveyService.reorderOptions).mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  useBuilderStore.getState().reset()
})

// ---------------------------------------------------------------------------
// Visibility tests
// ---------------------------------------------------------------------------

describe('show/hide based on question type', () => {
  const choiceTypes = ['single_choice', 'dropdown', 'multiple_choice', 'ranking', 'image_picker']
  const nonChoiceTypes = ['short_text', 'long_text', 'numeric', 'rating', 'date']

  choiceTypes.forEach((type) => {
    it(`renders for question type: ${type}`, () => {
      render(
        <AnswerOptionsEditor
          {...defaultProps}
          questionType={type}
          options={[]}
        />,
      )
      expect(screen.getByTestId('answer-options-editor')).toBeInTheDocument()
    })
  })

  nonChoiceTypes.forEach((type) => {
    it(`returns null for question type: ${type}`, () => {
      const { container } = render(
        <AnswerOptionsEditor
          {...defaultProps}
          questionType={type}
          options={[]}
        />,
      )
      expect(container.firstChild).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// Rendering options
// ---------------------------------------------------------------------------

describe('option rendering', () => {
  it('renders each option row', () => {
    const options = [
      makeOption('o1', 'A1', 'Very Satisfied', 1),
      makeOption('o2', 'A2', 'Satisfied', 2),
    ]
    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="single_choice"
        options={options}
      />,
    )

    expect(screen.getByTestId('option-row-o1')).toBeInTheDocument()
    expect(screen.getByTestId('option-row-o2')).toBeInTheDocument()
  })

  it('displays option code in badge', () => {
    const options = [makeOption('o1', 'A1', 'Very Satisfied')]
    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="single_choice"
        options={options}
      />,
    )

    expect(screen.getByTestId('option-code-o1')).toHaveTextContent('A1')
  })

  it('renders title input with current value', () => {
    const options = [makeOption('o1', 'A1', 'Very Satisfied')]
    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="single_choice"
        options={options}
      />,
    )

    expect(screen.getByTestId('option-title-o1')).toHaveValue('Very Satisfied')
  })

  it('shows option count in header', () => {
    const options = [makeOption('o1', 'A1', 'Opt 1'), makeOption('o2', 'A2', 'Opt 2')]
    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="single_choice"
        options={options}
      />,
    )

    expect(screen.getByText('Answer Options (2)')).toBeInTheDocument()
  })

  it('shows empty state when no options', () => {
    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="single_choice"
        options={[]}
      />,
    )

    expect(screen.getByTestId('options-empty-state')).toBeInTheDocument()
  })

  it('hides empty state in readOnly mode', () => {
    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="single_choice"
        options={[]}
        readOnly
      />,
    )

    expect(screen.queryByTestId('options-empty-state')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Drag handles
// ---------------------------------------------------------------------------

describe('drag handles', () => {
  it('shows drag handle when not readOnly', () => {
    const options = [makeOption('o1', 'A1', 'Option')]
    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="single_choice"
        options={options}
      />,
    )

    expect(screen.getByTestId('option-drag-handle-o1')).toBeInTheDocument()
  })

  it('hides drag handle when readOnly', () => {
    const options = [makeOption('o1', 'A1', 'Option')]
    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="single_choice"
        options={options}
        readOnly
      />,
    )

    expect(screen.queryByTestId('option-drag-handle-o1')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Add option
// ---------------------------------------------------------------------------

describe('add option', () => {
  it('shows Add Option button when not readOnly', () => {
    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="single_choice"
        options={[]}
      />,
    )

    expect(screen.getByTestId('add-option-button')).toBeInTheDocument()
  })

  it('hides Add Option button when readOnly', () => {
    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="single_choice"
        options={[]}
        readOnly
      />,
    )

    expect(screen.queryByTestId('add-option-button')).not.toBeInTheDocument()
  })

  it('calls surveyService.createOption when Add Option clicked', async () => {
    const user = userEvent.setup()

    // Set up store with the question
    useBuilderStore.setState({
      surveyId: 'survey-1',
      groups: [
        {
          id: 'g1',
          survey_id: 'survey-1',
          title: 'Group',
          description: null,
          sort_order: 1,
          relevance: null,
          created_at: '2024-01-01T00:00:00Z',
          questions: [
            {
              id: 'q1',
              group_id: 'g1',
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
              created_at: '2024-01-01T00:00:00Z',
              answer_options: [],
              subquestions: [],
            },
          ],
        },
      ],
    })

    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="single_choice"
        options={[]}
      />,
    )

    await act(async () => {
      await user.click(screen.getByTestId('add-option-button'))
    })

    await waitFor(() => {
      expect(surveyService.createOption).toHaveBeenCalledWith(
        'survey-1',
        'q1',
        expect.objectContaining({ code: 'A1' }),
      )
    })
  })

  it('auto-generates codes A1, A2, A3... for new options', async () => {
    const existingOptions = [makeOption('o1', 'A1', 'Opt 1')]
    vi.mocked(surveyService.createOption).mockResolvedValue(makeOption('opt-new', 'A2', 'Option A2'))

    const user = userEvent.setup()

    useBuilderStore.setState({
      surveyId: 'survey-1',
      groups: [
        {
          id: 'g1',
          survey_id: 'survey-1',
          title: 'Group',
          description: null,
          sort_order: 1,
          relevance: null,
          created_at: '2024-01-01T00:00:00Z',
          questions: [
            {
              id: 'q1',
              group_id: 'g1',
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
              created_at: '2024-01-01T00:00:00Z',
              answer_options: existingOptions,
              subquestions: [],
            },
          ],
        },
      ],
    })

    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="single_choice"
        options={existingOptions}
      />,
    )

    await act(async () => {
      await user.click(screen.getByTestId('add-option-button'))
    })

    await waitFor(() => {
      expect(surveyService.createOption).toHaveBeenCalledWith(
        'survey-1',
        'q1',
        expect.objectContaining({ code: 'A2' }),
      )
    })
  })

  it('undoes optimistic add when API fails', async () => {
    vi.mocked(surveyService.createOption).mockRejectedValueOnce(new Error('API Error'))

    const user = userEvent.setup()

    useBuilderStore.setState({
      surveyId: 'survey-1',
      groups: [
        {
          id: 'g1',
          survey_id: 'survey-1',
          title: 'Group',
          description: null,
          sort_order: 1,
          relevance: null,
          created_at: '2024-01-01T00:00:00Z',
          questions: [
            {
              id: 'q1',
              group_id: 'g1',
              parent_id: null,
              question_type: 'single_choice',
              code: 'Q1',
              title: 'Q',
              description: null,
              is_required: false,
              sort_order: 1,
              relevance: null,
              validation: null,
              settings: null,
              created_at: '2024-01-01T00:00:00Z',
              answer_options: [],
              subquestions: [],
            },
          ],
        },
      ],
    })

    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="single_choice"
        options={[]}
      />,
    )

    await act(async () => {
      await user.click(screen.getByTestId('add-option-button'))
    })

    // After API failure, the undo should have been called, restoring options to empty
    await waitFor(() => {
      const state = useBuilderStore.getState()
      const question = state.groups[0]?.questions.find((q) => q.id === 'q1')
      // Options should be empty after undo (no optimistic option remains)
      expect(question?.answer_options).toHaveLength(0)
    })
  })
})

// ---------------------------------------------------------------------------
// Inline title edit
// ---------------------------------------------------------------------------

describe('inline title edit', () => {
  it('calls surveyService.updateOption on title blur with new value', async () => {
    const user = userEvent.setup()
    const options = [makeOption('o1', 'A1', 'Old Title')]

    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="single_choice"
        options={options}
      />,
    )

    const titleInput = screen.getByTestId('option-title-o1')
    await act(async () => {
      await user.click(titleInput)
      await user.clear(titleInput)
      await user.type(titleInput, 'New Title')
      titleInput.blur()
    })

    await waitFor(() => {
      expect(surveyService.updateOption).toHaveBeenCalledWith(
        'survey-1',
        'q1',
        'o1',
        expect.objectContaining({ title: 'New Title' }),
      )
    })
  })

  it('title inputs are disabled in readOnly mode', () => {
    const options = [makeOption('o1', 'A1', 'Option')]
    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="single_choice"
        options={options}
        readOnly
      />,
    )

    expect(screen.getByTestId('option-title-o1')).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// Assessment value edit
// ---------------------------------------------------------------------------

describe('assessment value edit', () => {
  it('calls surveyService.updateOption on assessment value blur', async () => {
    const user = userEvent.setup()
    const options = [{ ...makeOption('o1', 'A1', 'Option'), assessment_value: 5 }]

    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="single_choice"
        options={options}
      />,
    )

    const assessInput = screen.getByTestId('option-assessment-o1')
    await act(async () => {
      await user.click(assessInput)
      await user.clear(assessInput)
      await user.type(assessInput, '10')
      assessInput.blur()
    })

    await waitFor(() => {
      expect(surveyService.updateOption).toHaveBeenCalledWith(
        'survey-1',
        'q1',
        'o1',
        expect.objectContaining({ assessment_value: 10 }),
      )
    })
  })

  it('assessment value inputs are disabled in readOnly mode', () => {
    const options = [makeOption('o1', 'A1', 'Option')]
    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="single_choice"
        options={options}
        readOnly
      />,
    )

    expect(screen.getByTestId('option-assessment-o1')).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// Delete option
// ---------------------------------------------------------------------------

describe('delete option', () => {
  it('shows delete button for each option', () => {
    const options = [makeOption('o1', 'A1', 'Option')]
    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="single_choice"
        options={options}
      />,
    )

    expect(screen.getByTestId('option-delete-o1')).toBeInTheDocument()
  })

  it('hides delete button in readOnly mode', () => {
    const options = [makeOption('o1', 'A1', 'Option')]
    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="single_choice"
        options={options}
        readOnly
      />,
    )

    expect(screen.queryByTestId('option-delete-o1')).not.toBeInTheDocument()
  })

  it('shows confirmation dialog when delete clicked', async () => {
    const user = userEvent.setup()
    const options = [makeOption('o1', 'A1', 'Option')]

    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="single_choice"
        options={options}
      />,
    )

    await act(async () => {
      await user.click(screen.getByTestId('option-delete-o1'))
    })

    expect(screen.getByTestId('option-delete-confirm')).toBeInTheDocument()
  })

  it('calls surveyService.deleteOption when confirm clicked', async () => {
    const user = userEvent.setup()

    useBuilderStore.setState({
      surveyId: 'survey-1',
      groups: [
        {
          id: 'g1',
          survey_id: 'survey-1',
          title: 'Group',
          description: null,
          sort_order: 1,
          relevance: null,
          created_at: '2024-01-01T00:00:00Z',
          questions: [
            {
              id: 'q1',
              group_id: 'g1',
              parent_id: null,
              question_type: 'single_choice',
              code: 'Q1',
              title: 'Q',
              description: null,
              is_required: false,
              sort_order: 1,
              relevance: null,
              validation: null,
              settings: null,
              created_at: '2024-01-01T00:00:00Z',
              answer_options: [makeOption('o1', 'A1', 'Option')],
              subquestions: [],
            },
          ],
        },
      ],
    })

    const options = [makeOption('o1', 'A1', 'Option')]
    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="single_choice"
        options={options}
      />,
    )

    // Click delete, then confirm
    await act(async () => {
      await user.click(screen.getByTestId('option-delete-o1'))
    })
    await act(async () => {
      await user.click(screen.getByTestId('option-delete-confirm-button'))
    })

    await waitFor(() => {
      expect(surveyService.deleteOption).toHaveBeenCalledWith('survey-1', 'q1', 'o1')
    })
  })

  it('dismisses confirm dialog when cancel clicked', async () => {
    const user = userEvent.setup()
    const options = [makeOption('o1', 'A1', 'Option')]

    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="single_choice"
        options={options}
      />,
    )

    await act(async () => {
      await user.click(screen.getByTestId('option-delete-o1'))
    })

    expect(screen.getByTestId('option-delete-confirm')).toBeInTheDocument()

    await act(async () => {
      await user.click(screen.getByTestId('option-delete-cancel'))
    })

    expect(screen.queryByTestId('option-delete-confirm')).not.toBeInTheDocument()
    expect(surveyService.deleteOption).not.toHaveBeenCalled()
  })

  it('shows error and undoes when deleteOption fails', async () => {
    vi.mocked(surveyService.deleteOption).mockRejectedValueOnce(new Error('API Error'))

    const user = userEvent.setup()

    useBuilderStore.setState({
      surveyId: 'survey-1',
      groups: [
        {
          id: 'g1',
          survey_id: 'survey-1',
          title: 'Group',
          description: null,
          sort_order: 1,
          relevance: null,
          created_at: '2024-01-01T00:00:00Z',
          questions: [
            {
              id: 'q1',
              group_id: 'g1',
              parent_id: null,
              question_type: 'single_choice',
              code: 'Q1',
              title: 'Q',
              description: null,
              is_required: false,
              sort_order: 1,
              relevance: null,
              validation: null,
              settings: null,
              created_at: '2024-01-01T00:00:00Z',
              answer_options: [makeOption('o1', 'A1', 'Option')],
              subquestions: [],
            },
          ],
        },
      ],
    })

    const options = [makeOption('o1', 'A1', 'Option')]
    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="single_choice"
        options={options}
      />,
    )

    await act(async () => {
      await user.click(screen.getByTestId('option-delete-o1'))
    })
    await act(async () => {
      await user.click(screen.getByTestId('option-delete-confirm-button'))
    })

    await waitFor(() => {
      expect(screen.getByTestId('option-delete-error')).toBeInTheDocument()
    })

    // After undo, the option should be restored in the store
    const state = useBuilderStore.getState()
    const question = state.groups[0]?.questions.find((q) => q.id === 'q1')
    expect(question?.answer_options).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Image picker specific
// ---------------------------------------------------------------------------

describe('image_picker question type', () => {
  it('shows image URL field for image_picker', () => {
    const options = [makeOption('o1', 'A1', 'Image Option')]
    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="image_picker"
        options={options}
      />,
    )

    expect(screen.getByTestId('option-image-url-o1')).toBeInTheDocument()
  })

  it('does not show image URL field for non image_picker', () => {
    const options = [makeOption('o1', 'A1', 'Option')]
    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="single_choice"
        options={options}
      />,
    )

    expect(screen.queryByTestId('option-image-url-o1')).not.toBeInTheDocument()
  })

  it('image URL field is disabled in readOnly mode', () => {
    const options = [makeOption('o1', 'A1', 'Image Option')]
    render(
      <AnswerOptionsEditor
        {...defaultProps}
        questionType="image_picker"
        options={options}
        readOnly
      />,
    )

    expect(screen.getByTestId('option-image-url-o1')).toBeDisabled()
  })
})
