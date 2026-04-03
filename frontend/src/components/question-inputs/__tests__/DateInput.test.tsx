/**
 * Tests for DateInput component.
 *
 * Covers: date-only and datetime-local modes, min/max date enforcement,
 * required validation, aria attributes.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DateInput } from '../DateInput'
import type { BuilderQuestion } from '../../../store/builderStore'
import { getDefaultSettings } from '../../../types/questionSettings'
import type { DateSettings } from '../../../types/questionSettings'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuestion(overrides: Partial<BuilderQuestion> = {}): BuilderQuestion {
  return {
    id: 'q-date-1',
    group_id: 'g-1',
    parent_id: null,
    question_type: 'date',
    code: 'Q1',
    title: 'Pick a date',
    description: null,
    is_required: false,
    sort_order: 1,
    relevance: null,
    validation: null,
    settings: getDefaultSettings('date'),
    created_at: '2024-01-01T00:00:00Z',
    answer_options: [],
    subquestions: [],
    ...overrides,
  }
}

function makeSettings(overrides: Partial<DateSettings> = {}): DateSettings {
  return {
    min_date: null,
    max_date: null,
    include_time: false,
    date_format: 'YYYY-MM-DD',
    placeholder: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('DateInput — rendering', () => {
  it('renders container with question id in testid', () => {
    render(<DateInput value="" onChange={vi.fn()} question={makeQuestion({ id: 'q-abc' })} />)
    expect(screen.getByTestId('date-input-q-abc')).toBeInTheDocument()
  })

  it('renders a date input by default (include_time=false)', () => {
    const question = makeQuestion({ settings: makeSettings({ include_time: false }) })
    render(<DateInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('date-input')).toHaveAttribute('type', 'date')
  })

  it('renders a datetime-local input when include_time=true', () => {
    const question = makeQuestion({ settings: makeSettings({ include_time: true }) })
    render(<DateInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('date-input')).toHaveAttribute('type', 'datetime-local')
  })

  it('reflects the current value', () => {
    render(<DateInput value="2024-06-15" onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId('date-input')).toHaveValue('2024-06-15')
  })

  it('applies min attribute from min_date', () => {
    const question = makeQuestion({ settings: makeSettings({ min_date: '2024-01-01' }) })
    render(<DateInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('date-input')).toHaveAttribute('min', '2024-01-01')
  })

  it('applies max attribute from max_date', () => {
    const question = makeQuestion({ settings: makeSettings({ max_date: '2024-12-31' }) })
    render(<DateInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('date-input')).toHaveAttribute('max', '2024-12-31')
  })

  it('shows placeholder text', () => {
    const question = makeQuestion({ settings: makeSettings({ placeholder: 'Select a date' }) })
    render(<DateInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('date-input')).toHaveAttribute('placeholder', 'Select a date')
  })
})

// ---------------------------------------------------------------------------
// onChange callback
// ---------------------------------------------------------------------------

describe('DateInput — onChange', () => {
  it('calls onChange when value changes', () => {
    const onChange = vi.fn()
    render(<DateInput value="" onChange={onChange} question={makeQuestion()} />)

    fireEvent.change(screen.getByTestId('date-input'), { target: { value: '2024-06-15' } })

    expect(onChange).toHaveBeenCalledWith('2024-06-15')
  })
})

// ---------------------------------------------------------------------------
// Required validation
// ---------------------------------------------------------------------------

describe('DateInput — required validation', () => {
  it('does not show errors before blur (untouched)', () => {
    const question = makeQuestion({ is_required: true })
    render(<DateInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('date-errors')).not.toBeInTheDocument()
  })

  it('shows required error on blur when empty and required', () => {
    const question = makeQuestion({ is_required: true })
    render(<DateInput value="" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('date-input'))

    expect(screen.getByTestId('date-errors')).toHaveTextContent('This field is required.')
  })

  it('does not show required error when not required', () => {
    const question = makeQuestion({ is_required: false })
    render(<DateInput value="" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('date-input'))

    expect(screen.queryByTestId('date-errors')).not.toBeInTheDocument()
  })

  it('does not show error when value is set and required', () => {
    const question = makeQuestion({ is_required: true })
    render(<DateInput value="2024-06-15" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('date-input'))

    expect(screen.queryByTestId('date-errors')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Date range validation
// ---------------------------------------------------------------------------

describe('DateInput — date range validation', () => {
  it('shows error when date is before min_date', () => {
    const question = makeQuestion({ settings: makeSettings({ min_date: '2024-06-01' }) })
    render(<DateInput value="2024-01-01" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('date-input'))

    expect(screen.getByTestId('date-errors')).toHaveTextContent('on or after 2024-06-01')
  })

  it('shows error when date is after max_date', () => {
    const question = makeQuestion({ settings: makeSettings({ max_date: '2024-06-30' }) })
    render(<DateInput value="2024-12-31" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('date-input'))

    expect(screen.getByTestId('date-errors')).toHaveTextContent('on or before 2024-06-30')
  })

  it('does not show error when date is within range', () => {
    const question = makeQuestion({
      settings: makeSettings({ min_date: '2024-01-01', max_date: '2024-12-31' }),
    })
    render(<DateInput value="2024-06-15" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('date-input'))

    expect(screen.queryByTestId('date-errors')).not.toBeInTheDocument()
  })

  it('does not show range error for empty value (unless required)', () => {
    const question = makeQuestion({
      settings: makeSettings({ min_date: '2024-01-01' }),
      is_required: false,
    })
    render(<DateInput value="" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('date-input'))

    expect(screen.queryByTestId('date-errors')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// External errors prop
// ---------------------------------------------------------------------------

describe('DateInput — external errors prop', () => {
  it('displays external errors immediately without blur', () => {
    render(
      <DateInput value="" onChange={vi.fn()} question={makeQuestion()} errors={['Server error']} />
    )
    expect(screen.getByTestId('date-errors')).toHaveTextContent('Server error')
  })
})

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('DateInput — accessibility', () => {
  it('does not set aria-invalid when no errors', () => {
    render(<DateInput value="" onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId('date-input')).toHaveAttribute('aria-invalid', 'false')
  })

  it('sets aria-invalid=true when errors present', () => {
    render(
      <DateInput value="" onChange={vi.fn()} question={makeQuestion()} errors={['Required']} />
    )
    expect(screen.getByTestId('date-input')).toHaveAttribute('aria-invalid', 'true')
  })

  it('sets aria-describedby pointing to error container when errors present', () => {
    const question = makeQuestion({ id: 'q-test' })
    render(
      <DateInput value="" onChange={vi.fn()} question={question} errors={['Required']} />
    )
    const input = screen.getByTestId('date-input')
    expect(input).toHaveAttribute('aria-describedby', 'question-q-test-error')
    expect(screen.getByTestId('date-errors')).toHaveAttribute('id', 'question-q-test-error')
  })
})
