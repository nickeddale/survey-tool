/**
 * MSW request handlers for testing.
 *
 * All error responses match the backend's exact shape: {detail: {code, message}}
 * as confirmed from backend/app/utils/errors.py and backend/app/main.py.
 */

import { http, HttpResponse } from 'msw'
import { getAccessToken } from '../services/tokenService'

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
          question_type: 'single_choice',
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

// Active survey for public response form tests (mockSurveyFull has draft status)
export const mockActiveSurveyFull = {
  id: '10000000-0000-0000-0000-000000000099',
  user_id: '00000000-0000-0000-0000-000000000001',
  title: 'Active Customer Survey',
  description: 'Help us improve our service',
  status: 'active',
  welcome_message: 'Thanks for taking the time to fill out this survey!',
  end_message: 'We appreciate your feedback!',
  default_language: 'en',
  settings: { one_page_per_group: true },
  created_at: '2024-01-10T10:00:00Z',
  updated_at: '2024-01-15T12:00:00Z',
  groups: [
    {
      id: 'ag1',
      survey_id: '10000000-0000-0000-0000-000000000099',
      title: 'About You',
      description: 'Tell us a bit about yourself',
      sort_order: 1,
      relevance: null,
      created_at: '2024-01-10T10:00:00Z',
      questions: [
        {
          id: 'aq1',
          group_id: 'ag1',
          parent_id: null,
          question_type: 'short_text',
          code: 'NAME',
          title: 'What is your name?',
          description: null,
          is_required: true,
          sort_order: 1,
          relevance: null,
          validation: null,
          settings: null,
          created_at: '2024-01-10T10:00:00Z',
          subquestions: [],
          answer_options: [],
        },
      ],
    },
    {
      id: 'ag2',
      survey_id: '10000000-0000-0000-0000-000000000099',
      title: 'Feedback',
      description: null,
      sort_order: 2,
      relevance: null,
      created_at: '2024-01-10T10:00:00Z',
      questions: [
        {
          id: 'aq2',
          group_id: 'ag2',
          parent_id: null,
          question_type: 'single_choice',
          code: 'RATING',
          title: 'How satisfied are you?',
          description: null,
          is_required: false,
          sort_order: 1,
          relevance: null,
          validation: null,
          settings: null,
          created_at: '2024-01-10T10:00:00Z',
          subquestions: [],
          answer_options: [
            {
              id: 'ao1',
              question_id: 'aq2',
              code: 'S1',
              title: 'Very Satisfied',
              sort_order: 1,
              assessment_value: 5,
              created_at: '2024-01-10T10:00:00Z',
            },
            {
              id: 'ao2',
              question_id: 'aq2',
              code: 'S2',
              title: 'Satisfied',
              sort_order: 2,
              assessment_value: 4,
              created_at: '2024-01-10T10:00:00Z',
            },
          ],
        },
      ],
    },
  ],
  questions: [],
  options: [],
}

// Mock response data for response service tests
export const mockResponseCreated = {
  id: 'r-00000000-0000-0000-0000-000000000001',
  survey_id: '10000000-0000-0000-0000-000000000099',
  participant_id: null,
  status: 'in_progress',
  ip_address: null,
  metadata_: null,
  started_at: '2024-01-15T10:00:00Z',
  completed_at: null,
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
  answers: [],
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
  token_type: 'bearer',
  expires_in: 1800,
}

export const mockNewTokens = {
  access_token:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDEiLCJleHAiOjk5OTk5OTk5OTksImlhdCI6Mn0.dummy',
  token_type: 'bearer',
  expires_in: 1800,
}

// Mock assessment data
export const mockAssessments = [
  {
    id: 'assessment-00000000-0000-0000-0000-000000000001',
    survey_id: '10000000-0000-0000-0000-000000000002',
    name: 'High Satisfaction',
    scope: 'total',
    group_id: null,
    min_score: 8,
    max_score: 10,
    message: 'You are highly satisfied!',
    created_at: '2024-01-10T10:00:00Z',
    updated_at: '2024-01-10T10:00:00Z',
  },
  {
    id: 'assessment-00000000-0000-0000-0000-000000000002',
    survey_id: '10000000-0000-0000-0000-000000000002',
    name: 'Group Score Low',
    scope: 'group',
    group_id: 'g1',
    min_score: 0,
    max_score: 3,
    message: 'Needs improvement in this area.',
    created_at: '2024-01-11T10:00:00Z',
    updated_at: '2024-01-11T10:00:00Z',
  },
]

// Mock API key data
export const mockApiKeys = [
  {
    id: 'key-00000000-0000-0000-0000-000000000001',
    name: 'Production Key',
    key_prefix: 'sk_prod_abc1',
    scopes: null,
    is_active: true,
    last_used_at: '2024-01-15T10:00:00Z',
    expires_at: null,
    created_at: '2024-01-10T10:00:00Z',
  },
  {
    id: 'key-00000000-0000-0000-0000-000000000002',
    name: 'Staging Key',
    key_prefix: 'sk_stag_xyz9',
    scopes: null,
    is_active: true,
    last_used_at: null,
    expires_at: null,
    created_at: '2024-01-11T10:00:00Z',
  },
]

// Mock webhook data
export const mockWebhooks = [
  {
    id: 'webhook-00000000-0000-0000-0000-000000000001',
    user_id: '00000000-0000-0000-0000-000000000001',
    url: 'https://example.com/webhook/survey-responses',
    events: ['response.completed', 'response.created'],
    survey_id: null,
    is_active: true,
    secret: null,
    created_at: '2024-01-10T10:00:00Z',
    updated_at: '2024-01-10T10:00:00Z',
  },
  {
    id: 'webhook-00000000-0000-0000-0000-000000000002',
    user_id: '00000000-0000-0000-0000-000000000001',
    url: 'https://myapp.io/api/hooks/survey-events',
    events: ['survey.activated', 'survey.closed'],
    survey_id: '10000000-0000-0000-0000-000000000002',
    is_active: false,
    secret: null,
    created_at: '2024-01-11T10:00:00Z',
    updated_at: '2024-01-11T10:00:00Z',
  },
]

// Mock quota data
export const mockQuotas = [
  {
    id: 'quota-00000000-0000-0000-0000-000000000001',
    survey_id: '10000000-0000-0000-0000-000000000002',
    name: 'Age 18-35 Limit',
    limit: 100,
    current_count: 45,
    action: 'terminate',
    conditions: [],
    is_active: true,
    created_at: '2024-01-10T10:00:00Z',
    updated_at: '2024-01-10T10:00:00Z',
  },
  {
    id: 'quota-00000000-0000-0000-0000-000000000002',
    survey_id: '10000000-0000-0000-0000-000000000002',
    name: 'Male Respondents',
    limit: 50,
    current_count: 50,
    action: 'hide_question',
    conditions: [{ question_id: 'q1', operator: 'eq', value: 'male' }],
    is_active: false,
    created_at: '2024-01-11T10:00:00Z',
    updated_at: '2024-01-11T10:00:00Z',
  },
]

export const mockEmailInvitations = [
  {
    id: 'inv-00000000-0000-0000-0000-000000000001',
    survey_id: '10000000-0000-0000-0000-000000000002',
    recipient_email: 'alice@example.com',
    recipient_name: 'Alice',
    subject: 'You are invited to take our survey',
    invitation_type: 'invite',
    status: 'delivered',
    sent_at: '2024-01-10T10:00:00Z',
    delivered_at: '2024-01-10T10:01:00Z',
    opened_at: '2024-01-10T11:00:00Z',
    clicked_at: null,
    bounced_at: null,
    created_at: '2024-01-10T10:00:00Z',
    updated_at: '2024-01-10T10:01:00Z',
  },
  {
    id: 'inv-00000000-0000-0000-0000-000000000002',
    survey_id: '10000000-0000-0000-0000-000000000002',
    recipient_email: 'bob@example.com',
    recipient_name: null,
    subject: null,
    invitation_type: 'reminder',
    status: 'sent',
    sent_at: '2024-01-11T10:00:00Z',
    delivered_at: null,
    opened_at: null,
    clicked_at: null,
    bounced_at: null,
    created_at: '2024-01-11T10:00:00Z',
    updated_at: '2024-01-11T10:00:00Z',
  },
]

export const mockParticipants = [
  {
    id: 'part-00000000-0000-0000-0000-000000000001',
    survey_id: '10000000-0000-0000-0000-000000000002',
    external_id: null,
    email: 'alice@example.com',
    attributes: { department: 'Engineering' },
    uses_remaining: 3,
    valid_from: null,
    valid_until: null,
    completed: false,
    created_at: '2024-01-10T10:00:00Z',
  },
  {
    id: 'part-00000000-0000-0000-0000-000000000002',
    survey_id: '10000000-0000-0000-0000-000000000002',
    external_id: null,
    email: 'bob@example.com',
    attributes: null,
    uses_remaining: null,
    valid_from: '2024-01-01T00:00:00Z',
    valid_until: '2024-12-31T23:59:59Z',
    completed: true,
    created_at: '2024-01-11T10:00:00Z',
  },
]

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
      { status: 401 }
    )
  }),

  // POST /api/v1/auth/register
  http.post(`${BASE}/auth/register`, async ({ request }) => {
    const body = (await request.json()) as { email?: string }
    if (body.email === 'existing@example.com') {
      return HttpResponse.json(
        { detail: { code: 'CONFLICT', message: 'A user with this email already exists' } },
        { status: 409 }
      )
    }
    return HttpResponse.json(mockUser, { status: 201 })
  }),

  // POST /api/v1/auth/refresh — reads refresh token from httpOnly cookie (not body)
  http.post(`${BASE}/auth/refresh`, () => {
    // Simulate httpOnly cookie presence by checking the in-memory access token.
    // In tests, setTokens(access_token) is the convention for "user has a valid session".
    // If no access token is set, simulate a missing/expired refresh cookie (401).
    if (!getAccessToken()) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'No valid refresh token' } },
        { status: 401 }
      )
    }
    return HttpResponse.json(mockNewTokens, { status: 200 })
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
        { status: 401 }
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
        { status: 401 }
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
      { status: 200 }
    )
  }),

  // GET /api/v1/surveys/:id/public — no auth required, only active surveys
  http.get(`${BASE}/surveys/:id/public`, ({ params }) => {
    if (params.id === mockActiveSurveyFull.id) {
      return HttpResponse.json(mockActiveSurveyFull, { status: 200 })
    }
    return HttpResponse.json(
      { detail: { code: 'NOT_FOUND', message: 'Survey not found' } },
      { status: 404 }
    )
  }),

  // GET /api/v1/surveys/:id
  http.get(`${BASE}/surveys/:id`, ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
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
        { status: 404 }
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
        { status: 401 }
      )
    }
    const survey =
      mockSurveys.find((s) => s.id === params.id) ??
      (params.id === mockSurveyFull.id ? mockSurveyFull : null)
    if (!survey) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Survey not found' } },
        { status: 404 }
      )
    }
    return HttpResponse.json(
      { ...survey, status: 'active', updated_at: new Date().toISOString() },
      { status: 200 }
    )
  }),

  // POST /api/v1/surveys/:id/close
  http.post(`${BASE}/surveys/:id/close`, ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const survey =
      mockSurveys.find((s) => s.id === params.id) ??
      (params.id === mockSurveyFull.id ? mockSurveyFull : null)
    if (!survey) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Survey not found' } },
        { status: 404 }
      )
    }
    return HttpResponse.json(
      { ...survey, status: 'closed', updated_at: new Date().toISOString() },
      { status: 200 }
    )
  }),

  // POST /api/v1/surveys/:id/archive
  http.post(`${BASE}/surveys/:id/archive`, ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const survey =
      mockSurveys.find((s) => s.id === params.id) ??
      (params.id === mockSurveyFull.id ? mockSurveyFull : null)
    if (!survey) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Survey not found' } },
        { status: 404 }
      )
    }
    return HttpResponse.json(
      { ...survey, status: 'archived', updated_at: new Date().toISOString() },
      { status: 200 }
    )
  }),

  // POST /api/v1/surveys/:id/clone
  http.post(`${BASE}/surveys/:id/clone`, ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const survey =
      mockSurveys.find((s) => s.id === params.id) ??
      (params.id === mockSurveyFull.id ? mockSurveyFull : null)
    if (!survey) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Survey not found' } },
        { status: 404 }
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
        { status: 401 }
      )
    }
    const survey =
      mockSurveys.find((s) => s.id === params.id) ??
      (params.id === mockSurveyFull.id ? mockSurveyFull : null)
    if (!survey) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Survey not found' } },
        { status: 404 }
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
        { status: 401 }
      )
    }
    const body = (await request.json()) as Record<string, unknown>
    if (!body.title) {
      return HttpResponse.json(
        { detail: { code: 'VALIDATION_ERROR', message: 'Title is required' } },
        { status: 422 }
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
        { status: 401 }
      )
    }
    const survey = mockSurveys.find((s) => s.id === params.id)
    if (!survey) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Survey not found' } },
        { status: 404 }
      )
    }
    const body = (await request.json()) as Record<string, unknown>
    const updated = { ...survey, ...body, updated_at: '2024-01-20T12:00:00Z' }
    return HttpResponse.json(updated, { status: 200 })
  }),

  // POST /api/v1/surveys/:surveyId/questions/:questionId/options
  http.post(
    `${BASE}/surveys/:surveyId/questions/:questionId/options`,
    async ({ request, params }) => {
      const authHeader = request.headers.get('Authorization')
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return HttpResponse.json(
          { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
          { status: 401 }
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
    }
  ),

  // PATCH /api/v1/surveys/:surveyId/questions/:questionId/options/reorder
  http.patch(`${BASE}/surveys/:surveyId/questions/:questionId/options/reorder`, ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    return new HttpResponse(null, { status: 204 })
  }),

  // PATCH /api/v1/surveys/:surveyId/questions/:questionId/options/:optionId
  http.patch(
    `${BASE}/surveys/:surveyId/questions/:questionId/options/:optionId`,
    async ({ request, params }) => {
      const authHeader = request.headers.get('Authorization')
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return HttpResponse.json(
          { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
          { status: 401 }
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
    }
  ),

  // DELETE /api/v1/surveys/:surveyId/questions/:questionId/options/:optionId
  http.delete(
    `${BASE}/surveys/:surveyId/questions/:questionId/options/:optionId`,
    ({ request }) => {
      const authHeader = request.headers.get('Authorization')
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return HttpResponse.json(
          { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
          { status: 401 }
        )
      }
      return new HttpResponse(null, { status: 204 })
    }
  ),

  // PATCH /api/v1/surveys/:id/groups/:groupId/questions/reorder
  http.patch(`${BASE}/surveys/:surveyId/groups/:groupId/questions/reorder`, ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
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
        { status: 401 }
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
        { status: 401 }
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
        { status: 401 }
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
        { status: 401 }
      )
    }
    const body = (await request.json()) as { group_ids?: string[] }
    const groupIds = body.group_ids ?? []
    const reordered = groupIds
      .map((id, index) => {
        const existing = mockSurveyFull.groups.find((g) => g.id === id)
        return existing ? { ...existing, sort_order: index + 1 } : null
      })
      .filter(Boolean)
    return HttpResponse.json(reordered, { status: 200 })
  }),

  // PATCH /api/v1/surveys/:surveyId/groups/:groupId
  http.patch(`${BASE}/surveys/:surveyId/groups/:groupId`, async ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const group = mockSurveyFull.groups.find((g) => g.id === params.groupId)
    if (!group) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Group not found' } },
        { status: 404 }
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
        { status: 401 }
      )
    }
    return new HttpResponse(null, { status: 204 })
  }),

  // PATCH /api/v1/surveys/:surveyId/groups/:groupId/questions/:questionId
  http.patch(
    `${BASE}/surveys/:surveyId/groups/:groupId/questions/:questionId`,
    async ({ request, params }) => {
      const authHeader = request.headers.get('Authorization')
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return HttpResponse.json(
          { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
          { status: 401 }
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
          { status: 404 }
        )
      }
      const body = (await request.json()) as Record<string, unknown>
      const updated = { ...foundQuestion, ...body, updated_at: new Date().toISOString() }
      return HttpResponse.json(updated, { status: 200 })
    }
  ),

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
      { status: 200 }
    )
  }),

  // POST /api/v1/surveys/:surveyId/logic/evaluate-expression
  http.post(`${BASE}/surveys/:surveyId/logic/evaluate-expression`, async ({ request }) => {
    const body = (await request.json()) as { expression: string; context: Record<string, string> }
    const hasExpression = Boolean(body.expression && body.expression.trim())
    if (!hasExpression) {
      return HttpResponse.json(
        {
          result: null,
          errors: [{ message: 'Expression cannot be empty', position: 0, code: 'SYNTAX_ERROR' }],
        },
        { status: 200 }
      )
    }
    // Default mock: return true when expression is non-empty (tests override this as needed)
    return HttpResponse.json(
      {
        result: true,
        errors: [] as Array<{ message: string; position: number; code: string }>,
      },
      { status: 200 }
    )
  }),

  // PATCH /api/v1/auth/me
  http.patch(`${BASE}/auth/me`, async ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const body = (await request.json()) as { name?: string }
    return HttpResponse.json({ ...mockUser, name: body.name ?? mockUser.name }, { status: 200 })
  }),

  // ---------------------------------------------------------------------------
  // Public response endpoints (no auth required)
  // ---------------------------------------------------------------------------

  // POST /api/v1/surveys/:surveyId/logic/resolve-flow — resolve conditional display (public)
  http.post(`${BASE}/surveys/:surveyId/logic/resolve-flow`, async () => {
    // Default: all questions/groups visible, no piped texts, no skip target
    return HttpResponse.json(
      {
        visible_questions: [],
        hidden_questions: [],
        visible_groups: [],
        hidden_groups: [],
        piped_texts: {},
        next_question_id: null,
      },
      { status: 200 }
    )
  }),

  // POST /api/v1/surveys/:surveyId/responses — create new response (public)
  http.post(`${BASE}/surveys/:surveyId/responses`, async ({ params }) => {
    const response = {
      ...mockResponseCreated,
      survey_id: params.surveyId as string,
    }
    return HttpResponse.json(response, { status: 201 })
  }),

  // PATCH /api/v1/surveys/:surveyId/responses/:responseId — save progress or complete (public)
  http.patch(`${BASE}/surveys/:surveyId/responses/:responseId`, async ({ request, params }) => {
    const body = (await request.json()) as { status?: string; answers?: unknown[] }
    const isComplete = body.status === 'complete'
    const response = {
      ...mockResponseCreated,
      id: params.responseId as string,
      survey_id: params.surveyId as string,
      status: isComplete ? 'complete' : 'in_progress',
      completed_at: isComplete ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }
    return HttpResponse.json(response, { status: 200 })
  }),

  // ---------------------------------------------------------------------------
  // Quota endpoints
  // ---------------------------------------------------------------------------

  // GET /api/v1/surveys/:surveyId/quotas
  http.get(`${BASE}/surveys/:surveyId/quotas`, ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const url = new URL(request.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
    const perPage = Math.max(1, parseInt(url.searchParams.get('per_page') ?? '10', 10) || 10)
    const surveyQuotas = mockQuotas.filter((q) => q.survey_id === params.surveyId)
    const total = surveyQuotas.length
    const totalPages = Math.max(1, Math.ceil(total / perPage))
    const start = (page - 1) * perPage
    const items = surveyQuotas.slice(start, start + perPage)
    return HttpResponse.json(
      { items, total, page, per_page: perPage, total_pages: totalPages },
      { status: 200 }
    )
  }),

  // GET /api/v1/surveys/:surveyId/quotas/:quotaId
  http.get(`${BASE}/surveys/:surveyId/quotas/:quotaId`, ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const quota = mockQuotas.find((q) => q.id === params.quotaId && q.survey_id === params.surveyId)
    if (!quota) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Quota not found' } },
        { status: 404 }
      )
    }
    return HttpResponse.json(quota, { status: 200 })
  }),

  // POST /api/v1/surveys/:surveyId/quotas
  http.post(`${BASE}/surveys/:surveyId/quotas`, async ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const body = (await request.json()) as Record<string, unknown>
    const newQuota = {
      id: `quota-new-${Date.now()}`,
      survey_id: params.surveyId as string,
      name: (body.name as string) ?? 'New Quota',
      limit: (body.limit as number) ?? 100,
      current_count: 0,
      action: (body.action as string) ?? 'terminate',
      conditions: (body.conditions as unknown[]) ?? [],
      is_active: (body.is_active as boolean) ?? true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    return HttpResponse.json(newQuota, { status: 201 })
  }),

  // PATCH /api/v1/surveys/:surveyId/quotas/:quotaId
  http.patch(`${BASE}/surveys/:surveyId/quotas/:quotaId`, async ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const quota = mockQuotas.find((q) => q.id === params.quotaId)
    if (!quota) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Quota not found' } },
        { status: 404 }
      )
    }
    const body = (await request.json()) as Record<string, unknown>
    const updated = { ...quota, ...body, updated_at: new Date().toISOString() }
    return HttpResponse.json(updated, { status: 200 })
  }),

  // DELETE /api/v1/surveys/:surveyId/quotas/:quotaId
  http.delete(`${BASE}/surveys/:surveyId/quotas/:quotaId`, ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    return new HttpResponse(null, { status: 204 })
  }),

  // ---------------------------------------------------------------------------
  // Assessment endpoints
  // ---------------------------------------------------------------------------

  // GET /api/v1/surveys/:surveyId/assessments
  http.get(`${BASE}/surveys/:surveyId/assessments`, ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const url = new URL(request.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
    const perPage = Math.max(1, parseInt(url.searchParams.get('per_page') ?? '10', 10) || 10)
    const surveyAssessments = mockAssessments.filter((a) => a.survey_id === params.surveyId)
    const total = surveyAssessments.length
    const totalPages = Math.max(1, Math.ceil(total / perPage))
    const start = (page - 1) * perPage
    const items = surveyAssessments.slice(start, start + perPage)
    return HttpResponse.json(
      { items, total, page, per_page: perPage, total_pages: totalPages },
      { status: 200 }
    )
  }),

  // GET /api/v1/surveys/:surveyId/assessments/:assessmentId
  http.get(`${BASE}/surveys/:surveyId/assessments/:assessmentId`, ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const assessment = mockAssessments.find(
      (a) => a.id === params.assessmentId && a.survey_id === params.surveyId
    )
    if (!assessment) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Assessment not found' } },
        { status: 404 }
      )
    }
    return HttpResponse.json(assessment, { status: 200 })
  }),

  // POST /api/v1/surveys/:surveyId/assessments
  http.post(`${BASE}/surveys/:surveyId/assessments`, async ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const body = (await request.json()) as Record<string, unknown>
    const newAssessment = {
      id: `assessment-new-${Date.now()}`,
      survey_id: params.surveyId as string,
      name: (body.name as string) ?? 'New Assessment',
      scope: (body.scope as string) ?? 'total',
      group_id: (body.group_id as string | null) ?? null,
      min_score: (body.min_score as number) ?? 0,
      max_score: (body.max_score as number) ?? 10,
      message: (body.message as string) ?? '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    return HttpResponse.json(newAssessment, { status: 201 })
  }),

  // PATCH /api/v1/surveys/:surveyId/assessments/:assessmentId
  http.patch(`${BASE}/surveys/:surveyId/assessments/:assessmentId`, async ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const assessment = mockAssessments.find((a) => a.id === params.assessmentId)
    if (!assessment) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Assessment not found' } },
        { status: 404 }
      )
    }
    const body = (await request.json()) as Record<string, unknown>
    const updated = { ...assessment, ...body, updated_at: new Date().toISOString() }
    return HttpResponse.json(updated, { status: 200 })
  }),

  // DELETE /api/v1/surveys/:surveyId/assessments/:assessmentId
  http.delete(`${BASE}/surveys/:surveyId/assessments/:assessmentId`, ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    return new HttpResponse(null, { status: 204 })
  }),

  // ---------------------------------------------------------------------------
  // Webhook endpoints
  // ---------------------------------------------------------------------------

  // GET /api/v1/webhooks
  http.get(`${BASE}/webhooks`, ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const url = new URL(request.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
    const perPage = Math.max(1, parseInt(url.searchParams.get('per_page') ?? '10', 10) || 10)
    const total = mockWebhooks.length
    const totalPages = Math.max(1, Math.ceil(total / perPage))
    const start = (page - 1) * perPage
    const items = mockWebhooks.slice(start, start + perPage)
    return HttpResponse.json(
      { items, total, page, per_page: perPage, total_pages: totalPages },
      { status: 200 }
    )
  }),

  // GET /api/v1/webhooks/:webhookId
  http.get(`${BASE}/webhooks/:webhookId`, ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const webhook = mockWebhooks.find((w) => w.id === params.webhookId)
    if (!webhook) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Webhook not found' } },
        { status: 404 }
      )
    }
    return HttpResponse.json(webhook, { status: 200 })
  }),

  // POST /api/v1/webhooks
  http.post(`${BASE}/webhooks`, async ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const body = (await request.json()) as Record<string, unknown>
    const newWebhook = {
      id: `webhook-new-${Date.now()}`,
      user_id: '00000000-0000-0000-0000-000000000001',
      url: (body.url as string) ?? 'https://example.com/webhook',
      events: (body.events as string[]) ?? [],
      survey_id: (body.survey_id as string | null) ?? null,
      is_active: (body.is_active as boolean) ?? true,
      secret: 'mock-webhook-secret-abc123xyz456def789',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    return HttpResponse.json(newWebhook, { status: 201 })
  }),

  // PATCH /api/v1/webhooks/:webhookId
  http.patch(`${BASE}/webhooks/:webhookId`, async ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const webhook = mockWebhooks.find((w) => w.id === params.webhookId)
    if (!webhook) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Webhook not found' } },
        { status: 404 }
      )
    }
    const body = (await request.json()) as Record<string, unknown>
    const updated = { ...webhook, ...body, updated_at: new Date().toISOString() }
    return HttpResponse.json(updated, { status: 200 })
  }),

  // DELETE /api/v1/webhooks/:webhookId
  http.delete(`${BASE}/webhooks/:webhookId`, ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    return new HttpResponse(null, { status: 204 })
  }),

  // POST /api/v1/webhooks/:webhookId/test
  http.post(`${BASE}/webhooks/:webhookId/test`, ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const webhook = mockWebhooks.find((w) => w.id === params.webhookId)
    if (!webhook) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Webhook not found' } },
        { status: 404 }
      )
    }
    return HttpResponse.json({ success: true, status_code: 200, error: null }, { status: 200 })
  }),

  // ---------------------------------------------------------------------------
  // Participant handlers
  // ---------------------------------------------------------------------------

  // GET /api/v1/surveys/:surveyId/participants
  http.get(`${BASE}/surveys/:surveyId/participants`, ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const url = new URL(request.url)
    const page = parseInt(url.searchParams.get('page') ?? '1', 10)
    const perPage = parseInt(url.searchParams.get('per_page') ?? '20', 10)
    const emailFilter = url.searchParams.get('email')
    const completedFilter = url.searchParams.get('completed')

    let items = mockParticipants.filter((p) => p.survey_id === params.surveyId)
    if (emailFilter) {
      items = items.filter((p) => p.email === emailFilter)
    }
    if (completedFilter !== null) {
      const completed = completedFilter === 'true'
      items = items.filter((p) => p.completed === completed)
    }

    const total = items.length
    const pages = Math.max(1, Math.ceil(total / perPage))
    const offset = (page - 1) * perPage
    const pageItems = items.slice(offset, offset + perPage)

    return HttpResponse.json(
      { items: pageItems, total, page, per_page: perPage, pages },
      { status: 200 }
    )
  }),

  // POST /api/v1/surveys/:surveyId/participants
  http.post(`${BASE}/surveys/:surveyId/participants`, async ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const body = (await request.json()) as Record<string, unknown>
    const newParticipant = {
      id: `part-new-${Date.now()}`,
      survey_id: params.surveyId as string,
      external_id: null,
      email: (body.email as string | null) ?? null,
      attributes: (body.attributes as Record<string, unknown> | null) ?? null,
      uses_remaining: (body.uses_remaining as number | null) ?? null,
      valid_from: (body.valid_from as string | null) ?? null,
      valid_until: (body.valid_until as string | null) ?? null,
      completed: false,
      created_at: new Date().toISOString(),
      token: 'mock-token-abc123xyz456def789ghi0',
    }
    return HttpResponse.json(newParticipant, { status: 201 })
  }),

  // POST /api/v1/surveys/:surveyId/participants/batch
  http.post(`${BASE}/surveys/:surveyId/participants/batch`, async ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const body = (await request.json()) as { items: Record<string, unknown>[] }
    const created = body.items.map((item, idx) => ({
      id: `part-batch-${Date.now()}-${idx}`,
      survey_id: params.surveyId as string,
      external_id: null,
      email: (item.email as string | null) ?? null,
      attributes: (item.attributes as Record<string, unknown> | null) ?? null,
      uses_remaining: (item.uses_remaining as number | null) ?? null,
      valid_from: (item.valid_from as string | null) ?? null,
      valid_until: (item.valid_until as string | null) ?? null,
      completed: false,
      created_at: new Date().toISOString(),
      token: `mock-batch-token-${idx}`,
    }))
    return HttpResponse.json(created, { status: 201 })
  }),

  // PATCH /api/v1/surveys/:surveyId/participants/:participantId
  http.patch(
    `${BASE}/surveys/:surveyId/participants/:participantId`,
    async ({ request, params }) => {
      const authHeader = request.headers.get('Authorization')
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return HttpResponse.json(
          { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
          { status: 401 }
        )
      }
      const participant = mockParticipants.find(
        (p) => p.id === params.participantId && p.survey_id === params.surveyId
      )
      if (!participant) {
        return HttpResponse.json(
          { detail: { code: 'NOT_FOUND', message: 'Participant not found' } },
          { status: 404 }
        )
      }
      const body = (await request.json()) as Record<string, unknown>
      const updated = { ...participant, ...body }
      return HttpResponse.json(updated, { status: 200 })
    }
  ),

  // DELETE /api/v1/surveys/:surveyId/participants/:participantId
  http.delete(`${BASE}/surveys/:surveyId/participants/:participantId`, ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    return new HttpResponse(null, { status: 204 })
  }),

  // ---------------------------------------------------------------------------
  // API Key endpoints
  // ---------------------------------------------------------------------------

  // GET /api/v1/auth/keys
  http.get(`${BASE}/auth/keys`, ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    return HttpResponse.json(mockApiKeys, { status: 200 })
  }),

  // POST /api/v1/auth/keys
  http.post(`${BASE}/auth/keys`, async ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const body = (await request.json()) as {
      name?: string
      scopes?: string[] | null
      expires_at?: string | null
    }
    const newKey = {
      id: `key-new-${Date.now()}`,
      name: body.name ?? 'New Key',
      key: 'sk_live_mock_full_api_key_abc123xyz456def789ghi0jkl',
      key_prefix: 'sk_live_mo',
      scopes: body.scopes ?? null,
      is_active: true,
      expires_at: body.expires_at ?? null,
      created_at: new Date().toISOString(),
    }
    return HttpResponse.json(newKey, { status: 201 })
  }),

  // DELETE /api/v1/auth/keys/:keyId
  http.delete(`${BASE}/auth/keys/:keyId`, ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    return new HttpResponse(null, { status: 204 })
  }),

  // ---------------------------------------------------------------------------
  // Email Invitation endpoints
  // ---------------------------------------------------------------------------

  // GET /api/v1/surveys/:surveyId/invitations/stats
  http.get(`${BASE}/surveys/:surveyId/invitations/stats`, ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const surveyInvitations = mockEmailInvitations.filter((i) => i.survey_id === params.surveyId)
    const totalSent = surveyInvitations.filter((i) => i.sent_at).length
    const totalDelivered = surveyInvitations.filter((i) => i.delivered_at).length
    const totalOpened = surveyInvitations.filter((i) => i.opened_at).length
    const totalClicked = surveyInvitations.filter((i) => i.clicked_at).length
    return HttpResponse.json(
      {
        total_sent: totalSent,
        total_delivered: totalDelivered,
        total_bounced: 0,
        total_failed: 0,
        open_rate: totalSent > 0 ? totalOpened / totalSent : 0,
        click_rate: totalSent > 0 ? totalClicked / totalSent : 0,
      },
      { status: 200 }
    )
  }),

  // GET /api/v1/surveys/:surveyId/invitations
  http.get(`${BASE}/surveys/:surveyId/invitations`, ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const url = new URL(request.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
    const perPage = Math.max(1, parseInt(url.searchParams.get('per_page') ?? '20', 10) || 20)
    const statusFilter = url.searchParams.get('status')
    const typeFilter = url.searchParams.get('invitation_type')

    let items = mockEmailInvitations.filter((i) => i.survey_id === params.surveyId)
    if (statusFilter) {
      items = items.filter((i) => i.status === statusFilter)
    }
    if (typeFilter) {
      items = items.filter((i) => i.invitation_type === typeFilter)
    }

    const total = items.length
    const totalPages = Math.max(1, Math.ceil(total / perPage))
    const start = (page - 1) * perPage
    const pageItems = items.slice(start, start + perPage)

    return HttpResponse.json(
      { items: pageItems, total, page, per_page: perPage, total_pages: totalPages },
      { status: 200 }
    )
  }),

  // GET /api/v1/surveys/:surveyId/invitations/:invitationId
  http.get(`${BASE}/surveys/:surveyId/invitations/:invitationId`, ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const invitation = mockEmailInvitations.find(
      (i) => i.id === params.invitationId && i.survey_id === params.surveyId
    )
    if (!invitation) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Invitation not found' } },
        { status: 404 }
      )
    }
    return HttpResponse.json(invitation, { status: 200 })
  }),

  // POST /api/v1/surveys/:surveyId/invitations/batch
  http.post(`${BASE}/surveys/:surveyId/invitations/batch`, async ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const body = (await request.json()) as { items: Array<{ email: string; name?: string }> }
    return HttpResponse.json({ sent: body.items.length, failed: 0, skipped: 0 }, { status: 201 })
  }),

  // POST /api/v1/surveys/:surveyId/invitations
  http.post(`${BASE}/surveys/:surveyId/invitations`, async ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const body = (await request.json()) as Record<string, unknown>
    const newInvitation = {
      id: `inv-new-${Date.now()}`,
      survey_id: params.surveyId as string,
      recipient_email: (body.recipient_email as string) ?? '',
      recipient_name: (body.recipient_name as string | null) ?? null,
      subject: (body.subject as string | null) ?? null,
      invitation_type: (body.invitation_type as string) ?? 'invite',
      status: 'sent',
      sent_at: new Date().toISOString(),
      delivered_at: null,
      opened_at: null,
      clicked_at: null,
      bounced_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    return HttpResponse.json(newInvitation, { status: 201 })
  }),

  // POST /api/v1/surveys/:surveyId/invitations/:invitationId/resend
  http.post(`${BASE}/surveys/:surveyId/invitations/:invitationId/resend`, ({ request, params }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    const invitation = mockEmailInvitations.find(
      (i) => i.id === params.invitationId && i.survey_id === params.surveyId
    )
    if (!invitation) {
      return HttpResponse.json(
        { detail: { code: 'NOT_FOUND', message: 'Invitation not found' } },
        { status: 404 }
      )
    }
    return HttpResponse.json(
      { ...invitation, status: 'sent', sent_at: new Date().toISOString() },
      { status: 200 }
    )
  }),

  // DELETE /api/v1/surveys/:surveyId/invitations/:invitationId
  http.delete(`${BASE}/surveys/:surveyId/invitations/:invitationId`, ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    return new HttpResponse(null, { status: 204 })
  }),

  // POST /api/v1/surveys/:surveyId/invitations/send-reminders
  http.post(`${BASE}/surveys/:surveyId/invitations/send-reminders`, ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    return HttpResponse.json({ sent: 2, skipped: 1, failed: 0 }, { status: 200 })
  }),
]
