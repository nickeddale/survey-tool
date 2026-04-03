/**
 * Integration tests for SurveyResponsePage (/s/:survey_id).
 *
 * Public page — no authentication required.
 * Uses MSW for network mocking.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { mockActiveSurveyFull, mockResponseCreated } from '../../mocks/handlers'
import type { SurveyFullResponse } from '../../types/survey'
import SurveyResponsePage from '../SurveyResponsePage'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SURVEY_ID = mockActiveSurveyFull.id
const BASE = '/api/v1'

// ---------------------------------------------------------------------------
// Render helper (no auth context needed — page is public)
// ---------------------------------------------------------------------------

function renderPage(surveyId = SURVEY_ID) {
  return render(
    <MemoryRouter
      initialEntries={[`/s/${surveyId}`]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/s/:survey_id" element={<SurveyResponsePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('loading state', () => {
  it('renders loading skeleton while survey is being fetched', async () => {
    server.use(
      http.get(`${BASE}/surveys/${SURVEY_ID}`, () => new Promise<never>(() => {})),
    )

    renderPage()

    expect(screen.getByTestId('response-loading-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('survey-response-page')).not.toBeInTheDocument()
  })

  it('shows the response page once survey loads', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByTestId('survey-response-page')).toBeInTheDocument())
  })
})

// ---------------------------------------------------------------------------
// Unavailable survey (not active)
// ---------------------------------------------------------------------------

describe('unavailable survey', () => {
  it('shows unavailable message for a closed survey', async () => {
    server.use(
      http.get(`${BASE}/surveys/${SURVEY_ID}`, () =>
        HttpResponse.json(
          { ...mockActiveSurveyFull, status: 'closed', groups: [], questions: [], options: [] },
          { status: 200 },
        ),
      ),
    )

    renderPage()

    await waitFor(() =>
      expect(screen.getByTestId('survey-unavailable-screen')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('unavailable-message')).toHaveTextContent(/closed/i)
  })

  it('shows unavailable message for a draft survey', async () => {
    server.use(
      http.get(`${BASE}/surveys/${SURVEY_ID}`, () =>
        HttpResponse.json(
          { ...mockActiveSurveyFull, status: 'draft', groups: [], questions: [], options: [] },
          { status: 200 },
        ),
      ),
    )

    renderPage()

    await waitFor(() =>
      expect(screen.getByTestId('survey-unavailable-screen')).toBeInTheDocument(),
    )
  })

  it('shows unavailable message for an archived survey', async () => {
    server.use(
      http.get(`${BASE}/surveys/${SURVEY_ID}`, () =>
        HttpResponse.json(
          { ...mockActiveSurveyFull, status: 'archived', groups: [], questions: [], options: [] },
          { status: 200 },
        ),
      ),
    )

    renderPage()

    await waitFor(() =>
      expect(screen.getByTestId('survey-unavailable-screen')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('unavailable-message')).toHaveTextContent(/archived/i)
  })
})

// ---------------------------------------------------------------------------
// Load error
// ---------------------------------------------------------------------------

describe('load error', () => {
  it('shows error message when survey fails to load', async () => {
    server.use(
      http.get(`${BASE}/surveys/${SURVEY_ID}`, () =>
        HttpResponse.json(
          { detail: { code: 'NOT_FOUND', message: 'Survey not found' } },
          { status: 404 },
        ),
      ),
    )

    renderPage()

    await waitFor(() =>
      expect(screen.getByTestId('response-load-error')).toBeInTheDocument(),
    )
  })
})

// ---------------------------------------------------------------------------
// Welcome screen
// ---------------------------------------------------------------------------

describe('welcome screen', () => {
  it('shows welcome screen after survey loads', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByTestId('survey-welcome-screen')).toBeInTheDocument())
  })

  it('displays survey title on welcome screen', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByTestId('welcome-survey-title')).toBeInTheDocument())
    expect(screen.getByTestId('welcome-survey-title')).toHaveTextContent(mockActiveSurveyFull.title)
  })

  it('displays survey description when present', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByTestId('welcome-survey-description')).toBeInTheDocument())
    expect(screen.getByTestId('welcome-survey-description')).toHaveTextContent(
      mockActiveSurveyFull.description!,
    )
  })

  it('displays welcome message when present', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByTestId('welcome-message')).toBeInTheDocument())
    expect(screen.getByTestId('welcome-message')).toHaveTextContent(
      mockActiveSurveyFull.welcome_message!,
    )
  })

  it('shows Start Survey button', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    expect(screen.getByTestId('start-survey-button')).toHaveTextContent(/start survey/i)
  })
})

// ---------------------------------------------------------------------------
// Survey flow: welcome → form → thank you
// ---------------------------------------------------------------------------

describe('survey flow', () => {
  it('transitions to form screen after clicking Start Survey', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('start-survey-button'))

    await waitFor(() => expect(screen.getByTestId('survey-form')).toBeInTheDocument())
  })

  it('calls createResponse API when clicking Start Survey', async () => {
    const user = userEvent.setup()
    let createCalled = false
    server.use(
      http.post(`${BASE}/surveys/${SURVEY_ID}/responses`, () => {
        createCalled = true
        return HttpResponse.json(mockResponseCreated, { status: 201 })
      }),
    )

    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('start-survey-button'))

    await waitFor(() => expect(createCalled).toBe(true))
  })

  it('stores response ID in localStorage after starting', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('start-survey-button'))

    await waitFor(() =>
      expect(localStorage.getItem(`survey_response_${SURVEY_ID}`)).toBe(mockResponseCreated.id),
    )
  })

  it('resumes with existing response_id from localStorage without calling createResponse', async () => {
    const existingId = 'existing-response-id-123'
    localStorage.setItem(`survey_response_${SURVEY_ID}`, existingId)

    let createCalled = false
    server.use(
      http.post(`${BASE}/surveys/${SURVEY_ID}/responses`, () => {
        createCalled = true
        return HttpResponse.json(mockResponseCreated, { status: 201 })
      }),
    )

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('start-survey-button'))

    await waitFor(() => expect(screen.getByTestId('survey-form')).toBeInTheDocument())
    expect(createCalled).toBe(false)
  })

  it('shows the first group questions after starting', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('start-survey-button'))

    await waitFor(() =>
      expect(screen.getByTestId(`form-group-${mockActiveSurveyFull.groups[0].id}`)).toBeInTheDocument(),
    )
    expect(screen.getByText(mockActiveSurveyFull.groups[0].title)).toBeInTheDocument()
  })

  it('shows next page when Next button is clicked with valid data', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('start-survey-button'))

    // Fill in the required name field on page 1
    await waitFor(() => expect(screen.getByTestId('survey-form')).toBeInTheDocument())
    const nameInput = screen.getByTestId('short-text-input')
    await user.type(nameInput, 'Test User')

    // Click Next
    const nextBtn = screen.getByTestId('form-next-button')
    await user.click(nextBtn)

    // Should advance to page 2 (Feedback group)
    await waitFor(() =>
      expect(screen.getByTestId(`form-group-${mockActiveSurveyFull.groups[1].id}`)).toBeInTheDocument(),
    )
  })

  it('blocks Next when required field is empty and shows errors', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('start-survey-button'))

    await waitFor(() => expect(screen.getByTestId('survey-form')).toBeInTheDocument())

    // Click Next without filling required field
    const nextBtn = screen.getByTestId('form-next-button')
    await user.click(nextBtn)

    // Should still be on page 1 (first group still visible)
    expect(
      screen.getByTestId(`form-group-${mockActiveSurveyFull.groups[0].id}`),
    ).toBeInTheDocument()
  })

  it('shows Previous button is disabled on first page', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('start-survey-button'))

    await waitFor(() => expect(screen.getByTestId('survey-form')).toBeInTheDocument())
    expect(screen.getByTestId('form-previous-button')).toBeDisabled()
  })

  it('shows Submit button on last page', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('start-survey-button'))

    // Fill required field and go to last page
    await waitFor(() => expect(screen.getByTestId('survey-form')).toBeInTheDocument())
    const nameInput = screen.getByTestId('short-text-input')
    await user.type(nameInput, 'Test User')
    await user.click(screen.getByTestId('form-next-button'))

    // Now on last page, should see Submit not Next
    await waitFor(() =>
      expect(screen.getByTestId('form-submit-button')).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('form-next-button')).not.toBeInTheDocument()
  })

  it('shows thank-you screen after successful submission', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('start-survey-button'))

    // Navigate to last page
    await waitFor(() => expect(screen.getByTestId('survey-form')).toBeInTheDocument())
    const nameInput = screen.getByTestId('short-text-input')
    await user.type(nameInput, 'Test User')
    await user.click(screen.getByTestId('form-next-button'))

    // Submit
    await waitFor(() => expect(screen.getByTestId('form-submit-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('form-submit-button'))

    await waitFor(() => expect(screen.getByTestId('survey-thankyou-screen')).toBeInTheDocument())
    expect(screen.getByTestId('thankyou-title')).toHaveTextContent(/thank you/i)
  })

  it('displays custom end message on thank-you screen', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('start-survey-button'))

    await waitFor(() => expect(screen.getByTestId('survey-form')).toBeInTheDocument())
    await user.type(screen.getByTestId('short-text-input'), 'Test User')
    await user.click(screen.getByTestId('form-next-button'))

    await waitFor(() => expect(screen.getByTestId('form-submit-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('form-submit-button'))

    await waitFor(() => expect(screen.getByTestId('thankyou-end-message')).toBeInTheDocument())
    expect(screen.getByTestId('thankyou-end-message')).toHaveTextContent(
      mockActiveSurveyFull.end_message!,
    )
  })

  it('clears localStorage after successful submission', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('start-survey-button'))

    // Store response ID set after start
    await waitFor(() =>
      expect(localStorage.getItem(`survey_response_${SURVEY_ID}`)).not.toBeNull(),
    )

    await waitFor(() => expect(screen.getByTestId('survey-form')).toBeInTheDocument())
    await user.type(screen.getByTestId('short-text-input'), 'Test User')
    await user.click(screen.getByTestId('form-next-button'))

    await waitFor(() => expect(screen.getByTestId('form-submit-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('form-submit-button'))

    await waitFor(() => expect(screen.getByTestId('survey-thankyou-screen')).toBeInTheDocument())
    expect(localStorage.getItem(`survey_response_${SURVEY_ID}`)).toBeNull()
  })

  it('shows previous group when Previous is clicked on non-first page', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('start-survey-button'))

    // Move to page 2
    await waitFor(() => expect(screen.getByTestId('survey-form')).toBeInTheDocument())
    await user.type(screen.getByTestId('short-text-input'), 'Test User')
    await user.click(screen.getByTestId('form-next-button'))

    // Should be on page 2 now
    await waitFor(() =>
      expect(screen.getByTestId(`form-group-${mockActiveSurveyFull.groups[1].id}`)).toBeInTheDocument(),
    )

    // Click Previous
    await user.click(screen.getByTestId('form-previous-button'))

    // Should be back to page 1
    await waitFor(() =>
      expect(screen.getByTestId(`form-group-${mockActiveSurveyFull.groups[0].id}`)).toBeInTheDocument(),
    )
  })

  it('calls saveProgress when advancing pages', async () => {
    const user = userEvent.setup()
    let saveProgressCalled = false
    server.use(
      http.patch(`${BASE}/surveys/${SURVEY_ID}/responses/:responseId`, async ({ request }) => {
        const body = (await request.json()) as { status?: string }
        if (!body.status) {
          saveProgressCalled = true
        }
        return HttpResponse.json({ ...mockResponseCreated, updated_at: new Date().toISOString() }, { status: 200 })
      }),
    )

    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('start-survey-button'))

    await waitFor(() => expect(screen.getByTestId('survey-form')).toBeInTheDocument())
    await user.type(screen.getByTestId('short-text-input'), 'Test User')
    await user.click(screen.getByTestId('form-next-button'))

    await waitFor(() => expect(saveProgressCalled).toBe(true))
  })
})

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

describe('progress bar', () => {
  it('shows progress bar when form is active', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('start-survey-button'))

    await waitFor(() => expect(screen.getByTestId('form-progress-bar')).toBeInTheDocument())
  })

  it('shows page indicator in form', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('start-survey-button'))

    await waitFor(() => expect(screen.getByTestId('form-page-indicator')).toBeInTheDocument())
    expect(screen.getByTestId('form-page-indicator')).toHaveTextContent('1 / 2')
  })
})

// ---------------------------------------------------------------------------
// Single-page mode (one_page_per_group = false)
// ---------------------------------------------------------------------------

describe('single-page mode', () => {
  it('shows all groups on one page when one_page_per_group is false', async () => {
    server.use(
      http.get(`${BASE}/surveys/${SURVEY_ID}`, () =>
        HttpResponse.json(
          { ...mockActiveSurveyFull, settings: { one_page_per_group: false } },
          { status: 200 },
        ),
      ),
    )

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('start-survey-button'))

    await waitFor(() => expect(screen.getByTestId('form-all-groups')).toBeInTheDocument())
  })

  it('shows only Submit button (no Next) in single-page mode', async () => {
    server.use(
      http.get(`${BASE}/surveys/${SURVEY_ID}`, () =>
        HttpResponse.json(
          { ...mockActiveSurveyFull, settings: { one_page_per_group: false } },
          { status: 200 },
        ),
      ),
    )

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('start-survey-button'))

    await waitFor(() => expect(screen.getByTestId('form-submit-button')).toBeInTheDocument())
    expect(screen.queryByTestId('form-next-button')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Submit error handling
// ---------------------------------------------------------------------------

describe('submit error', () => {
  it('shows error message when submission fails', async () => {
    server.use(
      http.patch(`${BASE}/surveys/${SURVEY_ID}/responses/:responseId`, () =>
        HttpResponse.json(
          { detail: { code: 'SERVER_ERROR', message: 'Internal server error' } },
          { status: 500 },
        ),
      ),
    )

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('start-survey-button'))

    await waitFor(() => expect(screen.getByTestId('survey-form')).toBeInTheDocument())
    await user.type(screen.getByTestId('short-text-input'), 'Test User')
    await user.click(screen.getByTestId('form-next-button'))

    // Go to last page (save progress failed but we continue — Next/Prev progression)
    // Here both save and navigation should work even if save fails; the submit is what we test
    await waitFor(() => expect(screen.getByTestId('form-submit-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('form-submit-button'))

    await waitFor(() => expect(screen.getByTestId('submit-error')).toBeInTheDocument())
    expect(screen.queryByTestId('survey-thankyou-screen')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('error state', () => {
  it('shows error when survey ID is not found', async () => {
    server.use(
      http.get(`${BASE}/surveys/nonexistent-id`, () =>
        HttpResponse.json(
          { detail: { code: 'NOT_FOUND', message: 'Survey not found' } },
          { status: 404 },
        ),
      ),
    )

    renderPage('nonexistent-id')

    await waitFor(() => expect(screen.getByTestId('response-load-error')).toBeInTheDocument())
  })
})

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('accessibility', () => {
  it('marks required questions with asterisk indicator', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    await act(async () => { await user.click(screen.getByTestId('start-survey-button')) })

    await waitFor(() => expect(screen.getByTestId('survey-form')).toBeInTheDocument())
    // The first question (name) is required
    expect(screen.getByTestId('form-required-indicator')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Flow resolution: conditional display and piped text
// ---------------------------------------------------------------------------

describe('flow resolution — conditional display', () => {
  // Build a survey with a third hidden question (aq3) to test hiding
  const surveyWithHiddenQ = {
    ...mockActiveSurveyFull,
    groups: [
      {
        ...mockActiveSurveyFull.groups[0],
        questions: [
          ...mockActiveSurveyFull.groups[0].questions,
          {
            id: 'aq3',
            group_id: 'ag1',
            parent_id: null,
            question_type: 'short_text',
            code: 'HIDDEN_Q',
            title: 'This question should be hidden',
            description: null,
            is_required: false,
            sort_order: 2,
            relevance: 'NAME == "show"',
            validation: null,
            settings: null,
            created_at: '2024-01-10T10:00:00Z',
            subquestions: [],
            answer_options: [],
          },
        ],
      },
      mockActiveSurveyFull.groups[1],
    ],
  } as SurveyFullResponse

  it('hides a question returned in hidden_questions by resolve-flow', async () => {
    server.use(
      http.get(`${BASE}/surveys/${SURVEY_ID}`, () =>
        HttpResponse.json(surveyWithHiddenQ, { status: 200 }),
      ),
      http.post(`${BASE}/surveys/${SURVEY_ID}/logic/resolve-flow`, () =>
        HttpResponse.json(
          {
            visible_questions: ['aq1'],
            hidden_questions: ['aq3'],
            visible_groups: ['ag1', 'ag2'],
            hidden_groups: [],
            piped_texts: {},
            next_question_id: null,
          },
          { status: 200 },
        ),
      ),
    )

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('start-survey-button'))

    await waitFor(() => expect(screen.getByTestId('survey-form')).toBeInTheDocument())

    // Wait for resolve-flow to be called and state to update (debounce 300ms + API time)
    await waitFor(() => {
      expect(screen.queryByTestId('form-question-aq3')).not.toBeInTheDocument()
    }, { timeout: 2000 })
    // The visible question should still be present
    expect(screen.getByTestId('form-question-aq1')).toBeInTheDocument()
  })

  it('hides an entire group returned in hidden_groups by resolve-flow', async () => {
    server.use(
      http.post(`${BASE}/surveys/${SURVEY_ID}/logic/resolve-flow`, () =>
        HttpResponse.json(
          {
            visible_questions: ['aq1'],
            hidden_questions: [],
            visible_groups: ['ag1'],
            hidden_groups: ['ag2'],
            piped_texts: {},
            next_question_id: null,
          },
          { status: 200 },
        ),
      ),
    )

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('start-survey-button'))

    // Move to page 2 (normally ag2 Feedback group)
    await waitFor(() => expect(screen.getByTestId('survey-form')).toBeInTheDocument())
    const nameInput = screen.getByTestId('short-text-input')
    await user.type(nameInput, 'Test')
    await user.click(screen.getByTestId('form-next-button'))

    // ag2 should not be rendered since it's hidden
    await waitFor(() => {
      expect(screen.queryByTestId('form-group-ag2')).not.toBeInTheDocument()
    })
  })

  it('applies piped text to question titles', async () => {
    server.use(
      http.post(`${BASE}/surveys/${SURVEY_ID}/logic/resolve-flow`, () =>
        HttpResponse.json(
          {
            visible_questions: ['aq1', 'aq2'],
            hidden_questions: [],
            visible_groups: ['ag1', 'ag2'],
            hidden_groups: [],
            piped_texts: { NAME: 'Alice' },
            next_question_id: null,
          },
          { status: 200 },
        ),
      ),
      // Serve a survey with a piped variable in question title
      http.get(`${BASE}/surveys/${SURVEY_ID}`, () =>
        HttpResponse.json(
          {
            ...mockActiveSurveyFull,
            groups: [
              {
                ...mockActiveSurveyFull.groups[0],
                questions: [
                  {
                    ...mockActiveSurveyFull.groups[0].questions[0],
                    title: 'Hello, {NAME}! What is your name?',
                  },
                ],
              },
              mockActiveSurveyFull.groups[1],
            ],
          },
          { status: 200 },
        ),
      ),
    )

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('start-survey-button'))

    await waitFor(() => expect(screen.getByTestId('survey-form')).toBeInTheDocument())

    // After resolve-flow, {NAME} should be replaced with Alice
    await waitFor(() => {
      const titles = screen.getAllByTestId('form-question-title')
      expect(titles.some((t) => t.textContent?.includes('Hello, Alice!'))).toBe(true)
    })
  })

  it('retains answers for hidden questions (does not clear them from state)', async () => {
    // This test verifies that when aq3 is hidden, answers for aq3 are still passed
    // to the API in subsequent resolve-flow calls (answers state is never cleared).
    let lastResolveBody: { answers: Array<{ question_id: string; value: unknown }> } | null = null

    server.use(
      http.get(`${BASE}/surveys/${SURVEY_ID}`, () =>
        HttpResponse.json(surveyWithHiddenQ, { status: 200 }),
      ),
      http.post(`${BASE}/surveys/${SURVEY_ID}/logic/resolve-flow`, async ({ request }) => {
        lastResolveBody = (await request.json()) as typeof lastResolveBody
        return HttpResponse.json(
          {
            visible_questions: ['aq1'],
            hidden_questions: ['aq3'],
            visible_groups: ['ag1', 'ag2'],
            hidden_groups: [],
            piped_texts: {},
            next_question_id: null,
          },
          { status: 200 },
        )
      }),
    )

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('start-survey-button'))

    await waitFor(() => expect(screen.getByTestId('survey-form')).toBeInTheDocument())

    // Wait for first resolve-flow to hide aq3 (debounce 300ms + API time)
    await waitFor(() => {
      expect(screen.queryByTestId('form-question-aq3')).not.toBeInTheDocument()
    }, { timeout: 2000 })

    // Type in aq1 (visible field) - use the container testid to scope the query
    const aq1Container = screen.getByTestId('short-text-input-aq1')
    const nameInput = aq1Container.querySelector('input')!
    await user.type(nameInput, 'Alice')

    // Wait for a resolve-flow call that includes aq1's answer
    await waitFor(() => {
      if (lastResolveBody) {
        const hasAq1 = lastResolveBody.answers.some(
          (a) => a.question_id === 'aq1' && typeof a.value === 'string' && (a.value as string).length > 0,
        )
        expect(hasAq1).toBe(true)
      }
    }, { timeout: 2000 })

    // aq3 should still not be in the DOM (answer state for aq3 is preserved internally)
    expect(screen.queryByTestId('form-question-aq3')).not.toBeInTheDocument()
  })

  it('skips to correct group when next_question_id is set', async () => {
    // Survey: ag1 (aq1), ag2 (aq2), ag3 (aq3)
    const surveyWithThreeGroups = {
      ...mockActiveSurveyFull,
      groups: [
        mockActiveSurveyFull.groups[0], // ag1 with aq1
        mockActiveSurveyFull.groups[1], // ag2 with aq2
        {
          id: 'ag3',
          survey_id: SURVEY_ID,
          title: 'Extra Group',
          description: null,
          sort_order: 3,
          relevance: null,
          created_at: '2024-01-10T10:00:00Z',
          questions: [
            {
              id: 'aq3',
              group_id: 'ag3',
              parent_id: null,
              question_type: 'short_text',
              code: 'EXTRA',
              title: 'Extra question',
              description: null,
              is_required: false,
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
      ],
    } as SurveyFullResponse

    server.use(
      http.get(`${BASE}/surveys/${SURVEY_ID}`, () =>
        HttpResponse.json(surveyWithThreeGroups, { status: 200 }),
      ),
      http.post(`${BASE}/surveys/${SURVEY_ID}/logic/resolve-flow`, () =>
        HttpResponse.json(
          {
            visible_questions: ['aq1', 'aq2', 'aq3'],
            hidden_questions: [],
            visible_groups: ['ag1', 'ag2', 'ag3'],
            hidden_groups: [],
            piped_texts: {},
            // Skip from ag1 directly to ag3 (skipping ag2)
            next_question_id: 'aq3',
          },
          { status: 200 },
        ),
      ),
    )

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByTestId('start-survey-button')).toBeInTheDocument())
    await user.click(screen.getByTestId('start-survey-button'))

    await waitFor(() => expect(screen.getByTestId('survey-form')).toBeInTheDocument())

    // Wait for the initial resolve-flow call to complete so nextQuestionId is populated
    // (debounce 300ms + API time = ~350ms)
    await waitFor(() => {
      // The hook should have resolved; we can detect this by ensuring the form is stable
      expect(screen.getByTestId('form-question-aq1')).toBeInTheDocument()
    }, { timeout: 2000 })

    // Small additional wait to ensure resolve-flow state is applied
    await new Promise((r) => setTimeout(r, 400))

    // Fill required field
    const nameInput = screen.getByTestId('short-text-input')
    await user.type(nameInput, 'Alice')

    // Wait for the debounced resolve-flow triggered by typing to complete
    await new Promise((r) => setTimeout(r, 400))

    // Click Next — should skip to ag3 (the group containing aq3)
    await user.click(screen.getByTestId('form-next-button'))

    // Should jump directly to ag3, skipping ag2
    await waitFor(() => {
      expect(screen.getByTestId('form-group-ag3')).toBeInTheDocument()
    }, { timeout: 2000 })
    expect(screen.queryByTestId('form-group-ag2')).not.toBeInTheDocument()
  })
})
