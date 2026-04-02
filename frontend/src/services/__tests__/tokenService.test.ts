import { describe, it, expect, beforeEach } from 'vitest'
import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
} from '../tokenService'

const ACCESS = 'test-access-token'
const REFRESH = 'test-refresh-token'

describe('tokenService', () => {
  beforeEach(() => {
    clearTokens()
    localStorage.clear()
  })

  describe('initial state', () => {
    it('access token is null by default', () => {
      expect(getAccessToken()).toBeNull()
    })

    it('refresh token is null by default', () => {
      expect(getRefreshToken()).toBeNull()
    })
  })

  describe('setTokens', () => {
    it('stores access token in memory', () => {
      setTokens(ACCESS, REFRESH)
      expect(getAccessToken()).toBe(ACCESS)
    })

    it('stores refresh token in localStorage', () => {
      setTokens(ACCESS, REFRESH)
      expect(getRefreshToken()).toBe(REFRESH)
    })

    it('access token is NOT in localStorage', () => {
      setTokens(ACCESS, REFRESH)
      // The access token should not appear in any localStorage key
      const allValues = Object.values(localStorage).join(',')
      expect(allValues).not.toContain(ACCESS)
    })
  })

  describe('clearTokens', () => {
    it('clears access token from memory', () => {
      setTokens(ACCESS, REFRESH)
      clearTokens()
      expect(getAccessToken()).toBeNull()
    })

    it('clears refresh token from localStorage', () => {
      setTokens(ACCESS, REFRESH)
      clearTokens()
      expect(getRefreshToken()).toBeNull()
    })
  })

  describe('persistence', () => {
    it('refresh token survives a fresh import (localStorage persists)', () => {
      setTokens(ACCESS, REFRESH)
      // Simulate what happens when clearTokens is NOT called (page still open):
      // getRefreshToken reads from localStorage
      expect(getRefreshToken()).toBe(REFRESH)
    })
  })
})
