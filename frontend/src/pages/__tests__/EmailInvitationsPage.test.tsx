import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { AuthProvider } from '../../contexts/AuthContext'
import { useAuthStore } from '../../store/authStore'
import { clearTokens, setTokens } from '../../services/tokenService'
import { mockTokens, mockUser, mockSurveyFull, mockEmailInvitations } from '../../mocks/handlers'
import EmailInvitationsPage from '../EmailInvitationsPage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

const SURVEY_ID = mockSurveyFull.id // '10000000-0000-0000-0000-000000000002'

function renderPage(surveyId = SURVEY_ID) {
  return render(
    <MemoryRouter
      initialEntries={[`/surveys/${surveyId}/email-invitations`]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AuthProvider>
        <Routes>
          <Route path="/surveys/:id/email-invitations" element={<EmailInvitationsPage />} />
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

describe('EmailInvitationsPage', () => {
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
    it('renders loading skeleton while fetching', async () => {
      server.use(
        http.get(
          `/api/v1/surveys/${SURVEY_ID}/email-invitations`,
          () => new Promise<never>(() => {})
        )
      )

      renderPage()

      expect(screen.getByTestId('table-skeleton')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Data loaded
  // -------------------------------------------------------------------------

  describe('data loaded state', () => {
    it('renders invitation emails in the table', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByText('alice@example.com')).toBeInTheDocument()
      })

      expect(screen.getByText('bob@example.com')).toBeInTheDocument()
    })

    it('renders stats cards after load', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByTestId('stats-cards')).toBeInTheDocument()
      })

      expect(screen.getByTestId('stat-total-sent')).toBeInTheDocument()
    })

    it('renders the page title', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Email Invitations')).toBeInTheDocument()
      })
    })

    it('renders Send Invitation and Send Batch buttons', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByTestId('send-invitation-button')).toBeInTheDocument()
      })

      expect(screen.getByTestId('send-batch-button')).toBeInTheDocument()
    })

    it('renders pagination info', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByTestId('pagination-info')).toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  describe('empty state', () => {
    it('renders empty state when no invitations and no filters', async () => {
      server.use(
        http.get(`/api/v1/surveys/${SURVEY_ID}/email-invitations`, () =>
          HttpResponse.json({ items: [], total: 0, page: 1, per_page: 20, pages: 1 })
        )
      )

      renderPage()

      await waitFor(() => {
        expect(screen.getByTestId('empty-state')).toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // Send Invitation form
  // -------------------------------------------------------------------------

  describe('send invitation form', () => {
    it('opens form when Send Invitation button clicked', async () => {
      const user = userEvent.setup()
      renderPage()

      await waitFor(() => {
        expect(screen.getByTestId('send-invitation-button')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('send-invitation-button'))

      expect(screen.getByTestId('invitation-form-modal')).toBeInTheDocument()
    })

    it('closes form when cancel clicked', async () => {
      const user = userEvent.setup()
      renderPage()

      await waitFor(() => {
        expect(screen.getByTestId('send-invitation-button')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('send-invitation-button'))
      expect(screen.getByTestId('invitation-form-modal')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /cancel/i }))
      expect(screen.queryByTestId('invitation-form-modal')).not.toBeInTheDocument()
    })

    it('sends invitation and closes form on success', async () => {
      const user = userEvent.setup()
      renderPage()

      await waitFor(() => {
        expect(screen.getByTestId('send-invitation-button')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('send-invitation-button'))
      await user.type(screen.getByTestId('inv-email-input'), 'new@example.com')
      await user.click(screen.getByTestId('inv-submit-button'))

      await waitFor(() => {
        expect(screen.queryByTestId('invitation-form-modal')).not.toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // Send Batch dialog
  // -------------------------------------------------------------------------

  describe('send batch dialog', () => {
    it('opens batch dialog when Send Batch button clicked', async () => {
      const user = userEvent.setup()
      renderPage()

      await waitFor(() => {
        expect(screen.getByTestId('send-batch-button')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('send-batch-button'))

      expect(screen.getByTestId('batch-dialog')).toBeInTheDocument()
    })

    it('closes batch dialog on cancel', async () => {
      const user = userEvent.setup()
      renderPage()

      await waitFor(() => {
        expect(screen.getByTestId('send-batch-button')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('send-batch-button'))
      expect(screen.getByTestId('batch-dialog')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /cancel/i }))
      expect(screen.queryByTestId('batch-dialog')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  describe('delete invitation', () => {
    it('shows delete confirmation modal when delete button clicked', async () => {
      const user = userEvent.setup()
      renderPage()

      await waitFor(() => {
        expect(
          screen.getByTestId(`delete-button-${mockEmailInvitations[0].id}`)
        ).toBeInTheDocument()
      })

      await user.click(screen.getByTestId(`delete-button-${mockEmailInvitations[0].id}`))

      const modal = screen.getByTestId('delete-confirm-modal')
      expect(modal).toBeInTheDocument()
      expect(modal).toHaveTextContent('alice@example.com')
    })

    it('closes delete modal on cancel', async () => {
      const user = userEvent.setup()
      renderPage()

      await waitFor(() => {
        expect(
          screen.getByTestId(`delete-button-${mockEmailInvitations[0].id}`)
        ).toBeInTheDocument()
      })

      await user.click(screen.getByTestId(`delete-button-${mockEmailInvitations[0].id}`))
      expect(screen.getByTestId('delete-confirm-modal')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /cancel/i }))
      expect(screen.queryByTestId('delete-confirm-modal')).not.toBeInTheDocument()
    })

    it('deletes invitation and closes modal on confirm', async () => {
      const user = userEvent.setup()
      renderPage()

      await waitFor(() => {
        expect(
          screen.getByTestId(`delete-button-${mockEmailInvitations[0].id}`)
        ).toBeInTheDocument()
      })

      await user.click(screen.getByTestId(`delete-button-${mockEmailInvitations[0].id}`))
      await user.click(screen.getByTestId('confirm-delete-button'))

      await waitFor(() => {
        expect(screen.queryByTestId('delete-confirm-modal')).not.toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------

  describe('filters', () => {
    it('renders status and type filter dropdowns', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByTestId('filter-status-select')).toBeInTheDocument()
      })

      expect(screen.getByTestId('filter-type-select')).toBeInTheDocument()
    })

    it('renders email search input', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByTestId('email-search-input')).toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  describe('error state', () => {
    it('renders error message when API fails', async () => {
      server.use(
        http.get(`/api/v1/surveys/${SURVEY_ID}/email-invitations`, () =>
          HttpResponse.json(
            { detail: { code: 'SERVER_ERROR', message: 'Server error' } },
            { status: 500 }
          )
        )
      )

      renderPage()

      await waitFor(() => {
        expect(screen.getByTestId('page-error')).toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  describe('navigation', () => {
    it('navigates back to survey when back button clicked', async () => {
      const user = userEvent.setup()
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back to survey/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /back to survey/i }))

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent(`/surveys/${SURVEY_ID}`)
      })
    })
  })

  // -------------------------------------------------------------------------
  // Send Reminders
  // -------------------------------------------------------------------------

  describe('send reminders', () => {
    it('renders Send Reminders button', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByTestId('send-reminders-button')).toBeInTheDocument()
      })
    })

    it('opens reminder dialog when Send Reminders button clicked', async () => {
      const user = userEvent.setup()
      renderPage()

      await waitFor(() => {
        expect(screen.getByTestId('send-reminders-button')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('send-reminders-button'))

      expect(screen.getByTestId('send-reminders-dialog')).toBeInTheDocument()
    })

    it('closes reminder dialog on cancel', async () => {
      const user = userEvent.setup()
      renderPage()

      await waitFor(() => {
        expect(screen.getByTestId('send-reminders-button')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('send-reminders-button'))
      expect(screen.getByTestId('send-reminders-dialog')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /cancel/i }))
      expect(screen.queryByTestId('send-reminders-dialog')).not.toBeInTheDocument()
    })

    it('dialog contains days_since_invite and max_reminders inputs', async () => {
      const user = userEvent.setup()
      renderPage()

      await waitFor(() => {
        expect(screen.getByTestId('send-reminders-button')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('send-reminders-button'))

      expect(screen.getByTestId('days-since-invite-input')).toBeInTheDocument()
      expect(screen.getByTestId('max-reminders-input')).toBeInTheDocument()
    })

    it('sends reminders and shows result summary on success', async () => {
      const user = userEvent.setup()
      renderPage()

      await waitFor(() => {
        expect(screen.getByTestId('send-reminders-button')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('send-reminders-button'))
      await user.click(screen.getByTestId('send-reminders-confirm'))

      await waitFor(() => {
        expect(screen.queryByTestId('send-reminders-dialog')).not.toBeInTheDocument()
      })

      await waitFor(() => {
        expect(screen.getByTestId('reminder-results-modal')).toBeInTheDocument()
      })

      expect(screen.getByTestId('reminder-results-modal')).toHaveTextContent('2')
    })

    it('closes reminder results modal on done', async () => {
      const user = userEvent.setup()
      renderPage()

      await waitFor(() => {
        expect(screen.getByTestId('send-reminders-button')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('send-reminders-button'))
      await user.click(screen.getByTestId('send-reminders-confirm'))

      await waitFor(() => {
        expect(screen.getByTestId('reminder-results-modal')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('reminder-results-close'))
      expect(screen.queryByTestId('reminder-results-modal')).not.toBeInTheDocument()
    })

    it('shows error message when send reminders fails', async () => {
      server.use(
        http.post(`/api/v1/surveys/${SURVEY_ID}/email-invitations/send-reminders`, () =>
          HttpResponse.json(
            { detail: { code: 'SERVER_ERROR', message: 'Failed to send reminders' } },
            { status: 500 }
          )
        )
      )

      const user = userEvent.setup()
      renderPage()

      await waitFor(() => {
        expect(screen.getByTestId('send-reminders-button')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('send-reminders-button'))
      await user.click(screen.getByTestId('send-reminders-confirm'))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })

      expect(screen.getByTestId('send-reminders-dialog')).toBeInTheDocument()
    })
  })
})
