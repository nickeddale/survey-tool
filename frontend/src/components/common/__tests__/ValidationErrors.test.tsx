/**
 * Tests for ValidationErrors component.
 *
 * Covers: renders nothing when errors is empty, renders error list with correct
 * aria attributes when errors are present, id prop is applied, className prop.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ValidationErrors } from '../ValidationErrors'

describe('ValidationErrors — empty errors', () => {
  it('renders nothing when errors array is empty', () => {
    const { container } = render(<ValidationErrors errors={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('does not render testid element when errors is empty', () => {
    render(<ValidationErrors errors={[]} />)
    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })
})

describe('ValidationErrors — with errors', () => {
  it('renders the error list when errors are present', () => {
    render(<ValidationErrors errors={['This field is required.']} />)
    expect(screen.getByTestId('validation-errors')).toBeInTheDocument()
  })

  it('renders all error messages', () => {
    render(<ValidationErrors errors={['Error one', 'Error two', 'Error three']} />)
    expect(screen.getByText('Error one')).toBeInTheDocument()
    expect(screen.getByText('Error two')).toBeInTheDocument()
    expect(screen.getByText('Error three')).toBeInTheDocument()
  })

  it('renders each error in its own li element', () => {
    render(<ValidationErrors errors={['First error', 'Second error']} />)
    expect(screen.getByTestId('validation-error-0')).toHaveTextContent('First error')
    expect(screen.getByTestId('validation-error-1')).toHaveTextContent('Second error')
  })

  it('renders a ul element', () => {
    render(<ValidationErrors errors={['Some error']} />)
    const list = screen.getByTestId('validation-errors')
    expect(list.tagName).toBe('UL')
  })

  it('sets role="alert" on the list', () => {
    render(<ValidationErrors errors={['Error']} />)
    expect(screen.getByTestId('validation-errors')).toHaveAttribute('role', 'alert')
  })

  it('sets aria-live="assertive" on the list', () => {
    render(<ValidationErrors errors={['Error']} />)
    expect(screen.getByTestId('validation-errors')).toHaveAttribute('aria-live', 'assertive')
  })

  it('applies the id prop', () => {
    render(<ValidationErrors errors={['Error']} id="question-q1-error" />)
    expect(screen.getByTestId('validation-errors')).toHaveAttribute('id', 'question-q1-error')
  })

  it('applies custom className prop', () => {
    render(<ValidationErrors errors={['Error']} className="custom-class" />)
    expect(screen.getByTestId('validation-errors')).toHaveClass('custom-class')
  })

  it('renders single error message correctly', () => {
    render(<ValidationErrors errors={['This field is required.']} />)
    expect(screen.getByTestId('validation-error-0')).toHaveTextContent('This field is required.')
  })
})
