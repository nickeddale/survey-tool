import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { http } from 'msw'
import { server } from '../../test/setup'
import { AuthProvider } from '../../contexts/AuthContext'
import { useAuthStore } from '../../store/authStore'
import ProtectedRoute from '../ProtectedRoute'
import { clearTokens, setTokens } from '../../services/tokenService'
import { mockTokens } from '../../mocks/handlers'

// ---------------------------------------------------------------------------
// Helper: display the current route location for redirect assertions
// ---------------------------------------------------------------------------

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

// ---------------------------------------------------------------------------
// Helper: render a ProtectedRoute within MemoryRouter + AuthProvider
// ---------------------------------------------------------------------------

function renderProtectedRoute(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div>Dashboard Content</div>} />
            <Route path="/surveys/:id" element={<div>Survey Content</div>} />
          </Route>
          <Route path="/login" element={<LocationDisplay />} />
          <Route path="*" element={<LocationDisplay />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProtectedRoute', () => {
  beforeEach(() => {
    clearTokens()
    localStorage.clear()
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false })
  })

  it('shows loading spinner while isLoading is true', async () => {
    // Make refresh endpoint hang so initialize() sets isLoading=true and stays there
    setTokens(mockTokens.access_token, mockTokens.refresh_token)
    server.use(
      http.post('/api/v1/auth/refresh', () => new Promise<never>(() => {})),
    )

    renderProtectedRoute('/dashboard')
    // isLoading should be true immediately while the hung refresh is pending
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument()
    })
  })

  it('redirects unauthenticated users to /login with returnTo param', async () => {
    renderProtectedRoute('/dashboard')

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/login?returnTo=%2Fdashboard')
    })
  })

  it('preserves nested path in returnTo when redirecting to /login', async () => {
    renderProtectedRoute('/surveys/123')

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/login?returnTo=%2Fsurveys%2F123')
    })
  })

  it('renders children when user is authenticated', async () => {
    setTokens(mockTokens.access_token, mockTokens.refresh_token)
    renderProtectedRoute('/dashboard')

    await waitFor(() => {
      expect(screen.getByText('Dashboard Content')).toBeInTheDocument()
    })
  })
})
