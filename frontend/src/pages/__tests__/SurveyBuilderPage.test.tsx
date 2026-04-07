/**
 * Integration tests for SurveyBuilderPage.
 *
 * Uses MSW for network mocking, pre-populates auth state via useAuthStore.setState
 * (not setTokens) to avoid AuthProvider.initialize() act() warnings.
 * Follows all patterns documented in MEMORY.md.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { AuthProvider } from '../../contexts/AuthContext'
import { useAuthStore } from '../../store/authStore'
import { useBuilderStore } from '../../store/builderStore'
import { clearTokens, setTokens } from '../../services/tokenService'
import { mockTokens, mockUser, mockSurveyFull, mockSurveys } from '../../mocks/handlers'
import SurveyBuilderPage from '../SurveyBuilderPage'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DRAFT_SURVEY_ID = mockSurveyFull.id // '10000000-0000-0000-0000-000000000002', status: 'draft'
// A non-draft survey for read-only tests
const ACTIVE_SURVEY_ID = mockSurveys[0].id // '10000000-0000-0000-0000-000000000001', status: 'active'

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderBuilder(surveyId = DRAFT_SURVEY_ID) {
  return render(
    <MemoryRouter
      initialEntries={[`/surveys/${surveyId}/builder`]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AuthProvider>
        <Routes>
          <Route path="/surveys/:id/builder" element={<SurveyBuilderPage />} />
          <Route path="/surveys/:id" element={<div data-testid="survey-detail-page" />} />
          <Route path="/surveys" element={<div data-testid="surveys-page" />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearTokens()
  localStorage.clear()
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false })
  useBuilderStore.getState().reset()

  // Pre-populate auth state WITHOUT storing refresh token in localStorage.
  // This prevents AuthProvider.initialize() from running and causing act() warnings.
  setTokens(mockTokens.access_token)
  localStorage.removeItem('devtracker_refresh_token')
  useAuthStore.setState({ user: mockUser, isAuthenticated: true, isLoading: false })
})

afterEach(() => {
  vi.restoreAllMocks()
  // IMPORTANT: always reset fake timers to avoid contaminating subsequent tests
  vi.useRealTimers()
  useBuilderStore.getState().reset()
})

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('loading state', () => {
  it('renders loading skeleton while survey is being fetched', async () => {
    server.use(
      http.get(`/api/v1/surveys/${DRAFT_SURVEY_ID}`, () => new Promise<never>(() => {})),
    )

    renderBuilder()

    expect(screen.getByTestId('builder-loading-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('survey-builder-page')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Successful load — draft survey
// ---------------------------------------------------------------------------

describe('draft survey', () => {
  it('renders three-panel layout after loading', async () => {
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    expect(screen.getByTestId('question-palette')).toBeInTheDocument()
    expect(screen.getByTestId('survey-canvas')).toBeInTheDocument()
    expect(screen.getByTestId('property-editor')).toBeInTheDocument()
  })

  it('shows survey title in top bar', async () => {
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    expect(screen.getByTestId('builder-title')).toHaveTextContent(mockSurveyFull.title)
  })

  it('shows status badge in top bar', async () => {
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    expect(screen.getByTestId('status-badge')).toHaveTextContent('draft')
  })

  it('does NOT show read-only badge for draft survey', async () => {
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    expect(screen.queryByTestId('read-only-badge')).not.toBeInTheDocument()
  })

  it('renders question type palette buttons enabled for draft survey', async () => {
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    const shortTextBtn = screen.getByRole('button', { name: /add short text question/i })
    expect(shortTextBtn).not.toBeDisabled()
  })

  it('renders groups and questions in the canvas', async () => {
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    // mockSurveyFull has one group 'g1' with 2 questions
    expect(screen.getByTestId('canvas-group-g1')).toBeInTheDocument()
    expect(screen.getByTestId('canvas-question-q1')).toBeInTheDocument()
    expect(screen.getByTestId('canvas-question-q2')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Read-only: non-draft survey
// ---------------------------------------------------------------------------

describe('non-draft survey (read-only)', () => {
  it('shows read-only badge for active survey', async () => {
    renderBuilder(ACTIVE_SURVEY_ID)

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    expect(screen.getByTestId('read-only-badge')).toBeInTheDocument()
  })

  it('disables question type palette buttons for active survey', async () => {
    renderBuilder(ACTIVE_SURVEY_ID)

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    const shortTextBtn = screen.getByRole('button', { name: /add short text question/i })
    expect(shortTextBtn).toBeDisabled()
  })

  it('shows status badge with active status', async () => {
    renderBuilder(ACTIVE_SURVEY_ID)

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    expect(screen.getByTestId('status-badge')).toHaveTextContent('active')
  })
})

// ---------------------------------------------------------------------------
// Property editor: selecting items
// ---------------------------------------------------------------------------

describe('property editor — item selection', () => {
  it('shows placeholder when no item selected', async () => {
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    const editor = screen.getByTestId('property-editor')
    expect(editor).toHaveTextContent(/select a group or question/i)
  })

  it('shows group properties when a group is clicked', async () => {
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    // Click the group panel header to select it
    await act(async () => {
      fireEvent.click(screen.getByTestId('group-panel-header-g1'))
    })

    await waitFor(() => expect(screen.getByTestId('group-properties')).toBeInTheDocument())

    const titleInput = screen.getByTestId('property-group-title')
    expect(titleInput).toHaveValue('General Questions')
  })

  it('shows question properties when a question is clicked', async () => {
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('canvas-question-q1'))

    await waitFor(() => expect(screen.getByTestId('question-properties')).toBeInTheDocument())

    const titleInput = screen.getByTestId('property-question-title')
    expect(titleInput).toHaveValue('What is your name?')
  })

  it('updates builderStore selectedItem when question is clicked', async () => {
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('canvas-question-q2'))

    await waitFor(() => {
      const { selectedItem } = useBuilderStore.getState()
      expect(selectedItem).toEqual({ type: 'question', id: 'q2' })
    })
  })

  it('shows answer options editor for radio question', async () => {
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    // q2 is the radio question with 2 answer options
    fireEvent.click(screen.getByTestId('canvas-question-q2'))

    await waitFor(() => expect(screen.getByTestId('question-properties')).toBeInTheDocument())

    // Options are now rendered as inputs in AnswerOptionsEditor
    expect(screen.getByTestId('answer-options-editor')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Very Satisfied')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Satisfied')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// QuestionEditor integration
// ---------------------------------------------------------------------------

describe('QuestionEditor integration', () => {
  it('renders QuestionEditor inside property editor when question is selected', async () => {
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('canvas-question-q1'))

    await waitFor(() => expect(screen.getByTestId('property-editor')).toBeInTheDocument())
    expect(screen.getByTestId('question-properties')).toBeInTheDocument()
  })

  it('title field in QuestionEditor is a textarea (multi-line)', async () => {
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('canvas-question-q1'))

    await waitFor(() => expect(screen.getByTestId('property-question-title')).toBeInTheDocument())
    expect(screen.getByTestId('property-question-title').tagName).toBe('TEXTAREA')
  })

  it('QuestionEditor title updates builder store when changed', async () => {
    const user = userEvent.setup()
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('canvas-question-q1'))

    await waitFor(() => expect(screen.getByTestId('property-question-title')).toBeInTheDocument())

    const titleEl = screen.getByTestId('property-question-title')
    await act(async () => {
      await user.clear(titleEl)
      await user.type(titleEl, 'Updated Name Question')
    })

    await waitFor(() => {
      const { groups } = useBuilderStore.getState()
      const q = groups.flatMap((g) => g.questions).find((q) => q.id === 'q1')
      expect(q?.title).toBe('Updated Name Question')
    })
  })

  it('shows empty state in property editor when no question selected', async () => {
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    expect(screen.getByTestId('property-editor')).toHaveTextContent(
      /select a group or question/i,
    )
    expect(screen.queryByTestId('question-properties')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Add Group flow
// ---------------------------------------------------------------------------

describe('Add Group flow', () => {
  it('renders Add Group button in canvas when survey has groups', async () => {
    renderBuilder()
    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())
    expect(screen.getByTestId('add-group-button')).toBeInTheDocument()
  })

  it('calls POST /groups and adds group to store when Add Group clicked', async () => {
    const capturedRequests: Array<{ body: Record<string, unknown> }> = []
    server.use(
      http.post(`/api/v1/surveys/${DRAFT_SURVEY_ID}/groups`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        capturedRequests.push({ body })
        return HttpResponse.json(
          {
            id: 'g-new',
            survey_id: DRAFT_SURVEY_ID,
            title: body.title as string,
            description: null,
            sort_order: 2,
            relevance: null,
            created_at: '2024-01-10T10:00:00Z',
          },
          { status: 201 },
        )
      }),
    )

    renderBuilder()
    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    await act(async () => {
      fireEvent.click(screen.getByTestId('add-group-button'))
    })

    await waitFor(() => {
      expect(capturedRequests).toHaveLength(1)
      expect(capturedRequests[0].body).toMatchObject({ title: 'Group 2' })
    })

    await waitFor(() => expect(screen.getByTestId('canvas-group-g-new')).toBeInTheDocument())
    expect(useBuilderStore.getState().groups.find((g) => g.id === 'g-new')).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Group reorder flow
// ---------------------------------------------------------------------------

describe('Group reorder — store action', () => {
  it('reorderGroups store action changes group order', async () => {
    renderBuilder()
    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    // Load a second group into the store to test reordering
    act(() => {
      useBuilderStore.getState().addGroup({
        id: 'g2',
        survey_id: DRAFT_SURVEY_ID,
        title: 'Second Group',
        description: null,
        sort_order: 2,
        relevance: null,
        created_at: '2024-01-08T12:00:00Z',
        questions: [],
      })
    })

    await waitFor(() => expect(screen.getByTestId('canvas-group-g2')).toBeInTheDocument())

    // Reorder: move g2 before g1
    act(() => {
      useBuilderStore.getState().reorderGroups(['g2', 'g1'])
    })

    await waitFor(() => {
      const groups = useBuilderStore.getState().groups
      expect(groups[0].id).toBe('g2')
      expect(groups[1].id).toBe('g1')
    })
  })

  it('calls PATCH /groups/reorder when reorderGroups API is called', async () => {
    const capturedRequests: Array<{ body: Record<string, unknown> }> = []
    server.use(
      http.patch(`/api/v1/surveys/${DRAFT_SURVEY_ID}/groups/reorder`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        capturedRequests.push({ body })
        return HttpResponse.json([], { status: 200 })
      }),
    )

    await act(async () => {
      await import('../../services/surveyService').then(({ default: svc }) =>
        svc.reorderGroups(DRAFT_SURVEY_ID, { group_ids: ['g1', 'g2'] }),
      )
    })

    await waitFor(() => {
      expect(capturedRequests).toHaveLength(1)
      expect(capturedRequests[0].body).toMatchObject({ group_ids: ['g1', 'g2'] })
    })
  })
})

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

describe('navigation', () => {
  it('navigates back to survey detail when back button clicked', async () => {
    const user = userEvent.setup()
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    const backBtn = screen.getByRole('button', { name: /back to survey/i })
    await act(async () => {
      await user.click(backBtn)
    })

    await waitFor(() => expect(screen.getByTestId('survey-detail-page')).toBeInTheDocument())
  })
})

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('error state', () => {
  it('renders error message when fetch fails', async () => {
    server.use(
      http.get(`/api/v1/surveys/${DRAFT_SURVEY_ID}`, () =>
        HttpResponse.json(
          { detail: { code: 'INTERNAL_ERROR', message: 'Server error' } },
          { status: 500 },
        ),
      ),
    )

    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('builder-error')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Undo/redo toolbar buttons
// ---------------------------------------------------------------------------

describe('undo/redo toolbar buttons', () => {
  it('renders undo and redo buttons in toolbar for draft survey', async () => {
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    expect(screen.getByTestId('undo-button')).toBeInTheDocument()
    expect(screen.getByTestId('redo-button')).toBeInTheDocument()
  })

  it('undo button is disabled when undoStack is empty', async () => {
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    // Initially, undoStack is empty (no actions taken yet)
    expect(screen.getByTestId('undo-button')).toBeDisabled()
  })

  it('redo button is disabled when redoStack is empty', async () => {
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    // Initially, redoStack is empty
    expect(screen.getByTestId('redo-button')).toBeDisabled()
  })

  it('undo button becomes enabled after a builder action', async () => {
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    // Push a state onto the undo stack by performing a builder action
    act(() => {
      useBuilderStore.getState().addGroup({
        id: 'g-test',
        survey_id: DRAFT_SURVEY_ID,
        title: 'Test Group',
        description: null,
        sort_order: 2,
        relevance: null,
        created_at: '2024-01-01T00:00:00Z',
        questions: [],
      })
    })

    await waitFor(() => expect(screen.getByTestId('undo-button')).not.toBeDisabled())
  })

  it('undo button calls store undo when clicked', async () => {
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    // Push a state to enable the undo button
    act(() => {
      useBuilderStore.getState().addGroup({
        id: 'g-test',
        survey_id: DRAFT_SURVEY_ID,
        title: 'Test Group',
        description: null,
        sort_order: 2,
        relevance: null,
        created_at: '2024-01-01T00:00:00Z',
        questions: [],
      })
    })

    await waitFor(() => expect(screen.getByTestId('undo-button')).not.toBeDisabled())

    const groupCountBefore = useBuilderStore.getState().groups.length

    await act(async () => {
      fireEvent.click(screen.getByTestId('undo-button'))
    })

    await waitFor(() => {
      expect(useBuilderStore.getState().groups.length).toBeLessThan(groupCountBefore)
    })
  })

  it('redo button becomes enabled after an undo', async () => {
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    act(() => {
      useBuilderStore.getState().addGroup({
        id: 'g-test',
        survey_id: DRAFT_SURVEY_ID,
        title: 'Test Group',
        description: null,
        sort_order: 2,
        relevance: null,
        created_at: '2024-01-01T00:00:00Z',
        questions: [],
      })
    })

    await waitFor(() => expect(screen.getByTestId('undo-button')).not.toBeDisabled())

    await act(async () => {
      fireEvent.click(screen.getByTestId('undo-button'))
    })

    await waitFor(() => expect(screen.getByTestId('redo-button')).not.toBeDisabled())
  })

  it('does not render undo/redo buttons for read-only (non-draft) survey', async () => {
    renderBuilder(ACTIVE_SURVEY_ID)

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    expect(screen.queryByTestId('undo-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('redo-button')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Undo/redo keyboard shortcuts
// ---------------------------------------------------------------------------

describe('undo/redo keyboard shortcuts', () => {
  it('Ctrl+Z triggers undo when undoStack is not empty', async () => {
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    // Add a group to populate the undo stack
    act(() => {
      useBuilderStore.getState().addGroup({
        id: 'g-ks',
        survey_id: DRAFT_SURVEY_ID,
        title: 'Keyboard Shortcut Test Group',
        description: null,
        sort_order: 2,
        relevance: null,
        created_at: '2024-01-01T00:00:00Z',
        questions: [],
      })
    })

    const groupCountBefore = useBuilderStore.getState().groups.length

    await act(async () => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    })

    await waitFor(() => {
      expect(useBuilderStore.getState().groups.length).toBeLessThan(groupCountBefore)
    })
  })

  it('Ctrl+Shift+Z triggers redo when redoStack is not empty', async () => {
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    act(() => {
      useBuilderStore.getState().addGroup({
        id: 'g-ks2',
        survey_id: DRAFT_SURVEY_ID,
        title: 'Keyboard Shortcut Test Group 2',
        description: null,
        sort_order: 2,
        relevance: null,
        created_at: '2024-01-01T00:00:00Z',
        questions: [],
      })
    })

    // Undo first to populate the redo stack
    await act(async () => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    })

    const groupCountAfterUndo = useBuilderStore.getState().groups.length

    await act(async () => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
    })

    await waitFor(() => {
      expect(useBuilderStore.getState().groups.length).toBeGreaterThan(groupCountAfterUndo)
    })
  })

  it('Ctrl+Z does nothing when undoStack is empty', async () => {
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    const groupCountBefore = useBuilderStore.getState().groups.length

    await act(async () => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    })

    // Groups count should remain the same
    expect(useBuilderStore.getState().groups.length).toBe(groupCountBefore)
  })

  it('keyboard shortcuts are ignored when typing in an input', async () => {
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    act(() => {
      useBuilderStore.getState().addGroup({
        id: 'g-input',
        survey_id: DRAFT_SURVEY_ID,
        title: 'Input Test Group',
        description: null,
        sort_order: 2,
        relevance: null,
        created_at: '2024-01-01T00:00:00Z',
        questions: [],
      })
    })

    const groupCountBefore = useBuilderStore.getState().groups.length

    // Click on a group to show the group title input
    await act(async () => {
      fireEvent.click(screen.getByTestId('group-panel-header-g1'))
    })

    const titleInput = await screen.findByTestId('property-group-title')

    // Fire Ctrl+Z from within the input element
    await act(async () => {
      fireEvent.keyDown(titleInput, { key: 'z', ctrlKey: true })
    })

    // Group count should remain unchanged (undo was not triggered)
    expect(useBuilderStore.getState().groups.length).toBe(groupCountBefore)
  })
})
