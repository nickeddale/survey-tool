import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import apiClient, { setRedirectFn } from '../apiClient'
import { setTokens, clearTokens, getAccessToken } from '../tokenService'
import { mockTokens, mockNewTokens } from '../../mocks/handlers'

const BASE = '/api/v1'

describe('apiClient interceptors', () => {
  const mockRedirect = vi.fn()

  beforeEach(() => {
    clearTokens()
    localStorage.clear()
    mockRedirect.mockClear()
    setRedirectFn(mockRedirect)
  })

  afterEach(() => {
    // Restore default redirect behaviour
    setRedirectFn(() => {
      if (typeof window !== 'undefined') {
        window.location.href = '/login'
      }
    })
  })

  describe('request interceptor', () => {
    it('attaches Authorization header when access token is set', async () => {
      let capturedAuth: string | null = null
      server.use(
        http.get(`${BASE}/auth/me`, ({ request }) => {
          capturedAuth = request.headers.get('Authorization')
          return HttpResponse.json({ id: '1', email: 'a@b.com', name: null, is_active: true, created_at: '2024-01-01T00:00:00Z' })
        }),
      )
      setTokens(mockTokens.access_token)
      await apiClient.get('/auth/me')
      expect(capturedAuth).toBe(`Bearer ${mockTokens.access_token}`)
    })

    it('does not attach Authorization header when no token', async () => {
      let capturedAuth: string | null = null
      server.use(
        http.get(`${BASE}/open`, ({ request }) => {
          capturedAuth = request.headers.get('Authorization')
          return HttpResponse.json({})
        }),
      )
      await apiClient.get('/open').catch(() => {/* handler registered, may 404 */})
      expect(capturedAuth).toBeNull()
    })
  })

  describe('response interceptor — 401 handling', () => {
    it('normalizes 401 response into ApiError with structured detail', async () => {
      // Clear tokens and make refresh fail to simulate absent cookie
      clearTokens()
      server.use(
        http.post(`${BASE}/auth/refresh`, () => {
          return HttpResponse.json(
            { detail: { code: 'UNAUTHORIZED', message: 'No refresh token' } },
            { status: 401 },
          )
        }),
      )
      try {
        await apiClient.get('/auth/me')
        expect.fail('should have thrown')
      } catch (err: unknown) {
        const e = err as { status: number; code: string }
        // After failed refresh, the error from the refresh call is thrown
        expect(e.status).toBe(401)
      }
    })

    it('retries request after successful token refresh on 401', async () => {
      let callCount = 0
      server.use(
        http.get(`${BASE}/protected`, ({ request }) => {
          callCount++
          const auth = request.headers.get('Authorization')
          // First call fails, second call (with new token) succeeds
          if (callCount === 1) {
            return HttpResponse.json(
              { detail: { code: 'UNAUTHORIZED', message: 'Token expired' } },
              { status: 401 },
            )
          }
          // Second call should have new token
          if (auth?.includes(mockNewTokens.access_token)) {
            return HttpResponse.json({ data: 'success' })
          }
          return HttpResponse.json({ detail: { code: 'UNAUTHORIZED', message: 'Bad token' } }, { status: 401 })
        }),
        http.post(`${BASE}/auth/refresh`, () => {
          return HttpResponse.json(mockNewTokens)
        }),
      )

      setTokens(mockTokens.access_token)
      const response = await apiClient.get('/protected')
      expect(response.data).toEqual({ data: 'success' })
      expect(callCount).toBe(2)
      // New access token should be stored in memory
      expect(getAccessToken()).toBe(mockNewTokens.access_token)
    })

    it('redirects to /login when refresh fails on 401', async () => {
      server.use(
        http.get(`${BASE}/protected`, () => {
          return HttpResponse.json(
            { detail: { code: 'UNAUTHORIZED', message: 'Token expired' } },
            { status: 401 },
          )
        }),
        http.post(`${BASE}/auth/refresh`, () => {
          return HttpResponse.json(
            { detail: { code: 'UNAUTHORIZED', message: 'Invalid refresh token' } },
            { status: 401 },
          )
        }),
      )

      setTokens(mockTokens.access_token)

      try {
        await apiClient.get('/protected')
        expect.fail('should have thrown')
      } catch {
        // Should have cleared tokens and called the redirect function
        expect(getAccessToken()).toBeNull()
        expect(mockRedirect).toHaveBeenCalledOnce()
      }
    })

    it('only makes one refresh call when concurrent 401s arrive', async () => {
      let refreshCallCount = 0
      let protectedCallCount = 0

      server.use(
        http.get(`${BASE}/concurrent`, ({ request }) => {
          protectedCallCount++
          const auth = request.headers.get('Authorization')
          if (auth?.includes(mockNewTokens.access_token)) {
            return HttpResponse.json({ data: 'ok' })
          }
          return HttpResponse.json(
            { detail: { code: 'UNAUTHORIZED', message: 'Token expired' } },
            { status: 401 },
          )
        }),
        http.post(`${BASE}/auth/refresh`, () => {
          refreshCallCount++
          return HttpResponse.json(mockNewTokens)
        }),
      )

      setTokens(mockTokens.access_token)

      // Fire two requests simultaneously
      await Promise.all([
        apiClient.get('/concurrent'),
        apiClient.get('/concurrent'),
      ])

      // Only one refresh call should have been made
      expect(refreshCallCount).toBe(1)
    })
  })

  describe('auth endpoint 401 passthrough', () => {
    it('does not call redirectToLogin when /auth/login returns 401', async () => {
      server.use(
        http.post(`${BASE}/auth/login`, () => {
          return HttpResponse.json(
            { detail: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } },
            { status: 401 },
          )
        }),
      )

      try {
        await apiClient.post('/auth/login', { email: 'a@b.com', password: 'wrong' })
        expect.fail('should have thrown')
      } catch (err: unknown) {
        const e = err as { status: number; code: string; message: string }
        expect(e.status).toBe(401)
        expect(e.code).toBe('INVALID_CREDENTIALS')
        expect(e.message).toBe('Invalid email or password')
        expect(mockRedirect).not.toHaveBeenCalled()
      }
    })

    it('does not call redirectToLogin when /auth/register returns 401', async () => {
      server.use(
        http.post(`${BASE}/auth/register`, () => {
          return HttpResponse.json(
            { detail: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
            { status: 401 },
          )
        }),
      )

      try {
        await apiClient.post('/auth/register', { email: 'a@b.com', password: 'password123' })
        expect.fail('should have thrown')
      } catch (err: unknown) {
        const e = err as { status: number; code: string; message: string }
        expect(e.status).toBe(401)
        expect(mockRedirect).not.toHaveBeenCalled()
      }
    })

    it('still triggers refresh flow for 401 on a protected endpoint', async () => {
      server.use(
        http.get(`${BASE}/surveys`, ({ request }) => {
          const auth = request.headers.get('Authorization')
          if (auth?.includes(mockNewTokens.access_token)) {
            return HttpResponse.json({ items: [] })
          }
          return HttpResponse.json(
            { detail: { code: 'UNAUTHORIZED', message: 'Token expired' } },
            { status: 401 },
          )
        }),
        http.post(`${BASE}/auth/refresh`, () => {
          return HttpResponse.json(mockNewTokens)
        }),
      )

      setTokens(mockTokens.access_token)
      const response = await apiClient.get('/surveys')
      expect(response.data).toEqual({ items: [] })
      expect(mockRedirect).not.toHaveBeenCalled()
    })
  })

  describe('public survey route — no redirect on 401', () => {
    beforeEach(() => {
      // Simulate browser being on a public survey route
      Object.defineProperty(window, 'location', {
        value: { ...window.location, pathname: '/s/abc-123' },
        writable: true,
        configurable: true,
      })
    })

    afterEach(() => {
      // Restore default pathname
      Object.defineProperty(window, 'location', {
        value: { ...window.location, pathname: '/' },
        writable: true,
        configurable: true,
      })
    })

    it('does not call redirectToLogin when on /s/* and refresh fails after 401', async () => {
      server.use(
        http.get(`${BASE}/surveys/abc-123/responses`, () => {
          return HttpResponse.json(
            { detail: { code: 'UNAUTHORIZED', message: 'No auth' } },
            { status: 401 },
          )
        }),
        http.post(`${BASE}/auth/refresh`, () => {
          return HttpResponse.json(
            { detail: { code: 'UNAUTHORIZED', message: 'No refresh token' } },
            { status: 401 },
          )
        }),
      )

      setTokens(mockTokens.access_token)

      try {
        await apiClient.get('/surveys/abc-123/responses')
        expect.fail('should have thrown')
      } catch {
        expect(mockRedirect).not.toHaveBeenCalled()
      }
    })

    it('still triggers redirectToLogin when on a non-public route and refresh fails', async () => {
      Object.defineProperty(window, 'location', {
        value: { ...window.location, pathname: '/dashboard' },
        writable: true,
        configurable: true,
      })

      server.use(
        http.get(`${BASE}/surveys`, () => {
          return HttpResponse.json(
            { detail: { code: 'UNAUTHORIZED', message: 'Token expired' } },
            { status: 401 },
          )
        }),
        http.post(`${BASE}/auth/refresh`, () => {
          return HttpResponse.json(
            { detail: { code: 'UNAUTHORIZED', message: 'Invalid refresh token' } },
            { status: 401 },
          )
        }),
      )

      setTokens(mockTokens.access_token)

      try {
        await apiClient.get('/surveys')
        expect.fail('should have thrown')
      } catch {
        expect(mockRedirect).toHaveBeenCalledOnce()
      }
    })
  })

  describe('error normalization', () => {
    it('wraps structured error response into ApiError', async () => {
      server.use(
        http.get(`${BASE}/not-found`, () => {
          return HttpResponse.json(
            { detail: { code: 'NOT_FOUND', message: 'Resource not found' } },
            { status: 404 },
          )
        }),
      )

      try {
        await apiClient.get('/not-found')
        expect.fail('should throw')
      } catch (err: unknown) {
        const e = err as { status: number; code: string; message: string }
        expect(e.status).toBe(404)
        expect(e.code).toBe('NOT_FOUND')
        expect(e.message).toBe('Resource not found')
      }
    })
  })
})
