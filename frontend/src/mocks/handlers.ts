/**
 * MSW request handlers for testing.
 *
 * All error responses match the backend's exact shape: {detail: {code, message}}
 * as confirmed from backend/app/utils/errors.py and backend/app/main.py.
 */

import { http, HttpResponse } from 'msw'

const BASE = '/api/v1'

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

export const mockUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'test@example.com',
  name: 'Test User',
  is_active: true,
  created_at: '2024-01-01T00:00:00Z',
}

export const mockTokens = {
  access_token:
    // JWT with payload {sub: "00000000-0000-0000-0000-000000000001", exp: 9999999999, iat: 1}
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDEiLCJleHAiOjk5OTk5OTk5OTksImlhdCI6MX0.dummy',
  refresh_token: 'mock-refresh-token-abc123',
  token_type: 'bearer',
  expires_in: 1800,
}

export const mockNewTokens = {
  access_token:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDEiLCJleHAiOjk5OTk5OTk5OTksImlhdCI6Mn0.dummy',
  refresh_token: 'mock-refresh-token-new456',
  token_type: 'bearer',
  expires_in: 1800,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const handlers = [
  // POST /api/v1/auth/login
  http.post(`${BASE}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string }
    if (body.email === 'test@example.com' && body.password === 'password123') {
      return HttpResponse.json(mockTokens, { status: 200 })
    }
    return HttpResponse.json(
      { detail: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } },
      { status: 401 },
    )
  }),

  // POST /api/v1/auth/register
  http.post(`${BASE}/auth/register`, async ({ request }) => {
    const body = (await request.json()) as { email?: string }
    if (body.email === 'existing@example.com') {
      return HttpResponse.json(
        { detail: { code: 'CONFLICT', message: 'A user with this email already exists' } },
        { status: 409 },
      )
    }
    return HttpResponse.json(mockUser, { status: 201 })
  }),

  // POST /api/v1/auth/refresh
  http.post(`${BASE}/auth/refresh`, async ({ request }) => {
    const body = (await request.json()) as { refresh_token?: string }
    if (body.refresh_token === mockTokens.refresh_token || body.refresh_token === 'mock-refresh-token-new456') {
      return HttpResponse.json(mockNewTokens, { status: 200 })
    }
    return HttpResponse.json(
      { detail: { code: 'UNAUTHORIZED', message: 'Invalid or revoked refresh token' } },
      { status: 401 },
    )
  }),

  // POST /api/v1/auth/logout
  http.post(`${BASE}/auth/logout`, () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // GET /api/v1/auth/me
  http.get(`${BASE}/auth/me`, ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 },
      )
    }
    return HttpResponse.json(mockUser, { status: 200 })
  }),

  // PATCH /api/v1/auth/me
  http.patch(`${BASE}/auth/me`, async ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 },
      )
    }
    const body = (await request.json()) as { name?: string }
    return HttpResponse.json(
      { ...mockUser, name: body.name ?? mockUser.name },
      { status: 200 },
    )
  }),
]
