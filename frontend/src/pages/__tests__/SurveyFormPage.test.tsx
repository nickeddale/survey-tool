import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { AuthProvider } from '../../contexts/AuthContext'
import { useAuthStore } from '../../store/authStore'
import { clearTokens, setTokens } from '../../services/tokenService'
import { mockTokens, mockUser, mockSurveys } from '../../mocks/handlers'
import SurveyFormPage from '../SurveyFormPage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location-display">{location.pathname}</div>
}

function renderForm(initialUrl: string) {
  return render(
    <MemoryRouter
      initialEntries={[initialUrl]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AuthProvider>
        <Routes>
          <Route path="/surveys/new" element={<SurveyFormPage />} />
          <Route path="/surveys/:id/edit" element={<SurveyFormPage />} />
          <Route path="/surveys/:id" element={<LocationDisplay />} />
          <Route path="/surveys" element={<LocationDisplay />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

function resetAuthStore() {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isInitializing: false,
    isLoading: false,
  })
}

// A draft survey from mock data
const draftSurvey = mockSurveys.find((s) => s.status === 'draft')!
// An active (non-draft) survey
const activeSurvey = mockSurveys.find((s) => s.status === 'active')!

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SurveyFormPage', () => {
  beforeEach(() => {
    clearTokens()
    localStorage.clear()
    resetAuthStore()
    // Set access token (in memory) without storing refresh token in localStorage.
    // This prevents AuthProvider from calling initialize() on mount, which would
    // trigger async state updates (setPendingInit, setUser) outside act().
    setTokens(mockTokens.access_token)
    localStorage.removeItem('devtracker_refresh_token')
    // Pre-populate auth store so authenticated API calls work correctly.
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

  // -------------------------------------------------------------------------
  // Create mode
  // -------------------------------------------------------------------------

  describe('create mode (/surveys/new)', () => {
    it('renders the create form with empty fields', () => {
      renderForm('/surveys/new')

      expect(screen.getByRole('heading', { name: /create survey/i })).toBeInTheDocument()
      expect(screen.getByLabelText(/title/i)).toHaveValue('')
      expect(screen.getByLabelText(/description/i)).toHaveValue('')
      expect(screen.getByLabelText(/welcome message/i)).toHaveValue('')
      expect(screen.getByLabelText(/end message/i)).toHaveValue('')
      expect(screen.getByRole('button', { name: /create survey/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })

    it('shows validation error when title is empty and form is submitted', async () => {
      const user = userEvent.setup()

      renderForm('/surveys/new')

      await act(async () => {
        await user.click(screen.getByRole('button', { name: /create survey/i }))
      })

      expect(await screen.findByRole('alert')).toBeInTheDocument()
      expect(screen.getByRole('alert').textContent).toMatch(/title is required/i)
    })

    it('calls createSurvey and redirects to /surveys/:id on success', async () => {
      const user = userEvent.setup()

      renderForm('/surveys/new')

      await act(async () => {
        await user.type(screen.getByLabelText(/title/i), 'My New Survey')
      })

      await act(async () => {
        await user.click(screen.getByRole('button', { name: /create survey/i }))
      })

      const location = await screen.findByTestId('location-display')
      expect(location.textContent).toBe('/surveys/20000000-0000-0000-0000-000000000001')
    })

    it('displays backend validation error on 422 response', async () => {
      server.use(
        http.post('/api/v1/surveys', () =>
          HttpResponse.json(
            { detail: { code: 'VALIDATION_ERROR', message: 'Title must be unique' } },
            { status: 422 }
          )
        )
      )

      const user = userEvent.setup()

      renderForm('/surveys/new')

      await act(async () => {
        await user.type(screen.getByLabelText(/title/i), 'Duplicate Title')
      })

      await act(async () => {
        await user.click(screen.getByRole('button', { name: /create survey/i }))
      })

      expect(await screen.findByRole('alert')).toBeInTheDocument()
      expect(screen.getByRole('alert').textContent).toMatch(/title must be unique/i)
    })

    it('shows loading state (button disabled) during submit', async () => {
      server.use(http.post('/api/v1/surveys', () => new Promise<never>(() => {})))

      const user = userEvent.setup()

      renderForm('/surveys/new')

      await act(async () => {
        await user.type(screen.getByLabelText(/title/i), 'Loading Test')
      })

      // userEvent already wraps in act internally; outer act ensures all
      // pending React state updates (setIsSubmitting) are flushed before assertion
      await act(async () => {
        await user.click(screen.getByRole('button', { name: /create survey/i }))
      })

      expect(screen.getByRole('button', { name: /creating.../i })).toBeDisabled()
    })

    it('cancel button navigates to /surveys', async () => {
      const user = userEvent.setup()

      renderForm('/surveys/new')

      await act(async () => {
        await user.click(screen.getByRole('button', { name: /cancel/i }))
      })

      const location = await screen.findByTestId('location-display')
      expect(location.textContent).toBe('/surveys')
    })
  })

  // -------------------------------------------------------------------------
  // Edit mode
  // -------------------------------------------------------------------------

  describe('edit mode (/surveys/:id/edit)', () => {
    it('shows loading state while fetching survey', () => {
      server.use(http.get('/api/v1/surveys/:id', () => new Promise<never>(() => {})))

      renderForm(`/surveys/${draftSurvey.id}/edit`)

      expect(screen.getByTestId('survey-form-loading')).toBeInTheDocument()
    })

    it('pre-fills form fields from existing draft survey', async () => {
      // Use the draft survey that has a description set
      const surveyWithDescription = {
        ...draftSurvey,
        description: 'Pre-filled description',
        welcome_message: 'Welcome!',
        end_message: 'Thank you!',
        default_language: 'fr',
      }

      server.use(
        http.get('/api/v1/surveys/:id', () =>
          HttpResponse.json(surveyWithDescription, { status: 200 })
        )
      )

      renderForm(`/surveys/${draftSurvey.id}/edit`)

      await waitFor(() => {
        expect(screen.getByDisplayValue(surveyWithDescription.title)).toBeInTheDocument()
      })

      expect(screen.getByLabelText(/title/i)).toHaveValue(surveyWithDescription.title)
      expect(screen.getByLabelText(/description/i)).toHaveValue('Pre-filled description')
      expect(screen.getByLabelText(/welcome message/i)).toHaveValue('Welcome!')
      expect(screen.getByLabelText(/end message/i)).toHaveValue('Thank you!')
      expect((screen.getByLabelText(/default language/i) as HTMLSelectElement).value).toBe('fr')
    })

    it('calls updateSurvey and redirects to /surveys/:id on success', async () => {
      server.use(
        http.get('/api/v1/surveys/:id', () => HttpResponse.json(draftSurvey, { status: 200 }))
      )

      const user = userEvent.setup()

      renderForm(`/surveys/${draftSurvey.id}/edit`)

      await waitFor(() => {
        expect(screen.getByDisplayValue(draftSurvey.title)).toBeInTheDocument()
      })

      // Clear and type a new title
      const titleInput = screen.getByLabelText(/title/i)
      await act(async () => {
        await user.clear(titleInput)
        await user.type(titleInput, 'Updated Survey Title')
      })

      await act(async () => {
        await user.click(screen.getByRole('button', { name: /save changes/i }))
      })

      const location = await screen.findByTestId('location-display')
      expect(location.textContent).toBe(`/surveys/${draftSurvey.id}`)
    })

    it('shows 404 view when survey is not found', async () => {
      server.use(
        http.get('/api/v1/surveys/:id', () =>
          HttpResponse.json(
            { detail: { code: 'NOT_FOUND', message: 'Survey not found' } },
            { status: 404 }
          )
        )
      )

      renderForm('/surveys/nonexistent-id/edit')

      await waitFor(() => {
        expect(screen.getByTestId('survey-not-found')).toBeInTheDocument()
      })

      expect(screen.getByText(/survey not found/i)).toBeInTheDocument()
    })

    it('shows read-only view for non-draft (active) survey', async () => {
      server.use(
        http.get('/api/v1/surveys/:id', () => HttpResponse.json(activeSurvey, { status: 200 }))
      )

      renderForm(`/surveys/${activeSurvey.id}/edit`)

      await waitFor(() => {
        expect(screen.getByTestId('readonly-notice')).toBeInTheDocument()
      })

      expect(screen.getByTestId('readonly-view')).toBeInTheDocument()
      // Should NOT show the editable form
      expect(screen.queryByRole('textbox', { name: /title/i })).not.toBeInTheDocument()
    })

    it('shows read-only view for closed survey', async () => {
      const closedSurvey = mockSurveys.find((s) => s.status === 'closed')!

      server.use(
        http.get('/api/v1/surveys/:id', () => HttpResponse.json(closedSurvey, { status: 200 }))
      )

      renderForm(`/surveys/${closedSurvey.id}/edit`)

      await waitFor(() => {
        expect(screen.getByTestId('readonly-notice')).toBeInTheDocument()
      })

      expect(screen.getByTestId('readonly-view')).toBeInTheDocument()
      expect(screen.getByRole('alert').textContent).toMatch(/closed/i)
    })

    it('readonly view shows Back to Surveys button that navigates to /surveys', async () => {
      server.use(
        http.get('/api/v1/surveys/:id', () => HttpResponse.json(activeSurvey, { status: 200 }))
      )

      const user = userEvent.setup()

      renderForm(`/surveys/${activeSurvey.id}/edit`)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back to surveys/i })).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByRole('button', { name: /back to surveys/i }))
      })

      const location = await screen.findByTestId('location-display')
      expect(location.textContent).toBe('/surveys')
    })

    it('shows error alert if API returns a non-404 error when loading survey', async () => {
      server.use(
        http.get('/api/v1/surveys/:id', () =>
          HttpResponse.json(
            { detail: { code: 'INTERNAL_SERVER_ERROR', message: 'Something went wrong' } },
            { status: 500 }
          )
        )
      )

      renderForm(`/surveys/${draftSurvey.id}/edit`)

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })

      expect(screen.getByRole('alert').textContent).toMatch(/something went wrong/i)
    })

    it('shows validation error when title is cleared and form is submitted in edit mode', async () => {
      server.use(
        http.get('/api/v1/surveys/:id', () => HttpResponse.json(draftSurvey, { status: 200 }))
      )

      const user = userEvent.setup()

      renderForm(`/surveys/${draftSurvey.id}/edit`)

      await waitFor(() => {
        expect(screen.getByDisplayValue(draftSurvey.title)).toBeInTheDocument()
      })

      await act(async () => {
        await user.clear(screen.getByLabelText(/title/i))
        await user.click(screen.getByRole('button', { name: /save changes/i }))
      })

      expect(await screen.findByRole('alert')).toBeInTheDocument()
      expect(screen.getByRole('alert').textContent).toMatch(/title is required/i)
    })

    it('cancel button navigates to /surveys in edit mode', async () => {
      server.use(
        http.get('/api/v1/surveys/:id', () => HttpResponse.json(draftSurvey, { status: 200 }))
      )

      const user = userEvent.setup()

      renderForm(`/surveys/${draftSurvey.id}/edit`)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByRole('button', { name: /cancel/i }))
      })

      const location = await screen.findByTestId('location-display')
      expect(location.textContent).toBe('/surveys')
    })
  })
})
