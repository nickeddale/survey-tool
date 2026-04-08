import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { AuthProvider } from '../../contexts/AuthContext'
import { useAuthStore } from '../../store/authStore'
import { clearTokens, setTokens } from '../../services/tokenService'
import { mockTokens, mockUser, mockSurveyFull, mockQuotas } from '../../mocks/handlers'
import QuotasPage from '../QuotasPage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

const SURVEY_ID = mockSurveyFull.id // '10000000-0000-0000-0000-000000000002'

function renderQuotas(surveyId = SURVEY_ID) {
  return render(
    <MemoryRouter
      initialEntries={[`/surveys/${surveyId}/quotas`]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AuthProvider>
        <Routes>
          <Route path="/surveys/:id/quotas" element={<QuotasPage />} />
          <Route path="/surveys/:id" element={<LocationDisplay />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function resetAuthStore() {
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QuotasPage', () => {
  beforeEach(() => {
    clearTokens()
    localStorage.clear()
    resetAuthStore()
    setTokens(mockTokens.access_token)
    localStorage.removeItem('devtracker_refresh_token')
    useAuthStore.setState({ user: mockUser, isAuthenticated: true, isLoading: false })
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
        http.get(`/api/v1/surveys/${SURVEY_ID}/quotas`, () => new Promise<never>(() => {})),
      )

      renderQuotas()

      expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Data loaded
  // -------------------------------------------------------------------------

  describe('data loaded state', () => {
    it('renders quota names in the table', async () => {
      renderQuotas()

      await waitFor(() => {
        expect(screen.getByText('Age 18-35 Limit')).toBeInTheDocument()
      })

      expect(screen.getByText('Male Respondents')).toBeInTheDocument()
    })

    it('renders progress bars for each quota', async () => {
      renderQuotas()

      await waitFor(() => {
        expect(screen.getByText('Age 18-35 Limit')).toBeInTheDocument()
      })

      const progressBars = screen.getAllByTestId('quota-progress-bar')
      expect(progressBars.length).toBeGreaterThanOrEqual(2)
    })

    it('renders active/inactive badges', async () => {
      renderQuotas()

      await waitFor(() => {
        expect(screen.getByText('Age 18-35 Limit')).toBeInTheDocument()
      })

      const quota1 = mockQuotas[0]
      const quota2 = mockQuotas[1]

      expect(screen.getByTestId(`quota-active-badge-${quota1.id}`)).toBeInTheDocument()
      expect(screen.getByTestId(`quota-inactive-badge-${quota2.id}`)).toBeInTheDocument()
    })

    it('renders action badges', async () => {
      renderQuotas()

      await waitFor(() => {
        expect(screen.getByText('Terminate')).toBeInTheDocument()
      })

      expect(screen.getByText('Hide Question')).toBeInTheDocument()
    })

    it('renders table headers', async () => {
      renderQuotas()

      await waitFor(() => {
        expect(screen.getByText('Name')).toBeInTheDocument()
      })

      expect(screen.getByText('Progress')).toBeInTheDocument()
      expect(screen.getByText('Action')).toBeInTheDocument()
      expect(screen.getByText('Status')).toBeInTheDocument()
      expect(screen.getByText('Actions')).toBeInTheDocument()
    })

    it('shows edit and delete buttons for each quota', async () => {
      renderQuotas()

      await waitFor(() => {
        expect(screen.getByText('Age 18-35 Limit')).toBeInTheDocument()
      })

      const quota1 = mockQuotas[0]
      expect(screen.getByTestId(`quota-edit-${quota1.id}`)).toBeInTheDocument()
      expect(screen.getByTestId(`quota-delete-${quota1.id}`)).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  describe('empty state', () => {
    it('renders empty state when there are no quotas', async () => {
      server.use(
        http.get(`/api/v1/surveys/${SURVEY_ID}/quotas`, () =>
          HttpResponse.json(
            { items: [], total: 0, page: 1, per_page: 10, total_pages: 1 },
            { status: 200 },
          ),
        ),
      )

      renderQuotas()

      await waitFor(() => {
        expect(screen.getByTestId('empty-state')).toBeInTheDocument()
      })

      expect(screen.getByText(/no quotas have been configured/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /create your first quota/i })).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Create quota
  // -------------------------------------------------------------------------

  describe('create quota', () => {
    it('opens the create form when Create Quota button is clicked', async () => {
      const user = userEvent.setup()

      renderQuotas()

      await waitFor(() => {
        expect(screen.getByTestId('create-quota-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('create-quota-button'))
      })

      expect(screen.getByTestId('quota-form-dialog')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Create Quota' })).toBeInTheDocument()
    })

    it('closes the form when Cancel is clicked', async () => {
      const user = userEvent.setup()

      renderQuotas()

      await waitFor(() => {
        expect(screen.getByTestId('create-quota-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('create-quota-button'))
      })

      expect(screen.getByTestId('quota-form-dialog')).toBeInTheDocument()

      await act(async () => {
        await user.click(screen.getByRole('button', { name: /cancel/i }))
      })

      expect(screen.queryByTestId('quota-form-dialog')).not.toBeInTheDocument()
    })

    it('submits new quota and refreshes the list', async () => {
      const user = userEvent.setup()

      let createCalled = false
      server.use(
        http.post(`/api/v1/surveys/${SURVEY_ID}/quotas`, async ({ request }) => {
          createCalled = true
          const body = (await request.json()) as Record<string, unknown>
          return HttpResponse.json(
            {
              id: 'quota-new-test',
              survey_id: SURVEY_ID,
              name: body.name as string,
              limit: body.limit as number,
              current_count: 0,
              action: body.action as string,
              conditions: [],
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { status: 201 },
          )
        }),
      )

      renderQuotas()

      await waitFor(() => {
        expect(screen.getByTestId('create-quota-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('create-quota-button'))
      })

      await act(async () => {
        await user.type(screen.getByTestId('quota-name-input'), 'Test Quota')
        await user.type(screen.getByTestId('quota-limit-input'), '200')
        // Add a condition (required — empty conditions are rejected by frontend validation)
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

      await waitFor(() => {
        expect(createCalled).toBe(true)
      })
    })

    it('shows validation error when name is empty', async () => {
      const user = userEvent.setup()

      renderQuotas()

      await waitFor(() => {
        expect(screen.getByTestId('create-quota-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('create-quota-button'))
      })

      // Submit without filling in the name
      await act(async () => {
        await user.type(screen.getByTestId('quota-limit-input'), '100')
        await user.click(screen.getByTestId('quota-form-submit'))
      })

      expect(screen.getByTestId('quota-form-error')).toBeInTheDocument()
      expect(screen.getByTestId('quota-form-error').textContent).toMatch(/name is required/i)
    })

    it('shows validation error when limit is invalid', async () => {
      const user = userEvent.setup()

      renderQuotas()

      await waitFor(() => {
        expect(screen.getByTestId('create-quota-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('create-quota-button'))
      })

      await act(async () => {
        await user.type(screen.getByTestId('quota-name-input'), 'Test Quota')
        await user.type(screen.getByTestId('quota-limit-input'), '-5')
        await user.click(screen.getByTestId('quota-form-submit'))
      })

      expect(screen.getByTestId('quota-form-error')).toBeInTheDocument()
      expect(screen.getByTestId('quota-form-error').textContent).toMatch(/limit must be a positive integer/i)
    })
  })

  // -------------------------------------------------------------------------
  // Edit quota
  // -------------------------------------------------------------------------

  describe('edit quota', () => {
    it('opens the edit form with pre-filled values when Edit is clicked', async () => {
      const user = userEvent.setup()

      renderQuotas()

      await waitFor(() => {
        expect(screen.getByText('Age 18-35 Limit')).toBeInTheDocument()
      })

      const quota1 = mockQuotas[0]
      await act(async () => {
        await user.click(screen.getByTestId(`quota-edit-${quota1.id}`))
      })

      expect(screen.getByTestId('quota-form-dialog')).toBeInTheDocument()
      expect(screen.getByText('Edit Quota')).toBeInTheDocument()

      // Name should be pre-filled
      const nameInput = screen.getByTestId('quota-name-input') as HTMLInputElement
      expect(nameInput.value).toBe(quota1.name)

      // Limit should be pre-filled
      const limitInput = screen.getByTestId('quota-limit-input') as HTMLInputElement
      expect(limitInput.value).toBe(String(quota1.limit))
    })
  })

  // -------------------------------------------------------------------------
  // Delete quota
  // -------------------------------------------------------------------------

  describe('delete quota', () => {
    it('shows delete confirmation modal when Delete is clicked', async () => {
      const user = userEvent.setup()

      renderQuotas()

      await waitFor(() => {
        expect(screen.getByText('Age 18-35 Limit')).toBeInTheDocument()
      })

      const quota1 = mockQuotas[0]
      await act(async () => {
        await user.click(screen.getByTestId(`quota-delete-${quota1.id}`))
      })

      expect(screen.getByTestId('delete-confirm-modal')).toBeInTheDocument()
      // The modal shows the quota name in the confirmation message
      expect(screen.getByTestId('delete-confirm-modal')).toHaveTextContent('Age 18-35 Limit')
    })

    it('cancels delete when Cancel is clicked', async () => {
      const user = userEvent.setup()

      let deleteCalled = false
      server.use(
        http.delete(`/api/v1/surveys/${SURVEY_ID}/quotas/:quotaId`, () => {
          deleteCalled = true
          return new HttpResponse(null, { status: 204 })
        }),
      )

      renderQuotas()

      await waitFor(() => {
        expect(screen.getByText('Age 18-35 Limit')).toBeInTheDocument()
      })

      const quota1 = mockQuotas[0]
      await act(async () => {
        await user.click(screen.getByTestId(`quota-delete-${quota1.id}`))
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
        http.delete(`/api/v1/surveys/${SURVEY_ID}/quotas/:quotaId`, ({ params }) => {
          deletedId = params.quotaId as string
          return new HttpResponse(null, { status: 204 })
        }),
      )

      renderQuotas()

      await waitFor(() => {
        expect(screen.getByText('Age 18-35 Limit')).toBeInTheDocument()
      })

      const quota1 = mockQuotas[0]
      await act(async () => {
        await user.click(screen.getByTestId(`quota-delete-${quota1.id}`))
      })

      await act(async () => {
        await user.click(screen.getByTestId('confirm-delete-button'))
      })

      await waitFor(() => {
        expect(deletedId).toBe(quota1.id)
      })
    })
  })

  // -------------------------------------------------------------------------
  // Toggle active
  // -------------------------------------------------------------------------

  describe('toggle active', () => {
    it('calls update with toggled is_active when toggle button is clicked', async () => {
      const user = userEvent.setup()

      let patchBody: Record<string, unknown> | null = null
      server.use(
        http.patch(`/api/v1/surveys/${SURVEY_ID}/quotas/:quotaId`, async ({ request, params }) => {
          const body = (await request.json()) as Record<string, unknown>
          patchBody = body
          const quota = mockQuotas.find((q) => q.id === params.quotaId)
          if (!quota) {
            return HttpResponse.json({ detail: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 })
          }
          return HttpResponse.json(
            { ...quota, ...body, updated_at: new Date().toISOString() },
            { status: 200 },
          )
        }),
      )

      renderQuotas()

      await waitFor(() => {
        expect(screen.getByText('Age 18-35 Limit')).toBeInTheDocument()
      })

      const quota1 = mockQuotas[0] // is_active: true
      await act(async () => {
        await user.click(screen.getByTestId(`quota-toggle-${quota1.id}`))
      })

      await waitFor(() => {
        expect(patchBody).not.toBeNull()
        expect(patchBody!.is_active).toBe(false) // toggled from true to false
      })
    })
  })

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  describe('navigation', () => {
    it('navigates back to survey detail when back button is clicked', async () => {
      const user = userEvent.setup()

      renderQuotas()

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
        http.get(`/api/v1/surveys/${SURVEY_ID}/quotas`, () =>
          HttpResponse.json(
            { detail: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' } },
            { status: 500 },
          ),
        ),
      )

      renderQuotas()

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // Progress bar
  // -------------------------------------------------------------------------

  describe('progress bar', () => {
    it('renders progress bar with correct percentage', async () => {
      renderQuotas()

      await waitFor(() => {
        expect(screen.getByText('Age 18-35 Limit')).toBeInTheDocument()
      })

      // quota1: current_count=45, limit=100 → 45%
      const progressBars = screen.getAllByRole('progressbar')
      const firstBar = progressBars[0]
      expect(firstBar).toHaveAttribute('aria-valuenow', '45')
      expect(firstBar).toHaveAttribute('aria-valuemax', '100')
    })
  })
})
