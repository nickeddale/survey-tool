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

// Full survey response with groups/questions/options (matches SurveyFullResponse)
export const mockSurveyFull = {
  ...(() => {
    const base = {
      id: '10000000-0000-0000-0000-000000000002',
      user_id: '00000000-0000-0000-0000-000000000001',
      title: 'Employee Feedback Form',
      description: 'Gather employee feedback',
      status: 'draft',
      welcome_message: 'Welcome to our survey!',
      end_message: 'Thank you for your feedback.',
      default_language: 'en',
      settings: null,
      created_at: '2024-01-08T10:00:00Z',
      updated_at: '2024-01-14T08:00:00Z',
    }
    return base
  })(),
  groups: [
    {
      id: 'g1',
      survey_id: '10000000-0000-0000-0000-000000000002',
      title: 'General Questions',
      description: null,
      sort_order: 1,
      relevance: null,
      created_at: '2024-01-08T10:00:00Z',
      questions: [
        {
          id: 'q1',
          group_id: 'g1',
          parent_id: null,
          question_type: 'short_text',
          code: 'Q1',
          title: 'What is your name?',
          description: null,
          is_required: true,
          sort_order: 1,
          relevance: null,
          validation: null,
          settings: null,
          created_at: '2024-01-08T10:00:00Z',
          subquestions: [],
          answer_options: [],
        },
        {
          id: 'q2',
          group_id: 'g1',
          parent_id: null,
          question_type: 'radio',
          code: 'Q2',
          title: 'How satisfied are you?',
          description: 'Rate your satisfaction',
          is_required: false,
          sort_order: 2,
          relevance: null,
          validation: null,
          settings: null,
          created_at: '2024-01-08T10:00:00Z',
          subquestions: [],
          answer_options: [
            {
              id: 'o1',
              question_id: 'q2',
              code: 'A1',
              title: 'Very Satisfied',
              sort_order: 1,
              assessment_value: 5,
              created_at: '2024-01-08T10:00:00Z',
            },
            {
              id: 'o2',
              question_id: 'q2',
              code: 'A2',
              title: 'Satisfied',
              sort_order: 2,
              assessment_value: 4,
              created_at: '2024-01-08T10:00:00Z',
            },
          ],
        },
      ],
    },
  ],
  questions: [],
  options: [],
}

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
    // Return mockSurveyFull if id matches, otherwise build full response from mockSurveys
    if (params.id === mockSurveyFull.id) {
      return HttpResponse.json(mockSurveyFull, { status: 200 })
    }
    const survey = mockSurveys.find((s) => s.id === params.id)
    if (!survey) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Survey not found' } },
        { status: 404 },
      )
    }
    return HttpResponse.json({ ...survey, groups: [], questions: [], options: [] }, { status: 200 })
  }),

  // POST /api/v1/surveys/:id/activate
  http.post(`${BASE}/surveys/:id/activate`, ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 },
      )
    }
    const survey = mockSurveys.find((s) => s.id === params.id) ??
      (params.id === mockSurveyFull.id ? mockSurveyFull : null)
    if (!survey) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Survey not found' } },
        { status: 404 },
      )
    }
    return HttpResponse.json({ ...survey, status: 'active', updated_at: new Date().toISOString() }, { status: 200 })
  }),

  // POST /api/v1/surveys/:id/close
  http.post(`${BASE}/surveys/:id/close`, ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 },
      )
    }
    const survey = mockSurveys.find((s) => s.id === params.id) ??
      (params.id === mockSurveyFull.id ? mockSurveyFull : null)
    if (!survey) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Survey not found' } },
        { status: 404 },
      )
    }
    return HttpResponse.json({ ...survey, status: 'closed', updated_at: new Date().toISOString() }, { status: 200 })
  }),

  // POST /api/v1/surveys/:id/archive
  http.post(`${BASE}/surveys/:id/archive`, ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 },
      )
    }
    const survey = mockSurveys.find((s) => s.id === params.id) ??
      (params.id === mockSurveyFull.id ? mockSurveyFull : null)
    if (!survey) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Survey not found' } },
        { status: 404 },
      )
    }
    return HttpResponse.json({ ...survey, status: 'archived', updated_at: new Date().toISOString() }, { status: 200 })
  }),

  // POST /api/v1/surveys/:id/clone
  http.post(`${BASE}/surveys/:id/clone`, ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 },
      )
    }
    const survey = mockSurveys.find((s) => s.id === params.id) ??
      (params.id === mockSurveyFull.id ? mockSurveyFull : null)
    if (!survey) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Survey not found' } },
        { status: 404 },
      )
    }
    const cloned = {
      ...survey,
      id: '30000000-0000-0000-0000-000000000001',
      title: `Copy of ${survey.title}`,
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    return HttpResponse.json(cloned, { status: 201 })
  }),

  // GET /api/v1/surveys/:id/export
  http.get(`${BASE}/surveys/:id/export`, ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 },
      )
    }
    const survey = mockSurveys.find((s) => s.id === params.id) ??
      (params.id === mockSurveyFull.id ? mockSurveyFull : null)
    if (!survey) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Survey not found' } },
        { status: 404 },
      )
    }
    const json = JSON.stringify(survey, null, 2)
    return new HttpResponse(json, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
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

  // POST /api/v1/surveys/:surveyId/questions/:questionId/options
  http.post(`${BASE}/surveys/:surveyId/questions/:questionId/options`, async ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 },
      )
    }
    const body = (await request.json()) as Record<string, unknown>
    const newOption = {
      id: `opt-${Date.now()}`,
      question_id: params.questionId as string,
      code: body.code as string,
      title: body.title as string,
      sort_order: (body.sort_order as number) ?? 1,
      assessment_value: (body.assessment_value as number) ?? 0,
      created_at: new Date().toISOString(),
    }
    return HttpResponse.json(newOption, { status: 201 })
  }),

  // PATCH /api/v1/surveys/:surveyId/questions/:questionId/options/reorder
  http.patch(`${BASE}/surveys/:surveyId/questions/:questionId/options/reorder`, ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 },
      )
    }
    return new HttpResponse(null, { status: 204 })
  }),

  // PATCH /api/v1/surveys/:surveyId/questions/:questionId/options/:optionId
  http.patch(`${BASE}/surveys/:surveyId/questions/:questionId/options/:optionId`, async ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 },
      )
    }
    const body = (await request.json()) as Record<string, unknown>
    const updatedOption = {
      id: params.optionId as string,
      question_id: params.questionId as string,
      code: 'A1',
      title: 'Updated',
      sort_order: 1,
      assessment_value: 0,
      created_at: '2024-01-08T10:00:00Z',
      ...body,
    }
    return HttpResponse.json(updatedOption, { status: 200 })
  }),

  // DELETE /api/v1/surveys/:surveyId/questions/:questionId/options/:optionId
  http.delete(`${BASE}/surveys/:surveyId/questions/:questionId/options/:optionId`, ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 },
      )
    }
    return new HttpResponse(null, { status: 204 })
  }),

  // PATCH /api/v1/surveys/:id/groups/:groupId/questions/reorder
  http.patch(`${BASE}/surveys/:surveyId/groups/:groupId/questions/reorder`, ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 },
      )
    }
    return new HttpResponse(null, { status: 204 })
  }),

  // PATCH /api/v1/surveys/:id/questions/:questionId (move to different group)
  http.patch(`${BASE}/surveys/:surveyId/questions/:questionId`, ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 },
      )
    }
    return new HttpResponse(null, { status: 204 })
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

  // POST /api/v1/surveys/:surveyId/groups
  http.post(`${BASE}/surveys/:surveyId/groups`, async ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 },
      )
    }
    const body = (await request.json()) as Record<string, unknown>
    const newGroup = {
      id: `g-new-${Date.now()}`,
      survey_id: params.surveyId as string,
      title: (body.title as string) ?? 'New Group',
      description: (body.description as string | null) ?? null,
      sort_order: mockSurveyFull.groups.length + 1,
      relevance: null,
      created_at: new Date().toISOString(),
      questions: [],
    }
    return HttpResponse.json(newGroup, { status: 201 })
  }),

  // PATCH /api/v1/surveys/:surveyId/groups/reorder
  http.patch(`${BASE}/surveys/:surveyId/groups/reorder`, async ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 },
      )
    }
    const body = (await request.json()) as { group_ids?: string[] }
    const groupIds = body.group_ids ?? []
    const reordered = groupIds.map((id, index) => {
      const existing = mockSurveyFull.groups.find((g) => g.id === id)
      return existing ? { ...existing, sort_order: index + 1 } : null
    }).filter(Boolean)
    return HttpResponse.json(reordered, { status: 200 })
  }),

  // PATCH /api/v1/surveys/:surveyId/groups/:groupId
  http.patch(`${BASE}/surveys/:surveyId/groups/:groupId`, async ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 },
      )
    }
    const group = mockSurveyFull.groups.find((g) => g.id === params.groupId)
    if (!group) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Group not found' } },
        { status: 404 },
      )
    }
    const body = (await request.json()) as Record<string, unknown>
    const updated = { ...group, ...body, updated_at: new Date().toISOString() }
    return HttpResponse.json(updated, { status: 200 })
  }),

  // DELETE /api/v1/surveys/:surveyId/groups/:groupId
  http.delete(`${BASE}/surveys/:surveyId/groups/:groupId`, ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 },
      )
    }
    return new HttpResponse(null, { status: 204 })
  }),

  // PATCH /api/v1/surveys/:surveyId/groups/:groupId/questions/:questionId
  http.patch(`${BASE}/surveys/:surveyId/groups/:groupId/questions/:questionId`, async ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 },
      )
    }
    // Find the question in mockSurveyFull
    let foundQuestion = null
    for (const group of mockSurveyFull.groups) {
      const q = group.questions.find((q) => q.id === params.questionId)
      if (q) {
        foundQuestion = q
        break
      }
    }
    if (!foundQuestion) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Question not found' } },
        { status: 404 },
      )
    }
    const body = (await request.json()) as Record<string, unknown>
    const updated = { ...foundQuestion, ...body, updated_at: new Date().toISOString() }
    return HttpResponse.json(updated, { status: 200 })
  }),

  // POST /api/v1/surveys/:surveyId/logic/validate-expression
  http.post(`${BASE}/surveys/:surveyId/logic/validate-expression`, async ({ request }) => {
    const body = (await request.json()) as { expression: string }
    const hasExpression = Boolean(body.expression && body.expression.trim())
    // Return structured response matching ValidateExpressionResult (backend ValidateExpressionResponse)
    // errors and warnings are structured objects with message/position/code fields
    const errors: Array<{ message: string; position: number; code: string }> = hasExpression
      ? []
      : [{ message: 'Expression cannot be empty', position: 0, code: 'SYNTAX_ERROR' }]
    return HttpResponse.json(
      {
        parsed_variables: hasExpression
          ? (body.expression.match(/\{([^}]+)\}/g) ?? []).map((m: string) => m.slice(1, -1))
          : [],
        errors,
        warnings: [] as Array<{ message: string; position: number; code: string }>,
      },
      { status: 200 },
    )
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
