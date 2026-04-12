import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import authService from '../authService'
import { getAccessToken, setTokens, clearTokens } from '../tokenService'
import { mockUser, mockTokens, mockNewTokens } from '../../mocks/handlers'

const BASE = '/api/v1'

describe('authService', () => {
  beforeEach(() => {
    clearTokens()
    localStorage.clear()
  })

  describe('login()', () => {
    it('returns token response on success', async () => {
      const tokens = await authService.login({ email: 'test@example.com', password: 'password123' })
      expect(tokens.access_token).toBe(mockTokens.access_token)
    })

    it('does not return refresh_token in response (it is in httpOnly cookie)', async () => {
      const tokens = await authService.login({ email: 'test@example.com', password: 'password123' })
      expect(tokens).not.toHaveProperty('refresh_token')
    })

    it('stores access token in memory after login', async () => {
      await authService.login({ email: 'test@example.com', password: 'password123' })
      expect(getAccessToken()).toBe(mockTokens.access_token)
    })

    it('does NOT store refresh token in localStorage (httpOnly cookie only)', async () => {
      await authService.login({ email: 'test@example.com', password: 'password123' })
      expect(localStorage.length).toBe(0)
    })

    it('throws ApiError on invalid credentials', async () => {
      // Set a token so the 401-retry interceptor can refresh (returns new token) and retry.
      // The retried login still fails (bad credentials) and is normalized to ApiError.
      setTokens(mockTokens.access_token)
      await expect(
        authService.login({ email: 'bad@example.com', password: 'wrong' })
      ).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
    })
  })

  describe('register()', () => {
    it('returns user on success', async () => {
      const user = await authService.register({
        email: 'new@example.com',
        password: 'password123',
      })
      expect(user.id).toBe(mockUser.id)
      expect(user.email).toBe(mockUser.email)
    })

    it('does NOT return password_hash field', async () => {
      const user = await authService.register({
        email: 'new@example.com',
        password: 'password123',
      })
      expect(user).not.toHaveProperty('password_hash')
    })

    it('throws ApiError on conflict (duplicate email)', async () => {
      await expect(
        authService.register({ email: 'existing@example.com', password: 'password123' })
      ).rejects.toMatchObject({ status: 409, code: 'CONFLICT' })
    })
  })

  describe('logout()', () => {
    it('clears access token after logout', async () => {
      await authService.login({ email: 'test@example.com', password: 'password123' })
      expect(getAccessToken()).not.toBeNull()

      await authService.logout()
      expect(getAccessToken()).toBeNull()
    })

    it('clears access token even if backend call fails', async () => {
      server.use(
        http.post(`${BASE}/auth/logout`, () => {
          return HttpResponse.json(
            { detail: { code: 'INTERNAL_ERROR', message: 'Server error' } },
            { status: 500 }
          )
        })
      )
      await authService.login({ email: 'test@example.com', password: 'password123' })
      await authService.logout()
      expect(getAccessToken()).toBeNull()
    })

    it('does not send refresh_token in request body (cookie is sent automatically)', async () => {
      let capturedBody: Record<string, unknown> | null = null
      server.use(
        http.post(`${BASE}/auth/logout`, async ({ request }) => {
          const text = await request.text()
          capturedBody = text ? JSON.parse(text) : {}
          return new HttpResponse(null, { status: 204 })
        })
      )
      await authService.login({ email: 'test@example.com', password: 'password123' })
      await authService.logout()
      // Body should be empty — no refresh_token field
      expect(capturedBody).not.toHaveProperty('refresh_token')
    })
  })

  describe('refreshToken()', () => {
    it('returns new access token and updates memory', async () => {
      await authService.login({ email: 'test@example.com', password: 'password123' })
      const tokens = await authService.refreshToken()
      expect(tokens.access_token).toBe(mockNewTokens.access_token)
      expect(getAccessToken()).toBe(mockNewTokens.access_token)
    })

    it('does not send refresh_token in request body (cookie is sent automatically)', async () => {
      let capturedBody: Record<string, unknown> | null = null
      server.use(
        http.post(`${BASE}/auth/refresh`, async ({ request }) => {
          const text = await request.text()
          capturedBody = text ? JSON.parse(text) : {}
          return HttpResponse.json(mockNewTokens, { status: 200 })
        })
      )
      await authService.login({ email: 'test@example.com', password: 'password123' })
      await authService.refreshToken()
      expect(capturedBody).not.toHaveProperty('refresh_token')
    })
  })

  describe('getCurrentUser()', () => {
    it('returns user when authenticated', async () => {
      await authService.login({ email: 'test@example.com', password: 'password123' })
      const user = await authService.getCurrentUser()
      expect(user.id).toBe(mockUser.id)
      expect(user.email).toBe(mockUser.email)
    })

    it('does NOT return password_hash field', async () => {
      await authService.login({ email: 'test@example.com', password: 'password123' })
      const user = await authService.getCurrentUser()
      expect(user).not.toHaveProperty('password_hash')
    })

    it('throws when no token and refresh cookie is absent', async () => {
      // Simulate absent httpOnly cookie by making the refresh endpoint return 401
      server.use(
        http.post(`${BASE}/auth/refresh`, () => {
          return HttpResponse.json(
            { detail: { code: 'UNAUTHORIZED', message: 'No refresh token' } },
            { status: 401 }
          )
        })
      )
      await expect(authService.getCurrentUser()).rejects.toBeTruthy()
    })
  })

  describe('updateCurrentUser()', () => {
    it('updates user name', async () => {
      await authService.login({ email: 'test@example.com', password: 'password123' })
      const updated = await authService.updateCurrentUser({ name: 'Updated Name' })
      expect(updated.name).toBe('Updated Name')
    })
  })
})
