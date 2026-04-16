import { describe, it, expect, beforeEach } from 'vitest'
import { getAccessToken, setTokens, clearTokens } from '../tokenService'

const ACCESS = 'test-access-token'

describe('tokenService', () => {
  beforeEach(() => {
    clearTokens()
    localStorage.clear()
  })

  describe('initial state', () => {
    it('access token is null by default', () => {
      expect(getAccessToken()).toBeNull()
    })
  })

  describe('setTokens', () => {
    it('stores access token in memory', () => {
      setTokens(ACCESS)
      expect(getAccessToken()).toBe(ACCESS)
    })

    it('access token is NOT in localStorage', () => {
      setTokens(ACCESS)
      // The access token should not appear in any localStorage key
      const allValues = Object.values(localStorage).join(',')
      expect(allValues).not.toContain(ACCESS)
    })

    it('refresh token is NOT in localStorage (httpOnly cookie, not JS-accessible)', () => {
      setTokens(ACCESS)
      // localStorage must remain empty — refresh token is in httpOnly cookie only
      expect(localStorage.length).toBe(0)
    })
  })

  describe('clearTokens', () => {
    it('clears access token from memory', () => {
      setTokens(ACCESS)
      clearTokens()
      expect(getAccessToken()).toBeNull()
    })
  })
})
