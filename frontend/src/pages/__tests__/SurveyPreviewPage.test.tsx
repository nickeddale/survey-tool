/**
 * Integration tests for SurveyPreviewPage.
 *
 * Uses MSW for network mocking, pre-populates auth state via useAuthStore.setState.
 * Follows all patterns from MEMORY.md and the existing SurveyBuilderPage.test.tsx.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { AuthProvider } from '../../contexts/AuthContext'
import { useAuthStore } from '../../store/authStore'
import { clearTokens, setTokens } from '../../services/tokenService'
import { mockTokens, mockUser, mockSurveyFull } from '../../mocks/handlers'
import SurveyPreviewPage from '../SurveyPreviewPage'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SURVEY_ID = mockSurveyFull.id // has welcome_message and end_message

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPreview(surveyId = SURVEY_ID) {
  return render(
    <MemoryRouter
      initialEntries={[`/surveys/${surveyId}/preview`]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AuthProvider>
        <Routes>
          <Route path="/surveys/:id/preview" element={<SurveyPreviewPage />} />
          <Route path="/surveys/:id/builder" element={<div data-testid="survey-builder-page" />} />
          <Route path="/surveys" element={<div data-testid="surveys-page" />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearTokens()
  localStorage.clear()
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isInitializing: false,
    isLoading: false,
  })

  setTokens(mockTokens.access_token)
  localStorage.removeItem('devtracker_refresh_token')
  useAuthStore.setState({
    user: mockUser,
    isAuthenticated: true,
    isInitializing: false,
    isLoading: false,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('loading state', () => {
  it('renders loading skeleton while survey is being fetched', async () => {
    server.use(http.get(`/api/v1/surveys/${SURVEY_ID}`, () => new Promise<never>(() => {})))

    renderPreview()

    expect(screen.getByTestId('preview-loading-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('survey-preview-page')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Welcome screen
// ---------------------------------------------------------------------------

describe('welcome screen', () => {
  it('renders preview page after loading', async () => {
    renderPreview()

    await waitFor(() => expect(screen.getByTestId('survey-preview-page')).toBeInTheDocument())
  })

  it('shows Preview Mode banner', async () => {
    renderPreview()

    await waitFor(() => expect(screen.getByTestId('preview-banner')).toBeInTheDocument())
    expect(screen.getByTestId('preview-banner-text')).toHaveTextContent(/preview mode/i)
  })

  it('shows Return to Builder button in banner', async () => {
    renderPreview()

    await waitFor(() => expect(screen.getByTestId('return-to-builder-button')).toBeInTheDocument())
  })

  it('shows welcome screen on initial load', async () => {
    renderPreview()

    await waitFor(() => expect(screen.getByTestId('preview-welcome-screen')).toBeInTheDocument())
  })

  it('displays survey title on welcome screen', async () => {
    renderPreview()

    await waitFor(() => expect(screen.getByTestId('preview-survey-title')).toBeInTheDocument())
    expect(screen.getByTestId('preview-survey-title')).toHaveTextContent(mockSurveyFull.title)
  })

  it('displays welcome message when present', async () => {
    renderPreview()

    await waitFor(() => expect(screen.getByTestId('preview-welcome-message')).toBeInTheDocument())
    expect(screen.getByTestId('preview-welcome-message')).toHaveTextContent(
      mockSurveyFull.welcome_message!
    )
  })

  it('shows Start Survey button on welcome screen', async () => {
    renderPreview()

    await waitFor(() => expect(screen.getByTestId('preview-start-button')).toBeInTheDocument())
    expect(screen.getByTestId('preview-start-button')).toHaveTextContent(/start survey/i)
  })

  it('does not show progress bar on welcome screen', async () => {
    renderPreview()

    await waitFor(() => expect(screen.getByTestId('survey-preview-page')).toBeInTheDocument())
    expect(screen.queryByTestId('preview-progress-container')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Group navigation (one_page_per_group = default true)
// ---------------------------------------------------------------------------

describe('group navigation', () => {
  it('transitions to group screen after clicking Start Survey', async () => {
    const user = userEvent.setup()
    renderPreview()

    await waitFor(() => expect(screen.getByTestId('preview-start-button')).toBeInTheDocument())

    await act(async () => {
      await user.click(screen.getByTestId('preview-start-button'))
    })

    expect(screen.getByTestId('preview-group-screen')).toBeInTheDocument()
  })

  it('shows first group title after starting survey', async () => {
    const user = userEvent.setup()
    renderPreview()

    await waitFor(() => expect(screen.getByTestId('preview-start-button')).toBeInTheDocument())

    await act(async () => {
      await user.click(screen.getByTestId('preview-start-button'))
    })

    expect(screen.getByTestId('preview-group-title')).toHaveTextContent(
      mockSurveyFull.groups[0].title
    )
  })

  it('shows progress bar on group screen', async () => {
    const user = userEvent.setup()
    renderPreview()

    await waitFor(() => expect(screen.getByTestId('preview-start-button')).toBeInTheDocument())

    await act(async () => {
      await user.click(screen.getByTestId('preview-start-button'))
    })

    expect(screen.getByTestId('preview-progress-container')).toBeInTheDocument()
    expect(screen.getByTestId('preview-progress-bar')).toBeInTheDocument()
  })

  it('shows navigation footer with Next and Previous buttons on group screen', async () => {
    const user = userEvent.setup()
    renderPreview()

    await waitFor(() => expect(screen.getByTestId('preview-start-button')).toBeInTheDocument())

    await act(async () => {
      await user.click(screen.getByTestId('preview-start-button'))
    })

    expect(screen.getByTestId('preview-next-button')).toBeInTheDocument()
    expect(screen.getByTestId('preview-previous-button')).toBeInTheDocument()
  })

  it('clicking Previous on first group returns to welcome screen', async () => {
    const user = userEvent.setup()
    renderPreview()

    await waitFor(() => expect(screen.getByTestId('preview-start-button')).toBeInTheDocument())

    await act(async () => {
      await user.click(screen.getByTestId('preview-start-button'))
    })

    await act(async () => {
      await user.click(screen.getByTestId('preview-previous-button'))
    })

    expect(screen.getByTestId('preview-welcome-screen')).toBeInTheDocument()
  })

  it('clicking Next on last group shows end screen', async () => {
    const user = userEvent.setup()
    renderPreview()

    await waitFor(() => expect(screen.getByTestId('preview-start-button')).toBeInTheDocument())

    await act(async () => {
      await user.click(screen.getByTestId('preview-start-button'))
    })

    // mockSurveyFull has only 1 group, so Next goes to end
    await act(async () => {
      await user.click(screen.getByTestId('preview-next-button'))
    })

    expect(screen.getByTestId('preview-end-screen')).toBeInTheDocument()
  })

  it('shows page indicator (e.g., 1 / 1) on group screen', async () => {
    const user = userEvent.setup()
    renderPreview()

    await waitFor(() => expect(screen.getByTestId('preview-start-button')).toBeInTheDocument())

    await act(async () => {
      await user.click(screen.getByTestId('preview-start-button'))
    })

    expect(screen.getByTestId('preview-page-indicator')).toHaveTextContent('1 / 1')
  })

  it('shows questions inside the group', async () => {
    const user = userEvent.setup()
    renderPreview()

    await waitFor(() => expect(screen.getByTestId('preview-start-button')).toBeInTheDocument())

    await act(async () => {
      await user.click(screen.getByTestId('preview-start-button'))
    })

    // mockSurveyFull group g1 has q1 and q2
    expect(screen.getByTestId('question-preview-q1')).toBeInTheDocument()
    expect(screen.getByTestId('question-preview-q2')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Multi-group navigation
// ---------------------------------------------------------------------------

describe('multi-group navigation', () => {
  const twoGroupSurvey = {
    ...mockSurveyFull,
    id: 'multi-group-survey',
    groups: [
      {
        ...mockSurveyFull.groups[0],
        id: 'grp1',
        title: 'Section One',
        sort_order: 1,
      },
      {
        id: 'grp2',
        survey_id: mockSurveyFull.id,
        title: 'Section Two',
        description: null,
        sort_order: 2,
        relevance: null,
        created_at: '2024-01-08T10:00:00Z',
        questions: [],
      },
    ],
  }

  beforeEach(() => {
    server.use(
      http.get('/api/v1/surveys/multi-group-survey', () =>
        HttpResponse.json(twoGroupSurvey, { status: 200 })
      )
    )
  })

  it('navigates from first group to second group with Next', async () => {
    const user = userEvent.setup()
    renderPreview('multi-group-survey')

    await waitFor(() => expect(screen.getByTestId('preview-start-button')).toBeInTheDocument())

    await act(async () => {
      await user.click(screen.getByTestId('preview-start-button'))
    })

    expect(screen.getByTestId('preview-group-title')).toHaveTextContent('Section One')

    await act(async () => {
      await user.click(screen.getByTestId('preview-next-button'))
    })

    expect(screen.getByTestId('preview-group-title')).toHaveTextContent('Section Two')
  })

  it('navigates back from second group to first with Previous', async () => {
    const user = userEvent.setup()
    renderPreview('multi-group-survey')

    await waitFor(() => expect(screen.getByTestId('preview-start-button')).toBeInTheDocument())

    await act(async () => {
      await user.click(screen.getByTestId('preview-start-button'))
    })
    await act(async () => {
      await user.click(screen.getByTestId('preview-next-button'))
    })

    expect(screen.getByTestId('preview-group-title')).toHaveTextContent('Section Two')

    await act(async () => {
      await user.click(screen.getByTestId('preview-previous-button'))
    })

    expect(screen.getByTestId('preview-group-title')).toHaveTextContent('Section One')
  })

  it('shows correct progress bar percentage (50%) on first group of two', async () => {
    const user = userEvent.setup()
    renderPreview('multi-group-survey')

    await waitFor(() => expect(screen.getByTestId('preview-start-button')).toBeInTheDocument())

    await act(async () => {
      await user.click(screen.getByTestId('preview-start-button'))
    })

    expect(screen.getByTestId('preview-progress-pct')).toHaveTextContent('50%')
  })

  it('shows 100% progress on end screen', async () => {
    const user = userEvent.setup()
    renderPreview('multi-group-survey')

    await waitFor(() => expect(screen.getByTestId('preview-start-button')).toBeInTheDocument())

    await act(async () => {
      await user.click(screen.getByTestId('preview-start-button'))
    })
    await act(async () => {
      await user.click(screen.getByTestId('preview-next-button'))
    })
    await act(async () => {
      await user.click(screen.getByTestId('preview-next-button'))
    })

    expect(screen.getByTestId('preview-end-screen')).toBeInTheDocument()
    expect(screen.getByTestId('preview-progress-pct')).toHaveTextContent('100%')
  })
})

// ---------------------------------------------------------------------------
// one_page_per_group = false (single page mode)
// ---------------------------------------------------------------------------

describe('single-page mode (one_page_per_group = false)', () => {
  const singlePageSurvey = {
    ...mockSurveyFull,
    id: 'single-page-survey',
    settings: { one_page_per_group: false },
    groups: [
      { ...mockSurveyFull.groups[0], id: 'sp-g1', title: 'Group A', sort_order: 1 },
      {
        id: 'sp-g2',
        survey_id: mockSurveyFull.id,
        title: 'Group B',
        description: null,
        sort_order: 2,
        relevance: null,
        created_at: '2024-01-08T10:00:00Z',
        questions: [],
      },
    ],
  }

  beforeEach(() => {
    server.use(
      http.get('/api/v1/surveys/single-page-survey', () =>
        HttpResponse.json(singlePageSurvey, { status: 200 })
      )
    )
  })

  it('shows all groups on a single page', async () => {
    const user = userEvent.setup()
    renderPreview('single-page-survey')

    await waitFor(() => expect(screen.getByTestId('preview-start-button')).toBeInTheDocument())

    await act(async () => {
      await user.click(screen.getByTestId('preview-start-button'))
    })

    expect(screen.getByTestId('preview-all-groups')).toBeInTheDocument()
    expect(screen.getByTestId('preview-group-sp-g1')).toBeInTheDocument()
    expect(screen.getByTestId('preview-group-sp-g2')).toBeInTheDocument()
  })

  it('goes to end screen when Next (Submit) clicked in single-page mode', async () => {
    const user = userEvent.setup()
    renderPreview('single-page-survey')

    await waitFor(() => expect(screen.getByTestId('preview-start-button')).toBeInTheDocument())

    await act(async () => {
      await user.click(screen.getByTestId('preview-start-button'))
    })
    await act(async () => {
      await user.click(screen.getByTestId('preview-next-button'))
    })

    expect(screen.getByTestId('preview-end-screen')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// End screen
// ---------------------------------------------------------------------------

describe('end screen', () => {
  it('displays end message when survey has one', async () => {
    const user = userEvent.setup()
    renderPreview()

    await waitFor(() => expect(screen.getByTestId('preview-start-button')).toBeInTheDocument())

    await act(async () => {
      await user.click(screen.getByTestId('preview-start-button'))
    })
    await act(async () => {
      await user.click(screen.getByTestId('preview-next-button'))
    })

    expect(screen.getByTestId('preview-end-message')).toHaveTextContent(mockSurveyFull.end_message!)
  })

  it('displays default message when no end_message', async () => {
    server.use(
      http.get(`/api/v1/surveys/${SURVEY_ID}`, () =>
        HttpResponse.json({ ...mockSurveyFull, end_message: null }, { status: 200 })
      )
    )
    const user = userEvent.setup()
    renderPreview()

    await waitFor(() => expect(screen.getByTestId('preview-start-button')).toBeInTheDocument())

    await act(async () => {
      await user.click(screen.getByTestId('preview-start-button'))
    })
    await act(async () => {
      await user.click(screen.getByTestId('preview-next-button'))
    })

    expect(screen.getByTestId('preview-end-default-message')).toBeInTheDocument()
  })

  it('does not show navigation footer on end screen', async () => {
    const user = userEvent.setup()
    renderPreview()

    await waitFor(() => expect(screen.getByTestId('preview-start-button')).toBeInTheDocument())

    await act(async () => {
      await user.click(screen.getByTestId('preview-start-button'))
    })
    await act(async () => {
      await user.click(screen.getByTestId('preview-next-button'))
    })

    expect(screen.queryByTestId('preview-navigation')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Return to Builder navigation
// ---------------------------------------------------------------------------

describe('Return to Builder', () => {
  it('navigates to builder page when Return to Builder is clicked', async () => {
    const user = userEvent.setup()
    renderPreview()

    await waitFor(() => expect(screen.getByTestId('return-to-builder-button')).toBeInTheDocument())

    await act(async () => {
      await user.click(screen.getByTestId('return-to-builder-button'))
    })

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())
  })
})

// ---------------------------------------------------------------------------
// Interactive questions
// ---------------------------------------------------------------------------

describe('interactive questions', () => {
  it('question preview inputs are interactive (not pointer-events-none)', async () => {
    const user = userEvent.setup()
    renderPreview()

    await waitFor(() => expect(screen.getByTestId('preview-start-button')).toBeInTheDocument())

    await act(async () => {
      await user.click(screen.getByTestId('preview-start-button'))
    })

    // q1 is short_text — find the input and confirm it's interactable
    const questionPreview = screen.getByTestId('question-preview-q1')
    expect(questionPreview).not.toHaveClass('pointer-events-none')
  })
})

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('error state', () => {
  it('renders error message when fetch fails', async () => {
    server.use(
      http.get(`/api/v1/surveys/${SURVEY_ID}`, () =>
        HttpResponse.json(
          { detail: { code: 'INTERNAL_ERROR', message: 'Server error' } },
          { status: 500 }
        )
      )
    )

    renderPreview()

    await waitFor(() => expect(screen.getByTestId('preview-error')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Survey with no groups
// ---------------------------------------------------------------------------

describe('survey with no groups', () => {
  beforeEach(() => {
    server.use(
      http.get(`/api/v1/surveys/${SURVEY_ID}`, () =>
        HttpResponse.json({ ...mockSurveyFull, groups: [] }, { status: 200 })
      )
    )
  })

  it('shows "View Results Screen" start button when survey has no groups', async () => {
    renderPreview()

    await waitFor(() => expect(screen.getByTestId('preview-start-button')).toBeInTheDocument())
    expect(screen.getByTestId('preview-start-button')).toHaveTextContent(/view results screen/i)
  })

  it('goes directly to end screen when started with no groups', async () => {
    const user = userEvent.setup()
    renderPreview()

    await waitFor(() => expect(screen.getByTestId('preview-start-button')).toBeInTheDocument())

    await act(async () => {
      await user.click(screen.getByTestId('preview-start-button'))
    })

    expect(screen.getByTestId('preview-end-screen')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// SurveyBuilderPage — Full Preview button
// ---------------------------------------------------------------------------

describe('SurveyBuilderPage Full Preview button', () => {
  it('Full Preview button renders in builder', async () => {
    // Import SurveyBuilderPage for this sub-test
    const { useBuilderStore } = await import('../../store/builderStore')
    const SurveyBuilderPage = (await import('../SurveyBuilderPage')).default

    useBuilderStore.getState().reset()

    const { unmount } = render(
      <MemoryRouter
        initialEntries={[`/surveys/${SURVEY_ID}/builder`]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AuthProvider>
          <Routes>
            <Route path="/surveys/:id/builder" element={<SurveyBuilderPage />} />
            <Route path="/surveys/:id/preview" element={<div data-testid="preview-page" />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    expect(screen.getByTestId('full-preview-button')).toBeInTheDocument()

    unmount()
    useBuilderStore.getState().reset()
  })

  it('Full Preview button navigates to preview page', async () => {
    const { useBuilderStore } = await import('../../store/builderStore')
    const SurveyBuilderPage = (await import('../SurveyBuilderPage')).default

    useBuilderStore.getState().reset()

    const user = userEvent.setup()
    const { unmount } = render(
      <MemoryRouter
        initialEntries={[`/surveys/${SURVEY_ID}/builder`]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AuthProvider>
          <Routes>
            <Route path="/surveys/:id/builder" element={<SurveyBuilderPage />} />
            <Route path="/surveys/:id/preview" element={<div data-testid="preview-page" />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByTestId('survey-builder-page')).toBeInTheDocument())

    await act(async () => {
      await user.click(screen.getByTestId('full-preview-button'))
    })

    await waitFor(() => expect(screen.getByTestId('preview-page')).toBeInTheDocument())

    unmount()
    useBuilderStore.getState().reset()
  })
})
