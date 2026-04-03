/**
 * ExpressionPreview — "Test Expression" panel for LogicEditor.
 *
 * Accepts sample values for each referenced variable (parsed_variables) and
 * calls the validate-expression endpoint to evaluate the expression. Shows a
 * true/false result based on the validation response (valid = true, errors = false).
 */

import { useState, useCallback } from 'react'
import surveyService from '../../services/surveyService'
import type { ValidateExpressionResult } from '../../types/survey'

// ---------------------------------------------------------------------------
// Pure helper – exported for unit testing without mounting the component
// ---------------------------------------------------------------------------

export async function handleTestExpression(
  surveyId: string,
  expression: string,
  sampleValues: Record<string, string>,
): Promise<{ result: boolean | null; errors: ValidateExpressionResult['errors'] }> {
  // Substitute sample values into the expression for evaluation
  let interpolated = expression
  for (const [varName, val] of Object.entries(sampleValues)) {
    // Replace {VAR} with the sample value (quoted if not a number)
    const isNumeric = val !== '' && !isNaN(Number(val))
    const replacement = isNumeric ? val : `'${val}'`
    interpolated = interpolated.replaceAll(`{${varName}}`, replacement)
  }

  try {
    const result = await surveyService.validateExpression(surveyId, { expression: interpolated })
    return {
      result: result.errors.length === 0,
      errors: result.errors,
    }
  } catch {
    return { result: null, errors: [] }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ExpressionPreviewProps {
  /** The survey ID (for validation API calls) */
  surveyId: string
  /** The current expression string */
  expression: string
  /** Variable names referenced in the expression */
  parsedVariables: string[]
  /** Disable interaction */
  disabled?: boolean
}

export function ExpressionPreview({
  surveyId,
  expression,
  parsedVariables,
  disabled = false,
}: ExpressionPreviewProps) {
  const [sampleValues, setSampleValues] = useState<Record<string, string>>({})
  const [testResult, setTestResult] = useState<boolean | null>(null)
  const [testErrors, setTestErrors] = useState<ValidateExpressionResult['errors']>([])
  const [isTesting, setIsTesting] = useState(false)

  function handleSampleChange(varName: string, value: string) {
    setSampleValues((prev) => ({ ...prev, [varName]: value }))
    // Clear previous result when inputs change
    setTestResult(null)
    setTestErrors([])
  }

  const runTest = useCallback(async () => {
    if (!expression.trim()) return
    setIsTesting(true)
    setTestResult(null)
    setTestErrors([])
    try {
      const { result, errors } = await handleTestExpression(surveyId, expression, sampleValues)
      setTestResult(result)
      setTestErrors(errors)
    } finally {
      setIsTesting(false)
    }
  }, [surveyId, expression, sampleValues])

  const hasMissingValues = parsedVariables.some(
    (v) => sampleValues[v] === undefined || sampleValues[v] === '',
  )

  return (
    <div
      className="rounded-md border border-border bg-muted/30 p-3 space-y-3"
      data-testid="expression-preview"
    >
      <p className="text-xs font-semibold text-foreground">Test Expression</p>

      {parsedVariables.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No variables referenced in the current expression.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Enter sample values to evaluate this expression:
          </p>
          {parsedVariables.map((varName) => (
            <div key={varName} className="flex items-center gap-2">
              <label
                htmlFor={`sample-${varName}`}
                className="text-xs font-mono text-foreground min-w-[4rem]"
              >
                {'{'}
                {varName}
                {'}'}
              </label>
              <input
                id={`sample-${varName}`}
                type="text"
                className="flex-1 rounded border border-input bg-background px-2 py-0.5 text-xs
                  focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                value={sampleValues[varName] ?? ''}
                onChange={(e) => handleSampleChange(varName, e.target.value)}
                disabled={disabled}
                placeholder={`value for {${varName}}`}
                aria-label={`Sample value for ${varName}`}
                data-testid={`sample-input-${varName}`}
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="text-xs px-3 py-1 rounded border border-primary bg-primary text-primary-foreground
            hover:bg-primary/90 transition-colors disabled:opacity-50"
          onClick={runTest}
          disabled={disabled || isTesting || !expression.trim()}
          data-testid="test-expression-run"
          aria-label="Run test expression"
        >
          {isTesting ? 'Testing…' : 'Evaluate'}
        </button>

        {/* Result indicator */}
        {!isTesting && testResult !== null && (
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded ${
              testResult
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}
            data-testid="test-expression-result"
          >
            {testResult ? '✓ true' : '✗ false'}
          </span>
        )}
      </div>

      {/* Evaluation errors */}
      {!isTesting && testErrors.length > 0 && (
        <div className="space-y-1">
          {testErrors.map((err, i) => (
            <p
              key={i}
              className="text-xs text-destructive"
              role="alert"
              data-testid="test-expression-error"
            >
              {err.position > 0 ? `Col ${err.position}: ` : ''}
              {err.message}
            </p>
          ))}
        </div>
      )}

      {hasMissingValues && parsedVariables.length > 0 && (
        <p className="text-xs text-muted-foreground italic" data-testid="test-missing-values">
          Fill in all sample values above to test the expression.
        </p>
      )}
    </div>
  )
}
