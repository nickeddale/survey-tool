import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { AuthProvider } from '../../contexts/AuthContext'
import { useAuthStore } from '../../store/authStore'
import { clearTokens, setTokens } from '../../services/tokenService'
import { mockTokens } from '../../mocks/handlers'
import DashboardPage from '../DashboardPage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/surveys/new" element={<LocationDisplay />} />
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

describe('DashboardPage', () => {
  beforeEach(() => {
    clearTokens()
    localStorage.clear()
    resetAuthStore()
    // Provide access token (in memory) without storing refresh token in localStorage.
    // This prevents AuthProvider from calling initialize() on mount, which would
    // trigger async state updates outside act().
    setTokens(mockTokens.access_token)
    localStorage.removeItem('devtracker_refresh_token')
  })

  describe('loading state', () => {
    it('renders loading skeleton while data is being fetched', async () => {
      server.use(
        http.get('/api/v1/surveys', () => new Promise<never>(() => {})),
      )

      renderDashboard()

      // The skeleton container has aria-label="Loading" and aria-busy="true"
      const skeleton = document.querySelector('[aria-label="Loading"][aria-busy="true"]')
      expect(skeleton).toBeInTheDocument()
    })
  })

  describe('data loaded state', () => {
    it('renders stat cards with correct counts after data loads', async () => {
      renderDashboard()

      await waitFor(() => {
        expect(screen.getByText('Total')).toBeInTheDocument()
      })

      // mockSurveys has: 1 active, 2 draft, 1 closed, 1 archived = 5 total
      expect(screen.getByText('Total')).toBeInTheDocument()
      expect(screen.getByText('Draft')).toBeInTheDocument()
      expect(screen.getByText('Active')).toBeInTheDocument()
      expect(screen.getByText('Closed')).toBeInTheDocument()
      expect(screen.getByText('Archived')).toBeInTheDocument()

      // Verify count values
      const statCards = screen.getAllByText(/^\d+$/)
      const cardValues = statCards.map((el) => el.textContent)
      expect(cardValues).toContain('5') // total
      expect(cardValues).toContain('2') // draft
      expect(cardValues).toContain('1') // active
    })

    it('renders recent surveys list with survey titles', async () => {
      renderDashboard()

      await waitFor(() => {
        expect(screen.getByText('Customer Satisfaction Survey')).toBeInTheDocument()
      })

      // Should show up to 5 most recent
      expect(screen.getByText('Employee Feedback Form')).toBeInTheDocument()
      expect(screen.getByText('Product NPS Survey')).toBeInTheDocument()
    })

    it('renders color-coded status badges for surveys', async () => {
      renderDashboard()

      await waitFor(() => {
        // active badge
        const activeBadge = document.querySelector('[data-testid="status-badge-active"]')
        expect(activeBadge).toBeInTheDocument()
        expect(activeBadge).toHaveClass('bg-green-100')
        expect(activeBadge).toHaveClass('text-green-800')

        // draft badge
        const draftBadge = document.querySelector('[data-testid="status-badge-draft"]')
        expect(draftBadge).toBeInTheDocument()
        expect(draftBadge).toHaveClass('bg-muted')

        // closed badge
        const closedBadge = document.querySelector('[data-testid="status-badge-closed"]')
        expect(closedBadge).toBeInTheDocument()
        expect(closedBadge).toHaveClass('bg-yellow-100')
        expect(closedBadge).toHaveClass('text-yellow-800')

        // archived badge
        const archivedBadge = document.querySelector('[data-testid="status-badge-archived"]')
        expect(archivedBadge).toBeInTheDocument()
        expect(archivedBadge).toHaveClass('bg-red-100')
        expect(archivedBadge).toHaveClass('text-red-800')
      })
    })

    it('renders the Recent Surveys heading', async () => {
      renderDashboard()

      await waitFor(() => {
        expect(screen.getByText('Recent Surveys')).toBeInTheDocument()
      })
    })
  })

  describe('empty state', () => {
    it('renders empty state when user has no surveys', async () => {
      server.use(
        http.get('/api/v1/surveys', () =>
          HttpResponse.json({ items: [], total: 0, page: 1, per_page: 100 }, { status: 200 }),
        ),
      )

      renderDashboard()

      await waitFor(() => {
        expect(screen.getByText(/you haven't created any surveys yet/i)).toBeInTheDocument()
      })
    })

    it('shows stat cards with zeros in empty state', async () => {
      server.use(
        http.get('/api/v1/surveys', () =>
          HttpResponse.json({ items: [], total: 0, page: 1, per_page: 100 }, { status: 200 }),
        ),
      )

      renderDashboard()

      await waitFor(() => {
        expect(screen.getByText('Total')).toBeInTheDocument()
      })

      // All counts should be 0
      const zeroValues = screen.getAllByText('0')
      expect(zeroValues.length).toBeGreaterThanOrEqual(5)
    })
  })

  describe('navigation', () => {
    it('navigates to /surveys/new when Create New Survey button is clicked', async () => {
      renderDashboard()

      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
      })

      const createButton = screen.getByRole('button', { name: /create new survey/i })
      const user = userEvent.setup()
      await act(async () => {
        await user.click(createButton)
      })

      const location = await screen.findByTestId('location')
      expect(location.textContent).toBe('/surveys/new')
    })
  })

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

      renderDashboard()

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })
    })

    it('renders error alert when network fails', async () => {
      server.use(
        http.get('/api/v1/surveys', () => HttpResponse.error()),
      )

      renderDashboard()

      await waitFor(() => {
        const alert = screen.getByRole('alert')
        expect(alert).toBeInTheDocument()
        expect(alert.textContent).toMatch(/failed to load/i)
      })
    })
  })
})
