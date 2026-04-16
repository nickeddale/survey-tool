/**
 * Tests for DropdownInput component.
 *
 * Covers: rendering, option list, placeholder, searchable filter behavior,
 * Other option show/hide, onChange callbacks, required validation,
 * external errors, accessibility attributes.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DropdownInput } from '../DropdownInput'
import type { BuilderQuestion } from '../../../store/builderStore'
import { getDefaultSettings } from '../../../types/questionSettings'
import type { DropdownSettings } from '../../../types/questionSettings'
import type { AnswerOptionResponse } from '../../../types/survey'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOption(overrides: Partial<AnswerOptionResponse> = {}): AnswerOptionResponse {
  return {
    id: 'opt-1',
    question_id: 'q-dd-1',
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
    id: 'q-dd-1',
    group_id: 'g-1',
    parent_id: null,
    question_type: 'dropdown',
    code: 'Q1',
    title: 'Pick one',
    description: null,
    is_required: false,
    sort_order: 1,
    relevance: null,
    validation: null,
    settings: getDefaultSettings('dropdown'),
    created_at: '2024-01-01T00:00:00Z',
    answer_options: [],
    subquestions: [],
    ...overrides,
  }
}

function makeSettings(overrides: Partial<DropdownSettings> = {}): DropdownSettings {
  return {
    placeholder: 'Select an option',
    searchable: false,
    has_other: false,
    other_text: 'Other',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('DropdownInput — rendering', () => {
  it('renders container with question id in testid', () => {
    render(<DropdownInput value="" onChange={vi.fn()} question={makeQuestion({ id: 'q-abc' })} />)
    expect(screen.getByTestId('dropdown-input-q-abc')).toBeInTheDocument()
  })

  it('renders select element', () => {
    render(<DropdownInput value="" onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId('dropdown-select')).toBeInTheDocument()
  })

  it('renders options for each answer option', () => {
    const options = [
      makeOption({ id: 'opt-1', title: 'Alpha' }),
      makeOption({ id: 'opt-2', title: 'Beta' }),
    ]
    const question = makeQuestion({ answer_options: options })
    render(<DropdownInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('dropdown-option-opt-1')).toBeInTheDocument()
    expect(screen.getByTestId('dropdown-option-opt-2')).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('renders placeholder as first disabled option', () => {
    const question = makeQuestion({ settings: makeSettings({ placeholder: 'Choose...' }) })
    render(<DropdownInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByText('Choose...')).toBeInTheDocument()
  })

  it('does not show Other option when has_other is false', () => {
    const question = makeQuestion({ settings: makeSettings({ has_other: false }) })
    render(<DropdownInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('dropdown-option-other')).not.toBeInTheDocument()
  })

  it('shows Other option when has_other is true', () => {
    const question = makeQuestion({ settings: makeSettings({ has_other: true }) })
    render(<DropdownInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('dropdown-option-other')).toBeInTheDocument()
    expect(screen.getByText('Other')).toBeInTheDocument()
  })

  it('uses custom other_text label', () => {
    const question = makeQuestion({
      settings: makeSettings({ has_other: true, other_text: 'N/A' }),
    })
    render(<DropdownInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByText('N/A')).toBeInTheDocument()
  })

  it('does not show search input when searchable is false', () => {
    const question = makeQuestion({ settings: makeSettings({ searchable: false }) })
    render(<DropdownInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('dropdown-search')).not.toBeInTheDocument()
  })

  it('shows search input when searchable is true', () => {
    const question = makeQuestion({ settings: makeSettings({ searchable: true }) })
    render(<DropdownInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('dropdown-search')).toBeInTheDocument()
  })

  it('does not show Other text input when Other is not selected', () => {
    const question = makeQuestion({ settings: makeSettings({ has_other: true }) })
    render(<DropdownInput value="opt-1" onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('dropdown-other-text')).not.toBeInTheDocument()
  })

  it('shows Other text input when Other option is selected', () => {
    const question = makeQuestion({ settings: makeSettings({ has_other: true }) })
    render(<DropdownInput value="__other__" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('dropdown-other-text')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Searchable filter
// ---------------------------------------------------------------------------

describe('DropdownInput — searchable filter', () => {
  it('filters options based on search query', async () => {
    const user = userEvent.setup()
    const options = [
      makeOption({ id: 'opt-1', title: 'Apple' }),
      makeOption({ id: 'opt-2', title: 'Banana' }),
      makeOption({ id: 'opt-3', title: 'Apricot' }),
    ]
    const question = makeQuestion({
      settings: makeSettings({ searchable: true }),
      answer_options: options,
    })
    render(<DropdownInput value="" onChange={vi.fn()} question={question} />)

    await act(async () => {
      await user.type(screen.getByTestId('dropdown-search'), 'ap')
    })

    expect(screen.queryByTestId('dropdown-option-opt-1')).toBeInTheDocument()
    expect(screen.queryByTestId('dropdown-option-opt-2')).not.toBeInTheDocument()
    expect(screen.queryByTestId('dropdown-option-opt-3')).toBeInTheDocument()
  })

  it('shows all options when search query is empty', async () => {
    const options = [
      makeOption({ id: 'opt-1', title: 'Apple' }),
      makeOption({ id: 'opt-2', title: 'Banana' }),
    ]
    const question = makeQuestion({
      settings: makeSettings({ searchable: true }),
      answer_options: options,
    })
    render(<DropdownInput value="" onChange={vi.fn()} question={question} />)

    expect(screen.getByTestId('dropdown-option-opt-1')).toBeInTheDocument()
    expect(screen.getByTestId('dropdown-option-opt-2')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// onChange callback
// ---------------------------------------------------------------------------

describe('DropdownInput — onChange', () => {
  it('calls onChange with option code when selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const options = [
      makeOption({ id: 'opt-1', code: 'O1', title: 'Alpha' }),
      makeOption({ id: 'opt-2', code: 'O2', title: 'Beta' }),
    ]
    const question = makeQuestion({ answer_options: options })
    render(<DropdownInput value="" onChange={onChange} question={question} />)

    await act(async () => {
      await user.selectOptions(screen.getByTestId('dropdown-select'), 'O1')
    })

    expect(onChange).toHaveBeenCalledWith('O1')
  })

  it('calls onChange with __other__ when Other option is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const question = makeQuestion({ settings: makeSettings({ has_other: true }) })
    render(<DropdownInput value="" onChange={onChange} question={question} />)

    await act(async () => {
      await user.selectOptions(screen.getByTestId('dropdown-select'), '__other__')
    })

    expect(onChange).toHaveBeenCalledWith('__other__')
  })
})

// ---------------------------------------------------------------------------
// Required validation
// ---------------------------------------------------------------------------

describe('DropdownInput — required validation', () => {
  it('does not show errors before blur (untouched)', () => {
    const question = makeQuestion({ is_required: true })
    render(<DropdownInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })

  it('shows required error on blur when nothing selected', () => {
    const question = makeQuestion({ is_required: true })
    render(<DropdownInput value="" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('dropdown-select'))

    expect(screen.getByTestId('validation-errors')).toHaveTextContent('This field is required.')
  })

  it('does not show required error when not required', () => {
    const question = makeQuestion({ is_required: false })
    render(<DropdownInput value="" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('dropdown-select'))

    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })

  it('shows Other text required error when Other selected but no text', () => {
    const question = makeQuestion({ settings: makeSettings({ has_other: true }) })
    render(<DropdownInput value="__other__" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('dropdown-select'))

    expect(screen.getByTestId('validation-errors')).toHaveTextContent('"Other"')
  })
})

// ---------------------------------------------------------------------------
// External errors prop
// ---------------------------------------------------------------------------

describe('DropdownInput — external errors prop', () => {
  it('displays external errors immediately without blur', () => {
    const question = makeQuestion()
    render(
      <DropdownInput
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

describe('DropdownInput — accessibility', () => {
  it('does not set aria-invalid when no errors', () => {
    const question = makeQuestion()
    render(<DropdownInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('dropdown-select')).toHaveAttribute('aria-invalid', 'false')
  })

  it('sets aria-invalid=true when errors present', () => {
    const question = makeQuestion()
    render(<DropdownInput value="" onChange={vi.fn()} question={question} errors={['Required']} />)
    expect(screen.getByTestId('dropdown-select')).toHaveAttribute('aria-invalid', 'true')
  })

  it('sets aria-describedby pointing to error container when errors present', () => {
    const question = makeQuestion({ id: 'q-test' })
    render(<DropdownInput value="" onChange={vi.fn()} question={question} errors={['Required']} />)
    const select = screen.getByTestId('dropdown-select')
    expect(select).toHaveAttribute('aria-describedby', 'question-q-test-error')
    expect(screen.getByTestId('validation-errors')).toHaveAttribute('id', 'question-q-test-error')
  })
})
