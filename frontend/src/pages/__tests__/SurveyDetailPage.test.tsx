import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { AuthProvider } from '../../contexts/AuthContext'
import { useAuthStore } from '../../store/authStore'
import { clearTokens, setTokens } from '../../services/tokenService'
import { mockTokens, mockUser, mockSurveyFull } from '../../mocks/handlers'
import SurveyDetailPage from '../SurveyDetailPage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

const SURVEY_ID = mockSurveyFull.id // '10000000-0000-0000-0000-000000000002'

function renderDetail(id = SURVEY_ID) {
  return render(
    <MemoryRouter
      initialEntries={[`/surveys/${id}`]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AuthProvider>
        <Routes>
          <Route path="/surveys/:id" element={<SurveyDetailPage />} />
          <Route path="/surveys/:id/edit" element={<LocationDisplay />} />
          <Route path="/surveys" element={<LocationDisplay />} />
          <Route
            path="/surveys/30000000-0000-0000-0000-000000000001"
            element={<LocationDisplay />}
          />
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

describe('SurveyDetailPage', () => {
  beforeEach(() => {
    clearTokens()
    localStorage.clear()
    resetAuthStore()
    // Set only the access token (in memory) without storing the refresh token in
    // localStorage. This prevents AuthProvider from calling initialize() on mount,
    // which would trigger async state updates (setPendingInit, set user) outside act().
    // The mock JWT has exp=9999999999, so no proactive refresh occurs either.
    setTokens(mockTokens.access_token)
    localStorage.removeItem('survey_tool_refresh_token')
    // Pre-populate the auth store so components that check isAuthenticated work correctly
    useAuthStore.setState({
      user: mockUser,
      isAuthenticated: true,
      isInitializing: false,
      isLoading: false,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // IMPORTANT: always reset timers to avoid contaminating subsequent tests
    vi.useRealTimers()
  })

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  describe('loading state', () => {
    it('renders loading skeleton while survey is being fetched', async () => {
      // Use a hanging promise so isLoading stays true indefinitely
      server.use(http.get(`/api/v1/surveys/${SURVEY_ID}`, () => new Promise<never>(() => {})))

      renderDetail()

      expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument()
      expect(screen.getByLabelText('Loading survey')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // 404 state
  // -------------------------------------------------------------------------

  describe('not found state', () => {
    it('renders not-found UI for unknown survey ID', async () => {
      renderDetail('nonexistent-id')

      await waitFor(() => {
        expect(screen.getByTestId('survey-not-found')).toBeInTheDocument()
      })

      expect(screen.getByText(/survey not found/i)).toBeInTheDocument()
    })

    it('navigates back to /surveys from not-found state', async () => {
      const user = userEvent.setup()
      renderDetail('nonexistent-id')

      await waitFor(() => {
        expect(screen.getByTestId('survey-not-found')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByRole('button', { name: /back to surveys/i }))
      })

      await waitFor(() => {
        expect(screen.getByTestId('location').textContent).toBe('/surveys')
      })
    })
  })

  // -------------------------------------------------------------------------
  // Data display
  // -------------------------------------------------------------------------

  describe('data display', () => {
    it('renders survey title and status badge', async () => {
      renderDetail()

      await waitFor(() => {
        expect(screen.getByText('Employee Feedback Form')).toBeInTheDocument()
      })

      expect(screen.getByTestId('status-badge')).toBeInTheDocument()
      expect(screen.getByTestId('status-badge').textContent).toBe('draft')
    })

    it('renders survey metadata: description, welcome, end messages', async () => {
      renderDetail()

      await waitFor(() => {
        expect(screen.getByText('Gather employee feedback')).toBeInTheDocument()
      })

      expect(screen.getByText('Welcome to our survey!')).toBeInTheDocument()
      expect(screen.getByText('Thank you for your feedback.')).toBeInTheDocument()
    })

    it('renders the question groups tree', async () => {
      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('groups-tree')).toBeInTheDocument()
      })

      expect(screen.getByText('General Questions')).toBeInTheDocument()
    })

    it('renders questions within groups', async () => {
      renderDetail()

      await waitFor(() => {
        expect(screen.getByText('What is your name?')).toBeInTheDocument()
      })

      expect(screen.getByText('How satisfied are you?')).toBeInTheDocument()
    })

    it('renders answer options for questions that have them', async () => {
      renderDetail()

      await waitFor(() => {
        expect(screen.getByText('Very Satisfied')).toBeInTheDocument()
      })

      expect(screen.getByText('Satisfied')).toBeInTheDocument()
    })

    it('renders empty groups state when survey has no groups', async () => {
      server.use(
        http.get(`/api/v1/surveys/${SURVEY_ID}`, () =>
          HttpResponse.json(
            { ...mockSurveyFull, groups: [], questions: [], options: [] },
            { status: 200 }
          )
        )
      )

      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('no-groups-state')).toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // Status-specific action buttons
  // -------------------------------------------------------------------------

  describe('status action buttons', () => {
    it('shows Activate button for draft surveys', async () => {
      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('activate-button')).toBeInTheDocument()
      })

      expect(screen.queryByTestId('close-button')).not.toBeInTheDocument()
      expect(screen.queryByTestId('archive-button')).not.toBeInTheDocument()
    })

    it('shows Close button for active surveys', async () => {
      server.use(
        http.get(`/api/v1/surveys/${SURVEY_ID}`, () =>
          HttpResponse.json(
            { ...mockSurveyFull, status: 'active', groups: [], questions: [], options: [] },
            { status: 200 }
          )
        )
      )

      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('close-button')).toBeInTheDocument()
      })

      expect(screen.queryByTestId('activate-button')).not.toBeInTheDocument()
      expect(screen.queryByTestId('archive-button')).not.toBeInTheDocument()
    })

    it('shows Archive button for closed surveys', async () => {
      server.use(
        http.get(`/api/v1/surveys/${SURVEY_ID}`, () =>
          HttpResponse.json(
            { ...mockSurveyFull, status: 'closed', groups: [], questions: [], options: [] },
            { status: 200 }
          )
        )
      )

      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('archive-button')).toBeInTheDocument()
      })

      expect(screen.queryByTestId('activate-button')).not.toBeInTheDocument()
      expect(screen.queryByTestId('close-button')).not.toBeInTheDocument()
    })

    it('shows no status transition button for archived surveys', async () => {
      server.use(
        http.get(`/api/v1/surveys/${SURVEY_ID}`, () =>
          HttpResponse.json(
            { ...mockSurveyFull, status: 'archived', groups: [], questions: [], options: [] },
            { status: 200 }
          )
        )
      )

      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('survey-detail-page')).toBeInTheDocument()
      })

      expect(screen.queryByTestId('activate-button')).not.toBeInTheDocument()
      expect(screen.queryByTestId('close-button')).not.toBeInTheDocument()
      expect(screen.queryByTestId('archive-button')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Confirmation modal: Activate
  // -------------------------------------------------------------------------

  describe('activate flow', () => {
    it('opens confirm modal when Activate is clicked', async () => {
      const user = userEvent.setup()
      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('activate-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('activate-button'))
      })

      await screen.findByTestId('confirm-modal')
      expect(screen.getByText(/activate survey/i)).toBeInTheDocument()
    })

    it('cancels modal without making API call', async () => {
      const user = userEvent.setup()
      let activateCalled = false
      server.use(
        http.post(`/api/v1/surveys/${SURVEY_ID}/activate`, () => {
          activateCalled = true
          return HttpResponse.json({}, { status: 200 })
        })
      )

      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('activate-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('activate-button'))
      })
      await screen.findByTestId('confirm-modal')

      await act(async () => {
        await user.click(screen.getByRole('button', { name: /cancel/i }))
      })

      expect(screen.queryByTestId('confirm-modal')).not.toBeInTheDocument()
      expect(activateCalled).toBe(false)
    })

    it('activates survey and updates status badge on confirm', async () => {
      const user = userEvent.setup()
      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('activate-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('activate-button'))
      })
      await act(async () => {
        await user.click(screen.getByTestId('confirm-button'))
      })

      await waitFor(() => {
        expect(screen.queryByTestId('confirm-modal')).not.toBeInTheDocument()
      })

      // Status badge should now show 'active'
      await waitFor(() => {
        expect(screen.getByTestId('status-badge').textContent).toBe('active')
      })
    })

    it('shows backend error in modal when activation fails (e.g. no questions)', async () => {
      const user = userEvent.setup()
      server.use(
        http.post(`/api/v1/surveys/${SURVEY_ID}/activate`, () =>
          HttpResponse.json(
            {
              detail: {
                code: 'VALIDATION_ERROR',
                message: 'Survey must have at least one question to activate',
              },
            },
            { status: 422 }
          )
        )
      )

      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('activate-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('activate-button'))
      })
      await act(async () => {
        await user.click(screen.getByTestId('confirm-button'))
      })

      await waitFor(() => {
        // Modal stays open with error message
        expect(screen.getByTestId('confirm-modal')).toBeInTheDocument()
        expect(screen.getByRole('alert')).toBeInTheDocument()
        expect(screen.getByRole('alert').textContent).toMatch(/at least one question/i)
      })
    })
  })

  // -------------------------------------------------------------------------
  // Confirmation modal: Close
  // -------------------------------------------------------------------------

  describe('close flow', () => {
    beforeEach(() => {
      server.use(
        http.get(`/api/v1/surveys/${SURVEY_ID}`, () =>
          HttpResponse.json(
            { ...mockSurveyFull, status: 'active', groups: [], questions: [], options: [] },
            { status: 200 }
          )
        )
      )
    })

    it('opens confirm modal when Close is clicked', async () => {
      const user = userEvent.setup()
      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('close-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('close-button'))
      })

      await screen.findByTestId('confirm-modal')
      expect(screen.getByRole('heading', { name: /close survey/i })).toBeInTheDocument()
    })

    it('closes survey and updates status on confirm', async () => {
      const user = userEvent.setup()
      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('close-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('close-button'))
      })
      await act(async () => {
        await user.click(screen.getByTestId('confirm-button'))
      })

      await waitFor(() => {
        expect(screen.queryByTestId('confirm-modal')).not.toBeInTheDocument()
      })

      await waitFor(() => {
        expect(screen.getByTestId('status-badge').textContent).toBe('closed')
      })
    })
  })

  // -------------------------------------------------------------------------
  // Confirmation modal: Archive
  // -------------------------------------------------------------------------

  describe('archive flow', () => {
    beforeEach(() => {
      server.use(
        http.get(`/api/v1/surveys/${SURVEY_ID}`, () =>
          HttpResponse.json(
            { ...mockSurveyFull, status: 'closed', groups: [], questions: [], options: [] },
            { status: 200 }
          )
        )
      )
    })

    it('opens confirm modal when Archive is clicked', async () => {
      const user = userEvent.setup()
      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('archive-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('archive-button'))
      })

      await screen.findByTestId('confirm-modal')
      expect(screen.getByText(/archive survey/i)).toBeInTheDocument()
    })

    it('archives survey and updates status on confirm', async () => {
      const user = userEvent.setup()
      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('archive-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('archive-button'))
      })
      await act(async () => {
        await user.click(screen.getByTestId('confirm-button'))
      })

      await waitFor(() => {
        expect(screen.queryByTestId('confirm-modal')).not.toBeInTheDocument()
      })

      await waitFor(() => {
        expect(screen.getByTestId('status-badge').textContent).toBe('archived')
      })
    })
  })

  // -------------------------------------------------------------------------
  // Edit button
  // -------------------------------------------------------------------------

  describe('edit button', () => {
    it('shows Edit button for draft surveys', async () => {
      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('edit-button')).toBeInTheDocument()
      })
    })

    it('does not show Edit button for non-draft surveys', async () => {
      server.use(
        http.get(`/api/v1/surveys/${SURVEY_ID}`, () =>
          HttpResponse.json(
            { ...mockSurveyFull, status: 'active', groups: [], questions: [], options: [] },
            { status: 200 }
          )
        )
      )

      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('survey-detail-page')).toBeInTheDocument()
      })

      expect(screen.queryByTestId('edit-button')).not.toBeInTheDocument()
    })

    it('navigates to /surveys/:id/edit when Edit is clicked', async () => {
      const user = userEvent.setup()
      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('edit-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('edit-button'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('location').textContent).toBe(`/surveys/${SURVEY_ID}/edit`)
      })
    })
  })

  // -------------------------------------------------------------------------
  // Clone
  // -------------------------------------------------------------------------

  describe('clone flow', () => {
    it('shows Clone button for all statuses', async () => {
      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('clone-button')).toBeInTheDocument()
      })
    })

    it('opens confirm modal when Clone is clicked', async () => {
      const user = userEvent.setup()
      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('clone-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('clone-button'))
      })

      await screen.findByTestId('confirm-modal')
      expect(screen.getByText(/clone survey/i)).toBeInTheDocument()
    })

    it('clones survey and navigates to new survey on confirm', async () => {
      const user = userEvent.setup()
      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('clone-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('clone-button'))
      })
      await act(async () => {
        await user.click(screen.getByTestId('confirm-button'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('location').textContent).toBe(
          '/surveys/30000000-0000-0000-0000-000000000001'
        )
      })
    })
  })

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------

  describe('export', () => {
    it('shows Export button for all statuses', async () => {
      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('export-button')).toBeInTheDocument()
      })
    })

    it('triggers file download when Export is clicked', async () => {
      const user = userEvent.setup()

      // JSDOM does not implement URL.createObjectURL — define mocks directly
      const mockBlobUrl = 'blob:mock-url'
      const createObjectURL = vi.fn().mockReturnValue(mockBlobUrl)
      const revokeObjectURL = vi.fn()
      URL.createObjectURL = createObjectURL
      URL.revokeObjectURL = revokeObjectURL

      // Spy on anchor click
      const mockClick = vi.fn()
      const originalCreateElement = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation(
        (tag: string, options?: ElementCreationOptions) => {
          const el = originalCreateElement(tag, options)
          if (tag === 'a') {
            el.click = mockClick
          }
          return el
        }
      )

      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('export-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('export-button'))
      })

      await waitFor(() => {
        expect(createObjectURL).toHaveBeenCalled()
      })
    })
  })

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  describe('delete flow', () => {
    it('shows Delete button for all statuses', async () => {
      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('delete-button')).toBeInTheDocument()
      })
    })

    it('opens confirm modal when Delete is clicked', async () => {
      const user = userEvent.setup()
      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('delete-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('delete-button'))
      })

      await screen.findByTestId('confirm-modal')
      expect(screen.getByText(/delete survey/i)).toBeInTheDocument()
    })

    it('navigates to /surveys after successful delete', async () => {
      const user = userEvent.setup()
      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('delete-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('delete-button'))
      })
      await act(async () => {
        await user.click(screen.getByTestId('confirm-button'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('location').textContent).toBe('/surveys')
      })
    })

    it('cancels modal without deleting', async () => {
      const user = userEvent.setup()
      let deleteCalled = false
      server.use(
        http.delete(`/api/v1/surveys/${SURVEY_ID}`, () => {
          deleteCalled = true
          return new HttpResponse(null, { status: 204 })
        })
      )

      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('delete-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('delete-button'))
      })
      await act(async () => {
        await user.click(screen.getByRole('button', { name: /cancel/i }))
      })

      await new Promise((r) => setTimeout(r, 50))
      expect(deleteCalled).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // Back navigation
  // -------------------------------------------------------------------------

  describe('back navigation', () => {
    it('navigates to /surveys when back button is clicked', async () => {
      const user = userEvent.setup()
      renderDetail()

      await waitFor(() => {
        expect(screen.getByTestId('survey-detail-page')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByLabelText('Back to surveys'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('location').textContent).toBe('/surveys')
      })
    })
  })

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  describe('error state', () => {
    it('renders error when API returns 500', async () => {
      server.use(
        http.get(`/api/v1/surveys/${SURVEY_ID}`, () =>
          HttpResponse.json(
            { detail: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' } },
            { status: 500 }
          )
        )
      )

      renderDetail()

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })
    })
  })
})
