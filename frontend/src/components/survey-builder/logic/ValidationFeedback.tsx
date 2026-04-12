import type { ValidateExpressionResult } from '../../../types/survey'

interface ValidationFeedbackProps {
  validationResult: ValidateExpressionResult
  previewExpression: string
  showTestPanel: boolean
  disabled?: boolean
  onToggleTest: () => void
}

export function ValidationFeedback({
  validationResult,
  previewExpression,
  showTestPanel,
  disabled,
  onToggleTest,
}: ValidationFeedbackProps) {
  return (
    <div className="space-y-1">
      {/* Errors with position highlighting */}
      {validationResult.errors.map((err, i) => (
        <p
          key={i}
          className="text-xs text-destructive"
          role="alert"
          data-testid="logic-editor-error"
        >
          {err.position > 0 ? (
            <span className="font-mono text-destructive/70 mr-1">[col {err.position}]</span>
          ) : null}
          {err.message}
        </p>
      ))}
      {/* Warnings (amber) with position info */}
      {validationResult.warnings.map((warn, i) => (
        <p
          key={i}
          className="text-xs text-amber-600"
          role="status"
          data-testid="logic-editor-warning"
        >
          {warn.position > 0 ? (
            <span className="font-mono text-amber-500/80 mr-1">[col {warn.position}]</span>
          ) : null}
          {warn.message}
        </p>
      ))}
      {/* Valid indicator with green check */}
      {validationResult.errors.length === 0 && previewExpression && (
        <p
          className="flex items-center gap-1 text-xs text-green-600"
          data-testid="logic-editor-valid"
        >
          <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
          Expression is valid
        </p>
      )}
      {/* Referenced variables list */}
      {validationResult.parsed_variables.length > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="logic-editor-variables">
          References:{' '}
          {validationResult.parsed_variables.map((v, i) => (
            <span key={v}>
              <span className="font-mono">
                {'{'}
                {v}
                {'}'}
              </span>
              {i < validationResult.parsed_variables.length - 1 ? ', ' : ''}
            </span>
          ))}
        </p>
      )}
      {/* Test Expression toggle button */}
      {validationResult.errors.length === 0 && previewExpression && (
        <button
          type="button"
          className={`text-xs px-2 py-0.5 rounded border transition-colors ${
            showTestPanel
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-muted-foreground border-input hover:bg-muted'
          }`}
          onClick={onToggleTest}
          disabled={disabled}
          data-testid="logic-editor-test-toggle"
        >
          {showTestPanel ? 'Hide Test' : 'Test Expression'}
        </button>
      )}
    </div>
  )
}
