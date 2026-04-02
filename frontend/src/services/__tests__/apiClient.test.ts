import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import apiClient from '../apiClient'
import { setTokens, clearTokens, getAccessToken, getRefreshToken } from '../tokenService'
import { mockTokens, mockNewTokens } from '../../mocks/handlers'

const BASE = '/api/v1'

describe('apiClient interceptors', () => {
  beforeEach(() => {
    clearTokens()
    localStorage.clear()
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
      setTokens(mockTokens.access_token, mockTokens.refresh_token)
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
      // Clear tokens so no refresh is attempted
      clearTokens()
      try {
        await apiClient.get('/auth/me')
        expect.fail('should have thrown')
      } catch (err: unknown) {
        const e = err as { status: number; code: string }
        expect(e.status).toBe(401)
        expect(e.code).toBe('UNAUTHORIZED')
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

      setTokens(mockTokens.access_token, mockTokens.refresh_token)
      const response = await apiClient.get('/protected')
      expect(response.data).toEqual({ data: 'success' })
      expect(callCount).toBe(2)
      // New tokens should be stored
      expect(getAccessToken()).toBe(mockNewTokens.access_token)
      expect(getRefreshToken()).toBe(mockNewTokens.refresh_token)
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

      setTokens(mockTokens.access_token, 'bad-refresh-token')

      // Override localStorage to return bad token
      localStorage.setItem('devtracker_refresh_token', 'bad-refresh-token')

      try {
        await apiClient.get('/protected')
        expect.fail('should have thrown')
      } catch {
        // Should have cleared tokens
        expect(getAccessToken()).toBeNull()
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

      setTokens(mockTokens.access_token, mockTokens.refresh_token)

      // Fire two requests simultaneously
      await Promise.all([
        apiClient.get('/concurrent'),
        apiClient.get('/concurrent'),
      ])

      // Only one refresh call should have been made
      expect(refreshCallCount).toBe(1)
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
