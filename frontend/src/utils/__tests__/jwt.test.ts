import { describe, it, expect } from 'vitest'
import { decodeJwtPayload, getTokenExpiry, isTokenExpiringSoon } from '../jwt'

// A real base64url-encoded JWT with known payload
// Header: {"alg":"HS256","typ":"JWT"}
// Payload: {"sub":"user-123","exp":9999999999,"iat":1}
const VALID_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImV4cCI6OTk5OTk5OTk5OSwiaWF0IjoxfQ.dummy-sig'

// JWT that expired in the past: exp = 1 (1970-01-01)
const EXPIRED_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImV4cCI6MSwiaWF0IjoxfQ.dummy-sig'

// JWT expiring in 30 seconds from "now" — we'll mock Date.now to control this
const NEAR_EXPIRY_EXP = Math.floor(Date.now() / 1000) + 30

function makeTokenWithExp(exp: number): string {
  const payload = btoa(JSON.stringify({ sub: 'u', exp, iat: 1 }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
  return `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.sig`
}

describe('decodeJwtPayload', () => {
  it('decodes a valid JWT payload', () => {
    const payload = decodeJwtPayload(VALID_TOKEN)
    expect(payload).not.toBeNull()
    expect(payload?.sub).toBe('user-123')
    expect(payload?.exp).toBe(9999999999)
  })

  it('returns null for malformed token', () => {
    expect(decodeJwtPayload('not.a.jwt.with.too.many.parts')).toBeNull()
    expect(decodeJwtPayload('onlyone')).toBeNull()
    expect(decodeJwtPayload('')).toBeNull()
  })

  it('returns null for non-JSON payload', () => {
    const badPayload = 'eyJhbGciOiJIUzI1NiJ9.bm90anNvbg.sig'
    // 'bm90anNvbg' decodes to 'notjson'
    expect(decodeJwtPayload(badPayload)).toBeNull()
  })
})

describe('getTokenExpiry', () => {
  it('returns exp from valid token', () => {
    expect(getTokenExpiry(VALID_TOKEN)).toBe(9999999999)
  })

  it('returns null for token without exp', () => {
    // Payload: {sub: "x"}
    const noExp = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig'
    expect(getTokenExpiry(noExp)).toBeNull()
  })

  it('returns null for malformed token', () => {
    expect(getTokenExpiry('bad')).toBeNull()
  })
})

describe('isTokenExpiringSoon', () => {
  it('returns false for a far-future token', () => {
    expect(isTokenExpiringSoon(VALID_TOKEN, 60)).toBe(false)
  })

  it('returns true for an expired token', () => {
    expect(isTokenExpiringSoon(EXPIRED_TOKEN, 60)).toBe(true)
  })

  it('returns true when token expires within threshold', () => {
    // 30 seconds from now, threshold = 60 → should be "expiring soon"
    const token = makeTokenWithExp(NEAR_EXPIRY_EXP)
    expect(isTokenExpiringSoon(token, 60)).toBe(true)
  })

  it('returns false when token has more than threshold seconds remaining', () => {
    // 120 seconds from now, threshold = 60 → not expiring soon
    const token = makeTokenWithExp(Math.floor(Date.now() / 1000) + 120)
    expect(isTokenExpiringSoon(token, 60)).toBe(false)
  })

  it('returns true for malformed tokens', () => {
    expect(isTokenExpiringSoon('invalid', 60)).toBe(true)
  })
})
