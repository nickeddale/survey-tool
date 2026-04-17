import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { AuthProvider } from '../../contexts/AuthContext'
import { useAuthStore } from '../../store/authStore'
import { clearTokens, setTokens } from '../../services/tokenService'
import { mockTokens, mockUser, mockSurveyFull, mockParticipants } from '../../mocks/handlers'
import ParticipantsPage from '../ParticipantsPage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

const SURVEY_ID = mockSurveyFull.id // '10000000-0000-0000-0000-000000000002'

function renderParticipants(surveyId = SURVEY_ID) {
  return render(
    <MemoryRouter
      initialEntries={[`/surveys/${surveyId}/participants`]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AuthProvider>
        <Routes>
          <Route path="/surveys/:id/participants" element={<ParticipantsPage />} />
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

describe('ParticipantsPage', () => {
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
        http.get(`/api/v1/surveys/${SURVEY_ID}/participants`, () => new Promise<never>(() => {}))
      )

      renderParticipants()

      expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Data loaded
  // -------------------------------------------------------------------------

  describe('data loaded state', () => {
    it('renders participant emails in the table', async () => {
      renderParticipants()

      await waitFor(() => {
        expect(screen.getByText('alice@example.com')).toBeInTheDocument()
      })

      expect(screen.getByText('bob@example.com')).toBeInTheDocument()
    })

    it('renders table headers', async () => {
      renderParticipants()

      await waitFor(() => {
        expect(screen.getByText('alice@example.com')).toBeInTheDocument()
      })

      expect(screen.getByText('Email')).toBeInTheDocument()
      expect(screen.getByText('Token')).toBeInTheDocument()
      expect(screen.getByText('Uses Remaining')).toBeInTheDocument()
      expect(screen.getByText('Valid From')).toBeInTheDocument()
      expect(screen.getByText('Valid Until')).toBeInTheDocument()
      expect(screen.getByText('Status')).toBeInTheDocument()
    })

    it('renders completed and pending badges', async () => {
      renderParticipants()

      await waitFor(() => {
        expect(screen.getByText('alice@example.com')).toBeInTheDocument()
      })

      const p1 = mockParticipants[0]
      const p2 = mockParticipants[1]

      // p1 not completed → pending badge
      expect(screen.getByTestId(`participant-pending-badge-${p1.id}`)).toBeInTheDocument()
      // p2 completed
      expect(screen.getByTestId(`participant-completed-badge-${p2.id}`)).toBeInTheDocument()
    })

    it('renders edit and delete buttons for each participant', async () => {
      renderParticipants()

      await waitFor(() => {
        expect(screen.getByText('alice@example.com')).toBeInTheDocument()
      })

      const p1 = mockParticipants[0]
      expect(screen.getByTestId(`participant-edit-${p1.id}`)).toBeInTheDocument()
      expect(screen.getByTestId(`participant-delete-${p1.id}`)).toBeInTheDocument()
    })

    it('renders masked token for each participant', async () => {
      renderParticipants()

      await waitFor(() => {
        expect(screen.getByText('alice@example.com')).toBeInTheDocument()
      })

      const p1 = mockParticipants[0]
      expect(screen.getByTestId(`participant-token-${p1.id}`)).toBeInTheDocument()
      expect(screen.getByTestId(`participant-token-${p1.id}`).textContent).toMatch(/^••••/)
    })
  })

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  describe('empty state', () => {
    it('renders empty state when there are no participants', async () => {
      server.use(
        http.get(`/api/v1/surveys/${SURVEY_ID}/participants`, () =>
          HttpResponse.json(
            { items: [], total: 0, page: 1, per_page: 20, pages: 1 },
            { status: 200 }
          )
        )
      )

      renderParticipants()

      await waitFor(() => {
        expect(screen.getByTestId('empty-state')).toBeInTheDocument()
      })

      expect(screen.getByText(/no participants have been added/i)).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /add your first participant/i })
      ).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Create participant
  // -------------------------------------------------------------------------

  describe('create participant', () => {
    it('opens the create form when Add Participant button is clicked', async () => {
      const user = userEvent.setup()

      renderParticipants()

      await waitFor(() => {
        expect(screen.getByTestId('create-participant-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('create-participant-button'))
      })

      expect(screen.getByTestId('participant-form-dialog')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Add Participant' })).toBeInTheDocument()
    })

    it('closes the form when Cancel is clicked', async () => {
      const user = userEvent.setup()

      renderParticipants()

      await waitFor(() => {
        expect(screen.getByTestId('create-participant-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('create-participant-button'))
      })

      expect(screen.getByTestId('participant-form-dialog')).toBeInTheDocument()

      await act(async () => {
        await user.click(screen.getByRole('button', { name: /cancel/i }))
      })

      expect(screen.queryByTestId('participant-form-dialog')).not.toBeInTheDocument()
    })

    it('shows token display after successful creation', async () => {
      const user = userEvent.setup()

      renderParticipants()

      await waitFor(() => {
        expect(screen.getByTestId('create-participant-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('create-participant-button'))
      })

      await act(async () => {
        await user.type(screen.getByTestId('participant-email-input'), 'newuser@example.com')
      })

      await act(async () => {
        await user.click(screen.getByTestId('participant-form-submit'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('token-display-dialog')).toBeInTheDocument()
      })

      expect(screen.getByTestId('created-token-value')).toBeInTheDocument()
      expect(screen.getByTestId('created-token-value').textContent).toBe(
        'mock-token-abc123xyz456def789ghi0'
      )
    })

    it('closes token display when acknowledged', async () => {
      const user = userEvent.setup()

      renderParticipants()

      await waitFor(() => {
        expect(screen.getByTestId('create-participant-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('create-participant-button'))
      })

      await act(async () => {
        await user.type(screen.getByTestId('participant-email-input'), 'newuser@example.com')
      })

      await act(async () => {
        await user.click(screen.getByTestId('participant-form-submit'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('token-display-dialog')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('token-acknowledge-button'))
      })

      await waitFor(() => {
        expect(screen.queryByTestId('token-display-dialog')).not.toBeInTheDocument()
        expect(screen.queryByTestId('participant-form-dialog')).not.toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // Edit participant
  // -------------------------------------------------------------------------

  describe('edit participant', () => {
    it('opens the edit form with pre-filled email when Edit is clicked', async () => {
      const user = userEvent.setup()

      renderParticipants()

      await waitFor(() => {
        expect(screen.getByText('alice@example.com')).toBeInTheDocument()
      })

      const p1 = mockParticipants[0]
      await act(async () => {
        await user.click(screen.getByTestId(`participant-edit-${p1.id}`))
      })

      expect(screen.getByTestId('participant-form-dialog')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Edit Participant' })).toBeInTheDocument()

      const emailInput = screen.getByTestId('participant-email-input') as HTMLInputElement
      expect(emailInput.value).toBe('alice@example.com')
    })

    it('submits the edit form and closes modal', async () => {
      const user = userEvent.setup()

      let patchCalled = false
      server.use(
        http.patch(`/api/v1/surveys/${SURVEY_ID}/participants/:participantId`, async () => {
          patchCalled = true
          return HttpResponse.json(
            { ...mockParticipants[0], email: 'alice-updated@example.com' },
            { status: 200 }
          )
        })
      )

      renderParticipants()

      await waitFor(() => {
        expect(screen.getByText('alice@example.com')).toBeInTheDocument()
      })

      const p1 = mockParticipants[0]
      await act(async () => {
        await user.click(screen.getByTestId(`participant-edit-${p1.id}`))
      })

      const emailInput = screen.getByTestId('participant-email-input')
      await act(async () => {
        await user.clear(emailInput)
        await user.type(emailInput, 'alice-updated@example.com')
      })

      await act(async () => {
        await user.click(screen.getByTestId('participant-form-submit'))
      })

      await waitFor(() => {
        expect(patchCalled).toBe(true)
      })
    })
  })

  // -------------------------------------------------------------------------
  // Delete participant
  // -------------------------------------------------------------------------

  describe('delete participant', () => {
    it('shows delete confirmation modal when Delete is clicked', async () => {
      const user = userEvent.setup()

      renderParticipants()

      await waitFor(() => {
        expect(screen.getByText('alice@example.com')).toBeInTheDocument()
      })

      const p1 = mockParticipants[0]
      await act(async () => {
        await user.click(screen.getByTestId(`participant-delete-${p1.id}`))
      })

      expect(screen.getByTestId('delete-confirm-modal')).toBeInTheDocument()
      expect(screen.getByTestId('delete-confirm-modal')).toHaveTextContent('alice@example.com')
    })

    it('cancels delete when Cancel is clicked', async () => {
      const user = userEvent.setup()

      let deleteCalled = false
      server.use(
        http.delete(`/api/v1/surveys/${SURVEY_ID}/participants/:participantId`, () => {
          deleteCalled = true
          return new HttpResponse(null, { status: 204 })
        })
      )

      renderParticipants()

      await waitFor(() => {
        expect(screen.getByText('alice@example.com')).toBeInTheDocument()
      })

      const p1 = mockParticipants[0]
      await act(async () => {
        await user.click(screen.getByTestId(`participant-delete-${p1.id}`))
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
        http.delete(`/api/v1/surveys/${SURVEY_ID}/participants/:participantId`, ({ params }) => {
          deletedId = params.participantId as string
          return new HttpResponse(null, { status: 204 })
        })
      )

      renderParticipants()

      await waitFor(() => {
        expect(screen.getByText('alice@example.com')).toBeInTheDocument()
      })

      const p1 = mockParticipants[0]
      await act(async () => {
        await user.click(screen.getByTestId(`participant-delete-${p1.id}`))
      })

      await act(async () => {
        await user.click(screen.getByTestId('confirm-delete-button'))
      })

      await waitFor(() => {
        expect(deletedId).toBe(p1.id)
      })
    })
  })

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  describe('navigation', () => {
    it('navigates back to survey detail when back button is clicked', async () => {
      const user = userEvent.setup()

      renderParticipants()

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
        http.get(`/api/v1/surveys/${SURVEY_ID}/participants`, () =>
          HttpResponse.json(
            { detail: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' } },
            { status: 500 }
          )
        )
      )

      renderParticipants()

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------

  describe('filters', () => {
    it('renders filter controls', async () => {
      renderParticipants()

      await waitFor(() => {
        expect(screen.getByTestId('email-search-input')).toBeInTheDocument()
      })

      expect(screen.getByTestId('filter-completed-select')).toBeInTheDocument()
      expect(screen.getByTestId('filter-valid-select')).toBeInTheDocument()
    })

    it('sends completed filter to API when changed', async () => {
      const user = userEvent.setup()

      let capturedUrl = ''
      server.use(
        http.get(`/api/v1/surveys/${SURVEY_ID}/participants`, ({ request }) => {
          capturedUrl = request.url
          return HttpResponse.json(
            { items: [], total: 0, page: 1, per_page: 20, pages: 1 },
            { status: 200 }
          )
        })
      )

      renderParticipants()

      await waitFor(() => {
        expect(screen.getByTestId('filter-completed-select')).toBeInTheDocument()
      })

      await act(async () => {
        await user.selectOptions(screen.getByTestId('filter-completed-select'), 'true')
      })

      await waitFor(() => {
        expect(capturedUrl).toContain('completed=true')
      })
    })
  })

  // -------------------------------------------------------------------------
  // CSV Import
  // -------------------------------------------------------------------------

  describe('CSV import', () => {
    it('opens CSV import dialog when Import CSV button is clicked', async () => {
      const user = userEvent.setup()

      renderParticipants()

      await waitFor(() => {
        expect(screen.getByTestId('csv-import-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('csv-import-button'))
      })

      expect(screen.getByTestId('csv-import-dialog')).toBeInTheDocument()
    })

    it('closes CSV import dialog when Cancel is clicked', async () => {
      const user = userEvent.setup()

      renderParticipants()

      await waitFor(() => {
        expect(screen.getByTestId('csv-import-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('csv-import-button'))
      })

      expect(screen.getByTestId('csv-import-dialog')).toBeInTheDocument()

      await act(async () => {
        await user.click(screen.getByRole('button', { name: /cancel/i }))
      })

      expect(screen.queryByTestId('csv-import-dialog')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------

  describe('pagination', () => {
    it('renders pagination info', async () => {
      renderParticipants()

      await waitFor(() => {
        expect(screen.getByTestId('pagination-info')).toBeInTheDocument()
      })

      expect(screen.getByTestId('pagination-info').textContent).toMatch(/Page 1/)
    })
  })

  // -------------------------------------------------------------------------
  // Copy link clipboard errors
  // -------------------------------------------------------------------------

  describe('copy link clipboard errors', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    function mockClipboardAfterSetup(writeText: ReturnType<typeof vi.fn>) {
      // Must be called AFTER userEvent.setup() since setup() installs its own clipboard
      Object.defineProperty(window.navigator, 'clipboard', {
        value: { writeText },
        writable: true,
        configurable: true,
      })
    }

    it('shows error message when clipboard rejects on copy link', async () => {
      const user = userEvent.setup()
      // Mock after setup() so our mock takes precedence over userEvent's virtual clipboard
      mockClipboardAfterSetup(vi.fn().mockRejectedValue(new Error('Permission denied')))

      renderParticipants()

      await waitFor(() => {
        expect(screen.getByText('alice@example.com')).toBeInTheDocument()
      })

      const p1 = mockParticipants[0]
      await act(async () => {
        await user.click(screen.getByTestId(`participant-copy-link-${p1.id}`))
      })

      await waitFor(() => {
        expect(screen.getByTestId('copy-link-error')).toBeInTheDocument()
      })
      expect(screen.getByTestId('copy-link-error')).toHaveTextContent(
        'Failed to copy link to clipboard'
      )
    })

    it('does not show error when clipboard succeeds on copy link', async () => {
      const user = userEvent.setup()
      mockClipboardAfterSetup(vi.fn().mockResolvedValue(undefined))

      renderParticipants()

      await waitFor(() => {
        expect(screen.getByText('alice@example.com')).toBeInTheDocument()
      })

      const p1 = mockParticipants[0]
      await act(async () => {
        await user.click(screen.getByTestId(`participant-copy-link-${p1.id}`))
      })

      expect(screen.queryByTestId('copy-link-error')).not.toBeInTheDocument()
    })

    it('auto-clears copy link error after 3 seconds', async () => {
      const user = userEvent.setup()
      // Mock after setup() so our mock takes precedence over userEvent's virtual clipboard
      mockClipboardAfterSetup(vi.fn().mockRejectedValue(new Error('Permission denied')))

      renderParticipants()

      await waitFor(() => {
        expect(screen.getByText('alice@example.com')).toBeInTheDocument()
      })

      const p1 = mockParticipants[0]
      await act(async () => {
        await user.click(screen.getByTestId(`participant-copy-link-${p1.id}`))
      })

      await waitFor(() => {
        expect(screen.getByTestId('copy-link-error')).toBeInTheDocument()
      })

      // Advance real timers to clear the error
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 3100))
      })

      expect(screen.queryByTestId('copy-link-error')).not.toBeInTheDocument()
    })
  })
})
