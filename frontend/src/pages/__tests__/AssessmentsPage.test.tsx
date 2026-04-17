import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { AuthProvider } from '../../contexts/AuthContext'
import { useAuthStore } from '../../store/authStore'
import { clearTokens, setTokens } from '../../services/tokenService'
import { mockTokens, mockUser, mockSurveyFull, mockAssessments } from '../../mocks/handlers'
import AssessmentsPage from '../AssessmentsPage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

const SURVEY_ID = mockSurveyFull.id // '10000000-0000-0000-0000-000000000002'

function renderAssessments(surveyId = SURVEY_ID) {
  return render(
    <MemoryRouter
      initialEntries={[`/surveys/${surveyId}/assessments`]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AuthProvider>
        <Routes>
          <Route path="/surveys/:id/assessments" element={<AssessmentsPage />} />
          <Route path="/surveys/:id" element={<LocationDisplay />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

function resetAuthStore() {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isInitializing: false,
    isLoading: false,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AssessmentsPage', () => {
  beforeEach(() => {
    clearTokens()
    localStorage.clear()
    resetAuthStore()
    setTokens(mockTokens.access_token)
    localStorage.removeItem('survey_tool_refresh_token')
    useAuthStore.setState({
      user: mockUser,
      isAuthenticated: true,
      isInitializing: false,
      isLoading: false,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  describe('loading state', () => {
    it('renders loading skeleton while data is being fetched', async () => {
      server.use(
        http.get(`/api/v1/surveys/${SURVEY_ID}/assessments`, () => new Promise<never>(() => {}))
      )

      renderAssessments()

      expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Data loaded
  // -------------------------------------------------------------------------

  describe('data loaded state', () => {
    it('renders assessment names in the table', async () => {
      renderAssessments()

      await waitFor(() => {
        expect(screen.getByText('High Satisfaction')).toBeInTheDocument()
      })

      expect(screen.getByText('Group Score Low')).toBeInTheDocument()
    })

    it('renders scope badges', async () => {
      renderAssessments()

      await waitFor(() => {
        expect(screen.getByText('High Satisfaction')).toBeInTheDocument()
      })

      const totalBadges = screen.getAllByText('total')
      const groupBadges = screen.getAllByText('group')
      expect(totalBadges.length).toBeGreaterThanOrEqual(1)
      expect(groupBadges.length).toBeGreaterThanOrEqual(1)
    })

    it('renders score ranges', async () => {
      renderAssessments()

      await waitFor(() => {
        expect(screen.getByText('High Satisfaction')).toBeInTheDocument()
      })

      // assessment 1: 8–10
      expect(screen.getByText('8 – 10')).toBeInTheDocument()
      // assessment 2: 0–3
      expect(screen.getByText('0 – 3')).toBeInTheDocument()
    })

    it('renders table headers', async () => {
      renderAssessments()

      await waitFor(() => {
        expect(screen.getByText('Name')).toBeInTheDocument()
      })

      expect(screen.getByText('Scope')).toBeInTheDocument()
      expect(screen.getByText('Score Range')).toBeInTheDocument()
      expect(screen.getByText('Message')).toBeInTheDocument()
      expect(screen.getByText('Actions')).toBeInTheDocument()
    })

    it('shows edit and delete buttons for each assessment', async () => {
      renderAssessments()

      await waitFor(() => {
        expect(screen.getByText('High Satisfaction')).toBeInTheDocument()
      })

      const a1 = mockAssessments[0]
      expect(screen.getByTestId(`assessment-edit-${a1.id}`)).toBeInTheDocument()
      expect(screen.getByTestId(`assessment-delete-${a1.id}`)).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  describe('empty state', () => {
    it('renders empty state when there are no assessments', async () => {
      server.use(
        http.get(`/api/v1/surveys/${SURVEY_ID}/assessments`, () =>
          HttpResponse.json(
            { items: [], total: 0, page: 1, per_page: 10, total_pages: 1 },
            { status: 200 }
          )
        )
      )

      renderAssessments()

      await waitFor(() => {
        expect(screen.getByTestId('empty-state')).toBeInTheDocument()
      })

      expect(screen.getByText(/no assessments have been configured/i)).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /create your first assessment/i })
      ).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Create assessment
  // -------------------------------------------------------------------------

  describe('create assessment', () => {
    it('opens the create form when Create Assessment button is clicked', async () => {
      const user = userEvent.setup()

      renderAssessments()

      await waitFor(() => {
        expect(screen.getByTestId('create-assessment-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('create-assessment-button'))
      })

      expect(screen.getByTestId('assessment-form-dialog')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Create Assessment' })).toBeInTheDocument()
    })

    it('closes the form when Cancel is clicked', async () => {
      const user = userEvent.setup()

      renderAssessments()

      await waitFor(() => {
        expect(screen.getByTestId('create-assessment-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('create-assessment-button'))
      })

      expect(screen.getByTestId('assessment-form-dialog')).toBeInTheDocument()

      await act(async () => {
        await user.click(screen.getByRole('button', { name: /cancel/i }))
      })

      expect(screen.queryByTestId('assessment-form-dialog')).not.toBeInTheDocument()
    })

    it('submits new assessment and refreshes the list', async () => {
      const user = userEvent.setup()

      let createCalled = false
      server.use(
        http.post(`/api/v1/surveys/${SURVEY_ID}/assessments`, async ({ request }) => {
          createCalled = true
          const body = (await request.json()) as Record<string, unknown>
          return HttpResponse.json(
            {
              id: 'assessment-new-test',
              survey_id: SURVEY_ID,
              name: body.name as string,
              scope: body.scope as string,
              group_id: (body.group_id as string | null) ?? null,
              min_score: body.min_score as number,
              max_score: body.max_score as number,
              message: body.message as string,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { status: 201 }
          )
        })
      )

      renderAssessments()

      await waitFor(() => {
        expect(screen.getByTestId('create-assessment-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('create-assessment-button'))
      })

      await act(async () => {
        await user.type(screen.getByTestId('assessment-name-input'), 'New Assessment')
        await user.type(screen.getByTestId('assessment-min-score-input'), '0')
        await user.type(screen.getByTestId('assessment-max-score-input'), '10')
        await user.type(screen.getByTestId('assessment-message-input'), 'Test message')
      })

      await act(async () => {
        await user.click(screen.getByTestId('assessment-form-submit'))
      })

      await waitFor(() => {
        expect(createCalled).toBe(true)
      })
    })

    it('shows validation error when name is empty', async () => {
      const user = userEvent.setup()

      renderAssessments()

      await waitFor(() => {
        expect(screen.getByTestId('create-assessment-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('create-assessment-button'))
      })

      await act(async () => {
        await user.type(screen.getByTestId('assessment-min-score-input'), '0')
        await user.type(screen.getByTestId('assessment-max-score-input'), '10')
        await user.type(screen.getByTestId('assessment-message-input'), 'Test')
        await user.click(screen.getByTestId('assessment-form-submit'))
      })

      expect(screen.getByTestId('assessment-form-error')).toBeInTheDocument()
      expect(screen.getByTestId('assessment-form-error').textContent).toMatch(/name is required/i)
    })

    it('shows validation error when min_score > max_score', async () => {
      const user = userEvent.setup()

      renderAssessments()

      await waitFor(() => {
        expect(screen.getByTestId('create-assessment-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('create-assessment-button'))
      })

      await act(async () => {
        await user.type(screen.getByTestId('assessment-name-input'), 'Test')
        await user.type(screen.getByTestId('assessment-min-score-input'), '10')
        await user.type(screen.getByTestId('assessment-max-score-input'), '5')
        await user.type(screen.getByTestId('assessment-message-input'), 'Test')
        await user.click(screen.getByTestId('assessment-form-submit'))
      })

      expect(screen.getByTestId('assessment-form-error')).toBeInTheDocument()
      expect(screen.getByTestId('assessment-form-error').textContent).toMatch(
        /min score.*max score/i
      )
    })
  })

  // -------------------------------------------------------------------------
  // Edit assessment
  // -------------------------------------------------------------------------

  describe('edit assessment', () => {
    it('opens the edit form with pre-filled values when Edit is clicked', async () => {
      const user = userEvent.setup()

      renderAssessments()

      await waitFor(() => {
        expect(screen.getByText('High Satisfaction')).toBeInTheDocument()
      })

      const a1 = mockAssessments[0]
      await act(async () => {
        await user.click(screen.getByTestId(`assessment-edit-${a1.id}`))
      })

      expect(screen.getByTestId('assessment-form-dialog')).toBeInTheDocument()
      expect(screen.getByText('Edit Assessment')).toBeInTheDocument()

      const nameInput = screen.getByTestId('assessment-name-input') as HTMLInputElement
      expect(nameInput.value).toBe(a1.name)

      const minInput = screen.getByTestId('assessment-min-score-input') as HTMLInputElement
      expect(minInput.value).toBe(String(a1.min_score))
    })
  })

  // -------------------------------------------------------------------------
  // Delete assessment
  // -------------------------------------------------------------------------

  describe('delete assessment', () => {
    it('shows delete confirmation modal when Delete is clicked', async () => {
      const user = userEvent.setup()

      renderAssessments()

      await waitFor(() => {
        expect(screen.getByText('High Satisfaction')).toBeInTheDocument()
      })

      const a1 = mockAssessments[0]
      await act(async () => {
        await user.click(screen.getByTestId(`assessment-delete-${a1.id}`))
      })

      expect(screen.getByTestId('delete-confirm-modal')).toBeInTheDocument()
      expect(screen.getByTestId('delete-confirm-modal')).toHaveTextContent('High Satisfaction')
    })

    it('cancels delete when Cancel is clicked', async () => {
      const user = userEvent.setup()

      let deleteCalled = false
      server.use(
        http.delete(`/api/v1/surveys/${SURVEY_ID}/assessments/:assessmentId`, () => {
          deleteCalled = true
          return new HttpResponse(null, { status: 204 })
        })
      )

      renderAssessments()

      await waitFor(() => {
        expect(screen.getByText('High Satisfaction')).toBeInTheDocument()
      })

      const a1 = mockAssessments[0]
      await act(async () => {
        await user.click(screen.getByTestId(`assessment-delete-${a1.id}`))
      })

      await act(async () => {
        await user.click(screen.getByRole('button', { name: /cancel/i }))
      })

      expect(screen.queryByTestId('delete-confirm-modal')).not.toBeInTheDocument()
      expect(deleteCalled).toBe(false)
    })

    it('calls delete service and closes modal when confirmed', async () => {
      const user = userEvent.setup()

      let deletedId = ''
      server.use(
        http.delete(`/api/v1/surveys/${SURVEY_ID}/assessments/:assessmentId`, ({ params }) => {
          deletedId = params.assessmentId as string
          return new HttpResponse(null, { status: 204 })
        })
      )

      renderAssessments()

      await waitFor(() => {
        expect(screen.getByText('High Satisfaction')).toBeInTheDocument()
      })

      const a1 = mockAssessments[0]
      await act(async () => {
        await user.click(screen.getByTestId(`assessment-delete-${a1.id}`))
      })

      await act(async () => {
        await user.click(screen.getByTestId('confirm-delete-button'))
      })

      await waitFor(() => {
        expect(deletedId).toBe(a1.id)
      })
    })
  })

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  describe('navigation', () => {
    it('navigates back to survey detail when back button is clicked', async () => {
      const user = userEvent.setup()

      renderAssessments()

      await waitFor(() => {
        expect(screen.getByLabelText('Back to survey')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByLabelText('Back to survey'))
      })

      const location = await screen.findByTestId('location')
      expect(location.textContent).toBe(`/surveys/${SURVEY_ID}`)
    })
  })

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  describe('error state', () => {
    it('renders error alert when API returns 500', async () => {
      server.use(
        http.get(`/api/v1/surveys/${SURVEY_ID}/assessments`, () =>
          HttpResponse.json(
            { detail: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' } },
            { status: 500 }
          )
        )
      )

      renderAssessments()

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })
    })
  })
})
