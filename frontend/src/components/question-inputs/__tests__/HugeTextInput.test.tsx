/**
 * Tests for HugeTextInput component.
 *
 * Covers: rendering (plain textarea and rich text mode), character counter
 * (with HTML stripping), required validation, max_length validation,
 * accessibility.
 *
 * The RichTextEditor (Tiptap) is mocked to avoid jsdom incompatibilities.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HugeTextInput, stripHtml } from '../HugeTextInput'
import type { BuilderQuestion } from '../../../store/builderStore'
import { getDefaultSettings } from '../../../types/questionSettings'
import type { HugeTextSettings } from '../../../types/questionSettings'

// ---------------------------------------------------------------------------
// Mock RichTextEditor to avoid Tiptap jsdom issues
// ---------------------------------------------------------------------------

vi.mock('../RichTextEditor', () => ({
  RichTextEditor: ({
    value,
    onChange,
    onBlur,
    hasErrors,
    editorId,
    errorId,
  }: {
    value: string
    onChange: (html: string) => void
    onBlur: () => void
    hasErrors: boolean
    editorId: string
    errorId?: string
  }) => (
    <div data-testid="rich-text-editor">
      <textarea
        data-testid="rich-text-inner"
        value={value}
        id={editorId}
        aria-invalid={hasErrors}
        aria-describedby={errorId}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </div>
  ),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuestion(overrides: Partial<BuilderQuestion> = {}): BuilderQuestion {
  return {
    id: 'q-huge-1',
    group_id: 'g-1',
    parent_id: null,
    question_type: 'huge_text',
    code: 'Q3',
    title: 'Detailed description',
    description: null,
    is_required: false,
    sort_order: 1,
    relevance: null,
    validation: null,
    settings: getDefaultSettings('huge_text'),
    created_at: '2024-01-01T00:00:00Z',
    answer_options: [],
    subquestions: [],
    ...overrides,
  }
}

function makeSettings(overrides: Partial<HugeTextSettings> = {}): HugeTextSettings {
  return {
    placeholder: null,
    max_length: 50000,
    rows: 10,
    rich_text: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// stripHtml utility
// ---------------------------------------------------------------------------

describe('stripHtml utility', () => {
  it('strips HTML tags from a string', () => {
    expect(stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world')
  })

  it('returns empty string for empty input', () => {
    expect(stripHtml('')).toBe('')
  })

  it('returns plain text unchanged', () => {
    expect(stripHtml('Plain text')).toBe('Plain text')
  })

  it('handles nested tags', () => {
    expect(stripHtml('<div><p><em>text</em></p></div>')).toBe('text')
  })
})

// ---------------------------------------------------------------------------
// Rendering — plain textarea mode (rich_text=false)
// ---------------------------------------------------------------------------

describe('HugeTextInput — plain textarea mode', () => {
  it('renders a textarea when rich_text is false', () => {
    render(<HugeTextInput value="" onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId('huge-text-textarea')).toBeInTheDocument()
    expect(screen.queryByTestId('rich-text-editor')).not.toBeInTheDocument()
  })

  it('uses configured rows', () => {
    const question = makeQuestion({ settings: makeSettings({ rows: 8 }) })
    render(<HugeTextInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('huge-text-textarea')).toHaveAttribute('rows', '8')
  })

  it('defaults to 10 rows', () => {
    render(<HugeTextInput value="" onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId('huge-text-textarea')).toHaveAttribute('rows', '10')
  })

  it('shows placeholder text', () => {
    const question = makeQuestion({ settings: makeSettings({ placeholder: 'Write in detail...' }) })
    render(<HugeTextInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('huge-text-textarea')).toHaveAttribute('placeholder', 'Write in detail...')
  })

  it('reflects the current value', () => {
    const question = makeQuestion({ settings: makeSettings() })
    render(<HugeTextInput value="My huge text" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('huge-text-textarea')).toHaveValue('My huge text')
  })

  it('renders container with question id in testid', () => {
    const question = makeQuestion({ id: 'q-huge-xyz' })
    render(<HugeTextInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('huge-text-input-q-huge-xyz')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Rendering — rich text mode (rich_text=true)
// ---------------------------------------------------------------------------

describe('HugeTextInput — rich text mode', () => {
  it('renders the rich text editor when rich_text is true', () => {
    const question = makeQuestion({ settings: makeSettings({ rich_text: true }) })
    render(<HugeTextInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('rich-text-editor')).toBeInTheDocument()
    expect(screen.queryByTestId('huge-text-textarea')).not.toBeInTheDocument()
  })

  it('passes HTML value to the rich text editor', () => {
    const question = makeQuestion({ settings: makeSettings({ rich_text: true }) })
    render(<HugeTextInput value="<p>Hello</p>" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('rich-text-inner')).toHaveValue('<p>Hello</p>')
  })
})

// ---------------------------------------------------------------------------
// Character counter
// ---------------------------------------------------------------------------

describe('HugeTextInput — character counter', () => {
  it('shows counter for plain text', () => {
    const question = makeQuestion({ settings: makeSettings({ max_length: 1000 }) })
    render(<HugeTextInput value="Hello" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('huge-text-char-counter')).toHaveTextContent('5/1000')
  })

  it('shows 0/max when value is empty', () => {
    const question = makeQuestion({ settings: makeSettings({ max_length: 1000 }) })
    render(<HugeTextInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('huge-text-char-counter')).toHaveTextContent('0/1000')
  })

  it('does not show counter when max_length is undefined (no key in settings)', () => {
    const question = makeQuestion({ settings: { placeholder: null, rows: 10, rich_text: false } as HugeTextSettings })
    render(<HugeTextInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('huge-text-char-counter')).not.toBeInTheDocument()
  })

  it('strips HTML tags for character count in rich text mode', () => {
    const question = makeQuestion({ settings: makeSettings({ rich_text: true, max_length: 1000 }) })
    render(<HugeTextInput value="<p>Hello</p>" onChange={vi.fn()} question={question} />)
    // "Hello" is 5 characters, not the full HTML string length
    expect(screen.getByTestId('huge-text-char-counter')).toHaveTextContent('5/1000')
  })

  it('updates counter when textarea value changes', async () => {
    const user = userEvent.setup()
    let val = ''
    const onChange = vi.fn((v: string) => { val = v })
    const question = makeQuestion({ settings: makeSettings({ max_length: 200 }) })
    const { rerender } = render(
      <HugeTextInput value={val} onChange={onChange} question={question} />
    )

    await act(async () => {
      await user.type(screen.getByTestId('huge-text-textarea'), 'Hi')
    })

    rerender(<HugeTextInput value="Hi" onChange={onChange} question={question} />)
    expect(screen.getByTestId('huge-text-char-counter')).toHaveTextContent('2/200')
  })
})

// ---------------------------------------------------------------------------
// onChange callback
// ---------------------------------------------------------------------------

describe('HugeTextInput — onChange', () => {
  it('calls onChange when user types in textarea', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const question = makeQuestion({ settings: makeSettings() })

    render(<HugeTextInput value="" onChange={onChange} question={question} />)

    await act(async () => {
      await user.type(screen.getByTestId('huge-text-textarea'), 'A')
    })

    expect(onChange).toHaveBeenCalledWith('A')
  })
})

// ---------------------------------------------------------------------------
// Required validation — plain textarea
// ---------------------------------------------------------------------------

describe('HugeTextInput — required validation', () => {
  it('shows required error on blur when empty and required', async () => {
    const user = userEvent.setup()
    const question = makeQuestion({ is_required: true, settings: makeSettings() })

    render(<HugeTextInput value="" onChange={vi.fn()} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('huge-text-textarea'))
      await user.tab()
    })

    const errors = await screen.findByTestId('huge-text-errors')
    expect(errors).toHaveTextContent('This field is required.')
  })

  it('does not show error when not required', async () => {
    const user = userEvent.setup()
    const question = makeQuestion({ is_required: false, settings: makeSettings() })

    render(<HugeTextInput value="" onChange={vi.fn()} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('huge-text-textarea'))
      await user.tab()
    })

    expect(screen.queryByTestId('huge-text-errors')).not.toBeInTheDocument()
  })

  it('does not show error before blur', () => {
    const question = makeQuestion({ is_required: true, settings: makeSettings() })
    render(<HugeTextInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('huge-text-errors')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Required validation — rich text mode
// ---------------------------------------------------------------------------

describe('HugeTextInput — required validation in rich text mode', () => {
  it('shows required error when rich text is empty on blur', async () => {
    const user = userEvent.setup()
    const question = makeQuestion({ is_required: true, settings: makeSettings({ rich_text: true }) })

    render(<HugeTextInput value="" onChange={vi.fn()} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('rich-text-inner'))
      await user.tab()
    })

    const errors = await screen.findByTestId('huge-text-errors')
    expect(errors).toHaveTextContent('This field is required.')
  })
})

// ---------------------------------------------------------------------------
// max_length validation
// ---------------------------------------------------------------------------

describe('HugeTextInput — max_length validation', () => {
  it('shows error when value exceeds max_length on blur', async () => {
    const user = userEvent.setup()
    const question = makeQuestion({ settings: makeSettings({ max_length: 5 }) })

    render(<HugeTextInput value="This is way too long" onChange={vi.fn()} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('huge-text-textarea'))
      await user.tab()
    })

    const errors = await screen.findByTestId('huge-text-errors')
    expect(errors).toHaveTextContent('5 characters')
  })
})

// ---------------------------------------------------------------------------
// External errors prop
// ---------------------------------------------------------------------------

describe('HugeTextInput — external errors', () => {
  it('displays external errors when provided', () => {
    const question = makeQuestion({ settings: makeSettings() })
    render(
      <HugeTextInput value="" onChange={vi.fn()} question={question} errors={['Server validation failed']} />
    )
    expect(screen.getByTestId('huge-text-errors')).toHaveTextContent('Server validation failed')
  })
})

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('HugeTextInput — accessibility', () => {
  it('does not set aria-invalid when no errors', () => {
    const question = makeQuestion({ settings: makeSettings() })
    render(<HugeTextInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('huge-text-textarea')).toHaveAttribute('aria-invalid', 'false')
  })

  it('sets aria-invalid=true when errors exist', () => {
    const question = makeQuestion({ settings: makeSettings() })
    render(
      <HugeTextInput value="" onChange={vi.fn()} question={question} errors={['Required']} />
    )
    expect(screen.getByTestId('huge-text-textarea')).toHaveAttribute('aria-invalid', 'true')
  })

  it('sets aria-describedby pointing to error container', () => {
    const question = makeQuestion({ id: 'q-huge-abc', settings: makeSettings() })
    render(
      <HugeTextInput value="" onChange={vi.fn()} question={question} errors={['Required']} />
    )
    const textarea = screen.getByTestId('huge-text-textarea')
    expect(textarea).toHaveAttribute('aria-describedby', 'question-q-huge-abc-error')
    expect(screen.getByTestId('huge-text-errors')).toHaveAttribute('id', 'question-q-huge-abc-error')
  })
})
