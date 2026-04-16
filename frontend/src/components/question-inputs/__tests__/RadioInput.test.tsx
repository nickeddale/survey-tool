/**
 * Tests for RadioInput component.
 *
 * Covers: rendering, option display, column grid, Other field show/hide,
 * onChange callbacks, required validation, randomize, external errors, accessibility.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RadioInput } from '../RadioInput'
import type { BuilderQuestion } from '../../../store/builderStore'
import { getDefaultSettings } from '../../../types/questionSettings'
import type { RadioSettings } from '../../../types/questionSettings'
import type { AnswerOptionResponse } from '../../../types/survey'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOption(overrides: Partial<AnswerOptionResponse> = {}): AnswerOptionResponse {
  return {
    id: 'opt-1',
    question_id: 'q-radio-1',
    code: 'O1',
    title: 'Option 1',
    sort_order: 1,
    assessment_value: 0,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeQuestion(overrides: Partial<BuilderQuestion> = {}): BuilderQuestion {
  return {
    id: 'q-radio-1',
    group_id: 'g-1',
    parent_id: null,
    question_type: 'single_choice',
    code: 'Q1',
    title: 'Pick one',
    description: null,
    is_required: false,
    sort_order: 1,
    relevance: null,
    validation: null,
    settings: getDefaultSettings('single_choice'),
    created_at: '2024-01-01T00:00:00Z',
    answer_options: [],
    subquestions: [],
    ...overrides,
  }
}

function makeSettings(overrides: Partial<RadioSettings> = {}): RadioSettings {
  return {
    has_other: false,
    other_text: 'Other',
    randomize: false,
    columns: 1,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('RadioInput — rendering', () => {
  it('renders container with question id in testid', () => {
    render(<RadioInput value="" onChange={vi.fn()} question={makeQuestion({ id: 'q-abc' })} />)
    expect(screen.getByTestId('radio-input-q-abc')).toBeInTheDocument()
  })

  it('renders radio buttons for each answer option', () => {
    const options = [
      makeOption({ id: 'opt-1', title: 'Option A' }),
      makeOption({ id: 'opt-2', title: 'Option B' }),
    ]
    const question = makeQuestion({ answer_options: options })
    render(<RadioInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('radio-input-opt-1')).toBeInTheDocument()
    expect(screen.getByTestId('radio-input-opt-2')).toBeInTheDocument()
    expect(screen.getByText('Option A')).toBeInTheDocument()
    expect(screen.getByText('Option B')).toBeInTheDocument()
  })

  it('renders options grid', () => {
    const question = makeQuestion()
    render(<RadioInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('radio-options-grid')).toBeInTheDocument()
  })

  it('applies columns CSS grid style', () => {
    const question = makeQuestion({ settings: makeSettings({ columns: 3 }) })
    render(<RadioInput value="" onChange={vi.fn()} question={question} />)
    const grid = screen.getByTestId('radio-options-grid')
    expect(grid).toHaveStyle({ gridTemplateColumns: 'repeat(3, 1fr)' })
  })

  it('does not show Other field when has_other is false', () => {
    const question = makeQuestion({ settings: makeSettings({ has_other: false }) })
    render(<RadioInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('radio-option-other')).not.toBeInTheDocument()
  })

  it('shows Other radio option when has_other is true', () => {
    const question = makeQuestion({ settings: makeSettings({ has_other: true }) })
    render(<RadioInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('radio-option-other')).toBeInTheDocument()
    expect(screen.getByText('Other')).toBeInTheDocument()
  })

  it('uses custom other_text label', () => {
    const question = makeQuestion({
      settings: makeSettings({ has_other: true, other_text: 'Specify' }),
    })
    render(<RadioInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByText('Specify')).toBeInTheDocument()
  })

  it('does not show Other text input when Other option is not selected', () => {
    const question = makeQuestion({ settings: makeSettings({ has_other: true }) })
    render(<RadioInput value="opt-1" onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('radio-other-text')).not.toBeInTheDocument()
  })

  it('shows Other text input when Other option is selected', () => {
    const question = makeQuestion({ settings: makeSettings({ has_other: true }) })
    render(<RadioInput value="__other__" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('radio-other-text')).toBeInTheDocument()
  })

  it('marks the selected radio option as checked', () => {
    const options = [
      makeOption({ id: 'opt-1', code: 'O1', title: 'A' }),
      makeOption({ id: 'opt-2', code: 'O2', title: 'B' }),
    ]
    const question = makeQuestion({ answer_options: options })
    render(<RadioInput value="O1" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('radio-input-opt-1')).toBeChecked()
    expect(screen.getByTestId('radio-input-opt-2')).not.toBeChecked()
  })
})

// ---------------------------------------------------------------------------
// onChange callback
// ---------------------------------------------------------------------------

describe('RadioInput — onChange', () => {
  it('calls onChange with option code when radio is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const options = [makeOption({ id: 'opt-1', code: 'O1', title: 'A' })]
    const question = makeQuestion({ answer_options: options })
    render(<RadioInput value="" onChange={onChange} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('radio-input-opt-1'))
    })

    expect(onChange).toHaveBeenCalledWith('O1')
  })

  it('calls onChange with __other__ when Other is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const question = makeQuestion({ settings: makeSettings({ has_other: true }) })
    render(<RadioInput value="" onChange={onChange} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('radio-input-other'))
    })

    expect(onChange).toHaveBeenCalledWith('__other__')
  })

  it('calls onChange when Other text is typed (keeps __other__ value)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const question = makeQuestion({ settings: makeSettings({ has_other: true }) })
    render(<RadioInput value="__other__" onChange={onChange} question={question} />)

    await act(async () => {
      await user.type(screen.getByTestId('radio-other-text'), 'my answer')
    })

    expect(onChange).toHaveBeenCalledWith('__other__')
  })
})

// ---------------------------------------------------------------------------
// Required validation
// ---------------------------------------------------------------------------

describe('RadioInput — required validation', () => {
  it('does not show errors before blur (untouched)', () => {
    const question = makeQuestion({ is_required: true })
    render(<RadioInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })

  it('shows required error on blur when no option selected', () => {
    const question = makeQuestion({ is_required: true })
    render(<RadioInput value="" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('radio-options-grid'))

    expect(screen.getByTestId('validation-errors')).toHaveTextContent('This field is required.')
  })

  it('does not show required error when not required', () => {
    const question = makeQuestion({ is_required: false })
    render(<RadioInput value="" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('radio-options-grid'))

    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })

  it('shows Other text required error when Other selected but no text', () => {
    const question = makeQuestion({ settings: makeSettings({ has_other: true }) })
    render(<RadioInput value="__other__" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('radio-options-grid'))

    expect(screen.getByTestId('validation-errors')).toHaveTextContent('"Other"')
  })
})

// ---------------------------------------------------------------------------
// Randomize
// ---------------------------------------------------------------------------

describe('RadioInput — randomize', () => {
  it('renders all options even when randomize is true', () => {
    const options = [
      makeOption({ id: 'opt-1', title: 'A' }),
      makeOption({ id: 'opt-2', title: 'B' }),
      makeOption({ id: 'opt-3', title: 'C' }),
    ]
    const question = makeQuestion({
      settings: makeSettings({ randomize: true }),
      answer_options: options,
    })
    render(<RadioInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
  })

  it('renders same order on re-render (session-stable)', () => {
    const options = [
      makeOption({ id: 'opt-1', title: 'A' }),
      makeOption({ id: 'opt-2', title: 'B' }),
      makeOption({ id: 'opt-3', title: 'C' }),
    ]
    const question = makeQuestion({
      id: 'stable-q',
      settings: makeSettings({ randomize: true }),
      answer_options: options,
    })
    const { unmount } = render(<RadioInput value="" onChange={vi.fn()} question={question} />)
    const firstRender = screen.getAllByRole('radio').map((el) => el.getAttribute('value'))
    unmount()
    render(<RadioInput value="" onChange={vi.fn()} question={question} />)
    const secondRender = screen.getAllByRole('radio').map((el) => el.getAttribute('value'))
    expect(firstRender).toEqual(secondRender)
  })
})

// ---------------------------------------------------------------------------
// External errors prop
// ---------------------------------------------------------------------------

describe('RadioInput — external errors prop', () => {
  it('displays external errors immediately without blur', () => {
    const question = makeQuestion()
    render(
      <RadioInput
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

describe('RadioInput — accessibility', () => {
  it('sets role=radiogroup on options grid', () => {
    const question = makeQuestion()
    render(<RadioInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByRole('radiogroup')).toBeInTheDocument()
  })

  it('does not set aria-invalid when no errors', () => {
    const question = makeQuestion()
    render(<RadioInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('radio-options-grid')).toHaveAttribute('aria-invalid', 'false')
  })

  it('sets aria-invalid=true when errors present', () => {
    const question = makeQuestion()
    render(<RadioInput value="" onChange={vi.fn()} question={question} errors={['Required']} />)
    expect(screen.getByTestId('radio-options-grid')).toHaveAttribute('aria-invalid', 'true')
  })

  it('sets aria-describedby pointing to error container when errors present', () => {
    const question = makeQuestion({ id: 'q-test' })
    render(<RadioInput value="" onChange={vi.fn()} question={question} errors={['Required']} />)
    const grid = screen.getByTestId('radio-options-grid')
    expect(grid).toHaveAttribute('aria-describedby', 'question-q-test-error')
    expect(screen.getByTestId('validation-errors')).toHaveAttribute('id', 'question-q-test-error')
  })
})
