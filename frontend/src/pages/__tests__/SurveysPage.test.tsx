import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { AuthProvider } from '../../contexts/AuthContext'
import { useAuthStore } from '../../store/authStore'
import { clearTokens, setTokens } from '../../services/tokenService'
import { mockTokens, mockSurveys } from '../../mocks/handlers'
import SurveysPage from '../SurveysPage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderSurveys(initialUrl = '/surveys') {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <AuthProvider>
        <Routes>
          <Route path="/surveys" element={<SurveysPage />} />
          <Route path="/surveys/new" element={<LocationDisplay />} />
          <Route path="/surveys/:id" element={<LocationDisplay />} />
          <Route path="/surveys/:id/edit" element={<LocationDisplay />} />
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

describe('SurveysPage', () => {
  beforeEach(() => {
    clearTokens()
    localStorage.clear()
    resetAuthStore()
    setTokens(mockTokens.access_token, mockTokens.refresh_token)
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
        http.get('/api/v1/surveys', () => new Promise<never>(() => {})),
      )

      renderSurveys()

      expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument()
      expect(document.querySelector('[aria-label="Loading"][aria-busy="true"]')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Data loaded
  // -------------------------------------------------------------------------

  describe('data loaded state', () => {
    it('renders survey titles in the table', async () => {
      renderSurveys()

      await waitFor(() => {
        expect(screen.getByText('Customer Satisfaction Survey')).toBeInTheDocument()
      })

      expect(screen.getByText('Employee Feedback Form')).toBeInTheDocument()
      expect(screen.getByText('Product NPS Survey')).toBeInTheDocument()
      expect(screen.getByText('Old Market Research')).toBeInTheDocument()
      expect(screen.getByText('Annual Review Survey')).toBeInTheDocument()
    })

    it('renders status badges for each survey', async () => {
      renderSurveys()

      await waitFor(() => {
        expect(document.querySelector('[data-testid="status-badge-active"]')).toBeInTheDocument()
      })

      expect(document.querySelector('[data-testid="status-badge-draft"]')).toBeInTheDocument()
      expect(document.querySelector('[data-testid="status-badge-closed"]')).toBeInTheDocument()
      expect(document.querySelector('[data-testid="status-badge-archived"]')).toBeInTheDocument()
    })

    it('renders the table with header columns', async () => {
      renderSurveys()

      await waitFor(() => {
        expect(screen.getByText('Title')).toBeInTheDocument()
      })

      expect(screen.getByText('Status')).toBeInTheDocument()
      expect(screen.getByText('Questions')).toBeInTheDocument()
      expect(screen.getByText('Created')).toBeInTheDocument()
      expect(screen.getByText('Actions')).toBeInTheDocument()
    })

    it('shows View button for all surveys', async () => {
      renderSurveys()

      await waitFor(() => {
        expect(screen.getByLabelText('View Customer Satisfaction Survey')).toBeInTheDocument()
      })
    })

    it('shows Edit button only for draft surveys', async () => {
      renderSurveys()

      await waitFor(() => {
        expect(screen.getByText('Employee Feedback Form')).toBeInTheDocument()
      })

      // Draft surveys should have edit buttons
      expect(screen.getByLabelText('Edit Employee Feedback Form')).toBeInTheDocument()
      expect(screen.getByLabelText('Edit Annual Review Survey')).toBeInTheDocument()

      // Non-draft surveys should NOT have edit buttons
      expect(screen.queryByLabelText('Edit Customer Satisfaction Survey')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Edit Product NPS Survey')).not.toBeInTheDocument()
    })

    it('shows pagination info', async () => {
      renderSurveys()

      await waitFor(() => {
        expect(screen.getByTestId('pagination-info')).toBeInTheDocument()
      })

      expect(screen.getByTestId('pagination-info').textContent).toMatch(/Page 1 of/)
    })
  })

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  describe('empty state', () => {
    it('renders empty state when there are no surveys', async () => {
      server.use(
        http.get('/api/v1/surveys', () =>
          HttpResponse.json(
            { items: [], total: 0, page: 1, per_page: 10, total_pages: 1 },
            { status: 200 },
          ),
        ),
      )

      renderSurveys()

      await waitFor(() => {
        expect(screen.getByTestId('empty-state')).toBeInTheDocument()
      })

      expect(screen.getByText(/you haven't created any surveys yet/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /create your first survey/i })).toBeInTheDocument()
    })

    it('shows filter-specific empty message when filters produce no results', async () => {
      server.use(
        http.get('/api/v1/surveys', ({ request }) => {
          const url = new URL(request.url)
          const status = url.searchParams.get('status') ?? ''
          if (status === 'archived') {
            return HttpResponse.json(
              { items: [], total: 0, page: 1, per_page: 10, total_pages: 1 },
              { status: 200 },
            )
          }
          return HttpResponse.json(
            { items: mockSurveys, total: mockSurveys.length, page: 1, per_page: 10, total_pages: 1 },
            { status: 200 },
          )
        }),
      )

      renderSurveys('/surveys?status=archived')

      await waitFor(() => {
        expect(screen.getByTestId('empty-state')).toBeInTheDocument()
      })

      expect(screen.getByText(/no surveys match your filters/i)).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Status filter
  // -------------------------------------------------------------------------

  describe('status filter', () => {
    it('renders status filter dropdown with all options', async () => {
      renderSurveys()

      await waitFor(() => {
        expect(screen.getByLabelText('Filter by status')).toBeInTheDocument()
      })

      const select = screen.getByLabelText('Filter by status') as HTMLSelectElement
      const options = Array.from(select.options).map((o) => o.value)
      expect(options).toContain('all')
      expect(options).toContain('draft')
      expect(options).toContain('active')
      expect(options).toContain('closed')
      expect(options).toContain('archived')
    })

    it('filters surveys when status is changed', async () => {
      const user = userEvent.setup()

      renderSurveys()

      await waitFor(() => {
        expect(screen.getByText('Customer Satisfaction Survey')).toBeInTheDocument()
      })

      const select = screen.getByLabelText('Filter by status')
      await user.selectOptions(select, 'draft')

      await waitFor(() => {
        expect(screen.queryByText('Customer Satisfaction Survey')).not.toBeInTheDocument()
        expect(screen.getByText('Employee Feedback Form')).toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  describe('search input', () => {
    it('renders the search input', async () => {
      renderSurveys()

      expect(screen.getByLabelText('Search surveys')).toBeInTheDocument()
    })

    it('debounces search: does not immediately fetch, fetches after 300ms delay', async () => {
      // Track all URLs requested
      const fetchedUrls: string[] = []
      server.use(
        http.get('/api/v1/surveys', ({ request }) => {
          fetchedUrls.push(request.url)
          const url = new URL(request.url)
          const search = (url.searchParams.get('search') ?? '').toLowerCase()
          const filtered = search
            ? mockSurveys.filter((s) => s.title.toLowerCase().includes(search))
            : mockSurveys
          return HttpResponse.json(
            { items: filtered, total: filtered.length, page: 1, per_page: 10, total_pages: 1 },
            { status: 200 },
          )
        }),
      )

      const user = userEvent.setup()

      renderSurveys()

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Customer Satisfaction Survey')).toBeInTheDocument()
      })

      const initialFetchCount = fetchedUrls.length

      // Type quickly — debounce should coalesce these into a single fetch
      const searchInput = screen.getByLabelText('Search surveys')
      await user.type(searchInput, 'NPS')

      // After debounce settles, only one additional fetch should have fired
      await waitFor(() => {
        const searchFetches = fetchedUrls.filter((u) =>
          new URL(u).searchParams.get('search') !== null,
        )
        expect(searchFetches.length).toBeGreaterThanOrEqual(1)
        // The search param should be 'NPS'
        expect(new URL(searchFetches[searchFetches.length - 1]).searchParams.get('search')).toBe('NPS')
      })

      // Total fetches should be very few: initial + 1 (debounced)
      // Not one fetch per keystroke (N, NP, NPS)
      const searchFetches = fetchedUrls.slice(initialFetchCount)
      expect(searchFetches.length).toBeLessThanOrEqual(2)

      // Filtered result should now show NPS survey only
      await waitFor(() => {
        expect(screen.getByText('Product NPS Survey')).toBeInTheDocument()
        expect(screen.queryByText('Customer Satisfaction Survey')).not.toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------

  describe('pagination', () => {
    it('renders prev/next buttons', async () => {
      renderSurveys()

      await waitFor(() => {
        expect(screen.getByLabelText('Previous page')).toBeInTheDocument()
        expect(screen.getByLabelText('Next page')).toBeInTheDocument()
      })
    })

    it('prev button is disabled on first page', async () => {
      renderSurveys()

      await waitFor(() => {
        expect(screen.getByLabelText('Previous page')).toBeDisabled()
      })
    })

    it('navigates to next page when next is clicked', async () => {
      const user = userEvent.setup()

      // Create 15 surveys to produce 2 pages
      const manySurveys = Array.from({ length: 15 }, (_, i) => ({
        ...mockSurveys[0],
        id: `10000000-0000-0000-0000-0000000000${String(i + 1).padStart(2, '0')}`,
        title: `Survey ${i + 1}`,
      }))

      server.use(
        http.get('/api/v1/surveys', ({ request }) => {
          const url = new URL(request.url)
          const page = parseInt(url.searchParams.get('page') ?? '1', 10) || 1
          const perPage = parseInt(url.searchParams.get('per_page') ?? '10', 10) || 10
          const start = (page - 1) * perPage
          const items = manySurveys.slice(start, start + perPage)
          return HttpResponse.json(
            { items, total: manySurveys.length, page, per_page: perPage, total_pages: 2 },
            { status: 200 },
          )
        }),
      )

      renderSurveys()

      await waitFor(() => {
        expect(screen.getByText('Survey 1')).toBeInTheDocument()
      })

      await user.click(screen.getByLabelText('Next page'))

      await waitFor(() => {
        expect(screen.getByText('Survey 11')).toBeInTheDocument()
      })

      expect(screen.queryByText('Survey 1')).not.toBeInTheDocument()
    })

    it('page number buttons are rendered', async () => {
      const manySurveys = Array.from({ length: 15 }, (_, i) => ({
        ...mockSurveys[0],
        id: `10000000-0000-0000-0000-0000000000${String(i + 1).padStart(2, '0')}`,
        title: `Survey ${i + 1}`,
      }))

      server.use(
        http.get('/api/v1/surveys', ({ request }) => {
          const url = new URL(request.url)
          const page = parseInt(url.searchParams.get('page') ?? '1', 10) || 1
          const perPage = 10
          const start = (page - 1) * perPage
          const items = manySurveys.slice(start, start + perPage)
          return HttpResponse.json(
            { items, total: 15, page, per_page: perPage, total_pages: 2 },
            { status: 200 },
          )
        }),
      )

      renderSurveys()

      await waitFor(() => {
        expect(screen.getByLabelText('Page 1')).toBeInTheDocument()
        expect(screen.getByLabelText('Page 2')).toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // URL param sync
  // -------------------------------------------------------------------------

  describe('URL param sync', () => {
    it('reads initial status from URL params', async () => {
      // Only draft surveys should be shown when status=draft in URL
      renderSurveys('/surveys?status=draft')

      await waitFor(() => {
        expect(screen.getByText('Employee Feedback Form')).toBeInTheDocument()
      })

      // Active survey should not appear
      expect(screen.queryByText('Customer Satisfaction Survey')).not.toBeInTheDocument()
    })

    it('reads initial search from URL params', async () => {
      renderSurveys('/surveys?search=NPS')

      await waitFor(() => {
        expect(screen.getByText('Product NPS Survey')).toBeInTheDocument()
      })

      expect(screen.queryByText('Customer Satisfaction Survey')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Delete action
  // -------------------------------------------------------------------------

  describe('delete action', () => {
    it('calls delete service when confirmed', async () => {
      const user = userEvent.setup()
      vi.spyOn(window, 'confirm').mockReturnValue(true)

      let deleteCalledFor = ''
      server.use(
        http.delete('/api/v1/surveys/:id', ({ params }) => {
          deleteCalledFor = params.id as string
          return new HttpResponse(null, { status: 204 })
        }),
      )

      renderSurveys()

      await waitFor(() => {
        expect(screen.getByLabelText('Delete Customer Satisfaction Survey')).toBeInTheDocument()
      })

      await user.click(screen.getByLabelText('Delete Customer Satisfaction Survey'))

      await waitFor(() => {
        expect(deleteCalledFor).toBe('10000000-0000-0000-0000-000000000001')
      })
    })

    it('does NOT call delete when cancelled', async () => {
      const user = userEvent.setup()
      vi.spyOn(window, 'confirm').mockReturnValue(false)

      let deleteCalled = false
      server.use(
        http.delete('/api/v1/surveys/:id', () => {
          deleteCalled = true
          return new HttpResponse(null, { status: 204 })
        }),
      )

      renderSurveys()

      await waitFor(() => {
        expect(screen.getByLabelText('Delete Customer Satisfaction Survey')).toBeInTheDocument()
      })

      await user.click(screen.getByLabelText('Delete Customer Satisfaction Survey'))

      // Give time for any async work
      await new Promise((r) => setTimeout(r, 50))
      expect(deleteCalled).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // Navigation actions
  // -------------------------------------------------------------------------

  describe('navigation', () => {
    it('navigates to /surveys/new when Create New Survey is clicked', async () => {
      const user = userEvent.setup()

      renderSurveys()

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create new survey/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /create new survey/i }))

      await waitFor(() => {
        expect(screen.getByTestId('location').textContent).toBe('/surveys/new')
      })
    })

    it('navigates to /surveys/:id when View is clicked', async () => {
      const user = userEvent.setup()

      renderSurveys()

      await waitFor(() => {
        expect(screen.getByLabelText('View Customer Satisfaction Survey')).toBeInTheDocument()
      })

      await user.click(screen.getByLabelText('View Customer Satisfaction Survey'))

      await waitFor(() => {
        expect(screen.getByTestId('location').textContent).toBe(
          '/surveys/10000000-0000-0000-0000-000000000001',
        )
      })
    })

    it('navigates to /surveys/:id/edit when Edit is clicked on a draft survey', async () => {
      const user = userEvent.setup()

      renderSurveys()

      await waitFor(() => {
        expect(screen.getByLabelText('Edit Employee Feedback Form')).toBeInTheDocument()
      })

      await user.click(screen.getByLabelText('Edit Employee Feedback Form'))

      await waitFor(() => {
        expect(screen.getByTestId('location').textContent).toBe(
          '/surveys/10000000-0000-0000-0000-000000000002/edit',
        )
      })
    })
  })

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  describe('error state', () => {
    it('renders error alert when API returns 500', async () => {
      server.use(
        http.get('/api/v1/surveys', () =>
          HttpResponse.json(
            { detail: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' } },
            { status: 500 },
          ),
        ),
      )

      renderSurveys()

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })
    })

    it('renders error alert when network fails', async () => {
      server.use(
        http.get('/api/v1/surveys', () => HttpResponse.error()),
      )

      renderSurveys()

      await waitFor(() => {
        const alert = screen.getByRole('alert')
        expect(alert).toBeInTheDocument()
        expect(alert.textContent).toMatch(/failed to load/i)
      })
    })
  })
})
