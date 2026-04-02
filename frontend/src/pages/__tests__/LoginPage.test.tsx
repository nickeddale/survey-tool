import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { AuthProvider } from '../../contexts/AuthContext'
import { useAuthStore } from '../../store/authStore'
import { clearTokens, setTokens } from '../../services/tokenService'
import { mockTokens } from '../../mocks/handlers'
import LoginPage from '../LoginPage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<LocationDisplay />} />
          <Route path="/register" element={<LocationDisplay />} />
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

describe('LoginPage', () => {
  beforeEach(() => {
    clearTokens()
    localStorage.clear()
    resetAuthStore()
  })

  describe('rendering', () => {
    it('renders email and password fields and submit button', () => {
      renderLoginPage()
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    })

    it('renders a link to the register page', () => {
      renderLoginPage()
      const link = screen.getByRole('link', { name: /register/i })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', '/register')
    })
  })

  describe('client-side validation', () => {
    it('shows error when email is empty on submit', async () => {
      renderLoginPage()
      await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
      expect(await screen.findByText('Email is required')).toBeInTheDocument()
    })

    it('shows error when email format is invalid', async () => {
      renderLoginPage()
      // Use fireEvent to bypass HTML5 native constraint validation on type="email"
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'notanemail' } })
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } })
      fireEvent.submit(screen.getByRole('button', { name: /sign in/i }).closest('form')!)
      expect(await screen.findByText('Please enter a valid email address')).toBeInTheDocument()
    })

    it('shows error when password is empty on submit', async () => {
      renderLoginPage()
      await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com')
      await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
      expect(await screen.findByText('Password is required')).toBeInTheDocument()
    })

    it('shows error when password is less than 8 characters', async () => {
      renderLoginPage()
      await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com')
      await userEvent.type(screen.getByLabelText(/password/i), 'short')
      await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
      expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument()
    })

    it('does not call login when validation fails', async () => {
      renderLoginPage()
      await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
      // Button should not show loading text
      expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled()
    })
  })

  describe('loading state', () => {
    it('disables the button and shows loading text while submitting', async () => {
      server.use(
        http.post('/api/v1/auth/login', () => new Promise<never>(() => {})),
      )

      renderLoginPage()
      await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com')
      await userEvent.type(screen.getByLabelText(/password/i), 'password123')
      await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled()
      })
    })
  })

  describe('successful login', () => {
    it('redirects to /dashboard on successful login', async () => {
      renderLoginPage()
      await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com')
      await userEvent.type(screen.getByLabelText(/password/i), 'password123')
      await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(screen.getByTestId('location').textContent).toBe('/dashboard')
      })
    })
  })

  describe('backend error display', () => {
    it('shows invalid credentials error from backend', async () => {
      // Set valid tokens so the 401 interceptor can refresh and retry — the retry
      // also returns 401 (_retried=true) so the error is then normalized correctly.
      setTokens(mockTokens.access_token, mockTokens.refresh_token)
      renderLoginPage()
      await userEvent.type(screen.getByLabelText(/email/i), 'wrong@example.com')
      await userEvent.type(screen.getByLabelText(/password/i), 'wrongpassword')
      await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password')
      })
    })

    it('re-enables the button after a failed login', async () => {
      renderLoginPage()
      await userEvent.type(screen.getByLabelText(/email/i), 'wrong@example.com')
      await userEvent.type(screen.getByLabelText(/password/i), 'wrongpassword')
      await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled()
      })
    })

    it('shows generic error message for non-ApiError failures', async () => {
      server.use(
        http.post('/api/v1/auth/login', () => HttpResponse.error()),
      )

      renderLoginPage()
      await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com')
      await userEvent.type(screen.getByLabelText(/password/i), 'password123')
      await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Login failed. Please try again.')
      })
    })
  })
})
