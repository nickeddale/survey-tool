import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import authService from '../authService'
import { getAccessToken, getRefreshToken, clearTokens } from '../tokenService'
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
      expect(tokens.refresh_token).toBe(mockTokens.refresh_token)
    })

    it('stores access token in memory after login', async () => {
      await authService.login({ email: 'test@example.com', password: 'password123' })
      expect(getAccessToken()).toBe(mockTokens.access_token)
    })

    it('stores refresh token in localStorage after login', async () => {
      await authService.login({ email: 'test@example.com', password: 'password123' })
      expect(getRefreshToken()).toBe(mockTokens.refresh_token)
    })

    it('throws ApiError on invalid credentials', async () => {
      await expect(
        authService.login({ email: 'bad@example.com', password: 'wrong' }),
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
        authService.register({ email: 'existing@example.com', password: 'password123' }),
      ).rejects.toMatchObject({ status: 409, code: 'CONFLICT' })
    })
  })

  describe('logout()', () => {
    it('clears tokens after logout', async () => {
      await authService.login({ email: 'test@example.com', password: 'password123' })
      expect(getAccessToken()).not.toBeNull()

      await authService.logout()
      expect(getAccessToken()).toBeNull()
      expect(getRefreshToken()).toBeNull()
    })

    it('clears tokens even if backend call fails', async () => {
      server.use(
        http.post(`${BASE}/auth/logout`, () => {
          return HttpResponse.json({ detail: { code: 'INTERNAL_ERROR', message: 'Server error' } }, { status: 500 })
        }),
      )
      await authService.login({ email: 'test@example.com', password: 'password123' })
      await authService.logout()
      expect(getAccessToken()).toBeNull()
      expect(getRefreshToken()).toBeNull()
    })
  })

  describe('refreshToken()', () => {
    it('returns new tokens and updates storage', async () => {
      await authService.login({ email: 'test@example.com', password: 'password123' })
      const tokens = await authService.refreshToken()
      expect(tokens.access_token).toBe(mockNewTokens.access_token)
      expect(getAccessToken()).toBe(mockNewTokens.access_token)
      expect(getRefreshToken()).toBe(mockNewTokens.refresh_token)
    })

    it('throws when no refresh token is stored', async () => {
      await expect(authService.refreshToken()).rejects.toThrow()
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

    it('throws ApiError 401 when no token is present', async () => {
      await expect(authService.getCurrentUser()).rejects.toMatchObject({ status: 401 })
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
