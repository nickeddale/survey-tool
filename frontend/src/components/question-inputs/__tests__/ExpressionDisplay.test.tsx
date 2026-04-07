/**
 * Tests for ExpressionDisplay component.
 *
 * Covers: renders placeholder when value is null, renders value when provided,
 * not interactive, aria-readonly, format variants.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExpressionDisplay } from '../ExpressionDisplay'
import type { BuilderQuestion } from '../../../store/builderStore'
import { getDefaultSettings } from '../../../types/questionSettings'
import type { ExpressionSettings } from '../../../types/questionSettings'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuestion(overrides: Partial<BuilderQuestion> = {}): BuilderQuestion {
  return {
    id: 'q-expr-1',
    group_id: 'g-1',
    parent_id: null,
    question_type: 'expression',
    code: 'Q1',
    title: 'Calculated value',
    description: null,
    is_required: false,
    sort_order: 1,
    relevance: null,
    validation: null,
    settings: getDefaultSettings('expression'),
    created_at: '2024-01-01T00:00:00Z',
    answer_options: [],
    subquestions: [],
    ...overrides,
  }
}

function makeSettings(overrides: Partial<ExpressionSettings> = {}): ExpressionSettings {
  return {
    expression: '',
    display_format: 'text',
    currency: null,
    decimal_places: 0,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('ExpressionDisplay — rendering', () => {
  it('renders container with question id in testid', () => {
    render(<ExpressionDisplay value={null} question={makeQuestion({ id: 'q-abc' })} />)
    expect(screen.getByTestId('expression-display-q-abc')).toBeInTheDocument()
  })

  it('renders placeholder text when value is null', () => {
    render(<ExpressionDisplay value={null} question={makeQuestion()} />)
    expect(screen.getByTestId('expression-display-value')).toHaveTextContent(
      'Expression result will appear here',
    )
  })

  it('renders placeholder text when value is empty string', () => {
    render(<ExpressionDisplay value="" question={makeQuestion()} />)
    expect(screen.getByTestId('expression-display-value')).toHaveTextContent(
      'Expression result will appear here',
    )
  })

  it('renders string value when provided', () => {
    render(<ExpressionDisplay value="Hello World" question={makeQuestion()} />)
    expect(screen.getByTestId('expression-display-value')).toHaveTextContent('Hello World')
  })

  it('renders numeric value when provided', () => {
    render(<ExpressionDisplay value={42} question={makeQuestion()} />)
    expect(screen.getByTestId('expression-display-value')).toHaveTextContent('42')
  })
})

// ---------------------------------------------------------------------------
// Display format
// ---------------------------------------------------------------------------

describe('ExpressionDisplay — display formats', () => {
  it('renders raw text format as-is', () => {
    render(
      <ExpressionDisplay
        value="some text"
        question={makeQuestion({ settings: makeSettings({ display_format: 'text' }) })}
      />
    )
    expect(screen.getByTestId('expression-display-value')).toHaveTextContent('some text')
  })

  it('renders percent format with % suffix', () => {
    render(
      <ExpressionDisplay
        value={75}
        question={makeQuestion({ settings: makeSettings({ display_format: 'percent', decimal_places: 0 }) })}
      />
    )
    expect(screen.getByTestId('expression-display-value')).toHaveTextContent('75%')
  })
})

// ---------------------------------------------------------------------------
// Non-interactive
// ---------------------------------------------------------------------------

describe('ExpressionDisplay — non-interactive', () => {
  it('does not render an input element', () => {
    render(<ExpressionDisplay value="42" question={makeQuestion()} />)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
  })

  it('does not accept onChange prop (read-only component)', () => {
    // This test just ensures the component renders without errors
    // when no onChange is provided (it's a display-only component)
    expect(() => {
      render(<ExpressionDisplay value="42" question={makeQuestion()} />)
    }).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('ExpressionDisplay — accessibility', () => {
  it('has aria-readonly=true on value display', () => {
    render(<ExpressionDisplay value="test" question={makeQuestion()} />)
    expect(screen.getByTestId('expression-display-value')).toHaveAttribute('aria-readonly', 'true')
  })

  it('has aria-label equal to question title', () => {
    render(
      <ExpressionDisplay
        value="test"
        question={makeQuestion({ title: 'My Expression' })}
      />
    )
    expect(screen.getByLabelText('My Expression')).toBeInTheDocument()
  })

  it('has role=status on value display', () => {
    render(<ExpressionDisplay value="test" question={makeQuestion()} />)
    expect(screen.getByTestId('expression-display-value')).toHaveAttribute('role', 'status')
  })

  it('has aria-live=polite for dynamic updates', () => {
    render(<ExpressionDisplay value="test" question={makeQuestion()} />)
    expect(screen.getByTestId('expression-display-value')).toHaveAttribute('aria-live', 'polite')
  })
})
