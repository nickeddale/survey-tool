/**
 * JWT utility functions.
 * Decodes JWT payload without verification (client-side only use).
 * Used for proactive token refresh before expiry.
 */

interface JwtPayload {
  sub?: string
  exp?: number
  iat?: number
  [key: string]: unknown
}

/**
 * Decode JWT payload from base64url without signature verification.
 * Returns null if the token is malformed.
 */
export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    // base64url → base64 → JSON
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const json = atob(padded)
    return JSON.parse(json) as JwtPayload
  } catch {
    return null
  }
}

/**
 * Extract the expiry timestamp (seconds since epoch) from a JWT.
 * Returns null if the token is malformed or has no exp claim.
 */
export function getTokenExpiry(token: string): number | null {
  const payload = decodeJwtPayload(token)
  if (payload?.exp == null) return null
  return payload.exp
}

/**
 * Returns true if the token will expire within the given threshold (seconds).
 * Treats malformed tokens as expired.
 * Default threshold is 30 seconds — reduced from 60 to avoid constant proactive
 * refresh calls during the last minute of token validity (ISS-183).
 */
export function isTokenExpiringSoon(token: string, thresholdSeconds = 30): boolean {
  const exp = getTokenExpiry(token)
  if (exp == null) return true
  const nowSeconds = Math.floor(Date.now() / 1000)
  return exp - nowSeconds <= thresholdSeconds
}
