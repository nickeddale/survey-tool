/**
 * Tests for LongTextInput component.
 *
 * Covers: rendering, configurable rows, character counter, required validation,
 * max_length validation, accessibility.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LongTextInput } from '../LongTextInput'
import type { BuilderQuestion } from '../../../store/builderStore'
import { getDefaultSettings } from '../../../types/questionSettings'
import type { LongTextSettings } from '../../../types/questionSettings'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuestion(overrides: Partial<BuilderQuestion> = {}): BuilderQuestion {
  return {
    id: 'q-long-1',
    group_id: 'g-1',
    parent_id: null,
    question_type: 'long_text',
    code: 'Q2',
    title: 'Tell us more',
    description: null,
    is_required: false,
    sort_order: 1,
    relevance: null,
    validation: null,
    settings: getDefaultSettings('long_text'),
    created_at: '2024-01-01T00:00:00Z',
    answer_options: [],
    subquestions: [],
    ...overrides,
  }
}

function makeSettings(overrides: Partial<LongTextSettings> = {}): LongTextSettings {
  return {
    placeholder: null,
    max_length: 5000,
    rows: 4,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('LongTextInput — rendering', () => {
  it('renders a textarea element', () => {
    render(<LongTextInput value="" onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId('long-text-input')).toBeInTheDocument()
    expect(screen.getByTestId('long-text-input').tagName).toBe('TEXTAREA')
  })

  it('renders with the configured number of rows', () => {
    const question = makeQuestion({ settings: makeSettings({ rows: 6 }) })
    render(<LongTextInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('long-text-input')).toHaveAttribute('rows', '6')
  })

  it('defaults to 4 rows when not specified', () => {
    render(<LongTextInput value="" onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId('long-text-input')).toHaveAttribute('rows', '4')
  })

  it('shows placeholder text', () => {
    const question = makeQuestion({
      settings: makeSettings({ placeholder: 'Write your answer here' }),
    })
    render(<LongTextInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('long-text-input')).toHaveAttribute(
      'placeholder',
      'Write your answer here'
    )
  })

  it('reflects the current value', () => {
    const question = makeQuestion({ settings: makeSettings() })
    render(<LongTextInput value="Some long text" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('long-text-input')).toHaveValue('Some long text')
  })

  it('renders container with question id in testid', () => {
    const question = makeQuestion({ id: 'q-xyz' })
    render(<LongTextInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('long-text-input-q-xyz')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Character counter
// ---------------------------------------------------------------------------

describe('LongTextInput — character counter', () => {
  it('shows counter when max_length is set', () => {
    const question = makeQuestion({ settings: makeSettings({ max_length: 500 }) })
    render(<LongTextInput value="Hello there" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('long-text-char-counter')).toHaveTextContent('11/500')
  })

  it('shows 0/max when value is empty', () => {
    const question = makeQuestion({ settings: makeSettings({ max_length: 500 }) })
    render(<LongTextInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('long-text-char-counter')).toHaveTextContent('0/500')
  })

  it('does not show counter when max_length is undefined (no key in settings)', () => {
    const question = makeQuestion({ settings: { placeholder: null, rows: 4 } as LongTextSettings })
    render(<LongTextInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('long-text-char-counter')).not.toBeInTheDocument()
  })

  it('updates counter as user types', async () => {
    const user = userEvent.setup()
    let val = ''
    const onChange = vi.fn((v: string) => {
      val = v
    })
    const question = makeQuestion({ settings: makeSettings({ max_length: 100 }) })
    const { rerender } = render(
      <LongTextInput value={val} onChange={onChange} question={question} />
    )

    await act(async () => {
      await user.type(screen.getByTestId('long-text-input'), 'Test')
    })

    rerender(<LongTextInput value="Test" onChange={onChange} question={question} />)
    expect(screen.getByTestId('long-text-char-counter')).toHaveTextContent('4/100')
  })
})

// ---------------------------------------------------------------------------
// onChange callback
// ---------------------------------------------------------------------------

describe('LongTextInput — onChange', () => {
  it('calls onChange when user types', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const question = makeQuestion({ settings: makeSettings() })

    render(<LongTextInput value="" onChange={onChange} question={question} />)

    await act(async () => {
      await user.type(screen.getByTestId('long-text-input'), 'A')
    })

    expect(onChange).toHaveBeenCalledWith('A')
  })
})

// ---------------------------------------------------------------------------
// Required validation
// ---------------------------------------------------------------------------

describe('LongTextInput — required validation', () => {
  it('shows required error on blur when field is empty and required', async () => {
    const user = userEvent.setup()
    const question = makeQuestion({ is_required: true, settings: makeSettings() })

    render(<LongTextInput value="" onChange={vi.fn()} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('long-text-input'))
      await user.tab()
    })

    const errors = await screen.findByTestId('validation-errors')
    expect(errors).toHaveTextContent('This field is required.')
  })

  it('does not show error when not required and field is empty', async () => {
    const user = userEvent.setup()
    const question = makeQuestion({ is_required: false, settings: makeSettings() })

    render(<LongTextInput value="" onChange={vi.fn()} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('long-text-input'))
      await user.tab()
    })

    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })

  it('does not show error before blur', () => {
    const question = makeQuestion({ is_required: true, settings: makeSettings() })
    render(<LongTextInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// max_length validation
// ---------------------------------------------------------------------------

describe('LongTextInput — max_length validation', () => {
  it('shows error when value exceeds max_length on blur', async () => {
    const user = userEvent.setup()
    const question = makeQuestion({ settings: makeSettings({ max_length: 10 }) })

    render(
      <LongTextInput
        value="This is too long for the limit"
        onChange={vi.fn()}
        question={question}
      />
    )

    await act(async () => {
      await user.click(screen.getByTestId('long-text-input'))
      await user.tab()
    })

    const errors = await screen.findByTestId('validation-errors')
    expect(errors).toHaveTextContent('10 characters')
  })
})

// ---------------------------------------------------------------------------
// External errors prop
// ---------------------------------------------------------------------------

describe('LongTextInput — external errors prop', () => {
  it('displays external errors', () => {
    const question = makeQuestion({ settings: makeSettings() })
    render(
      <LongTextInput
        value=""
        onChange={vi.fn()}
        question={question}
        errors={['Answer is required']}
      />
    )
    expect(screen.getByTestId('validation-errors')).toHaveTextContent('Answer is required')
  })
})

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('LongTextInput — accessibility', () => {
  it('does not set aria-invalid when no errors', () => {
    const question = makeQuestion({ settings: makeSettings() })
    render(<LongTextInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('long-text-input')).toHaveAttribute('aria-invalid', 'false')
  })

  it('sets aria-invalid=true when errors exist', () => {
    const question = makeQuestion({ settings: makeSettings() })
    render(<LongTextInput value="" onChange={vi.fn()} question={question} errors={['Required']} />)
    expect(screen.getByTestId('long-text-input')).toHaveAttribute('aria-invalid', 'true')
  })

  it('sets aria-describedby pointing to error container', () => {
    const question = makeQuestion({ id: 'q-long-abc', settings: makeSettings() })
    render(<LongTextInput value="" onChange={vi.fn()} question={question} errors={['Required']} />)
    const textarea = screen.getByTestId('long-text-input')
    expect(textarea).toHaveAttribute('aria-describedby', 'question-q-long-abc-error')
    expect(screen.getByTestId('validation-errors')).toHaveAttribute(
      'id',
      'question-q-long-abc-error'
    )
  })
})
