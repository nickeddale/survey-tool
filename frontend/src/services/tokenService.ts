/**
 * Token storage service.
 *
 * Security design:
 * - Access token: stored ONLY in module-level memory (never written to localStorage/sessionStorage).
 *   This prevents XSS from reading the access token via document.cookie or storage APIs.
 * - Refresh token: stored in an httpOnly/Secure/SameSite=Strict cookie managed by the backend.
 *   JavaScript cannot read or write the refresh token — it is sent automatically by the browser
 *   on requests to the backend. This eliminates the XSS risk for refresh tokens.
 */

// Access token lives only in memory — never persisted to any browser storage
let _accessToken: string | null = null

export function getAccessToken(): string | null {
  return _accessToken
}

export function setTokens(accessToken: string): void {
  _accessToken = accessToken
}

export function clearTokens(): void {
  _accessToken = null
}
