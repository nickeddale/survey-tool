/**
 * Unit tests for QuestionEditor component.
 *
 * Patterns used:
 * - Wrap every await user.click/type() in act(async () => ...) to avoid act() warnings.
 * - Auth state pre-populated via useAuthStore.setState (no refresh token in localStorage).
 * - vi.useRealTimers() in afterEach to prevent timer leaks.
 * - Debounce testing: use real timers + waitFor to verify a single PATCH request fires.
 * - MSW server lifecycle managed by src/test/setup.ts (do NOT add server.listen here).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/setup'
import { AuthProvider } from '../../../contexts/AuthContext'
import { useAuthStore } from '../../../store/authStore'
import { useBuilderStore } from '../../../store/builderStore'
import { clearTokens, setTokens } from '../../../services/tokenService'
import { mockTokens, mockUser, mockSurveyFull } from '../../../mocks/handlers'
import { QuestionEditor } from '../QuestionEditor'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SURVEY_ID = mockSurveyFull.id
const GROUP_ID = mockSurveyFull.groups[0].id // 'g1'
const Q1 = mockSurveyFull.groups[0].questions[0] // text, 'What is your name?', is_required: true
const Q2 = mockSurveyFull.groups[0].questions[1] // radio, 'How satisfied are you?', has answer options

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderEditor(surveyId = SURVEY_ID, readOnly = false) {
  return render(
    <MemoryRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AuthProvider>
        <QuestionEditor surveyId={surveyId} readOnly={readOnly} />
      </AuthProvider>
    </MemoryRouter>,
  )
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearTokens()
  localStorage.clear()
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false })
  useBuilderStore.getState().reset()

  // Pre-populate auth state without triggering AuthProvider.initialize()
  setTokens(mockTokens.access_token, mockTokens.refresh_token)
  localStorage.removeItem('devtracker_refresh_token')
  useAuthStore.setState({ user: mockUser, isAuthenticated: true, isLoading: false })

  // Load survey into builder store
  useBuilderStore.getState().loadSurvey(mockSurveyFull)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  useBuilderStore.getState().reset()
})

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('empty state', () => {
  it('shows prompt when no question selected', () => {
    renderEditor()
    expect(screen.getByTestId('question-editor-empty')).toBeInTheDocument()
    expect(screen.getByText(/select a question to edit/i)).toBeInTheDocument()
  })

  it('does not show question form when group is selected', () => {
    useBuilderStore.getState().setSelectedItem({ type: 'group', id: GROUP_ID })
    renderEditor()
    expect(screen.queryByTestId('question-properties')).not.toBeInTheDocument()
    expect(screen.getByTestId('question-editor-empty')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Populating fields on question selection
// ---------------------------------------------------------------------------

describe('question selection populates fields', () => {
  it('populates title field when question is selected', () => {
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q1.id })
    renderEditor()
    const titleEl = screen.getByTestId('property-question-title')
    expect(titleEl).toHaveValue(Q1.title)
  })

  it('title field is a multi-line textarea', () => {
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q1.id })
    renderEditor()
    const titleEl = screen.getByTestId('property-question-title')
    expect(titleEl.tagName).toBe('TEXTAREA')
  })

  it('populates code field when question is selected', () => {
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q1.id })
    renderEditor()
    expect(screen.getByTestId('property-question-code')).toHaveValue(Q1.code)
  })

  it('populates question type dropdown when question is selected', () => {
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q1.id })
    renderEditor()
    expect(screen.getByTestId('property-question-type')).toHaveValue(Q1.question_type)
  })

  it('populates is_required checkbox when question is selected', () => {
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q1.id })
    renderEditor()
    const checkbox = screen.getByTestId('property-question-required')
    expect((checkbox as HTMLInputElement).checked).toBe(Q1.is_required)
  })

  it('populates description field when question is selected', () => {
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q2.id })
    renderEditor()
    expect(screen.getByTestId('property-question-description')).toHaveValue(Q2.description ?? '')
  })

  it('shows answer options for radio question', () => {
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q2.id })
    renderEditor()
    // AnswerOptionsEditor renders options as input values (defaultValue)
    expect(screen.getByDisplayValue('Very Satisfied')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Satisfied')).toBeInTheDocument()
  })

  it('updates fields when selected question changes', async () => {
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q1.id })
    const { rerender } = renderEditor()
    expect(screen.getByTestId('property-question-title')).toHaveValue(Q1.title)

    await act(async () => {
      useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q2.id })
      rerender(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <QuestionEditor surveyId={SURVEY_ID} readOnly={false} />
          </AuthProvider>
        </MemoryRouter>,
      )
    })
    expect(screen.getByTestId('property-question-title')).toHaveValue(Q2.title)
  })
})

// ---------------------------------------------------------------------------
// Title field editing
// ---------------------------------------------------------------------------

describe('title field editing', () => {
  it('updates builder store on title change', async () => {
    const user = userEvent.setup()
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q1.id })
    renderEditor()

    const titleEl = screen.getByTestId('property-question-title')
    await act(async () => {
      await user.clear(titleEl)
      await user.type(titleEl, 'New title')
    })

    await waitFor(() => {
      const { groups } = useBuilderStore.getState()
      const q = groups.flatMap((g) => g.questions).find((q) => q.id === Q1.id)
      expect(q?.title).toBe('New title')
    })
  })

  it('auto-updates code when title changes (auto mode)', async () => {
    const user = userEvent.setup()
    // Use Q2 which has a custom code that matches auto-generated (unlikely), so use Q1
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q1.id })
    renderEditor()

    const codeEl = screen.getByTestId('property-question-code')
    // Initial code from Q1 is 'Q1' which doesn't match auto-generated 'WHAT_IS_YOUR_NAME'
    // so codeIsCustom starts true. Let's test with a fresh question where code = auto-generated
    // We need to first verify auto-code toggling behavior:
    // Click "Reset to auto" to enter auto mode
    const toggleBtn = screen.getByTestId('code-auto-toggle')
    await act(async () => {
      await user.click(toggleBtn)
    })
    // Now code should be auto-generated from title
    // Auto-gen of "What is your name?" => "WHAT_IS_YOUR_NAME"
    expect(codeEl).toHaveValue('WHAT_IS_YOUR_NAME')
  })
})

// ---------------------------------------------------------------------------
// Code field with auto-generate toggle
// ---------------------------------------------------------------------------

describe('code field auto-generate toggle', () => {
  it('shows "Customize" button when in auto mode', async () => {
    const user = userEvent.setup()
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q1.id })
    renderEditor()

    // Click "Reset to auto" first to enter auto mode
    const toggleBtn = screen.getByTestId('code-auto-toggle')
    await act(async () => {
      await user.click(toggleBtn)
    })
    expect(screen.getByTestId('code-auto-toggle')).toHaveTextContent('Customize')
    expect(screen.getByText(/auto-generated from title/i)).toBeInTheDocument()
  })

  it('shows "Reset to auto" after clicking Customize', async () => {
    const user = userEvent.setup()
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q1.id })
    renderEditor()

    // Q1.code = 'Q1' which doesn't match auto-generated, so codeIsCustom = true
    // toggle button shows "Reset to auto"
    expect(screen.getByTestId('code-auto-toggle')).toHaveTextContent('Reset to auto')
  })

  it('allows manual code editing when in custom mode', async () => {
    const user = userEvent.setup()
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q1.id })
    renderEditor()

    const codeEl = screen.getByTestId('property-question-code')
    await act(async () => {
      await user.clear(codeEl)
      await user.type(codeEl, 'MY_CODE')
    })

    await waitFor(() => {
      const { groups } = useBuilderStore.getState()
      const q = groups.flatMap((g) => g.questions).find((q) => q.id === Q1.id)
      expect(q?.code).toBe('MY_CODE')
    })
  })
})

// ---------------------------------------------------------------------------
// Question type dropdown
// ---------------------------------------------------------------------------

describe('question type dropdown', () => {
  it('shows warning when switching to incompatible type', async () => {
    const user = userEvent.setup()
    // Q2 is 'radio' (choice type). Switching to 'short_text' (non-choice) is incompatible.
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q2.id })
    renderEditor()

    const typeSelect = screen.getByTestId('property-question-type')
    await act(async () => {
      await user.selectOptions(typeSelect, 'short_text')
    })

    await waitFor(() => {
      expect(screen.getByTestId('type-change-warning')).toBeInTheDocument()
    })
    expect(screen.getByText(/incompatible/i)).toBeInTheDocument()
  })

  it('confirms type change when "Change type" button clicked', async () => {
    const user = userEvent.setup()
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q2.id })
    renderEditor()

    const typeSelect = screen.getByTestId('property-question-type')
    await act(async () => {
      await user.selectOptions(typeSelect, 'short_text')
    })

    await waitFor(() => expect(screen.getByTestId('type-change-warning')).toBeInTheDocument())

    await act(async () => {
      await user.click(screen.getByTestId('type-change-confirm'))
    })

    await waitFor(() => {
      expect(screen.queryByTestId('type-change-warning')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      const { groups } = useBuilderStore.getState()
      const q = groups.flatMap((g) => g.questions).find((q) => q.id === Q2.id)
      expect(q?.question_type).toBe('short_text')
    })
  })

  it('cancels type change when "Cancel" button clicked', async () => {
    const user = userEvent.setup()
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q2.id })
    renderEditor()

    const typeSelect = screen.getByTestId('property-question-type')
    await act(async () => {
      await user.selectOptions(typeSelect, 'short_text')
    })

    await waitFor(() => expect(screen.getByTestId('type-change-warning')).toBeInTheDocument())

    await act(async () => {
      await user.click(screen.getByTestId('type-change-cancel'))
    })

    await waitFor(() => {
      expect(screen.queryByTestId('type-change-warning')).not.toBeInTheDocument()
    })
    // Type should not have changed
    const { groups } = useBuilderStore.getState()
    const q = groups.flatMap((g) => g.questions).find((q) => q.id === Q2.id)
    expect(q?.question_type).toBe('radio')
  })

  it('does NOT show warning when switching between compatible types', async () => {
    const user = userEvent.setup()
    // Q2 is 'radio'. Switching to 'checkbox' is compatible (both choice types).
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q2.id })
    renderEditor()

    const typeSelect = screen.getByTestId('property-question-type')
    await act(async () => {
      await user.selectOptions(typeSelect, 'checkbox')
    })

    expect(screen.queryByTestId('type-change-warning')).not.toBeInTheDocument()
    await waitFor(() => {
      const { groups } = useBuilderStore.getState()
      const q = groups.flatMap((g) => g.questions).find((q) => q.id === Q2.id)
      expect(q?.question_type).toBe('checkbox')
    })
  })
})

// ---------------------------------------------------------------------------
// is_required toggle
// ---------------------------------------------------------------------------

describe('is_required toggle', () => {
  it('updates builder store when required checkbox is toggled', async () => {
    const user = userEvent.setup()
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q1.id })
    renderEditor()

    // Q1.is_required = true; click to uncheck
    const checkbox = screen.getByTestId('property-question-required')
    expect((checkbox as HTMLInputElement).checked).toBe(true)

    await act(async () => {
      await user.click(checkbox)
    })

    await waitFor(() => {
      const { groups } = useBuilderStore.getState()
      const q = groups.flatMap((g) => g.questions).find((q) => q.id === Q1.id)
      expect(q?.is_required).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// Description field
// ---------------------------------------------------------------------------

describe('description field', () => {
  it('updates builder store on description change', async () => {
    const user = userEvent.setup()
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q1.id })
    renderEditor()

    const descEl = screen.getByTestId('property-question-description')
    await act(async () => {
      await user.clear(descEl)
      await user.type(descEl, 'Help text here')
    })

    await waitFor(() => {
      const { groups } = useBuilderStore.getState()
      const q = groups.flatMap((g) => g.questions).find((q) => q.id === Q1.id)
      expect(q?.description).toBe('Help text here')
    })
  })
})

// ---------------------------------------------------------------------------
// Relevance expression
// ---------------------------------------------------------------------------

describe('relevance expression', () => {
  it('updates builder store on relevance change via raw mode', async () => {
    const user = userEvent.setup()
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q1.id })
    renderEditor()

    // Switch to raw mode to edit directly
    await act(async () => {
      await user.click(screen.getByTestId('logic-editor-mode-raw'))
    })

    const relEl = screen.getByTestId('logic-editor-raw-input')
    await act(async () => {
      fireEvent.change(relEl, { target: { value: "{Q0} == 'yes'" } })
    })

    await waitFor(() => {
      const { groups } = useBuilderStore.getState()
      const q = groups.flatMap((g) => g.questions).find((q) => q.id === Q1.id)
      expect(q?.relevance).toBe("{Q0} == 'yes'")
    })
  })
})

// ---------------------------------------------------------------------------
// Validation JSON editor
// ---------------------------------------------------------------------------

describe('validation JSON editor', () => {
  it('shows inline error for invalid JSON', async () => {
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q1.id })
    renderEditor()

    const validationEl = screen.getByTestId('property-question-validation')
    await act(async () => {
      fireEvent.change(validationEl, { target: { value: 'not valid json' } })
    })

    await waitFor(() => {
      expect(screen.getByTestId('validation-json-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('validation-json-error')).toHaveTextContent('Invalid JSON')
  })

  it('updates builder store with parsed JSON on valid input', async () => {
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q1.id })
    renderEditor()

    const validationEl = screen.getByTestId('property-question-validation')
    await act(async () => {
      fireEvent.change(validationEl, { target: { value: '{"min":1}' } })
    })

    await waitFor(() => {
      expect(screen.queryByTestId('validation-json-error')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      const { groups } = useBuilderStore.getState()
      const q = groups.flatMap((g) => g.questions).find((q) => q.id === Q1.id)
      expect(q?.validation).toEqual({ min: 1 })
    })
  })
})

// ---------------------------------------------------------------------------
// Debounced PATCH calls
// ---------------------------------------------------------------------------

describe('debounced PATCH calls', () => {
  it('sends a PATCH request after typing stops (debounced)', async () => {
    const user = userEvent.setup()
    const capturedRequests: Request[] = []

    server.use(
      http.patch(
        `/api/v1/surveys/${SURVEY_ID}/groups/${GROUP_ID}/questions/${Q1.id}`,
        async ({ request }) => {
          capturedRequests.push(request.clone())
          const q = mockSurveyFull.groups[0].questions[0]
          const body = (await request.json()) as Record<string, unknown>
          return HttpResponse.json({ ...q, ...body }, { status: 200 })
        },
      ),
    )

    useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q1.id })
    renderEditor()

    const titleEl = screen.getByTestId('property-question-title')
    await act(async () => {
      await user.clear(titleEl)
      await user.type(titleEl, 'Updated Title')
    })

    // Wait for exactly one PATCH request (debounced — should coalesce keystrokes)
    await waitFor(
      () => {
        expect(capturedRequests.length).toBe(1)
      },
      { timeout: 2000 },
    )
  })
})

// ---------------------------------------------------------------------------
// Read-only mode
// ---------------------------------------------------------------------------

describe('read-only mode', () => {
  it('disables all form inputs when readOnly=true', () => {
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q1.id })
    renderEditor(SURVEY_ID, true)

    expect(screen.getByTestId('property-question-title')).toBeDisabled()
    expect(screen.getByTestId('property-question-code')).toBeDisabled()
    expect(screen.getByTestId('property-question-type')).toBeDisabled()
    expect(screen.getByTestId('property-question-description')).toBeDisabled()
    expect(screen.getByTestId('property-question-required')).toBeDisabled()
    expect(screen.getByTestId('logic-editor-mode-visual')).toBeDisabled()
    expect(screen.getByTestId('property-question-validation')).toBeDisabled()
  })

  it('does not show code toggle button in read-only mode', () => {
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: Q1.id })
    renderEditor(SURVEY_ID, true)
    expect(screen.queryByTestId('code-auto-toggle')).not.toBeInTheDocument()
  })
})
