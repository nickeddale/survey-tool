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

export const mockSurveys = [
  {
    id: '10000000-0000-0000-0000-000000000001',
    user_id: '00000000-0000-0000-0000-000000000001',
    title: 'Customer Satisfaction Survey',
    description: 'Measure customer satisfaction',
    status: 'active',
    welcome_message: null,
    end_message: null,
    default_language: 'en',
    settings: null,
    created_at: '2024-01-10T10:00:00Z',
    updated_at: '2024-01-15T12:00:00Z',
  },
  {
    id: '10000000-0000-0000-0000-000000000002',
    user_id: '00000000-0000-0000-0000-000000000001',
    title: 'Employee Feedback Form',
    description: null,
    status: 'draft',
    welcome_message: null,
    end_message: null,
    default_language: 'en',
    settings: null,
    created_at: '2024-01-08T10:00:00Z',
    updated_at: '2024-01-14T08:00:00Z',
  },
  {
    id: '10000000-0000-0000-0000-000000000003',
    user_id: '00000000-0000-0000-0000-000000000001',
    title: 'Product NPS Survey',
    description: 'Net Promoter Score',
    status: 'closed',
    welcome_message: null,
    end_message: null,
    default_language: 'en',
    settings: null,
    created_at: '2024-01-05T10:00:00Z',
    updated_at: '2024-01-12T15:00:00Z',
  },
  {
    id: '10000000-0000-0000-0000-000000000004',
    user_id: '00000000-0000-0000-0000-000000000001',
    title: 'Old Market Research',
    description: null,
    status: 'archived',
    welcome_message: null,
    end_message: null,
    default_language: 'en',
    settings: null,
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-11T09:00:00Z',
  },
  {
    id: '10000000-0000-0000-0000-000000000005',
    user_id: '00000000-0000-0000-0000-000000000001',
    title: 'Annual Review Survey',
    description: null,
    status: 'draft',
    welcome_message: null,
    end_message: null,
    default_language: 'en',
    settings: null,
    created_at: '2024-01-03T10:00:00Z',
    updated_at: '2024-01-10T11:00:00Z',
  },
]

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

  // GET /api/v1/surveys
  http.get(`${BASE}/surveys`, ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 },
      )
    }
    const url = new URL(request.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
    const perPage = Math.max(1, parseInt(url.searchParams.get('per_page') ?? '10', 10) || 10)
    const statusFilter = url.searchParams.get('status') ?? ''
    const search = (url.searchParams.get('search') ?? '').toLowerCase()

    let filtered = [...mockSurveys]
    if (statusFilter && statusFilter !== 'all') {
      filtered = filtered.filter((s) => s.status === statusFilter)
    }
    if (search) {
      filtered = filtered.filter((s) => s.title.toLowerCase().includes(search))
    }

    const total = filtered.length
    const totalPages = Math.max(1, Math.ceil(total / perPage))
    const safePage = Math.min(page, totalPages)
    const start = (safePage - 1) * perPage
    const items = filtered.slice(start, start + perPage)

    return HttpResponse.json(
      {
        items,
        total,
        page: safePage,
        per_page: perPage,
        total_pages: totalPages,
      },
      { status: 200 },
    )
  }),

  // GET /api/v1/surveys/:id
  http.get(`${BASE}/surveys/:id`, ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 },
      )
    }
    const survey = mockSurveys.find((s) => s.id === params.id)
    if (!survey) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Survey not found' } },
        { status: 404 },
      )
    }
    return HttpResponse.json(survey, { status: 200 })
  }),

  // POST /api/v1/surveys
  http.post(`${BASE}/surveys`, async ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 },
      )
    }
    const body = (await request.json()) as Record<string, unknown>
    if (!body.title) {
      return HttpResponse.json(
        { detail: { code: 'VALIDATION_ERROR', message: 'Title is required' } },
        { status: 422 },
      )
    }
    const newSurvey = {
      id: '20000000-0000-0000-0000-000000000001',
      user_id: '00000000-0000-0000-0000-000000000001',
      title: body.title as string,
      description: (body.description as string | null) ?? null,
      status: 'draft',
      welcome_message: (body.welcome_message as string | null) ?? null,
      end_message: (body.end_message as string | null) ?? null,
      default_language: (body.default_language as string) ?? 'en',
      settings: null,
      created_at: '2024-01-20T10:00:00Z',
      updated_at: '2024-01-20T10:00:00Z',
    }
    return HttpResponse.json(newSurvey, { status: 201 })
  }),

  // PATCH /api/v1/surveys/:id
  http.patch(`${BASE}/surveys/:id`, async ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 },
      )
    }
    const survey = mockSurveys.find((s) => s.id === params.id)
    if (!survey) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Survey not found' } },
        { status: 404 },
      )
    }
    const body = (await request.json()) as Record<string, unknown>
    const updated = { ...survey, ...body, updated_at: '2024-01-20T12:00:00Z' }
    return HttpResponse.json(updated, { status: 200 })
  }),

  // DELETE /api/v1/surveys/:id
  http.delete(`${BASE}/surveys/:id`, ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 },
      )
    }
    return new HttpResponse(null, { status: 204 })
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
