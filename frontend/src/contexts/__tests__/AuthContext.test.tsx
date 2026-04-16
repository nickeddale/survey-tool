import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { type ReactNode } from 'react'
import { AuthProvider, useAuth } from '../AuthContext'
import { useAuthStore } from '../../store/authStore'
import { clearTokens, setTokens } from '../../services/tokenService'
import { mockUser, mockTokens } from '../../mocks/handlers'

// ---------------------------------------------------------------------------
// Wrapper helpers
// ---------------------------------------------------------------------------

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetAuthStore() {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isInitializing: true,
    isLoading: false,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthContext', () => {
  beforeEach(() => {
    clearTokens()
    localStorage.clear()
    resetAuthStore()
  })

  describe('useAuth outside provider', () => {
    it('throws a descriptive error when used outside AuthProvider', () => {
      // Suppress console.error from React for the expected throw
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(() => renderHook(() => useAuth())).toThrow(
        'useAuth must be used within an AuthProvider'
      )
      consoleSpy.mockRestore()
    })
  })

  describe('initial state (no stored tokens)', () => {
    it('exposes user=null, isAuthenticated=false, isInitializing=false after init', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isInitializing).toBe(false)
      })

      expect(result.current.user).toBeNull()
      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('initial state (with stored valid refresh token)', () => {
    it('sets user and isAuthenticated=true when refresh token is present and valid', async () => {
      // Set access token to simulate having a valid session (refresh will succeed)
      setTokens(mockTokens.access_token)

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isInitializing).toBe(false)
      })

      expect(result.current.user).not.toBeNull()
      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.user?.email).toBe(mockUser.email)
    })
  })

  describe('login()', () => {
    it('sets isAuthenticated=true and user after successful login', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => expect(result.current.isInitializing).toBe(false))

      await act(async () => {
        await result.current.login({ email: 'test@example.com', password: 'password123' })
      })

      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.user?.email).toBe(mockUser.email)
    })

    it('throws ApiError on invalid credentials', async () => {
      // Set a token so the 401-retry interceptor can refresh (returns new token) and retry.
      // The retried login still fails (bad credentials) and is normalized to ApiError.
      setTokens(mockTokens.access_token)

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => expect(result.current.isInitializing).toBe(false))

      let caughtError: unknown
      await act(async () => {
        try {
          await result.current.login({ email: 'bad@example.com', password: 'wrong' })
        } catch (err) {
          caughtError = err
        }
      })

      expect(caughtError).toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
    })
  })

  describe('logout()', () => {
    it('exposes logout action that clears auth state', async () => {
      // Set access token so initialize() succeeds (refresh returns 200 when token is set)
      setTokens(mockTokens.access_token)
      useAuthStore.setState({
        user: mockUser,
        isAuthenticated: true,
        isInitializing: false,
        isLoading: false,
      })

      const { result } = renderHook(() => useAuth(), { wrapper })

      // AuthProvider initializes: valid cookie → refresh succeeds → stays authenticated
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

      await act(async () => {
        await result.current.logout()
      })

      expect(result.current.user).toBeNull()
      expect(result.current.isAuthenticated).toBe(false)
    })
  })

  describe('register()', () => {
    it('returns UserResponse on successful registration', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => expect(result.current.isInitializing).toBe(false))

      let registeredUser: Awaited<ReturnType<typeof result.current.register>> | undefined
      await act(async () => {
        registeredUser = await result.current.register({
          email: 'new@example.com',
          password: 'password123',
        })
      })

      expect(registeredUser?.email).toBe(mockUser.email)
    })

    it('throws ApiError on duplicate email', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => expect(result.current.isInitializing).toBe(false))

      await expect(
        act(async () => {
          await result.current.register({ email: 'existing@example.com', password: 'password123' })
        })
      ).rejects.toMatchObject({ status: 409, code: 'CONFLICT' })
    })
  })
})
