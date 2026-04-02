/**
 * Integration tests for SurveyBuilderPage.
 *
 * Uses MSW for network mocking, pre-populates auth state via useAuthStore.setState
 * (not setTokens) to avoid AuthProvider.initialize() act() warnings.
 * Follows all patterns documented in MEMORY.md.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
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
  setTokens(mockTokens.access_token, mockTokens.refresh_token)
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
    const user = userEvent.setup()
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    const groupCard = screen.getByTestId('canvas-group-g1')
    // Click the card header — the CardHeader element within the group card
    const header = groupCard.querySelector('[class*="CardHeader"], [class*="card-header"], .pb-2')
    await act(async () => {
      await user.click(header ?? groupCard)
    })

    await waitFor(() => expect(screen.getByTestId('group-properties')).toBeInTheDocument())

    const titleInput = screen.getByTestId('property-group-title')
    expect(titleInput).toHaveValue('General Questions')
  })

  it('shows question properties when a question is clicked', async () => {
    const user = userEvent.setup()
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    const questionEl = screen.getByTestId('canvas-question-q1')
    await act(async () => {
      await user.click(questionEl)
    })

    await waitFor(() => expect(screen.getByTestId('question-properties')).toBeInTheDocument())

    const titleInput = screen.getByTestId('property-question-title')
    expect(titleInput).toHaveValue('What is your name?')
  })

  it('updates builderStore selectedItem when question is clicked', async () => {
    const user = userEvent.setup()
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    const questionEl = screen.getByTestId('canvas-question-q2')
    await act(async () => {
      await user.click(questionEl)
    })

    await waitFor(() => {
      const { selectedItem } = useBuilderStore.getState()
      expect(selectedItem).toEqual({ type: 'question', id: 'q2' })
    })
  })

  it('shows answer options editor for radio question', async () => {
    const user = userEvent.setup()
    renderBuilder()

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    // q2 is the radio question with 2 answer options
    const questionEl = screen.getByTestId('canvas-question-q2')
    await act(async () => {
      await user.click(questionEl)
    })

    await waitFor(() => expect(screen.getByTestId('question-properties')).toBeInTheDocument())

    // Options are now rendered as inputs in AnswerOptionsEditor
    expect(screen.getByTestId('answer-options-editor')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Very Satisfied')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Satisfied')).toBeInTheDocument()
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
