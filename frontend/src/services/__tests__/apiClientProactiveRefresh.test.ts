/**
 * Tests for ISS-183: builder page redirect regression.
 *
 * Scenario: proactive refresh (request interceptor) hits 429 repeatedly.
 * Expected: NO redirect to /login. Subsequent real 401 response SHOULD redirect.
 *
 * The fix: remove redirectToLogin() from the proactive refresh catch block.
 * The response interceptor's 401 handler remains the single authoritative redirect point.
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import apiClient, { setRedirectFn, resetProactiveRefreshCooldown } from '../apiClient'
import { setTokens, clearTokens } from '../tokenService'

const BASE = '/api/v1'

// Build a JWT that expires in `secondsFromNow` seconds from now.
function makeSoonExpiringToken(secondsFromNow: number): string {
  const now = Math.floor(Date.now() / 1000)
  const payload = { sub: 'user-1', exp: now + secondsFromNow, iat: now }
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  const body = btoa(JSON.stringify(payload))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `${header}.${body}.dummy`
}

describe('proactive refresh — no redirect on 429 (ISS-183)', () => {
  const mockRedirect = vi.fn()

  beforeAll(() => {
    vi.useFakeTimers()
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    clearTokens()
    mockRedirect.mockClear()
    setRedirectFn(mockRedirect)
    resetProactiveRefreshCooldown()
    // Set a token that expires in 10 seconds — within the 30s proactive threshold
    setTokens(makeSoonExpiringToken(10))
  })

  afterEach(() => {
    setRedirectFn(() => {
      if (typeof window !== 'undefined') {
        window.location.href = '/login'
      }
    })
  })

  it('does NOT redirect when proactive refresh returns 429 (first attempt)', async () => {
    server.use(
      http.post(`${BASE}/auth/refresh`, () => {
        return HttpResponse.json(
          { detail: { code: 'RATE_LIMITED', message: 'Too many requests' } },
          { status: 429, headers: { 'Retry-After': '1' } }
        )
      }),
      http.get(`${BASE}/surveys`, () => {
        return HttpResponse.json({ items: [] })
      })
    )

    // The proactive refresh will fail with 429 — should NOT redirect
    const promise = apiClient.get('/surveys').catch((e) => e)
    await vi.runAllTimersAsync()
    await promise

    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('does NOT redirect when both proactive refresh attempts return 429', async () => {
    server.use(
      http.post(`${BASE}/auth/refresh`, () => {
        return HttpResponse.json(
          { detail: { code: 'RATE_LIMITED', message: 'Too many requests' } },
          { status: 429, headers: { 'Retry-After': '1' } }
        )
      }),
      http.get(`${BASE}/surveys`, () => {
        return HttpResponse.json({ items: [] })
      })
    )

    const promise = apiClient.get('/surveys').catch((e) => e)
    await vi.runAllTimersAsync()
    await promise

    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('redirects when a real 401 response is received (no expiring token, reactive refresh fails)', async () => {
    // Simulate a non-public route where redirects are allowed
    Object.defineProperty(window, 'location', {
      value: { ...window.location, pathname: '/surveys/builder' },
      writable: true,
      configurable: true,
    })

    // Use a token that is NOT expiring soon (no proactive refresh triggered)
    // so we can test the reactive 401 path in isolation
    clearTokens()
    // Don't set any token — no token means no proactive refresh attempt

    server.use(
      http.post(`${BASE}/auth/refresh`, () => {
        return HttpResponse.json(
          { detail: { code: 'UNAUTHORIZED', message: 'Refresh token expired' } },
          { status: 401 }
        )
      }),
      http.get(`${BASE}/protected-resource`, () => {
        // Returns 401 — simulates a protected endpoint with no valid token
        return HttpResponse.json(
          { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
          { status: 401 }
        )
      })
    )

    // No token is set so request goes out without Authorization.
    // Server returns 401. Response interceptor tries to refresh.
    // Refresh fails with 401. Catch block calls redirectToLogin().
    const promise = apiClient.get('/protected-resource').catch((e) => e)
    await vi.runAllTimersAsync()
    await promise

    // The response interceptor's 401 handler should have called redirect
    expect(mockRedirect).toHaveBeenCalledOnce()

    // Restore
    Object.defineProperty(window, 'location', {
      value: { ...window.location, pathname: '/' },
      writable: true,
      configurable: true,
    })
  })

  it('skips proactive refresh within cooldown window after a failure', async () => {
    let refreshCallCount = 0

    server.use(
      http.post(`${BASE}/auth/refresh`, () => {
        refreshCallCount++
        return HttpResponse.json(
          { detail: { code: 'RATE_LIMITED', message: 'Too many requests' } },
          { status: 429, headers: { 'Retry-After': '1' } }
        )
      }),
      http.get(`${BASE}/surveys`, ({ request }) => {
        // Return success regardless of auth header (to let request complete)
        const auth = request.headers.get('Authorization')
        if (auth) {
          return HttpResponse.json({ items: [] })
        }
        return HttpResponse.json({ items: [] })
      })
    )

    // First request — proactive refresh fires, hits 429, sets cooldown
    const firstPromise = apiClient.get('/surveys').catch(() => {
      /* proactive may reject */
    })
    await vi.runAllTimersAsync()
    await firstPromise

    const refreshAfterFirst = refreshCallCount

    // Set a new soon-expiring token (simulating the state after cooldown but within window)
    setTokens(makeSoonExpiringToken(10))

    // Second request — should be within cooldown, so NO proactive refresh should fire
    const secondPromise = apiClient.get('/surveys').catch(() => {
      /* ignore */
    })
    await vi.runAllTimersAsync()
    await secondPromise

    // Refresh should not have been called a second time (cooldown active)
    expect(refreshCallCount).toBe(refreshAfterFirst)
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
