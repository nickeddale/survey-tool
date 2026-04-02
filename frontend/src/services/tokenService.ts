/**
 * Token storage service.
 *
 * Security design:
 * - Access token: stored ONLY in module-level memory (never written to localStorage/sessionStorage).
 *   This prevents XSS from reading the access token via document.cookie or storage APIs.
 * - Refresh token: stored in localStorage under a stable key.
 *   WARNING: localStorage is readable by JavaScript. This is a known XSS risk.
 *   Mitigate with strict Content-Security-Policy headers on the server.
 *   If the backend ever supports httpOnly cookie for refresh tokens, prefer that approach.
 */

const REFRESH_TOKEN_KEY = 'devtracker_refresh_token'

// Access token lives only in memory — never persisted to any browser storage
let _accessToken: string | null = null

export function getAccessToken(): string | null {
  return _accessToken
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY)
  } catch {
    return null
  }
}

export function setTokens(accessToken: string, refreshToken: string): void {
  _accessToken = accessToken
  try {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  } catch {
    // localStorage may be unavailable (e.g. private browsing in some browsers)
    // Access token is still in memory — the session will work until page reload
  }
}

export function clearTokens(): void {
  _accessToken = null
  try {
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  } catch {
    // Ignore storage errors on clear
  }
}
