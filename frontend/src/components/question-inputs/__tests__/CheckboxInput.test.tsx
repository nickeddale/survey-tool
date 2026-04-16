/**
 * Tests for CheckboxInput component.
 *
 * Covers: rendering, multi-select, column grid classes, Select All toggle,
 * Other field show/hide, min/max_choices validation, onChange callbacks,
 * required validation, external errors, accessibility attributes.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckboxInput } from '../CheckboxInput'
import type { BuilderQuestion } from '../../../store/builderStore'
import { getDefaultSettings } from '../../../types/questionSettings'
import type { CheckboxSettings } from '../../../types/questionSettings'
import type { AnswerOptionResponse } from '../../../types/survey'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOption(overrides: Partial<AnswerOptionResponse> = {}): AnswerOptionResponse {
  return {
    id: 'opt-1',
    question_id: 'q-cb-1',
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
    id: 'q-cb-1',
    group_id: 'g-1',
    parent_id: null,
    question_type: 'multiple_choice',
    code: 'Q1',
    title: 'Pick multiple',
    description: null,
    is_required: false,
    sort_order: 1,
    relevance: null,
    validation: null,
    settings: getDefaultSettings('multiple_choice'),
    created_at: '2024-01-01T00:00:00Z',
    answer_options: [],
    subquestions: [],
    ...overrides,
  }
}

function makeSettings(overrides: Partial<CheckboxSettings> = {}): CheckboxSettings {
  return {
    min_choices: null,
    max_choices: null,
    has_other: false,
    other_text: 'Other',
    randomize: false,
    columns: 1,
    select_all: false,
    select_all_text: 'Select all',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('CheckboxInput — rendering', () => {
  it('renders container with question id in testid', () => {
    render(<CheckboxInput value={[]} onChange={vi.fn()} question={makeQuestion({ id: 'q-abc' })} />)
    expect(screen.getByTestId('checkbox-input-q-abc')).toBeInTheDocument()
  })

  it('renders checkboxes for each answer option', () => {
    const options = [
      makeOption({ id: 'opt-1', title: 'Option A' }),
      makeOption({ id: 'opt-2', title: 'Option B' }),
    ]
    const question = makeQuestion({ answer_options: options })
    render(<CheckboxInput value={[]} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('checkbox-input-opt-1')).toBeInTheDocument()
    expect(screen.getByTestId('checkbox-input-opt-2')).toBeInTheDocument()
    expect(screen.getByText('Option A')).toBeInTheDocument()
    expect(screen.getByText('Option B')).toBeInTheDocument()
  })

  it('renders options grid', () => {
    const question = makeQuestion()
    render(<CheckboxInput value={[]} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('checkbox-options-grid')).toBeInTheDocument()
  })

  it('applies columns CSS grid style', () => {
    const question = makeQuestion({ settings: makeSettings({ columns: 3 }) })
    render(<CheckboxInput value={[]} onChange={vi.fn()} question={question} />)
    const grid = screen.getByTestId('checkbox-options-grid')
    expect(grid).toHaveStyle({ gridTemplateColumns: 'repeat(3, 1fr)' })
  })

  it('marks selected checkboxes as checked', () => {
    const options = [
      makeOption({ id: 'opt-1', title: 'A' }),
      makeOption({ id: 'opt-2', title: 'B' }),
    ]
    const question = makeQuestion({ answer_options: options })
    render(<CheckboxInput value={['opt-1']} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('checkbox-input-opt-1')).toBeChecked()
    expect(screen.getByTestId('checkbox-input-opt-2')).not.toBeChecked()
  })

  it('does not show Select All when select_all is false', () => {
    const question = makeQuestion({ settings: makeSettings({ select_all: false }) })
    render(<CheckboxInput value={[]} onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('checkbox-select-all')).not.toBeInTheDocument()
  })

  it('shows Select All when select_all is true', () => {
    const question = makeQuestion({ settings: makeSettings({ select_all: true }) })
    render(<CheckboxInput value={[]} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('checkbox-select-all')).toBeInTheDocument()
    expect(screen.getByText('Select all')).toBeInTheDocument()
  })

  it('uses custom select_all_text', () => {
    const question = makeQuestion({
      settings: makeSettings({ select_all: true, select_all_text: 'Check all' }),
    })
    render(<CheckboxInput value={[]} onChange={vi.fn()} question={question} />)
    expect(screen.getByText('Check all')).toBeInTheDocument()
  })

  it('does not show Other option when has_other is false', () => {
    const question = makeQuestion({ settings: makeSettings({ has_other: false }) })
    render(<CheckboxInput value={[]} onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('checkbox-option-other')).not.toBeInTheDocument()
  })

  it('shows Other option when has_other is true', () => {
    const question = makeQuestion({ settings: makeSettings({ has_other: true }) })
    render(<CheckboxInput value={[]} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('checkbox-option-other')).toBeInTheDocument()
    expect(screen.getByText('Other')).toBeInTheDocument()
  })

  it('uses custom other_text label', () => {
    const question = makeQuestion({
      settings: makeSettings({ has_other: true, other_text: 'Specify' }),
    })
    render(<CheckboxInput value={[]} onChange={vi.fn()} question={question} />)
    expect(screen.getByText('Specify')).toBeInTheDocument()
  })

  it('does not show Other text input when Other not selected', () => {
    const question = makeQuestion({ settings: makeSettings({ has_other: true }) })
    render(<CheckboxInput value={[]} onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('checkbox-other-text')).not.toBeInTheDocument()
  })

  it('shows Other text input when Other is selected', () => {
    const question = makeQuestion({ settings: makeSettings({ has_other: true }) })
    render(<CheckboxInput value={['__other__']} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('checkbox-other-text')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// onChange callback
// ---------------------------------------------------------------------------

describe('CheckboxInput — onChange', () => {
  it('calls onChange with added option when checkbox is checked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const options = [makeOption({ id: 'opt-1', title: 'A' })]
    const question = makeQuestion({ answer_options: options })
    render(<CheckboxInput value={[]} onChange={onChange} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('checkbox-input-opt-1'))
    })

    expect(onChange).toHaveBeenCalledWith(['opt-1'])
  })

  it('calls onChange with option removed when checkbox is unchecked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const options = [makeOption({ id: 'opt-1', title: 'A' })]
    const question = makeQuestion({ answer_options: options })
    render(<CheckboxInput value={['opt-1']} onChange={onChange} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('checkbox-input-opt-1'))
    })

    expect(onChange).toHaveBeenCalledWith([])
  })

  it('supports multiple selections', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const options = [
      makeOption({ id: 'opt-1', title: 'A' }),
      makeOption({ id: 'opt-2', title: 'B' }),
    ]
    const question = makeQuestion({ answer_options: options })
    render(<CheckboxInput value={['opt-1']} onChange={onChange} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('checkbox-input-opt-2'))
    })

    expect(onChange).toHaveBeenCalledWith(['opt-1', 'opt-2'])
  })

  it('calls onChange with __other__ when Other is checked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const question = makeQuestion({ settings: makeSettings({ has_other: true }) })
    render(<CheckboxInput value={[]} onChange={onChange} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('checkbox-input-other'))
    })

    expect(onChange).toHaveBeenCalledWith(['__other__'])
  })
})

// ---------------------------------------------------------------------------
// Select All
// ---------------------------------------------------------------------------

describe('CheckboxInput — Select All', () => {
  it('checks all options when Select All is checked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const options = [
      makeOption({ id: 'opt-1', title: 'A' }),
      makeOption({ id: 'opt-2', title: 'B' }),
    ]
    const question = makeQuestion({
      settings: makeSettings({ select_all: true }),
      answer_options: options,
    })
    render(<CheckboxInput value={[]} onChange={onChange} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('checkbox-select-all'))
    })

    expect(onChange).toHaveBeenCalledWith(['opt-1', 'opt-2'])
  })

  it('unchecks all options when Select All is unchecked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const options = [
      makeOption({ id: 'opt-1', title: 'A' }),
      makeOption({ id: 'opt-2', title: 'B' }),
    ]
    const question = makeQuestion({
      settings: makeSettings({ select_all: true }),
      answer_options: options,
    })
    render(<CheckboxInput value={['opt-1', 'opt-2']} onChange={onChange} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('checkbox-select-all'))
    })

    expect(onChange).toHaveBeenCalledWith([])
  })

  it('marks Select All as checked when all options are selected', () => {
    const options = [
      makeOption({ id: 'opt-1', title: 'A' }),
      makeOption({ id: 'opt-2', title: 'B' }),
    ]
    const question = makeQuestion({
      settings: makeSettings({ select_all: true }),
      answer_options: options,
    })
    render(<CheckboxInput value={['opt-1', 'opt-2']} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('checkbox-select-all')).toBeChecked()
  })

  it('does not mark Select All as checked when only some options are selected', () => {
    const options = [
      makeOption({ id: 'opt-1', title: 'A' }),
      makeOption({ id: 'opt-2', title: 'B' }),
    ]
    const question = makeQuestion({
      settings: makeSettings({ select_all: true }),
      answer_options: options,
    })
    render(<CheckboxInput value={['opt-1']} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('checkbox-select-all')).not.toBeChecked()
  })

  it('preserves Other selection when Select All is toggled', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const options = [makeOption({ id: 'opt-1', title: 'A' })]
    const question = makeQuestion({
      settings: makeSettings({ select_all: true, has_other: true }),
      answer_options: options,
    })
    render(<CheckboxInput value={['__other__']} onChange={onChange} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('checkbox-select-all'))
    })

    const called = onChange.mock.calls[0][0] as string[]
    expect(called).toContain('opt-1')
    expect(called).toContain('__other__')
  })
})

// ---------------------------------------------------------------------------
// Randomize
// ---------------------------------------------------------------------------

describe('CheckboxInput — randomize', () => {
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
    render(<CheckboxInput value={[]} onChange={vi.fn()} question={question} />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Validation — required
// ---------------------------------------------------------------------------

describe('CheckboxInput — required validation', () => {
  it('does not show errors before blur (untouched)', () => {
    const question = makeQuestion({ is_required: true })
    render(<CheckboxInput value={[]} onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })

  it('shows required error on blur when nothing selected', () => {
    const question = makeQuestion({ is_required: true })
    render(<CheckboxInput value={[]} onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('checkbox-input-q-cb-1'))

    expect(screen.getByTestId('validation-errors')).toHaveTextContent('This field is required.')
  })

  it('does not show required error when not required', () => {
    const question = makeQuestion({ is_required: false })
    render(<CheckboxInput value={[]} onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('checkbox-input-q-cb-1'))

    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })

  it('shows Other text required error when Other selected but no text', () => {
    const question = makeQuestion({ settings: makeSettings({ has_other: true }) })
    render(<CheckboxInput value={['__other__']} onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('checkbox-input-q-cb-1'))

    expect(screen.getByTestId('validation-errors')).toHaveTextContent('"Other"')
  })
})

// ---------------------------------------------------------------------------
// Validation — min/max_choices
// ---------------------------------------------------------------------------

describe('CheckboxInput — min/max_choices validation', () => {
  it('shows error when fewer than min_choices selected on blur', () => {
    const options = [
      makeOption({ id: 'opt-1', title: 'A' }),
      makeOption({ id: 'opt-2', title: 'B' }),
      makeOption({ id: 'opt-3', title: 'C' }),
    ]
    const question = makeQuestion({
      settings: makeSettings({ min_choices: 2 }),
      answer_options: options,
    })
    render(<CheckboxInput value={['opt-1']} onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('checkbox-input-q-cb-1'))

    expect(screen.getByTestId('validation-errors')).toHaveTextContent('at least 2')
  })

  it('shows error when more than max_choices selected on blur', () => {
    const options = [
      makeOption({ id: 'opt-1', title: 'A' }),
      makeOption({ id: 'opt-2', title: 'B' }),
      makeOption({ id: 'opt-3', title: 'C' }),
    ]
    const question = makeQuestion({
      settings: makeSettings({ max_choices: 2 }),
      answer_options: options,
    })
    render(
      <CheckboxInput value={['opt-1', 'opt-2', 'opt-3']} onChange={vi.fn()} question={question} />
    )

    fireEvent.blur(screen.getByTestId('checkbox-input-q-cb-1'))

    expect(screen.getByTestId('validation-errors')).toHaveTextContent('at most 2')
  })

  it('does not show min_choices error when nothing selected yet', () => {
    const options = [makeOption({ id: 'opt-1', title: 'A' })]
    const question = makeQuestion({
      settings: makeSettings({ min_choices: 2 }),
      answer_options: options,
    })
    render(<CheckboxInput value={[]} onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('checkbox-input-q-cb-1'))

    // No error since count is 0 (nothing selected, not required)
    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// External errors prop
// ---------------------------------------------------------------------------

describe('CheckboxInput — external errors prop', () => {
  it('displays external errors immediately without blur', () => {
    const question = makeQuestion()
    render(
      <CheckboxInput
        value={[]}
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

describe('CheckboxInput — accessibility', () => {
  it('does not set aria-invalid when no errors', () => {
    const question = makeQuestion()
    render(<CheckboxInput value={[]} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('checkbox-options-grid')).toHaveAttribute('aria-invalid', 'false')
  })

  it('sets aria-invalid=true when errors present', () => {
    const question = makeQuestion()
    render(
      <CheckboxInput value={[]} onChange={vi.fn()} question={question} errors={['Required']} />
    )
    expect(screen.getByTestId('checkbox-options-grid')).toHaveAttribute('aria-invalid', 'true')
  })

  it('sets aria-describedby pointing to error container when errors present', () => {
    const question = makeQuestion({ id: 'q-test' })
    render(
      <CheckboxInput value={[]} onChange={vi.fn()} question={question} errors={['Required']} />
    )
    const grid = screen.getByTestId('checkbox-options-grid')
    expect(grid).toHaveAttribute('aria-describedby', 'question-q-test-error')
    expect(screen.getByTestId('validation-errors')).toHaveAttribute('id', 'question-q-test-error')
  })
})
