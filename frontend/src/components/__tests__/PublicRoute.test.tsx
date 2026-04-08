import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { http } from 'msw'
import { server } from '../../test/setup'
import { AuthProvider } from '../../contexts/AuthContext'
import { useAuthStore } from '../../store/authStore'
import PublicRoute from '../PublicRoute'
import { clearTokens, setTokens } from '../../services/tokenService'
import { mockTokens } from '../../mocks/handlers'

// ---------------------------------------------------------------------------
// Helper: display the current route location for redirect assertions
// ---------------------------------------------------------------------------

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

// ---------------------------------------------------------------------------
// Helper: render a PublicRoute within MemoryRouter + AuthProvider
// ---------------------------------------------------------------------------

function renderPublicRoute(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <Routes>
          <Route element={<PublicRoute />}>
            <Route path="/login" element={<div>Login Content</div>} />
            <Route path="/register" element={<div>Register Content</div>} />
          </Route>
          <Route path="/dashboard" element={<LocationDisplay />} />
          <Route path="*" element={<LocationDisplay />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PublicRoute', () => {
  beforeEach(() => {
    clearTokens()
    localStorage.clear()
    // Reset store but keep isInitializing: true so AuthProvider.initialize() drives the state
    useAuthStore.setState({ user: null, isAuthenticated: false, isInitializing: true, isLoading: false })
  })

  it('shows loading spinner while isInitializing is true', async () => {
    // Make refresh endpoint hang so initialize() keeps isInitializing=true
    setTokens(mockTokens.access_token)
    server.use(
      http.post('/api/v1/auth/refresh', () => new Promise<never>(() => {})),
    )

    renderPublicRoute('/login')
    // isInitializing should be true immediately while the hung refresh is pending
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument()
    })
  })

  it('renders children when isLoading is true (login in progress) but not isInitializing', async () => {
    // Simulate a login attempt in progress: isInitializing=false, isLoading=true
    // PublicRoute should NOT replace Outlet with a spinner in this case
    useAuthStore.setState({ user: null, isAuthenticated: false, isInitializing: false, isLoading: true })
    renderPublicRoute('/login')
    await waitFor(() => {
      expect(screen.getByText('Login Content')).toBeInTheDocument()
    })
  })

  it('renders children when user is not authenticated', async () => {
    renderPublicRoute('/login')

    await waitFor(() => {
      expect(screen.getByText('Login Content')).toBeInTheDocument()
    })
  })

  it('redirects authenticated users to /dashboard', async () => {
    setTokens(mockTokens.access_token)
    renderPublicRoute('/login')

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/dashboard')
    })
  })

  it('renders register page when unauthenticated', async () => {
    renderPublicRoute('/register')

    await waitFor(() => {
      expect(screen.getByText('Register Content')).toBeInTheDocument()
    })
  })
})
