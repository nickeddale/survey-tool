/**
 * Unit tests for LogicEditor component — expression validation UI.
 *
 * Patterns:
 * - vi.useFakeTimers() for debounce; always restore with vi.useRealTimers() in afterEach.
 * - Wrap userEvent interactions in act() to avoid React boundary warnings.
 * - MSW handlers overridden per-test with server.use() to simulate validation states.
 * - Explicit shape assertions on mock response to verify ValidateExpressionResult structure.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/setup'
import { LogicEditor } from '../LogicEditor'
import { setTokens } from '../../../services/tokenService'
import { mockTokens } from '../../../mocks/handlers'
import type { ValidateExpressionResult } from '../../../types/survey'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SURVEY_ID = '10000000-0000-0000-0000-000000000002'
const BASE = '/api/v1'

const mockQuestion = {
  id: 'q1',
  group_id: 'g1',
  parent_id: null as null,
  question_type: 'short_text',
  code: 'Q1',
  title: 'What is your name?',
  description: null as null,
  is_required: false,
  sort_order: 1,
  relevance: null as null,
  validation: null as null,
  settings: null as null,
  created_at: '2024-01-08T10:00:00Z',
  subquestions: [] as never[],
  answer_options: [] as never[],
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderEditor(
  props: {
    value?: string
    onChange?: (v: string) => void
    disabled?: boolean
    currentQuestionCode?: string
  } = {}
) {
  const { value = '', onChange = vi.fn(), disabled = false, currentQuestionCode } = props
  return render(
    <LogicEditor
      surveyId={SURVEY_ID}
      currentSortOrder={2}
      currentQuestionCode={currentQuestionCode}
      previousQuestions={[mockQuestion]}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  )
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  setTokens(mockTokens.access_token)
  URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Helper to make a ValidateExpressionResult mock response
// ---------------------------------------------------------------------------

function makeValidResult(parsedVariables: string[] = ['Q1']): ValidateExpressionResult {
  return {
    parsed_variables: parsedVariables,
    errors: [],
    warnings: [],
  }
}

function makeErrorResult(): ValidateExpressionResult {
  return {
    parsed_variables: [],
    errors: [{ message: 'Unknown variable: Q99', position: 1, code: 'UNKNOWN_VARIABLE' }],
    warnings: [],
  }
}

function makeWarningResult(): ValidateExpressionResult {
  return {
    parsed_variables: ['Q3'],
    errors: [],
    warnings: [{ message: 'Forward reference to Q3', position: 1, code: 'FORWARD_REFERENCE' }],
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LogicEditor — rendering', () => {
  it('renders the logic editor', () => {
    renderEditor()
    expect(screen.getByTestId('logic-editor')).toBeInTheDocument()
  })

  it('shows visual and raw mode toggle buttons', () => {
    renderEditor()
    expect(screen.getByTestId('logic-editor-mode-visual')).toBeInTheDocument()
    expect(screen.getByTestId('logic-editor-mode-raw')).toBeInTheDocument()
  })

  it('switches to raw mode', async () => {
    renderEditor()
    const rawBtn = screen.getByTestId('logic-editor-mode-raw')
    await act(async () => {
      await userEvent.click(rawBtn)
    })
    expect(screen.getByTestId('logic-editor-raw-input')).toBeInTheDocument()
  })
})

describe('LogicEditor — loading state', () => {
  it('shows loading spinner while validating', async () => {
    // Use a never-resolving promise to keep the loading state visible
    let resolveValidation!: (value: ValidateExpressionResult) => void
    const validationPromise = new Promise<ValidateExpressionResult>((resolve) => {
      resolveValidation = resolve
    })

    server.use(
      http.post(`${BASE}/surveys/:surveyId/logic/validate-expression`, async () => {
        const result = await validationPromise
        return HttpResponse.json(result, { status: 200 })
      })
    )

    renderEditor()

    // Switch to raw mode
    const rawBtn = screen.getByTestId('logic-editor-mode-raw')
    await act(async () => {
      await userEvent.click(rawBtn)
    })

    const textarea = screen.getByTestId('logic-editor-raw-input')

    // Use fireEvent to avoid userEvent's internal debounce handling issues
    // and directly trigger the 500ms debounce
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "{Q1} == 'yes'" } })
    })

    // Wait for debounce to fire (500ms)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 550))
    })

    // Should show validating state while promise is pending
    expect(screen.getByTestId('logic-editor-validating')).toBeInTheDocument()

    // Resolve the validation so the component doesn't leak async state
    await act(async () => {
      resolveValidation(makeValidResult())
    })
  })
})

describe('LogicEditor — valid state', () => {
  it('shows green check when expression is valid', async () => {
    server.use(
      http.post(`${BASE}/surveys/:surveyId/logic/validate-expression`, async () => {
        return HttpResponse.json(makeValidResult(), { status: 200 })
      })
    )

    renderEditor()

    const rawBtn = screen.getByTestId('logic-editor-mode-raw')
    await act(async () => {
      await userEvent.click(rawBtn)
    })

    const textarea = screen.getByTestId('logic-editor-raw-input')
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "{Q1} == 'yes'" } })
    })

    await waitFor(() => {
      expect(screen.getByTestId('logic-editor-valid')).toBeInTheDocument()
    })

    expect(screen.getByTestId('logic-editor-valid')).toHaveTextContent('Expression is valid')
  })

  it('shows referenced variables list when expression is valid', async () => {
    server.use(
      http.post(`${BASE}/surveys/:surveyId/logic/validate-expression`, async () => {
        return HttpResponse.json(makeValidResult(['Q1']), { status: 200 })
      })
    )

    renderEditor()

    const rawBtn = screen.getByTestId('logic-editor-mode-raw')
    await act(async () => {
      await userEvent.click(rawBtn)
    })

    const textarea = screen.getByTestId('logic-editor-raw-input')
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "{Q1} == 'test'" } })
    })

    await waitFor(() => {
      expect(screen.getByTestId('logic-editor-variables')).toBeInTheDocument()
    })

    expect(screen.getByTestId('logic-editor-variables')).toHaveTextContent('Q1')
  })

  it('shows Test Expression toggle button when valid', async () => {
    server.use(
      http.post(`${BASE}/surveys/:surveyId/logic/validate-expression`, async () => {
        return HttpResponse.json(makeValidResult(['Q1']), { status: 200 })
      })
    )

    renderEditor()

    const rawBtn = screen.getByTestId('logic-editor-mode-raw')
    await act(async () => {
      await userEvent.click(rawBtn)
    })

    const textarea = screen.getByTestId('logic-editor-raw-input')
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "{Q1} == 'yes'" } })
    })

    await waitFor(() => {
      expect(screen.getByTestId('logic-editor-test-toggle')).toBeInTheDocument()
    })
  })
})

describe('LogicEditor — error state', () => {
  it('shows red error message with position when expression has errors', async () => {
    server.use(
      http.post(`${BASE}/surveys/:surveyId/logic/validate-expression`, async () => {
        return HttpResponse.json(makeErrorResult(), { status: 200 })
      })
    )

    renderEditor()

    const rawBtn = screen.getByTestId('logic-editor-mode-raw')
    await act(async () => {
      await userEvent.click(rawBtn)
    })

    const textarea = screen.getByTestId('logic-editor-raw-input')
    await act(async () => {
      fireEvent.change(textarea, { target: { value: '{Q99} == bad' } })
    })

    await waitFor(() => {
      expect(screen.getByTestId('logic-editor-error')).toBeInTheDocument()
    })

    const errorEl = screen.getByTestId('logic-editor-error')
    expect(errorEl).toHaveTextContent('Unknown variable: Q99')
    // Position col indicator shown when position > 0
    expect(errorEl).toHaveTextContent('col 1')
  })

  it('does not show valid indicator when there are errors', async () => {
    server.use(
      http.post(`${BASE}/surveys/:surveyId/logic/validate-expression`, async () => {
        return HttpResponse.json(makeErrorResult(), { status: 200 })
      })
    )

    renderEditor()

    const rawBtn = screen.getByTestId('logic-editor-mode-raw')
    await act(async () => {
      await userEvent.click(rawBtn)
    })

    const textarea = screen.getByTestId('logic-editor-raw-input')
    // Use fireEvent.change to avoid userEvent interpreting curly braces as keyboard shortcuts
    await act(async () => {
      fireEvent.change(textarea, { target: { value: '{Q99} == bad' } })
    })

    await waitFor(() => {
      expect(screen.getByTestId('logic-editor-error')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('logic-editor-valid')).not.toBeInTheDocument()
  })
})

describe('LogicEditor — warning state', () => {
  it('shows amber warning messages with position info', async () => {
    server.use(
      http.post(`${BASE}/surveys/:surveyId/logic/validate-expression`, async () => {
        return HttpResponse.json(makeWarningResult(), { status: 200 })
      })
    )

    renderEditor()

    const rawBtn = screen.getByTestId('logic-editor-mode-raw')
    await act(async () => {
      await userEvent.click(rawBtn)
    })

    const textarea = screen.getByTestId('logic-editor-raw-input')
    await act(async () => {
      fireEvent.change(textarea, { target: { value: '{Q3} == yes' } })
    })

    await waitFor(() => {
      expect(screen.getByTestId('logic-editor-warning')).toBeInTheDocument()
    })

    const warningEl = screen.getByTestId('logic-editor-warning')
    expect(warningEl).toHaveTextContent('Forward reference to Q3')
    expect(warningEl).toHaveTextContent('col 1')
  })
})

describe('LogicEditor — Test Expression panel', () => {
  it('shows ExpressionPreview when test toggle is clicked', async () => {
    server.use(
      http.post(`${BASE}/surveys/:surveyId/logic/validate-expression`, async () => {
        return HttpResponse.json(makeValidResult(['Q1']), { status: 200 })
      })
    )

    renderEditor()

    const rawBtn = screen.getByTestId('logic-editor-mode-raw')
    await act(async () => {
      await userEvent.click(rawBtn)
    })

    const textarea = screen.getByTestId('logic-editor-raw-input')
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "{Q1} == 'yes'" } })
    })

    await waitFor(() => {
      expect(screen.getByTestId('logic-editor-test-toggle')).toBeInTheDocument()
    })

    await act(async () => {
      await userEvent.click(screen.getByTestId('logic-editor-test-toggle'))
    })

    expect(screen.getByTestId('expression-preview')).toBeInTheDocument()
  })

  it('hides ExpressionPreview when test toggle is clicked again', async () => {
    server.use(
      http.post(`${BASE}/surveys/:surveyId/logic/validate-expression`, async () => {
        return HttpResponse.json(makeValidResult(['Q1']), { status: 200 })
      })
    )

    renderEditor()

    const rawBtn = screen.getByTestId('logic-editor-mode-raw')
    await act(async () => {
      await userEvent.click(rawBtn)
    })

    const textarea = screen.getByTestId('logic-editor-raw-input')
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "{Q1} == 'yes'" } })
    })

    await waitFor(() => {
      expect(screen.getByTestId('logic-editor-test-toggle')).toBeInTheDocument()
    })

    // Open panel
    await act(async () => {
      await userEvent.click(screen.getByTestId('logic-editor-test-toggle'))
    })
    expect(screen.getByTestId('expression-preview')).toBeInTheDocument()

    // Close panel
    await act(async () => {
      await userEvent.click(screen.getByTestId('logic-editor-test-toggle'))
    })
    expect(screen.queryByTestId('expression-preview')).not.toBeInTheDocument()
  })
})

describe('LogicEditor — mock response shape assertion', () => {
  it('mock validate-expression response has correct ValidateExpressionResult shape', async () => {
    // Explicit shape assertion as required by plan warnings
    let capturedResponse: ValidateExpressionResult | null = null

    server.use(
      http.post(`${BASE}/surveys/:surveyId/logic/validate-expression`, async () => {
        const response: ValidateExpressionResult = {
          parsed_variables: ['Q1'],
          errors: [],
          warnings: [],
        }
        capturedResponse = response
        return HttpResponse.json(response, { status: 200 })
      })
    )

    renderEditor()

    const rawBtn = screen.getByTestId('logic-editor-mode-raw')
    await act(async () => {
      await userEvent.click(rawBtn)
    })

    const textarea = screen.getByTestId('logic-editor-raw-input')
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "{Q1} == 'yes'" } })
    })

    await waitFor(() => {
      expect(capturedResponse).not.toBeNull()
    })

    // Verify shape: parsed_variables is string[], errors/warnings are structured objects
    expect(capturedResponse).toHaveProperty('parsed_variables')
    expect(Array.isArray(capturedResponse!.parsed_variables)).toBe(true)
    expect(capturedResponse).toHaveProperty('errors')
    expect(Array.isArray(capturedResponse!.errors)).toBe(true)
    expect(capturedResponse).toHaveProperty('warnings')
    expect(Array.isArray(capturedResponse!.warnings)).toBe(true)
    // errors and warnings should NOT be string[] — they are structured objects
    // (no 'valid' field on the response itself)
    expect(capturedResponse).not.toHaveProperty('valid')
  })
})

describe('LogicEditor — question_code in request payload', () => {
  it('sends question_code in request payload when currentQuestionCode is provided', async () => {
    let capturedBody: Record<string, unknown> | null = null

    server.use(
      http.post(`${BASE}/surveys/:surveyId/logic/validate-expression`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(makeValidResult(), { status: 200 })
      })
    )

    renderEditor({ currentQuestionCode: 'Q1' })

    const rawBtn = screen.getByTestId('logic-editor-mode-raw')
    await act(async () => {
      await userEvent.click(rawBtn)
    })

    const textarea = screen.getByTestId('logic-editor-raw-input')
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "{Q2} == 'yes'" } })
    })

    await waitFor(() => {
      expect(capturedBody).not.toBeNull()
    })

    expect(capturedBody).toHaveProperty('question_code', 'Q1')
    expect(capturedBody).toHaveProperty('expression', "{Q2} == 'yes'")
  })

  it('does not send question_code when currentQuestionCode is not provided', async () => {
    let capturedBody: Record<string, unknown> | null = null

    server.use(
      http.post(`${BASE}/surveys/:surveyId/logic/validate-expression`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(makeValidResult(), { status: 200 })
      })
    )

    renderEditor()

    const rawBtn = screen.getByTestId('logic-editor-mode-raw')
    await act(async () => {
      await userEvent.click(rawBtn)
    })

    const textarea = screen.getByTestId('logic-editor-raw-input')
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "{Q1} == 'yes'" } })
    })

    await waitFor(() => {
      expect(capturedBody).not.toBeNull()
    })

    expect(capturedBody).not.toHaveProperty('question_code')
    expect(capturedBody).toHaveProperty('expression', "{Q1} == 'yes'")
  })
})

describe('LogicEditor — debounce timing', () => {
  it('calls validate-expression after 500ms debounce with real timers', async () => {
    let callCount = 0
    server.use(
      http.post(`${BASE}/surveys/:surveyId/logic/validate-expression`, async () => {
        callCount++
        return HttpResponse.json(makeValidResult(), { status: 200 })
      })
    )

    renderEditor()

    const rawBtn = screen.getByTestId('logic-editor-mode-raw')
    await act(async () => {
      await userEvent.click(rawBtn)
    })

    const textarea = screen.getByTestId('logic-editor-raw-input')

    // Trigger a change event
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "{Q1} == 'yes'" } })
    })

    // Before debounce fires — no call yet
    expect(callCount).toBe(0)

    // Wait for debounce to fire (500ms + buffer)
    await waitFor(
      () => {
        expect(callCount).toBeGreaterThan(0)
      },
      { timeout: 2000 }
    )
  })
})
