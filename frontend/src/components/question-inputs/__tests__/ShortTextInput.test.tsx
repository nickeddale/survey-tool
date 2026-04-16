/**
 * Tests for ShortTextInput component.
 *
 * Covers: rendering, character counter, validation (required/email/url/max_length),
 * accessibility attributes.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShortTextInput } from '../ShortTextInput'
import type { BuilderQuestion } from '../../../store/builderStore'
import { getDefaultSettings } from '../../../types/questionSettings'
import type { ShortTextSettings } from '../../../types/questionSettings'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuestion(overrides: Partial<BuilderQuestion> = {}): BuilderQuestion {
  return {
    id: 'q-short-1',
    group_id: 'g-1',
    parent_id: null,
    question_type: 'short_text',
    code: 'Q1',
    title: 'Your name',
    description: null,
    is_required: false,
    sort_order: 1,
    relevance: null,
    validation: null,
    settings: getDefaultSettings('short_text'),
    created_at: '2024-01-01T00:00:00Z',
    answer_options: [],
    subquestions: [],
    ...overrides,
  }
}

function makeSettings(overrides: Partial<ShortTextSettings> = {}): ShortTextSettings {
  return {
    placeholder: null,
    max_length: 255,
    input_type: 'text',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('ShortTextInput — rendering', () => {
  it('renders an input element', () => {
    render(<ShortTextInput value="" onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId('short-text-input')).toBeInTheDocument()
  })

  it('uses the correct input type from settings', () => {
    const question = makeQuestion({ settings: makeSettings({ input_type: 'email' }) })
    render(<ShortTextInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('short-text-input')).toHaveAttribute('type', 'email')
  })

  it('uses url input type from settings', () => {
    const question = makeQuestion({ settings: makeSettings({ input_type: 'url' }) })
    render(<ShortTextInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('short-text-input')).toHaveAttribute('type', 'url')
  })

  it('uses tel input type from settings', () => {
    const question = makeQuestion({ settings: makeSettings({ input_type: 'tel' }) })
    render(<ShortTextInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('short-text-input')).toHaveAttribute('type', 'tel')
  })

  it('shows placeholder text', () => {
    const question = makeQuestion({ settings: makeSettings({ placeholder: 'Enter your name' }) })
    render(<ShortTextInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('short-text-input')).toHaveAttribute('placeholder', 'Enter your name')
  })

  it('reflects the current value', () => {
    const question = makeQuestion({ settings: makeSettings() })
    render(<ShortTextInput value="Hello" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('short-text-input')).toHaveValue('Hello')
  })

  it('renders container with question id in testid', () => {
    const question = makeQuestion({ id: 'q-abc' })
    render(<ShortTextInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('short-text-input-q-abc')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Character counter
// ---------------------------------------------------------------------------

describe('ShortTextInput — character counter', () => {
  it('shows counter when max_length is set', () => {
    const question = makeQuestion({ settings: makeSettings({ max_length: 100 }) })
    render(<ShortTextInput value="Hello" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('short-text-char-counter')).toHaveTextContent('5/100')
  })

  it('does not show counter when settings has no max_length (undefined)', () => {
    // Cast to Partial so max_length is undefined → counter hidden
    const question = makeQuestion({
      settings: { placeholder: null, input_type: 'text' } as ShortTextSettings,
    })
    render(<ShortTextInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('short-text-char-counter')).not.toBeInTheDocument()
  })

  it('updates counter when value changes', async () => {
    const user = userEvent.setup()
    let currentValue = 'Hi'
    const onChange = vi.fn((v: string) => {
      currentValue = v
    })

    const question = makeQuestion({ settings: makeSettings({ max_length: 50 }) })
    const { rerender } = render(
      <ShortTextInput value={currentValue} onChange={onChange} question={question} />
    )

    await act(async () => {
      await user.type(screen.getByTestId('short-text-input'), '!')
    })

    rerender(<ShortTextInput value="Hi!" onChange={onChange} question={question} />)
    expect(screen.getByTestId('short-text-char-counter')).toHaveTextContent('3/50')
  })
})

// ---------------------------------------------------------------------------
// onChange callback
// ---------------------------------------------------------------------------

describe('ShortTextInput — onChange', () => {
  it('calls onChange with new value when user types', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const question = makeQuestion({ settings: makeSettings() })

    render(<ShortTextInput value="" onChange={onChange} question={question} />)

    await act(async () => {
      await user.type(screen.getByTestId('short-text-input'), 'abc')
    })

    expect(onChange).toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledWith('a')
  })
})

// ---------------------------------------------------------------------------
// Required validation
// ---------------------------------------------------------------------------

describe('ShortTextInput — required validation', () => {
  it('shows required error on blur when field is empty and required', async () => {
    const user = userEvent.setup()
    const question = makeQuestion({ is_required: true, settings: makeSettings() })

    render(<ShortTextInput value="" onChange={vi.fn()} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('short-text-input'))
      await user.tab()
    })

    const errors = await screen.findByTestId('validation-errors')
    expect(errors).toHaveTextContent('This field is required.')
  })

  it('does not show required error when not required', async () => {
    const user = userEvent.setup()
    const question = makeQuestion({ is_required: false, settings: makeSettings() })

    render(<ShortTextInput value="" onChange={vi.fn()} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('short-text-input'))
      await user.tab()
    })

    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })

  it('does not show required error before blur (untouched)', () => {
    const question = makeQuestion({ is_required: true, settings: makeSettings() })
    render(<ShortTextInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Email validation
// ---------------------------------------------------------------------------

describe('ShortTextInput — email validation', () => {
  it('shows error for invalid email on blur', async () => {
    const user = userEvent.setup()
    const question = makeQuestion({ settings: makeSettings({ input_type: 'email' }) })

    render(<ShortTextInput value="not-an-email" onChange={vi.fn()} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('short-text-input'))
      await user.tab()
    })

    const errors = await screen.findByTestId('validation-errors')
    expect(errors).toHaveTextContent('valid email address')
  })

  it('does not show error for valid email on blur', async () => {
    const user = userEvent.setup()
    const question = makeQuestion({ settings: makeSettings({ input_type: 'email' }) })

    render(<ShortTextInput value="user@example.com" onChange={vi.fn()} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('short-text-input'))
      await user.tab()
    })

    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

describe('ShortTextInput — URL validation', () => {
  it('shows error for invalid URL on blur', async () => {
    const user = userEvent.setup()
    const question = makeQuestion({ settings: makeSettings({ input_type: 'url' }) })

    render(<ShortTextInput value="not-a-url" onChange={vi.fn()} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('short-text-input'))
      await user.tab()
    })

    const errors = await screen.findByTestId('validation-errors')
    expect(errors).toHaveTextContent('valid URL')
  })

  it('does not show error for valid https URL', async () => {
    const user = userEvent.setup()
    const question = makeQuestion({ settings: makeSettings({ input_type: 'url' }) })

    render(<ShortTextInput value="https://example.com" onChange={vi.fn()} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('short-text-input'))
      await user.tab()
    })

    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })

  it('does not show error for valid http URL', async () => {
    const user = userEvent.setup()
    const question = makeQuestion({ settings: makeSettings({ input_type: 'url' }) })

    render(<ShortTextInput value="http://example.com" onChange={vi.fn()} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('short-text-input'))
      await user.tab()
    })

    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// max_length validation
// ---------------------------------------------------------------------------

describe('ShortTextInput — max_length validation', () => {
  it('shows error when value exceeds max_length on blur', async () => {
    const user = userEvent.setup()
    const question = makeQuestion({ settings: makeSettings({ max_length: 5 }) })

    render(<ShortTextInput value="toolongvalue" onChange={vi.fn()} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('short-text-input'))
      await user.tab()
    })

    const errors = await screen.findByTestId('validation-errors')
    expect(errors).toHaveTextContent('5 characters')
  })
})

// ---------------------------------------------------------------------------
// External errors prop
// ---------------------------------------------------------------------------

describe('ShortTextInput — external errors prop', () => {
  it('displays external errors when provided', () => {
    const question = makeQuestion({ settings: makeSettings() })
    render(
      <ShortTextInput
        value=""
        onChange={vi.fn()}
        question={question}
        errors={['Server error occurred']}
      />
    )
    expect(screen.getByTestId('validation-errors')).toHaveTextContent('Server error occurred')
  })
})

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('ShortTextInput — accessibility', () => {
  it('does not set aria-invalid when there are no errors', () => {
    const question = makeQuestion({ settings: makeSettings() })
    render(<ShortTextInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('short-text-input')).toHaveAttribute('aria-invalid', 'false')
  })

  it('sets aria-invalid=true when there are errors', async () => {
    const question = makeQuestion({ settings: makeSettings() })
    render(<ShortTextInput value="" onChange={vi.fn()} question={question} errors={['Required']} />)
    expect(screen.getByTestId('short-text-input')).toHaveAttribute('aria-invalid', 'true')
  })

  it('sets aria-describedby pointing to error container when there are errors', async () => {
    const question = makeQuestion({ id: 'q-test', settings: makeSettings() })
    render(<ShortTextInput value="" onChange={vi.fn()} question={question} errors={['Required']} />)
    const input = screen.getByTestId('short-text-input')
    expect(input).toHaveAttribute('aria-describedby', 'question-q-test-error')
    expect(screen.getByTestId('validation-errors')).toHaveAttribute('id', 'question-q-test-error')
  })
})
