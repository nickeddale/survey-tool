/**
 * Tests for ErrorBoundary component.
 *
 * Covers: fallback UI renders when a child throws, retry button resets the
 * boundary and allows children to re-render successfully.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBoundary } from '../ErrorBoundary'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A component that throws on its first render. After the ErrorBoundary resets
 * and remounts the subtree, `shouldThrow` will be false and it renders normally.
 */
let shouldThrow = true

function ThrowingComponent() {
  if (shouldThrow) {
    throw new Error('Test error from ThrowingComponent')
  }
  return <div data-testid="child-content">Child rendered successfully</div>
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ErrorBoundary', () => {
  beforeEach(() => {
    shouldThrow = true
    // Suppress console.error for expected error boundary output
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders children when there is no error', () => {
    shouldThrow = false
    render(
      <ErrorBoundary>
        <div data-testid="child-content">No error here</div>
      </ErrorBoundary>
    )
    expect(screen.getByTestId('child-content')).toBeInTheDocument()
  })

  it('renders fallback UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    )
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument()
    expect(screen.getByTestId('error-boundary-heading')).toHaveTextContent('Something went wrong')
  })

  it('displays the error message in the fallback UI', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    )
    expect(screen.getByTestId('error-boundary-message')).toHaveTextContent(
      'Test error from ThrowingComponent'
    )
  })

  it('renders a retry button in the fallback UI', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    )
    expect(screen.getByTestId('error-boundary-retry')).toBeInTheDocument()
    expect(screen.getByTestId('error-boundary-retry')).toHaveTextContent('Try again')
  })

  it('resets the boundary and re-renders children when retry is clicked', async () => {
    const user = userEvent.setup()

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    )

    // Fallback is visible
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument()

    // Allow ThrowingComponent to succeed on next render
    shouldThrow = false

    await user.click(screen.getByTestId('error-boundary-retry'))

    // Children should now render successfully
    expect(screen.getByTestId('child-content')).toBeInTheDocument()
    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument()
  })

  it('renders a custom fallback when provided via fallback prop', () => {
    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom fallback</div>}>
        <ThrowingComponent />
      </ErrorBoundary>
    )
    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument()
    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument()
  })

  it('sets role="alert" on the default fallback', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    )
    expect(screen.getByTestId('error-boundary-fallback')).toHaveAttribute('role', 'alert')
  })

  it('sets aria-live="assertive" on the default fallback', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    )
    expect(screen.getByTestId('error-boundary-fallback')).toHaveAttribute('aria-live', 'assertive')
  })
})
