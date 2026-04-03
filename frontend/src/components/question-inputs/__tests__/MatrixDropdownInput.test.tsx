/**
 * Tests for MatrixDropdownInput component.
 *
 * Covers: table rendering, dropdown per row, selection updates value map,
 * alternate_rows, randomize_rows, is_all_rows_required validation,
 * external errors, accessibility.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MatrixDropdownInput } from '../MatrixDropdownInput'
import type { BuilderQuestion } from '../../../store/builderStore'
import { getDefaultSettings } from '../../../types/questionSettings'
import type { MatrixDropdownSettings } from '../../../types/questionSettings'
import type { AnswerOptionResponse } from '../../../types/survey'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOption(overrides: Partial<AnswerOptionResponse> = {}): AnswerOptionResponse {
  return {
    id: 'opt-1',
    question_id: 'q-mdd-1',
    code: 'A1',
    title: 'Option 1',
    sort_order: 1,
    assessment_value: 0,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeSubquestion(overrides: Partial<BuilderQuestion> = {}): BuilderQuestion {
  return {
    id: 'sq-1',
    group_id: 'g-1',
    parent_id: 'q-mdd-1',
    question_type: 'matrix_dropdown',
    code: 'SQ001',
    title: 'Row 1',
    description: null,
    is_required: false,
    sort_order: 1,
    relevance: null,
    validation: null,
    settings: null,
    created_at: '2024-01-01T00:00:00Z',
    answer_options: [],
    subquestions: [],
    ...overrides,
  }
}

function makeQuestion(overrides: Partial<BuilderQuestion> = {}): BuilderQuestion {
  return {
    id: 'q-mdd-1',
    group_id: 'g-1',
    parent_id: null,
    question_type: 'matrix_dropdown',
    code: 'Q1',
    title: 'Select for each',
    description: null,
    is_required: false,
    sort_order: 1,
    relevance: null,
    validation: null,
    settings: getDefaultSettings('matrix_dropdown'),
    created_at: '2024-01-01T00:00:00Z',
    answer_options: [],
    subquestions: [],
    ...overrides,
  }
}

function makeSettings(overrides: Partial<MatrixDropdownSettings> = {}): MatrixDropdownSettings {
  return {
    alternate_rows: true,
    is_all_rows_required: false,
    randomize_rows: false,
    cell_type: 'dropdown',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('MatrixDropdownInput — rendering', () => {
  it('renders container with question id in testid', () => {
    render(<MatrixDropdownInput value={{}} onChange={vi.fn()} question={makeQuestion({ id: 'q-abc' })} />)
    expect(screen.getByTestId('matrix-dropdown-input-q-abc')).toBeInTheDocument()
  })

  it('renders a table with thead and tbody', () => {
    const question = makeQuestion()
    render(<MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} />)
    const table = screen.getByRole('table')
    expect(table).toBeInTheDocument()
    expect(table.querySelector('thead')).toBeInTheDocument()
    expect(table.querySelector('tbody')).toBeInTheDocument()
  })

  it('renders rows for each subquestion', () => {
    const subquestions = [
      makeSubquestion({ id: 'sq-1', code: 'SQ001', title: 'Row 1' }),
      makeSubquestion({ id: 'sq-2', code: 'SQ002', title: 'Row 2' }),
    ]
    const question = makeQuestion({ subquestions })
    render(<MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('matrix-dropdown-row-SQ001')).toBeInTheDocument()
    expect(screen.getByTestId('matrix-dropdown-row-SQ002')).toBeInTheDocument()
    expect(screen.getByText('Row 1')).toBeInTheDocument()
    expect(screen.getByText('Row 2')).toBeInTheDocument()
  })

  it('renders a dropdown select per row', () => {
    const subquestions = [
      makeSubquestion({ id: 'sq-1', code: 'SQ001' }),
      makeSubquestion({ id: 'sq-2', code: 'SQ002' }),
    ]
    const question = makeQuestion({ subquestions })
    render(<MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('matrix-dropdown-select-SQ001')).toBeInTheDocument()
    expect(screen.getByTestId('matrix-dropdown-select-SQ002')).toBeInTheDocument()
  })

  it('renders answer_options as select options', () => {
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const options = [
      makeOption({ id: 'opt-1', code: 'A1', title: 'Never' }),
      makeOption({ id: 'opt-2', code: 'A2', title: 'Always' }),
    ]
    const question = makeQuestion({ subquestions, answer_options: options })
    render(<MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} />)
    expect(screen.getByRole('option', { name: 'Never' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Always' })).toBeInTheDocument()
  })

  it('shows the selected value in the dropdown', () => {
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const options = [
      makeOption({ id: 'opt-1', code: 'A1', title: 'Never' }),
      makeOption({ id: 'opt-2', code: 'A2', title: 'Always' }),
    ]
    const question = makeQuestion({ subquestions, answer_options: options })
    render(<MatrixDropdownInput value={{ SQ001: 'A1' }} onChange={vi.fn()} question={question} />)
    const select = screen.getByTestId('matrix-dropdown-select-SQ001') as HTMLSelectElement
    expect(select.value).toBe('A1')
  })

  it('has an overflow-x-auto scroll container', () => {
    const question = makeQuestion()
    const { container } = render(<MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} />)
    expect(container.querySelector('.overflow-x-auto')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// onChange callback
// ---------------------------------------------------------------------------

describe('MatrixDropdownInput — onChange', () => {
  it('calls onChange with updated value map when dropdown changes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const options = [
      makeOption({ id: 'opt-1', code: 'A1', title: 'Never' }),
      makeOption({ id: 'opt-2', code: 'A2', title: 'Always' }),
    ]
    const question = makeQuestion({ subquestions, answer_options: options })
    render(<MatrixDropdownInput value={{}} onChange={onChange} question={question} />)

    await act(async () => {
      await user.selectOptions(screen.getByTestId('matrix-dropdown-select-SQ001'), 'A1')
    })

    expect(onChange).toHaveBeenCalledWith({ SQ001: 'A1' })
  })

  it('preserves existing selections when a new row is answered', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const subquestions = [
      makeSubquestion({ id: 'sq-1', code: 'SQ001' }),
      makeSubquestion({ id: 'sq-2', code: 'SQ002' }),
    ]
    const options = [makeOption({ code: 'A1', title: 'Yes' })]
    const question = makeQuestion({ subquestions, answer_options: options })
    render(<MatrixDropdownInput value={{ SQ001: 'A1' }} onChange={onChange} question={question} />)

    await act(async () => {
      await user.selectOptions(screen.getByTestId('matrix-dropdown-select-SQ002'), 'A1')
    })

    expect(onChange).toHaveBeenCalledWith({ SQ001: 'A1', SQ002: 'A1' })
  })
})

// ---------------------------------------------------------------------------
// Alternate rows
// ---------------------------------------------------------------------------

describe('MatrixDropdownInput — alternate_rows', () => {
  it('applies alternating bg class to odd-indexed rows when alternate_rows is true', () => {
    const subquestions = [
      makeSubquestion({ id: 'sq-1', code: 'SQ001' }),
      makeSubquestion({ id: 'sq-2', code: 'SQ002' }),
      makeSubquestion({ id: 'sq-3', code: 'SQ003' }),
    ]
    const question = makeQuestion({
      settings: makeSettings({ alternate_rows: true }),
      subquestions,
    })
    render(<MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} />)

    const row1 = screen.getByTestId('matrix-dropdown-row-SQ001')
    const row2 = screen.getByTestId('matrix-dropdown-row-SQ002')
    const row3 = screen.getByTestId('matrix-dropdown-row-SQ003')

    expect(row1.className).not.toContain('bg-muted')
    expect(row2.className).toContain('bg-muted')
    expect(row3.className).not.toContain('bg-muted')
  })

  it('does not apply alternating bg when alternate_rows is false', () => {
    const subquestions = [
      makeSubquestion({ id: 'sq-1', code: 'SQ001' }),
      makeSubquestion({ id: 'sq-2', code: 'SQ002' }),
    ]
    const question = makeQuestion({
      settings: makeSettings({ alternate_rows: false }),
      subquestions,
    })
    render(<MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} />)

    const row2 = screen.getByTestId('matrix-dropdown-row-SQ002')
    expect(row2.className).not.toContain('bg-muted')
  })
})

// ---------------------------------------------------------------------------
// Randomize rows
// ---------------------------------------------------------------------------

describe('MatrixDropdownInput — randomize_rows', () => {
  it('renders all subquestions even when randomize_rows is true', () => {
    const subquestions = [
      makeSubquestion({ id: 'sq-1', code: 'SQ001', title: 'Row A' }),
      makeSubquestion({ id: 'sq-2', code: 'SQ002', title: 'Row B' }),
      makeSubquestion({ id: 'sq-3', code: 'SQ003', title: 'Row C' }),
    ]
    const question = makeQuestion({
      settings: makeSettings({ randomize_rows: true }),
      subquestions,
    })
    render(<MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} />)
    expect(screen.getByText('Row A')).toBeInTheDocument()
    expect(screen.getByText('Row B')).toBeInTheDocument()
    expect(screen.getByText('Row C')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// is_all_rows_required validation
// ---------------------------------------------------------------------------

describe('MatrixDropdownInput — is_all_rows_required validation', () => {
  it('does not show errors before blur (untouched)', () => {
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const question = makeQuestion({
      settings: makeSettings({ is_all_rows_required: true }),
      subquestions,
    })
    render(<MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('matrix-dropdown-errors')).not.toBeInTheDocument()
  })

  it('shows error on blur when is_all_rows_required and rows unanswered', () => {
    const subquestions = [
      makeSubquestion({ id: 'sq-1', code: 'SQ001' }),
      makeSubquestion({ id: 'sq-2', code: 'SQ002' }),
    ]
    const question = makeQuestion({
      settings: makeSettings({ is_all_rows_required: true }),
      subquestions,
    })
    render(<MatrixDropdownInput value={{ SQ001: 'A1' }} onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('matrix-dropdown-input-q-mdd-1'))

    expect(screen.getByTestId('matrix-dropdown-errors')).toHaveTextContent('Please answer all rows.')
  })

  it('does not show error when all rows are answered', () => {
    const subquestions = [
      makeSubquestion({ id: 'sq-1', code: 'SQ001' }),
      makeSubquestion({ id: 'sq-2', code: 'SQ002' }),
    ]
    const question = makeQuestion({
      settings: makeSettings({ is_all_rows_required: true }),
      subquestions,
    })
    render(<MatrixDropdownInput value={{ SQ001: 'A1', SQ002: 'A2' }} onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('matrix-dropdown-input-q-mdd-1'))

    expect(screen.queryByTestId('matrix-dropdown-errors')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// External errors prop
// ---------------------------------------------------------------------------

describe('MatrixDropdownInput — external errors prop', () => {
  it('displays external errors immediately without blur', () => {
    const question = makeQuestion()
    render(
      <MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} errors={['Server error']} />
    )
    expect(screen.getByTestId('matrix-dropdown-errors')).toHaveTextContent('Server error')
  })
})

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('MatrixDropdownInput — accessibility', () => {
  it('does not set aria-invalid when no errors', () => {
    const question = makeQuestion()
    render(<MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} />)
    expect(screen.getByRole('table')).toHaveAttribute('aria-invalid', 'false')
  })

  it('sets aria-invalid=true when errors present', () => {
    const question = makeQuestion()
    render(<MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} errors={['Required']} />)
    expect(screen.getByRole('table')).toHaveAttribute('aria-invalid', 'true')
  })

  it('sets aria-describedby pointing to error container when errors present', () => {
    const question = makeQuestion({ id: 'q-test' })
    render(<MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} errors={['Required']} />)
    const table = screen.getByRole('table')
    expect(table).toHaveAttribute('aria-describedby', 'question-q-test-error')
    expect(screen.getByTestId('matrix-dropdown-errors')).toHaveAttribute('id', 'question-q-test-error')
  })

  it('error list has role=alert and aria-live=assertive', () => {
    const question = makeQuestion()
    render(<MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} errors={['Error']} />)
    const errorList = screen.getByTestId('matrix-dropdown-errors')
    expect(errorList).toHaveAttribute('role', 'alert')
    expect(errorList).toHaveAttribute('aria-live', 'assertive')
  })
})
