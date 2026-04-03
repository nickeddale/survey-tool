import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { AuthProvider } from '../../contexts/AuthContext'
import { useAuthStore } from '../../store/authStore'
import { clearTokens, setTokens } from '../../services/tokenService'
import { mockTokens, mockUser, mockWebhooks } from '../../mocks/handlers'
import WebhooksPage from '../WebhooksPage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderWebhooks() {
  return render(
    <MemoryRouter
      initialEntries={['/webhooks']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AuthProvider>
        <Routes>
          <Route path="/webhooks" element={<WebhooksPage />} />
          <Route path="/dashboard" element={<LocationDisplay />} />
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

describe('WebhooksPage', () => {
  beforeEach(() => {
    clearTokens()
    localStorage.clear()
    resetAuthStore()
    setTokens(mockTokens.access_token, mockTokens.refresh_token)
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
        http.get('/api/v1/webhooks', () => new Promise<never>(() => {})),
      )

      renderWebhooks()

      expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Data loaded
  // -------------------------------------------------------------------------

  describe('data loaded state', () => {
    it('renders webhook URLs in the table', async () => {
      renderWebhooks()

      await waitFor(() => {
        expect(screen.getByText(/example\.com\/webhook/)).toBeInTheDocument()
      })

      expect(screen.getByText(/myapp\.io\/api\/hooks/)).toBeInTheDocument()
    })

    it('renders table headers', async () => {
      renderWebhooks()

      await waitFor(() => {
        expect(screen.getByText('URL')).toBeInTheDocument()
      })

      expect(screen.getByText('Events')).toBeInTheDocument()
      expect(screen.getByText('Survey')).toBeInTheDocument()
      expect(screen.getByText('Status')).toBeInTheDocument()
      expect(screen.getByText('Actions')).toBeInTheDocument()
    })

    it('renders event badges for each webhook', async () => {
      renderWebhooks()

      await waitFor(() => {
        expect(screen.getByText(/example\.com\/webhook/)).toBeInTheDocument()
      })

      const webhook1 = mockWebhooks[0]
      expect(screen.getByTestId(`webhook-event-badge-${webhook1.id}-response.completed`)).toBeInTheDocument()
      expect(screen.getByTestId(`webhook-event-badge-${webhook1.id}-response.created`)).toBeInTheDocument()
    })

    it('renders active/inactive badges', async () => {
      renderWebhooks()

      await waitFor(() => {
        expect(screen.getByText(/example\.com\/webhook/)).toBeInTheDocument()
      })

      const webhook1 = mockWebhooks[0]
      const webhook2 = mockWebhooks[1]

      expect(screen.getByTestId(`webhook-active-badge-${webhook1.id}`)).toBeInTheDocument()
      expect(screen.getByTestId(`webhook-inactive-badge-${webhook2.id}`)).toBeInTheDocument()
    })

    it('renders edit and delete buttons for each webhook', async () => {
      renderWebhooks()

      await waitFor(() => {
        expect(screen.getByText(/example\.com\/webhook/)).toBeInTheDocument()
      })

      const webhook1 = mockWebhooks[0]
      expect(screen.getByTestId(`webhook-edit-${webhook1.id}`)).toBeInTheDocument()
      expect(screen.getByTestId(`webhook-delete-${webhook1.id}`)).toBeInTheDocument()
    })

    it('renders test and toggle buttons for each webhook', async () => {
      renderWebhooks()

      await waitFor(() => {
        expect(screen.getByText(/example\.com\/webhook/)).toBeInTheDocument()
      })

      const webhook1 = mockWebhooks[0]
      expect(screen.getByTestId(`webhook-test-${webhook1.id}`)).toBeInTheDocument()
      expect(screen.getByTestId(`webhook-toggle-${webhook1.id}`)).toBeInTheDocument()
    })

    it('shows "All surveys" for webhooks with no survey_id', async () => {
      renderWebhooks()

      await waitFor(() => {
        expect(screen.getByText(/example\.com\/webhook/)).toBeInTheDocument()
      })

      expect(screen.getByText('All surveys')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  describe('empty state', () => {
    it('renders empty state when there are no webhooks', async () => {
      server.use(
        http.get('/api/v1/webhooks', () =>
          HttpResponse.json(
            { items: [], total: 0, page: 1, per_page: 10, total_pages: 1 },
            { status: 200 },
          ),
        ),
      )

      renderWebhooks()

      await waitFor(() => {
        expect(screen.getByTestId('empty-state')).toBeInTheDocument()
      })

      expect(screen.getByText(/no webhooks have been configured/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /create your first webhook/i })).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Create webhook
  // -------------------------------------------------------------------------

  describe('create webhook', () => {
    it('opens the create form when Create Webhook button is clicked', async () => {
      const user = userEvent.setup()

      renderWebhooks()

      await waitFor(() => {
        expect(screen.getByTestId('create-webhook-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('create-webhook-button'))
      })

      expect(screen.getByTestId('webhook-form-dialog')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Create Webhook' })).toBeInTheDocument()
    })

    it('closes the form when Cancel is clicked', async () => {
      const user = userEvent.setup()

      renderWebhooks()

      await waitFor(() => {
        expect(screen.getByTestId('create-webhook-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('create-webhook-button'))
      })

      expect(screen.getByTestId('webhook-form-dialog')).toBeInTheDocument()

      await act(async () => {
        await user.click(screen.getByTestId('webhook-form-cancel'))
      })

      expect(screen.queryByTestId('webhook-form-dialog')).not.toBeInTheDocument()
    })

    it('shows secret after creating webhook', async () => {
      const user = userEvent.setup()

      server.use(
        http.post('/api/v1/webhooks', async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          return HttpResponse.json(
            {
              id: 'webhook-new-test',
              user_id: '00000000-0000-0000-0000-000000000001',
              url: body.url as string,
              events: body.events as string[],
              survey_id: null,
              is_active: true,
              secret: 'test-secret-abc123',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { status: 201 },
          )
        }),
      )

      renderWebhooks()

      await waitFor(() => {
        expect(screen.getByTestId('create-webhook-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('create-webhook-button'))
      })

      await act(async () => {
        await user.type(screen.getByTestId('webhook-url-input'), 'https://example.com/new-hook')
        await user.click(screen.getByTestId('webhook-event-response.completed'))
        await user.click(screen.getByTestId('webhook-form-submit'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('webhook-secret-display')).toBeInTheDocument()
      })

      expect(screen.getByTestId('webhook-secret-value')).toHaveTextContent('test-secret-abc123')
    })

    it('shows validation error when URL is empty', async () => {
      const user = userEvent.setup()

      renderWebhooks()

      await waitFor(() => {
        expect(screen.getByTestId('create-webhook-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('create-webhook-button'))
      })

      await act(async () => {
        await user.click(screen.getByTestId('webhook-form-submit'))
      })

      expect(screen.getByTestId('webhook-form-error')).toBeInTheDocument()
      expect(screen.getByTestId('webhook-form-error').textContent).toMatch(/url is required/i)
    })

    it('shows validation error when no events are selected', async () => {
      const user = userEvent.setup()

      renderWebhooks()

      await waitFor(() => {
        expect(screen.getByTestId('create-webhook-button')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('create-webhook-button'))
      })

      await act(async () => {
        await user.type(screen.getByTestId('webhook-url-input'), 'https://example.com/hook')
        await user.click(screen.getByTestId('webhook-form-submit'))
      })

      expect(screen.getByTestId('webhook-form-error')).toBeInTheDocument()
      expect(screen.getByTestId('webhook-form-error').textContent).toMatch(/at least one event/i)
    })
  })

  // -------------------------------------------------------------------------
  // Edit webhook
  // -------------------------------------------------------------------------

  describe('edit webhook', () => {
    it('opens the edit form with pre-filled values when Edit is clicked', async () => {
      const user = userEvent.setup()

      renderWebhooks()

      await waitFor(() => {
        expect(screen.getByText(/example\.com\/webhook/)).toBeInTheDocument()
      })

      const webhook1 = mockWebhooks[0]
      await act(async () => {
        await user.click(screen.getByTestId(`webhook-edit-${webhook1.id}`))
      })

      expect(screen.getByTestId('webhook-form-dialog')).toBeInTheDocument()
      expect(screen.getByText('Edit Webhook')).toBeInTheDocument()

      const urlInput = screen.getByTestId('webhook-url-input') as HTMLInputElement
      expect(urlInput.value).toBe(webhook1.url)
    })

    it('shows masked secret field in edit mode', async () => {
      const user = userEvent.setup()

      renderWebhooks()

      await waitFor(() => {
        expect(screen.getByText(/example\.com\/webhook/)).toBeInTheDocument()
      })

      const webhook1 = mockWebhooks[0]
      await act(async () => {
        await user.click(screen.getByTestId(`webhook-edit-${webhook1.id}`))
      })

      expect(screen.getByTestId('webhook-secret-masked')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Delete webhook
  // -------------------------------------------------------------------------

  describe('delete webhook', () => {
    it('shows delete confirmation modal when Delete is clicked', async () => {
      const user = userEvent.setup()

      renderWebhooks()

      await waitFor(() => {
        expect(screen.getByText(/example\.com\/webhook/)).toBeInTheDocument()
      })

      const webhook1 = mockWebhooks[0]
      await act(async () => {
        await user.click(screen.getByTestId(`webhook-delete-${webhook1.id}`))
      })

      expect(screen.getByTestId('delete-confirm-modal')).toBeInTheDocument()
    })

    it('cancels delete when Cancel is clicked in modal', async () => {
      const user = userEvent.setup()

      let deleteCalled = false
      server.use(
        http.delete('/api/v1/webhooks/:webhookId', () => {
          deleteCalled = true
          return new HttpResponse(null, { status: 204 })
        }),
      )

      renderWebhooks()

      await waitFor(() => {
        expect(screen.getByText(/example\.com\/webhook/)).toBeInTheDocument()
      })

      const webhook1 = mockWebhooks[0]
      await act(async () => {
        await user.click(screen.getByTestId(`webhook-delete-${webhook1.id}`))
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
        http.delete('/api/v1/webhooks/:webhookId', ({ params }) => {
          deletedId = params.webhookId as string
          return new HttpResponse(null, { status: 204 })
        }),
      )

      renderWebhooks()

      await waitFor(() => {
        expect(screen.getByText(/example\.com\/webhook/)).toBeInTheDocument()
      })

      const webhook1 = mockWebhooks[0]
      await act(async () => {
        await user.click(screen.getByTestId(`webhook-delete-${webhook1.id}`))
      })

      await act(async () => {
        await user.click(screen.getByTestId('confirm-delete-button'))
      })

      await waitFor(() => {
        expect(deletedId).toBe(webhook1.id)
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
        http.patch('/api/v1/webhooks/:webhookId', async ({ request, params }) => {
          const body = (await request.json()) as Record<string, unknown>
          patchBody = body
          const webhook = mockWebhooks.find((w) => w.id === params.webhookId)
          if (!webhook) {
            return HttpResponse.json({ detail: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 })
          }
          return HttpResponse.json(
            { ...webhook, ...body, updated_at: new Date().toISOString() },
            { status: 200 },
          )
        }),
      )

      renderWebhooks()

      await waitFor(() => {
        expect(screen.getByText(/example\.com\/webhook/)).toBeInTheDocument()
      })

      const webhook1 = mockWebhooks[0] // is_active: true
      await act(async () => {
        await user.click(screen.getByTestId(`webhook-toggle-${webhook1.id}`))
      })

      await waitFor(() => {
        expect(patchBody).not.toBeNull()
        expect(patchBody!.is_active).toBe(false) // toggled from true to false
      })
    })
  })

  // -------------------------------------------------------------------------
  // Test webhook
  // -------------------------------------------------------------------------

  describe('test webhook', () => {
    it('shows success result after test webhook succeeds', async () => {
      const user = userEvent.setup()

      server.use(
        http.post('/api/v1/webhooks/:webhookId/test', ({ params }) => {
          const webhook = mockWebhooks.find((w) => w.id === params.webhookId)
          if (!webhook) {
            return HttpResponse.json({ detail: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 })
          }
          return HttpResponse.json({ success: true, status_code: 200, error: null }, { status: 200 })
        }),
      )

      renderWebhooks()

      await waitFor(() => {
        expect(screen.getByText(/example\.com\/webhook/)).toBeInTheDocument()
      })

      const webhook1 = mockWebhooks[0]
      await act(async () => {
        await user.click(screen.getByTestId(`webhook-test-${webhook1.id}`))
      })

      await waitFor(() => {
        expect(screen.getByTestId('test-result-banner')).toBeInTheDocument()
      })

      expect(screen.getByTestId('test-result-banner')).toHaveTextContent(/succeeded/i)
    })

    it('shows failure result after test webhook fails', async () => {
      const user = userEvent.setup()

      server.use(
        http.post('/api/v1/webhooks/:webhookId/test', () => {
          return HttpResponse.json(
            { success: false, status_code: 503, error: 'Connection refused' },
            { status: 200 },
          )
        }),
      )

      renderWebhooks()

      await waitFor(() => {
        expect(screen.getByText(/example\.com\/webhook/)).toBeInTheDocument()
      })

      const webhook1 = mockWebhooks[0]
      await act(async () => {
        await user.click(screen.getByTestId(`webhook-test-${webhook1.id}`))
      })

      await waitFor(() => {
        expect(screen.getByTestId('test-result-banner')).toBeInTheDocument()
      })

      expect(screen.getByTestId('test-result-banner')).toHaveTextContent(/connection refused/i)
    })
  })

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  describe('navigation', () => {
    it('navigates back to dashboard when back button is clicked', async () => {
      const user = userEvent.setup()

      renderWebhooks()

      await waitFor(() => {
        expect(screen.getByLabelText('Back to dashboard')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByLabelText('Back to dashboard'))
      })

      const location = await screen.findByTestId('location')
      expect(location.textContent).toBe('/dashboard')
    })
  })

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  describe('error state', () => {
    it('renders error alert when API returns 500', async () => {
      server.use(
        http.get('/api/v1/webhooks', () =>
          HttpResponse.json(
            { detail: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' } },
            { status: 500 },
          ),
        ),
      )

      renderWebhooks()

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------

  describe('pagination', () => {
    it('renders pagination info when webhooks are loaded', async () => {
      renderWebhooks()

      await waitFor(() => {
        expect(screen.getByTestId('pagination-info')).toBeInTheDocument()
      })

      expect(screen.getByTestId('pagination-info')).toHaveTextContent('Page 1')
      expect(screen.getByTestId('pagination-info')).toHaveTextContent('webhooks')
    })
  })
})
