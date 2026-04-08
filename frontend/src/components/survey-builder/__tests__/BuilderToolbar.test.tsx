/**
 * Unit tests for BuilderToolbar component.
 *
 * Key patterns:
 * - Mock useNavigate from react-router-dom to assert navigation does NOT happen when
 *   clicking the 'Add Question' dropdown trigger.
 * - Mock surveyService at module level for createQuestion assertions.
 * - vi.useRealTimers() in afterEach to prevent timer leakage.
 * - Wrap userEvent interactions in act() to prevent act() warnings.
 * - MSW server lifecycle managed by src/test/setup.ts.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useBuilderStore } from '../../../store/builderStore'
import { useAuthStore } from '../../../store/authStore'
import { setTokens, clearTokens } from '../../../services/tokenService'
import { mockTokens, mockUser, mockSurveyFull } from '../../../mocks/handlers'
import { BuilderToolbar } from '../BuilderToolbar'
import { useRef } from 'react'

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../../../services/surveyService', () => ({
  default: {
    createQuestion: vi.fn(),
    createGroup: vi.fn(),
    updateSurvey: vi.fn(),
    activateSurvey: vi.fn(),
    reorderGroups: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

const SURVEY_ID = mockSurveyFull.id

function TestWrapper() {
  const undoRedoPendingRef = useRef(false)
  return (
    <BuilderToolbar
      surveyId={SURVEY_ID}
      isPreviewMode={false}
      onTogglePreview={vi.fn()}
      isTranslationMode={false}
      onToggleTranslation={vi.fn()}
      readOnly={false}
      undoRedoPendingRef={undoRedoPendingRef}
    />
  )
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  clearTokens()
  localStorage.clear()
  useAuthStore.setState({ user: null, isAuthenticated: false, isInitializing: false, isLoading: false })
  useBuilderStore.getState().reset()

  setTokens(mockTokens.access_token)
  localStorage.removeItem('devtracker_refresh_token')
  useAuthStore.setState({ user: mockUser, isAuthenticated: true, isInitializing: false, isLoading: false })

  // Load survey with a group so the 'Add Question' button is visible
  useBuilderStore.getState().loadSurvey(mockSurveyFull)

  mockNavigate.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  useBuilderStore.getState().reset()
})

// ---------------------------------------------------------------------------
// Add Question dropdown — navigation fix (ISS-161)
// ---------------------------------------------------------------------------

describe('Add Question dropdown', () => {
  it('renders the Add Question button when groups exist', () => {
    render(<TestWrapper />)
    expect(screen.getByTestId('toolbar-add-question-button')).toBeInTheDocument()
  })

  it('clicking the Add Question button does NOT navigate away', async () => {
    render(<TestWrapper />)
    const trigger = screen.getByTestId('toolbar-add-question-button')

    await act(async () => {
      await userEvent.click(trigger)
    })

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('clicking the Add Question button opens the dropdown menu', async () => {
    render(<TestWrapper />)
    const trigger = screen.getByTestId('toolbar-add-question-button')

    await act(async () => {
      await userEvent.click(trigger)
    })

    // Dropdown content should be visible with question type items
    await waitFor(() => {
      expect(screen.getByTestId('add-question-type-short_text')).toBeInTheDocument()
    })
  })

  it('shows all question types in the dropdown', async () => {
    render(<TestWrapper />)

    await act(async () => {
      await userEvent.click(screen.getByTestId('toolbar-add-question-button'))
    })

    await waitFor(() => {
      expect(screen.getByTestId('add-question-type-short_text')).toBeInTheDocument()
      expect(screen.getByTestId('add-question-type-long_text')).toBeInTheDocument()
      expect(screen.getByTestId('add-question-type-single_choice')).toBeInTheDocument()
      expect(screen.getByTestId('add-question-type-multiple_choice')).toBeInTheDocument()
      expect(screen.getByTestId('add-question-type-dropdown')).toBeInTheDocument()
      expect(screen.getByTestId('add-question-type-numeric')).toBeInTheDocument()
    })
  })

  it('clicking a question type calls surveyService.createQuestion with correct args', async () => {
    const surveyService = (await import('../../../services/surveyService')).default
    const mockQuestion = {
      id: 'new-q',
      group_id: 'g1',
      parent_id: null,
      question_type: 'short_text',
      code: 'Q3',
      title: 'New Short Text',
      description: null,
      is_required: false,
      sort_order: 3,
      relevance: null,
      validation: null,
      settings: null,
      created_at: '2024-01-08T10:00:00Z',
      answer_options: [],
      subquestions: [],
    }
    vi.mocked(surveyService.createQuestion).mockResolvedValueOnce(mockQuestion)

    render(<TestWrapper />)

    await act(async () => {
      await userEvent.click(screen.getByTestId('toolbar-add-question-button'))
    })

    await waitFor(() => {
      expect(screen.getByTestId('add-question-type-short_text')).toBeInTheDocument()
    })

    await act(async () => {
      await userEvent.click(screen.getByTestId('add-question-type-short_text'))
    })

    await waitFor(() => {
      expect(surveyService.createQuestion).toHaveBeenCalledWith(
        SURVEY_ID,
        'g1',
        expect.objectContaining({ question_type: 'short_text' }),
      )
    })
  })

  it('clicking a question type does NOT navigate away', async () => {
    const surveyService = (await import('../../../services/surveyService')).default
    vi.mocked(surveyService.createQuestion).mockResolvedValueOnce({
      id: 'new-q',
      group_id: 'g1',
      parent_id: null,
      question_type: 'single_choice',
      code: 'Q3',
      title: 'New Single Choice',
      description: null,
      is_required: false,
      sort_order: 3,
      relevance: null,
      validation: null,
      settings: null,
      created_at: '2024-01-08T10:00:00Z',
      answer_options: [],
      subquestions: [],
    })

    render(<TestWrapper />)

    await act(async () => {
      await userEvent.click(screen.getByTestId('toolbar-add-question-button'))
    })

    await waitFor(() => {
      expect(screen.getByTestId('add-question-type-single_choice')).toBeInTheDocument()
    })

    await act(async () => {
      await userEvent.click(screen.getByTestId('add-question-type-single_choice'))
    })

    // Navigate should only be called if user explicitly clicks back button, not for question add
    // Give it a tick to settle
    await waitFor(() => {
      expect(surveyService.createQuestion).toHaveBeenCalled()
    })

    // Should not have navigated to dashboard
    const dashboardCalls = mockNavigate.mock.calls.filter(
      (call) => call[0] === '/surveys' || call[0] === '/',
    )
    expect(dashboardCalls).toHaveLength(0)
  })

  it('does not show Add Question button when there are no groups', () => {
    useBuilderStore.getState().reset()
    render(<TestWrapper />)
    expect(screen.queryByTestId('toolbar-add-question-button')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Back button navigation
// ---------------------------------------------------------------------------

describe('Back button', () => {
  it('navigates to survey detail when back button is clicked', async () => {
    render(<TestWrapper />)

    await act(async () => {
      await userEvent.click(screen.getByTestId('toolbar-back-button'))
    })

    expect(mockNavigate).toHaveBeenCalledWith(`/surveys/${SURVEY_ID}`)
  })
})
