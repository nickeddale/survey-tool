/**
 * ValidationErrors — presentational component that displays validation errors
 * below question inputs in an accessible list.
 *
 * Renders nothing when errors is empty. When errors are present, renders a
 * <ul role="alert" aria-live="assertive"> consistent with the error display
 * pattern used by individual input components.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationErrorsProps {
  errors: string[]
  id?: string
  className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ValidationErrors({ errors, id, className }: ValidationErrorsProps) {
  if (errors.length === 0) return null

  return (
    <ul
      id={id}
      role="alert"
      aria-live="assertive"
      className={['space-y-0.5', className].filter(Boolean).join(' ')}
      data-testid="validation-errors"
    >
      {errors.map((error, i) => (
        <li key={i} className="text-xs text-destructive" data-testid={`validation-error-${i}`}>
          {error}
        </li>
      ))}
    </ul>
  )
}

export default ValidationErrors
