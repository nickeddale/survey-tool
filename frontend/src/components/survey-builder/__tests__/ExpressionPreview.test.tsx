/**
 * Unit tests for ExpressionPreview component and handleTestExpression helper.
 *
 * Patterns:
 * - Test the pure handleTestExpression function without mounting component.
 * - Test component rendering with mocked MSW handlers.
 * - vi.useRealTimers() in afterEach to prevent timer leaks.
 * - Wrap userEvent in act() for React boundary safety.
 * - Explicit shape assertion on MSW mock response to catch type mismatches.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/setup'
import { ExpressionPreview, handleTestExpression } from '../ExpressionPreview'
import { setTokens } from '../../../services/tokenService'
import { mockTokens } from '../../../mocks/handlers'
import type { EvaluateExpressionResult } from '../../../types/survey'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SURVEY_ID = '10000000-0000-0000-0000-000000000002'
const BASE = '/api/v1'

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
// Helper render
// ---------------------------------------------------------------------------

function renderPreview(props: {
  expression?: string
  parsedVariables?: string[]
  disabled?: boolean
}) {
  const {
    expression = "{Q1} == 'yes'",
    parsedVariables = ['Q1'],
    disabled = false,
  } = props

  return render(
    <ExpressionPreview
      surveyId={SURVEY_ID}
      expression={expression}
      parsedVariables={parsedVariables}
      disabled={disabled}
    />,
  )
}

// ---------------------------------------------------------------------------
// Tests — pure handleTestExpression function
// ---------------------------------------------------------------------------

describe('handleTestExpression — pure function', () => {
  it('returns true result when evaluate endpoint returns result: true', async () => {
    server.use(
      http.post(`${BASE}/surveys/:surveyId/logic/evaluate-expression`, async () => {
        const response: EvaluateExpressionResult = {
          result: true,
          errors: [],
        }
        return HttpResponse.json(response, { status: 200 })
      }),
    )

    const { result, errors } = await handleTestExpression(
      SURVEY_ID,
      "{Q1} == 'yes'",
      { Q1: 'yes' },
    )

    expect(result).toBe(true)
    expect(errors).toHaveLength(0)
  })

  it('returns false result when evaluate endpoint returns result: false', async () => {
    server.use(
      http.post(`${BASE}/surveys/:surveyId/logic/evaluate-expression`, async () => {
        const response: EvaluateExpressionResult = {
          result: false,
          errors: [],
        }
        return HttpResponse.json(response, { status: 200 })
      }),
    )

    const { result, errors } = await handleTestExpression(
      SURVEY_ID,
      "{Q1} == 'Yes'",
      { Q1: 'No' },
    )

    expect(result).toBe(false)
    expect(errors).toHaveLength(0)
  })

  it('returns null result when evaluate endpoint returns null result with errors', async () => {
    server.use(
      http.post(`${BASE}/surveys/:surveyId/logic/evaluate-expression`, async () => {
        const response: EvaluateExpressionResult = {
          result: null,
          errors: [{ message: 'Syntax error', position: 0, code: 'SYNTAX_ERROR' }],
        }
        return HttpResponse.json(response, { status: 200 })
      }),
    )

    const { result, errors } = await handleTestExpression(
      SURVEY_ID,
      "{Q1} === bad",
      { Q1: 'yes' },
    )

    expect(result).toBeNull()
    expect(errors).toHaveLength(1)
    expect(errors[0]).toHaveProperty('message')
    expect(errors[0]).toHaveProperty('position')
    expect(errors[0]).toHaveProperty('code')
  })

  it('returns null result when API throws', async () => {
    server.use(
      http.post(`${BASE}/surveys/:surveyId/logic/evaluate-expression`, async () => {
        return HttpResponse.json(
          { detail: { code: 'SERVER_ERROR', message: 'Internal error' } },
          { status: 500 },
        )
      }),
    )

    const { result, errors } = await handleTestExpression(
      SURVEY_ID,
      "{Q1} == 'yes'",
      { Q1: 'yes' },
    )

    expect(result).toBeNull()
    expect(errors).toHaveLength(0)
  })

  it('sends raw expression and sampleValues as context (no string interpolation)', async () => {
    let capturedBody: { expression: string; context: Record<string, string> } | null = null

    server.use(
      http.post(`${BASE}/surveys/:surveyId/logic/evaluate-expression`, async ({ request }) => {
        capturedBody = (await request.json()) as {
          expression: string
          context: Record<string, string>
        }
        return HttpResponse.json({ result: true, errors: [] }, { status: 200 })
      }),
    )

    await handleTestExpression(SURVEY_ID, '{Q1} > {Q2}', { Q1: '5', Q2: '3' })

    // The raw expression must be sent, NOT interpolated
    expect(capturedBody!.expression).toBe('{Q1} > {Q2}')
    // Sample values are sent as context dict
    expect(capturedBody!.context).toEqual({ Q1: '5', Q2: '3' })
  })

  it('sends context with string values without quoting them', async () => {
    let capturedBody: { expression: string; context: Record<string, string> } | null = null

    server.use(
      http.post(`${BASE}/surveys/:surveyId/logic/evaluate-expression`, async ({ request }) => {
        capturedBody = (await request.json()) as {
          expression: string
          context: Record<string, string>
        }
        return HttpResponse.json({ result: true, errors: [] }, { status: 200 })
      }),
    )

    await handleTestExpression(SURVEY_ID, "{Q1} == 'Yes'", { Q1: 'Yes' })

    // Context value must be the raw string, not quoted
    expect(capturedBody!.context).toEqual({ Q1: 'Yes' })
    // Expression must remain unchanged
    expect(capturedBody!.expression).toBe("{Q1} == 'Yes'")
  })

  it('correctly distinguishes false from null: false means evaluated to false', async () => {
    server.use(
      http.post(`${BASE}/surveys/:surveyId/logic/evaluate-expression`, async () => {
        return HttpResponse.json({ result: false, errors: [] }, { status: 200 })
      }),
    )

    const { result } = await handleTestExpression(SURVEY_ID, "{Q1} == 'Yes'", { Q1: 'No' })
    expect(result).toBe(false)
    expect(result).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests — ExpressionPreview component rendering
// ---------------------------------------------------------------------------

describe('ExpressionPreview — rendering', () => {
  it('renders the test expression panel', () => {
    renderPreview({})
    expect(screen.getByTestId('expression-preview')).toBeInTheDocument()
  })

  it('renders sample input for each parsed variable', () => {
    renderPreview({ parsedVariables: ['Q1', 'Q2'] })
    expect(screen.getByTestId('sample-input-Q1')).toBeInTheDocument()
    expect(screen.getByTestId('sample-input-Q2')).toBeInTheDocument()
  })

  it('shows message when no variables are referenced', () => {
    renderPreview({ parsedVariables: [] })
    expect(
      screen.getByText('No variables referenced in the current expression.'),
    ).toBeInTheDocument()
  })

  it('renders Evaluate button', () => {
    renderPreview({})
    expect(screen.getByTestId('test-expression-run')).toBeInTheDocument()
  })

  it('shows missing values hint when variables have no sample values', () => {
    renderPreview({ parsedVariables: ['Q1'] })
    expect(screen.getByTestId('test-missing-values')).toBeInTheDocument()
  })
})

describe('ExpressionPreview — true result', () => {
  it('shows true result after evaluation returns true', async () => {
    server.use(
      http.post(`${BASE}/surveys/:surveyId/logic/evaluate-expression`, async () => {
        return HttpResponse.json(
          { result: true, errors: [] } satisfies EvaluateExpressionResult,
          { status: 200 },
        )
      }),
    )

    renderPreview({ parsedVariables: ['Q1'] })

    // Enter a sample value
    const input = screen.getByTestId('sample-input-Q1')
    await act(async () => {
      await userEvent.type(input, 'yes')
    })

    // Click Evaluate
    const evaluateBtn = screen.getByTestId('test-expression-run')
    await act(async () => {
      await userEvent.click(evaluateBtn)
    })

    await waitFor(() => {
      expect(screen.getByTestId('test-expression-result')).toBeInTheDocument()
    })

    expect(screen.getByTestId('test-expression-result')).toHaveTextContent('true')
  })
})

describe('ExpressionPreview — false result', () => {
  it('shows false result when evaluate endpoint returns result: false', async () => {
    server.use(
      http.post(`${BASE}/surveys/:surveyId/logic/evaluate-expression`, async () => {
        return HttpResponse.json(
          { result: false, errors: [] } satisfies EvaluateExpressionResult,
          { status: 200 },
        )
      }),
    )

    renderPreview({ parsedVariables: ['Q1'] })

    const input = screen.getByTestId('sample-input-Q1')
    await act(async () => {
      await userEvent.type(input, 'No')
    })

    const evaluateBtn = screen.getByTestId('test-expression-run')
    await act(async () => {
      await userEvent.click(evaluateBtn)
    })

    await waitFor(() => {
      expect(screen.getByTestId('test-expression-result')).toBeInTheDocument()
    })

    expect(screen.getByTestId('test-expression-result')).toHaveTextContent('false')
  })

  it('shows evaluation errors with position when evaluation has errors', async () => {
    server.use(
      http.post(`${BASE}/surveys/:surveyId/logic/evaluate-expression`, async () => {
        return HttpResponse.json(
          {
            result: null,
            errors: [{ message: 'Type mismatch', position: 5, code: 'SYNTAX_ERROR' as const }],
          } satisfies EvaluateExpressionResult,
          { status: 200 },
        )
      }),
    )

    renderPreview({ parsedVariables: ['Q1'] })

    const input = screen.getByTestId('sample-input-Q1')
    await act(async () => {
      await userEvent.type(input, 'bad')
    })

    await act(async () => {
      await userEvent.click(screen.getByTestId('test-expression-run'))
    })

    await waitFor(() => {
      expect(screen.getByTestId('test-expression-error')).toBeInTheDocument()
    })

    expect(screen.getByTestId('test-expression-error')).toHaveTextContent('Col 5')
    expect(screen.getByTestId('test-expression-error')).toHaveTextContent('Type mismatch')
  })
})

describe('ExpressionPreview — mock response shape assertion', () => {
  it('mock response has correct EvaluateExpressionResult shape', async () => {
    let capturedResponse: EvaluateExpressionResult | null = null

    server.use(
      http.post(`${BASE}/surveys/:surveyId/logic/evaluate-expression`, async () => {
        const response: EvaluateExpressionResult = {
          result: true,
          errors: [],
        }
        capturedResponse = response
        return HttpResponse.json(response, { status: 200 })
      }),
    )

    renderPreview({ parsedVariables: ['Q1'] })

    const input = screen.getByTestId('sample-input-Q1')
    await act(async () => {
      await userEvent.type(input, 'test')
    })

    await act(async () => {
      await userEvent.click(screen.getByTestId('test-expression-run'))
    })

    await waitFor(() => {
      expect(capturedResponse).not.toBeNull()
    })

    // Shape assertions
    expect(capturedResponse).toHaveProperty('result')
    expect(capturedResponse).toHaveProperty('errors')
    // errors must be an array
    expect(Array.isArray(capturedResponse!.errors)).toBe(true)
    // No 'warnings' or 'parsed_variables' field on the response
    expect(capturedResponse).not.toHaveProperty('warnings')
    expect(capturedResponse).not.toHaveProperty('parsed_variables')
  })
})

describe('ExpressionPreview — disabled state', () => {
  it('disables inputs and button when disabled prop is true', () => {
    renderPreview({ disabled: true })
    expect(screen.getByTestId('sample-input-Q1')).toBeDisabled()
    expect(screen.getByTestId('test-expression-run')).toBeDisabled()
  })
})
