/**
 * ErrorBoundary — class-based React error boundary that catches render errors
 * in the component tree below it and displays a fallback UI with a retry button.
 *
 * React error boundaries must be class components (as of React 18).
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, info)
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div
          role="alert"
          aria-live="assertive"
          className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center"
          data-testid="error-boundary-fallback"
        >
          <h1
            className="text-2xl font-semibold text-destructive"
            data-testid="error-boundary-heading"
          >
            Something went wrong
          </h1>
          {this.state.error && (
            <p
              className="max-w-md text-sm text-muted-foreground"
              data-testid="error-boundary-message"
            >
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={this.handleRetry}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            data-testid="error-boundary-retry"
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
