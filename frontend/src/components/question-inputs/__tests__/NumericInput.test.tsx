/**
 * Tests for NumericInput component.
 *
 * Covers: rendering with prefix/suffix, onChange, blur validation
 * (required, min, max, decimal places), external errors, aria attributes.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NumericInput } from '../NumericInput'
import type { BuilderQuestion } from '../../../store/builderStore'
import { getDefaultSettings } from '../../../types/questionSettings'
import type { NumericSettings } from '../../../types/questionSettings'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuestion(overrides: Partial<BuilderQuestion> = {}): BuilderQuestion {
  return {
    id: 'q-numeric-1',
    group_id: 'g-1',
    parent_id: null,
    question_type: 'numeric',
    code: 'Q1',
    title: 'Enter a number',
    description: null,
    is_required: false,
    sort_order: 1,
    relevance: null,
    validation: null,
    settings: getDefaultSettings('numeric'),
    created_at: '2024-01-01T00:00:00Z',
    answer_options: [],
    subquestions: [],
    ...overrides,
  }
}

function makeSettings(overrides: Partial<NumericSettings> = {}): NumericSettings {
  return {
    min: null,
    max: null,
    decimal_places: 0,
    placeholder: null,
    prefix: null,
    suffix: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('NumericInput — rendering', () => {
  it('renders container with question id in testid', () => {
    render(<NumericInput value="" onChange={vi.fn()} question={makeQuestion({ id: 'q-abc' })} />)
    expect(screen.getByTestId('numeric-input-q-abc')).toBeInTheDocument()
  })

  it('renders a number input', () => {
    render(<NumericInput value="" onChange={vi.fn()} question={makeQuestion()} />)
    const input = screen.getByTestId('numeric-input')
    expect(input).toHaveAttribute('type', 'number')
  })

  it('reflects the current value', () => {
    render(<NumericInput value="42" onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId('numeric-input')).toHaveValue(42)
  })

  it('renders prefix when set', () => {
    const question = makeQuestion({ settings: makeSettings({ prefix: '$' }) })
    render(<NumericInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('numeric-prefix')).toHaveTextContent('$')
  })

  it('renders suffix when set', () => {
    const question = makeQuestion({ settings: makeSettings({ suffix: 'kg' }) })
    render(<NumericInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('numeric-suffix')).toHaveTextContent('kg')
  })

  it('does not render prefix when not set', () => {
    render(<NumericInput value="" onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.queryByTestId('numeric-prefix')).not.toBeInTheDocument()
  })

  it('does not render suffix when not set', () => {
    render(<NumericInput value="" onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.queryByTestId('numeric-suffix')).not.toBeInTheDocument()
  })

  it('shows placeholder text', () => {
    const question = makeQuestion({ settings: makeSettings({ placeholder: 'Enter amount' }) })
    render(<NumericInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('numeric-input')).toHaveAttribute('placeholder', 'Enter amount')
  })

  it('applies min attribute from settings', () => {
    const question = makeQuestion({ settings: makeSettings({ min: 0 }) })
    render(<NumericInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('numeric-input')).toHaveAttribute('min', '0')
  })

  it('applies max attribute from settings', () => {
    const question = makeQuestion({ settings: makeSettings({ max: 100 }) })
    render(<NumericInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('numeric-input')).toHaveAttribute('max', '100')
  })
})

// ---------------------------------------------------------------------------
// onChange callback
// ---------------------------------------------------------------------------

describe('NumericInput — onChange', () => {
  it('calls onChange when user types', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NumericInput value="" onChange={onChange} question={makeQuestion()} />)

    await act(async () => {
      await user.type(screen.getByTestId('numeric-input'), '5')
    })

    expect(onChange).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Required validation
// ---------------------------------------------------------------------------

describe('NumericInput — required validation', () => {
  it('does not show errors before blur (untouched)', () => {
    const question = makeQuestion({ is_required: true })
    render(<NumericInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })

  it('shows required error on blur when empty and required', () => {
    const question = makeQuestion({ is_required: true })
    render(<NumericInput value="" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('numeric-input'))

    expect(screen.getByTestId('validation-errors')).toHaveTextContent('This field is required.')
  })

  it('does not show required error when not required', () => {
    const question = makeQuestion({ is_required: false })
    render(<NumericInput value="" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('numeric-input'))

    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Range validation
// ---------------------------------------------------------------------------

describe('NumericInput — range validation', () => {
  it('shows min error when value is below min', () => {
    const question = makeQuestion({ settings: makeSettings({ min: 10 }) })
    render(<NumericInput value="5" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('numeric-input'))

    expect(screen.getByTestId('validation-errors')).toHaveTextContent('at least 10')
  })

  it('shows max error when value exceeds max', () => {
    const question = makeQuestion({ settings: makeSettings({ max: 100 }) })
    render(<NumericInput value="150" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('numeric-input'))

    expect(screen.getByTestId('validation-errors')).toHaveTextContent('at most 100')
  })

  it('does not show error when value is within range', () => {
    const question = makeQuestion({ settings: makeSettings({ min: 0, max: 100 }) })
    render(<NumericInput value="50" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('numeric-input'))

    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Decimal places validation
// ---------------------------------------------------------------------------

describe('NumericInput — decimal places validation', () => {
  it('shows error when value has too many decimal places', () => {
    const question = makeQuestion({ settings: makeSettings({ decimal_places: 2 }) })
    render(<NumericInput value="1.234" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('numeric-input'))

    expect(screen.getByTestId('validation-errors')).toHaveTextContent('2 decimal places')
  })

  it('does not show error when decimal places are within limit', () => {
    const question = makeQuestion({ settings: makeSettings({ decimal_places: 2 }) })
    render(<NumericInput value="1.23" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('numeric-input'))

    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })

  it('shows error when integer setting but decimal value entered', () => {
    const question = makeQuestion({ settings: makeSettings({ decimal_places: 0 }) })
    render(<NumericInput value="1.5" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('numeric-input'))

    expect(screen.getByTestId('validation-errors')).toHaveTextContent('0 decimal places')
  })
})

// ---------------------------------------------------------------------------
// External errors prop
// ---------------------------------------------------------------------------

describe('NumericInput — external errors prop', () => {
  it('displays external errors immediately without blur', () => {
    render(
      <NumericInput value="" onChange={vi.fn()} question={makeQuestion()} errors={['Server error']} />
    )
    expect(screen.getByTestId('validation-errors')).toHaveTextContent('Server error')
  })
})

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('NumericInput — accessibility', () => {
  it('does not set aria-invalid when no errors', () => {
    render(<NumericInput value="" onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId('numeric-input')).toHaveAttribute('aria-invalid', 'false')
  })

  it('sets aria-invalid=true when errors present', () => {
    render(
      <NumericInput value="" onChange={vi.fn()} question={makeQuestion()} errors={['Required']} />
    )
    expect(screen.getByTestId('numeric-input')).toHaveAttribute('aria-invalid', 'true')
  })

  it('sets aria-describedby pointing to error container when errors present', () => {
    const question = makeQuestion({ id: 'q-test' })
    render(
      <NumericInput value="" onChange={vi.fn()} question={question} errors={['Required']} />
    )
    const input = screen.getByTestId('numeric-input')
    expect(input).toHaveAttribute('aria-describedby', 'question-q-test-error')
    expect(screen.getByTestId('validation-errors')).toHaveAttribute('id', 'question-q-test-error')
  })
})
