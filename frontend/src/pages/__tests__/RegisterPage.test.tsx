import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { AuthProvider } from '../../contexts/AuthContext'
import { useAuthStore } from '../../store/authStore'
import { clearTokens } from '../../services/tokenService'
import RegisterPage from '../RegisterPage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderRegisterPage() {
  return render(
    <MemoryRouter initialEntries={['/register']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/dashboard" element={<LocationDisplay />} />
          <Route path="/login" element={<LocationDisplay />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function resetAuthStore() {
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false })
}

async function fillForm(user: ReturnType<typeof userEvent.setup>, name: string, email: string, password: string, confirmPassword: string) {
  await user.type(screen.getByLabelText('Name'), name)
  await user.type(screen.getByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.type(screen.getByLabelText('Confirm Password'), confirmPassword)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RegisterPage', () => {
  beforeEach(() => {
    clearTokens()
    localStorage.clear()
    resetAuthStore()
  })

  describe('rendering', () => {
    it('renders name, email, password, confirm password fields and submit button', () => {
      renderRegisterPage()
      expect(screen.getByLabelText('Name')).toBeInTheDocument()
      expect(screen.getByLabelText('Email')).toBeInTheDocument()
      expect(screen.getByLabelText('Password')).toBeInTheDocument()
      expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
    })

    it('renders a link to the login page', () => {
      renderRegisterPage()
      const link = screen.getByRole('link', { name: /sign in/i })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', '/login')
    })
  })

  describe('client-side validation', () => {
    it('shows error when name is empty on submit', async () => {
      const user = userEvent.setup()
      renderRegisterPage()
      await act(async () => {
        await user.click(screen.getByRole('button', { name: /create account/i }))
      })
      expect(await screen.findByText('Name is required')).toBeInTheDocument()
    })

    it('shows error when email is empty on submit', async () => {
      const user = userEvent.setup()
      renderRegisterPage()
      await act(async () => {
        await user.type(screen.getByLabelText('Name'), 'Test User')
      })
      await act(async () => {
        await user.click(screen.getByRole('button', { name: /create account/i }))
      })
      expect(await screen.findByText('Email is required')).toBeInTheDocument()
    })

    it('shows error when email format is invalid', async () => {
      renderRegisterPage()
      // Use fireEvent to bypass HTML5 native constraint validation on type="email"
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test User' } })
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'notanemail' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
      fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password123' } })
      fireEvent.submit(screen.getByRole('button', { name: /create account/i }).closest('form')!)
      expect(await screen.findByText('Please enter a valid email address')).toBeInTheDocument()
    })

    it('shows error when password is empty on submit', async () => {
      const user = userEvent.setup()
      renderRegisterPage()
      await act(async () => {
        await user.type(screen.getByLabelText('Name'), 'Test User')
        await user.type(screen.getByLabelText('Email'), 'new@example.com')
      })
      await act(async () => {
        await user.click(screen.getByRole('button', { name: /create account/i }))
      })
      expect(await screen.findByText('Password is required')).toBeInTheDocument()
    })

    it('shows error when password is less than 8 characters', async () => {
      const user = userEvent.setup()
      renderRegisterPage()
      await act(async () => {
        await user.type(screen.getByLabelText('Name'), 'Test User')
        await user.type(screen.getByLabelText('Email'), 'new@example.com')
        await user.type(screen.getByLabelText('Password'), 'short')
      })
      await act(async () => {
        await user.click(screen.getByRole('button', { name: /create account/i }))
      })
      expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument()
    })

    it('shows error when confirm password is empty', async () => {
      const user = userEvent.setup()
      renderRegisterPage()
      await act(async () => {
        await user.type(screen.getByLabelText('Name'), 'Test User')
        await user.type(screen.getByLabelText('Email'), 'new@example.com')
        await user.type(screen.getByLabelText('Password'), 'password123')
      })
      await act(async () => {
        await user.click(screen.getByRole('button', { name: /create account/i }))
      })
      expect(await screen.findByText('Please confirm your password')).toBeInTheDocument()
    })

    it('shows error when passwords do not match', async () => {
      const user = userEvent.setup()
      renderRegisterPage()
      await act(async () => {
        await user.type(screen.getByLabelText('Name'), 'Test User')
        await user.type(screen.getByLabelText('Email'), 'new@example.com')
        await user.type(screen.getByLabelText('Password'), 'password123')
        await user.type(screen.getByLabelText('Confirm Password'), 'different123')
      })
      await act(async () => {
        await user.click(screen.getByRole('button', { name: /create account/i }))
      })
      expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
    })

    it('does not call register when validation fails', async () => {
      const user = userEvent.setup()
      renderRegisterPage()
      await act(async () => {
        await user.click(screen.getByRole('button', { name: /create account/i }))
      })
      expect(screen.getByRole('button', { name: /create account/i })).not.toBeDisabled()
    })
  })

  describe('loading state', () => {
    it('disables the button and shows loading text while submitting', async () => {
      server.use(
        http.post('/api/v1/auth/register', () => new Promise<never>(() => {})),
      )

      const user = userEvent.setup()
      renderRegisterPage()
      await act(async () => {
        await fillForm(user, 'Test User', 'new@example.com', 'password123', 'password123')
      })
      await act(async () => {
        await user.click(screen.getByRole('button', { name: /create account/i }))
      })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /creating account/i })).toBeDisabled()
      })
    })
  })

  describe('successful registration', () => {
    it('auto-logs in and redirects to /dashboard after successful registration', async () => {
      const user = userEvent.setup()
      renderRegisterPage()
      // Use credentials the MSW login handler accepts (test@example.com / password123)
      await act(async () => {
        await fillForm(user, 'Test User', 'test@example.com', 'password123', 'password123')
      })
      await act(async () => {
        await user.click(screen.getByRole('button', { name: /create account/i }))
      })

      const location = await screen.findByTestId('location')
      expect(location.textContent).toBe('/dashboard')
    })
  })

  describe('backend error display', () => {
    it('shows email already registered error from backend', async () => {
      const user = userEvent.setup()
      renderRegisterPage()
      await act(async () => {
        await fillForm(user, 'Test User', 'existing@example.com', 'password123', 'password123')
      })
      await act(async () => {
        await user.click(screen.getByRole('button', { name: /create account/i }))
      })

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('A user with this email already exists')
      })
    })

    it('re-enables the button after a failed registration', async () => {
      const user = userEvent.setup()
      renderRegisterPage()
      await act(async () => {
        await fillForm(user, 'Test User', 'existing@example.com', 'password123', 'password123')
      })
      await act(async () => {
        await user.click(screen.getByRole('button', { name: /create account/i }))
      })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create account/i })).not.toBeDisabled()
      })
    })

    it('shows generic error message for non-ApiError failures', async () => {
      server.use(
        http.post('/api/v1/auth/register', () => HttpResponse.error()),
      )

      const user = userEvent.setup()
      renderRegisterPage()
      await act(async () => {
        await fillForm(user, 'Test User', 'new@example.com', 'password123', 'password123')
      })
      await act(async () => {
        await user.click(screen.getByRole('button', { name: /create account/i }))
      })

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Registration failed. Please try again.')
      })
    })
  })
})
