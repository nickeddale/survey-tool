/**
 * Tests for MatrixDropdownInput component.
 *
 * Covers: table rendering, column headers, dropdown select per column,
 * per-column cell types, nested response shape, alternate_rows, randomize_rows,
 * is_all_rows_required validation, external errors, accessibility.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MatrixDropdownInput } from '../MatrixDropdownInput'
import type { MatrixDropdownValue } from '../MatrixDropdownInput'
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
    transpose: false,
    cell_type: 'dropdown',
    column_types: null,
    ...overrides,
  }
}

function makeRatingSettings(
  columnTypes: Record<string, 'dropdown' | 'rating'>
): MatrixDropdownSettings {
  return makeSettings({ column_types: columnTypes })
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('MatrixDropdownInput — rendering', () => {
  it('renders container with question id in testid', () => {
    render(
      <MatrixDropdownInput value={{}} onChange={vi.fn()} question={makeQuestion({ id: 'q-abc' })} />
    )
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

  it('renders column headers from answer_options', () => {
    const options = [
      makeOption({ id: 'opt-1', code: 'col1', title: 'Column 1' }),
      makeOption({ id: 'opt-2', code: 'col2', title: 'Column 2' }),
    ]
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const question = makeQuestion({ subquestions, answer_options: options })
    render(<MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('matrix-dropdown-col-col1')).toHaveTextContent('Column 1')
    expect(screen.getByTestId('matrix-dropdown-col-col2')).toHaveTextContent('Column 2')
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

  it('renders a dropdown select per cell (subquestion × column)', () => {
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const options = [makeOption({ id: 'opt-1', code: 'col1' })]
    const question = makeQuestion({ subquestions, answer_options: options })
    render(<MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('matrix-dropdown-select-SQ001-col1')).toBeInTheDocument()
  })

  it('renders answer_options as select options', () => {
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const options = [makeOption({ id: 'opt-1', code: 'col1', title: 'Never' })]
    // answer_options serve as columns; the dropdown for each cell lists the same answer_options
    const question = makeQuestion({ subquestions, answer_options: options })
    render(<MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} />)
    // The select should have "— Select —" placeholder
    const select = screen.getByTestId('matrix-dropdown-select-SQ001-col1') as HTMLSelectElement
    expect(select).toBeInTheDocument()
  })

  it('shows the selected value in the dropdown (nested shape)', () => {
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const options = [
      makeOption({ id: 'opt-1', code: 'col1', title: 'Column 1' }),
      makeOption({ id: 'opt-2', code: 'col2', title: 'Column 2' }),
    ]
    const question = makeQuestion({ subquestions, answer_options: options })
    // Value in nested shape: { SQ001: { col1: 'col2' } } — col2 is a valid option code
    render(
      <MatrixDropdownInput
        value={{ SQ001: { col1: 'col2' } }}
        onChange={vi.fn()}
        question={question}
      />
    )
    const select = screen.getByTestId('matrix-dropdown-select-SQ001-col1') as HTMLSelectElement
    expect(select.value).toBe('col2')
  })

  it('has an overflow-x-auto scroll container', () => {
    const question = makeQuestion()
    const { container } = render(
      <MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} />
    )
    expect(container.querySelector('.overflow-x-auto')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Cell type rendering
// ---------------------------------------------------------------------------

describe('MatrixDropdownInput — cell types', () => {
  it('renders text input when cell_type is text', () => {
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const options = [makeOption({ id: 'opt-1', code: 'col1', title: 'Column' })]
    const question = makeQuestion({
      subquestions,
      answer_options: options,
      settings: makeSettings({ cell_type: 'text' }),
    })
    render(<MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} />)
    const cell = screen.getByTestId('matrix-dropdown-cell-SQ001-col1')
    expect(cell.querySelector('input[type="text"]')).toBeInTheDocument()
  })

  it('renders number input when cell_type is number', () => {
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const options = [makeOption({ id: 'opt-1', code: 'col1', title: 'Column' })]
    const question = makeQuestion({
      subquestions,
      answer_options: options,
      settings: makeSettings({ cell_type: 'number' }),
    })
    render(<MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} />)
    const cell = screen.getByTestId('matrix-dropdown-cell-SQ001-col1')
    expect(cell.querySelector('input[type="number"]')).toBeInTheDocument()
  })

  it('renders checkbox when cell_type is boolean', () => {
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const options = [makeOption({ id: 'opt-1', code: 'col1', title: 'Column' })]
    const question = makeQuestion({
      subquestions,
      answer_options: options,
      settings: makeSettings({ cell_type: 'boolean' }),
    })
    render(<MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} />)
    const cell = screen.getByTestId('matrix-dropdown-cell-SQ001-col1')
    expect(cell.querySelector('input[type="checkbox"]')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// onChange callback — nested shape
// ---------------------------------------------------------------------------

describe('MatrixDropdownInput — onChange nested shape', () => {
  it('calls onChange with nested value map when dropdown changes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const options = [makeOption({ id: 'opt-1', code: 'col1', title: 'Column 1' })]
    // The dropdown's options come from the same answer_options list
    const question = makeQuestion({
      subquestions,
      answer_options: options,
      settings: makeSettings({ cell_type: 'dropdown' }),
    })
    // For the select to have options, answer_options need to be added
    // The CellInput renders answer_options as <option> elements
    // We set it up so selecting from the select produces { SQ001: { col1: 'col1' } }
    render(<MatrixDropdownInput value={{}} onChange={onChange} question={question} />)

    const select = screen.getByTestId('matrix-dropdown-select-SQ001-col1')
    await act(async () => {
      await user.selectOptions(select, 'col1')
    })

    // The nested shape should be: { SQ001: { col1: 'col1' } }
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as MatrixDropdownValue
    expect(lastCall.SQ001).toBeDefined()
    expect(lastCall.SQ001['col1']).toBe('col1')
  })

  it('preserves existing row data when new row is answered', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const subquestions = [
      makeSubquestion({ id: 'sq-1', code: 'SQ001' }),
      makeSubquestion({ id: 'sq-2', code: 'SQ002' }),
    ]
    const options = [makeOption({ code: 'col1', title: 'Col 1' })]
    const question = makeQuestion({
      subquestions,
      answer_options: options,
      settings: makeSettings({ cell_type: 'dropdown' }),
    })
    render(
      <MatrixDropdownInput
        value={{ SQ001: { col1: 'col1' } }}
        onChange={onChange}
        question={question}
      />
    )

    const select = screen.getByTestId('matrix-dropdown-select-SQ002-col1')
    await act(async () => {
      await user.selectOptions(select, 'col1')
    })

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as MatrixDropdownValue
    expect(lastCall.SQ001?.['col1']).toBe('col1')
    expect(lastCall.SQ002?.['col1']).toBe('col1')
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
// is_all_rows_required validation — nested shape
// ---------------------------------------------------------------------------

describe('MatrixDropdownInput — is_all_rows_required validation', () => {
  it('does not show errors before blur (untouched)', () => {
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const question = makeQuestion({
      settings: makeSettings({ is_all_rows_required: true }),
      subquestions,
    })
    render(<MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
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
    // Only SQ001 has any answer
    render(
      <MatrixDropdownInput
        value={{ SQ001: { col1: 'val' } }}
        onChange={vi.fn()}
        question={question}
      />
    )

    fireEvent.blur(screen.getByTestId('matrix-dropdown-input-q-mdd-1'))

    expect(screen.getByTestId('validation-errors')).toHaveTextContent('Please answer all rows.')
  })

  it('does not show error when all rows have data', () => {
    const subquestions = [
      makeSubquestion({ id: 'sq-1', code: 'SQ001' }),
      makeSubquestion({ id: 'sq-2', code: 'SQ002' }),
    ]
    const question = makeQuestion({
      settings: makeSettings({ is_all_rows_required: true }),
      subquestions,
    })
    render(
      <MatrixDropdownInput
        value={{ SQ001: { col1: 'A1' }, SQ002: { col1: 'A2' } }}
        onChange={vi.fn()}
        question={question}
      />
    )

    fireEvent.blur(screen.getByTestId('matrix-dropdown-input-q-mdd-1'))

    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// External errors prop
// ---------------------------------------------------------------------------

describe('MatrixDropdownInput — external errors prop', () => {
  it('displays external errors immediately without blur', () => {
    const question = makeQuestion()
    render(
      <MatrixDropdownInput
        value={{}}
        onChange={vi.fn()}
        question={question}
        errors={['Server error']}
      />
    )
    expect(screen.getByTestId('validation-errors')).toHaveTextContent('Server error')
  })
})

// ---------------------------------------------------------------------------
// Rating column_type
// ---------------------------------------------------------------------------

describe('MatrixDropdownInput — rating column_type', () => {
  // In the multi-column model, column_types is keyed by answer_option (column) code.
  // A rating column renders a rating widget for every row in that column.

  it('renders rating widget instead of select when column_types sets rating for a column', () => {
    const subquestions = [makeSubquestion({ id: 'sq-1', code: 'SQ001', title: 'Row 1' })]
    const options = [makeOption({ id: 'opt-1', code: 'col1', title: 'Column 1' })]
    const question = makeQuestion({
      settings: makeRatingSettings({ col1: 'rating' }),
      subquestions,
      answer_options: options,
    })
    render(<MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} />)

    expect(screen.queryByTestId('matrix-dropdown-select-SQ001-col1')).not.toBeInTheDocument()
    expect(screen.getByTestId('matrix-dropdown-rating-SQ001-col1')).toBeInTheDocument()
  })

  it('renders 5 rating buttons by default for a rating column', () => {
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const options = [makeOption({ id: 'opt-1', code: 'col1', title: 'Column 1' })]
    const question = makeQuestion({
      settings: makeRatingSettings({ col1: 'rating' }),
      subquestions,
      answer_options: options,
    })
    render(<MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} />)

    for (let i = 1; i <= 5; i++) {
      expect(screen.getByTestId(`matrix-dropdown-rating-SQ001-col1-${i}`)).toBeInTheDocument()
    }
  })

  it('calls onChange with nested value map containing rating string when rating button clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const options = [makeOption({ id: 'opt-1', code: 'col1', title: 'Column 1' })]
    const question = makeQuestion({
      settings: makeRatingSettings({ col1: 'rating' }),
      subquestions,
      answer_options: options,
    })
    render(<MatrixDropdownInput value={{}} onChange={onChange} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('matrix-dropdown-rating-SQ001-col1-3'))
    })

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as MatrixDropdownValue
    expect(lastCall.SQ001).toBeDefined()
    expect(lastCall.SQ001['col1']).toBe('3')
  })

  it('reflects selected rating value via data-filled attribute', () => {
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const options = [makeOption({ id: 'opt-1', code: 'col1', title: 'Column 1' })]
    const question = makeQuestion({
      settings: makeRatingSettings({ col1: 'rating' }),
      subquestions,
      answer_options: options,
    })
    render(
      <MatrixDropdownInput
        value={{ SQ001: { col1: '3' } }}
        onChange={vi.fn()}
        question={question}
      />
    )

    expect(screen.getByTestId('matrix-dropdown-rating-SQ001-col1-1')).toHaveAttribute(
      'data-filled',
      'true'
    )
    expect(screen.getByTestId('matrix-dropdown-rating-SQ001-col1-3')).toHaveAttribute(
      'data-filled',
      'true'
    )
    expect(screen.getByTestId('matrix-dropdown-rating-SQ001-col1-4')).toHaveAttribute(
      'data-filled',
      'false'
    )
  })

  it('renders dropdown for non-rating columns and rating for rating column in the same question', () => {
    const subquestions = [makeSubquestion({ id: 'sq-1', code: 'SQ001', title: 'Row 1' })]
    const options = [
      makeOption({ id: 'opt-1', code: 'col1', title: 'Rate it' }),
      makeOption({ id: 'opt-2', code: 'col2', title: 'Pick one' }),
    ]
    const question = makeQuestion({
      settings: makeRatingSettings({ col1: 'rating', col2: 'dropdown' }),
      subquestions,
      answer_options: options,
    })
    render(<MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} />)

    expect(screen.getByTestId('matrix-dropdown-rating-SQ001-col1')).toBeInTheDocument()
    expect(screen.queryByTestId('matrix-dropdown-select-SQ001-col1')).not.toBeInTheDocument()
    expect(screen.getByTestId('matrix-dropdown-select-SQ001-col2')).toBeInTheDocument()
    expect(screen.queryByTestId('matrix-dropdown-rating-SQ001-col2')).not.toBeInTheDocument()
  })

  it('preserves existing dropdown selections when a rating cell is answered', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const subquestions = [
      makeSubquestion({ id: 'sq-1', code: 'SQ001' }),
      makeSubquestion({ id: 'sq-2', code: 'SQ002' }),
    ]
    const options = [
      makeOption({ id: 'opt-1', code: 'col1', title: 'Rate it' }),
      makeOption({ id: 'opt-2', code: 'col2', title: 'Pick one' }),
    ]
    const question = makeQuestion({
      settings: makeRatingSettings({ col1: 'rating' }),
      subquestions,
      answer_options: options,
    })
    render(
      <MatrixDropdownInput
        value={{ SQ002: { col2: 'col2' } }}
        onChange={onChange}
        question={question}
      />
    )

    await act(async () => {
      await user.click(screen.getByTestId('matrix-dropdown-rating-SQ001-col1-4'))
    })

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as MatrixDropdownValue
    expect(lastCall.SQ001?.['col1']).toBe('4')
    expect(lastCall.SQ002?.['col2']).toBe('col2')
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
    render(
      <MatrixDropdownInput
        value={{}}
        onChange={vi.fn()}
        question={question}
        errors={['Required']}
      />
    )
    expect(screen.getByRole('table')).toHaveAttribute('aria-invalid', 'true')
  })

  it('sets aria-describedby pointing to error container when errors present', () => {
    const question = makeQuestion({ id: 'q-test' })
    render(
      <MatrixDropdownInput
        value={{}}
        onChange={vi.fn()}
        question={question}
        errors={['Required']}
      />
    )
    const table = screen.getByRole('table')
    expect(table).toHaveAttribute('aria-describedby', 'question-q-test-error')
    expect(screen.getByTestId('validation-errors')).toHaveAttribute('id', 'question-q-test-error')
  })

  it('error list has role=alert and aria-live=assertive', () => {
    const question = makeQuestion()
    render(
      <MatrixDropdownInput value={{}} onChange={vi.fn()} question={question} errors={['Error']} />
    )
    const errorList = screen.getByTestId('validation-errors')
    expect(errorList).toHaveAttribute('role', 'alert')
    expect(errorList).toHaveAttribute('aria-live', 'assertive')
  })
})
