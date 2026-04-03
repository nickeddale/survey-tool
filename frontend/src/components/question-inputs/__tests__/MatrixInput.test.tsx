/**
 * Tests for MatrixInput component.
 *
 * Covers: table rendering (thead/tbody), radio selection updates value map,
 * alternate_rows applies alternating CSS, randomize_rows shuffles order,
 * is_all_rows_required validation, external errors, accessibility.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MatrixInput } from '../MatrixInput'
import type { BuilderQuestion } from '../../../store/builderStore'
import { getDefaultSettings } from '../../../types/questionSettings'
import type { MatrixSettings } from '../../../types/questionSettings'
import type { AnswerOptionResponse } from '../../../types/survey'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOption(overrides: Partial<AnswerOptionResponse> = {}): AnswerOptionResponse {
  return {
    id: 'opt-1',
    question_id: 'q-matrix-1',
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
    parent_id: 'q-matrix-1',
    question_type: 'matrix',
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
    id: 'q-matrix-1',
    group_id: 'g-1',
    parent_id: null,
    question_type: 'matrix',
    code: 'Q1',
    title: 'Rate each item',
    description: null,
    is_required: false,
    sort_order: 1,
    relevance: null,
    validation: null,
    settings: getDefaultSettings('matrix'),
    created_at: '2024-01-01T00:00:00Z',
    answer_options: [],
    subquestions: [],
    ...overrides,
  }
}

function makeSettings(overrides: Partial<MatrixSettings> = {}): MatrixSettings {
  return {
    alternate_rows: true,
    is_all_rows_required: false,
    randomize_rows: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('MatrixInput — rendering', () => {
  it('renders container with question id in testid', () => {
    render(<MatrixInput value={{}} onChange={vi.fn()} question={makeQuestion({ id: 'q-abc' })} />)
    expect(screen.getByTestId('matrix-input-q-abc')).toBeInTheDocument()
  })

  it('renders a table with thead and tbody', () => {
    const question = makeQuestion()
    render(<MatrixInput value={{}} onChange={vi.fn()} question={question} />)
    expect(screen.getByRole('table')).toBeInTheDocument()
    // thead and tbody are implicit in table
    const table = screen.getByRole('table')
    expect(table.querySelector('thead')).toBeInTheDocument()
    expect(table.querySelector('tbody')).toBeInTheDocument()
  })

  it('renders column headers from answer_options', () => {
    const options = [
      makeOption({ id: 'opt-1', code: 'A1', title: 'Agree' }),
      makeOption({ id: 'opt-2', code: 'A2', title: 'Disagree' }),
    ]
    const question = makeQuestion({ answer_options: options })
    render(<MatrixInput value={{}} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('matrix-col-A1')).toHaveTextContent('Agree')
    expect(screen.getByTestId('matrix-col-A2')).toHaveTextContent('Disagree')
  })

  it('renders rows for each subquestion', () => {
    const subquestions = [
      makeSubquestion({ id: 'sq-1', code: 'SQ001', title: 'Row 1' }),
      makeSubquestion({ id: 'sq-2', code: 'SQ002', title: 'Row 2' }),
    ]
    const question = makeQuestion({ subquestions })
    render(<MatrixInput value={{}} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('matrix-row-SQ001')).toBeInTheDocument()
    expect(screen.getByTestId('matrix-row-SQ002')).toBeInTheDocument()
    expect(screen.getByText('Row 1')).toBeInTheDocument()
    expect(screen.getByText('Row 2')).toBeInTheDocument()
  })

  it('renders a radio button per cell (subquestion × option)', () => {
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const options = [
      makeOption({ code: 'A1' }),
      makeOption({ id: 'opt-2', code: 'A2' }),
    ]
    const question = makeQuestion({ subquestions, answer_options: options })
    render(<MatrixInput value={{}} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('matrix-cell-SQ001-A1')).toBeInTheDocument()
    expect(screen.getByTestId('matrix-cell-SQ001-A2')).toBeInTheDocument()
    expect(screen.getByTestId('matrix-radio-SQ001-A1')).toBeInTheDocument()
    expect(screen.getByTestId('matrix-radio-SQ001-A2')).toBeInTheDocument()
  })

  it('marks the selected radio as checked', () => {
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const options = [
      makeOption({ code: 'A1' }),
      makeOption({ id: 'opt-2', code: 'A2' }),
    ]
    const question = makeQuestion({ subquestions, answer_options: options })
    render(<MatrixInput value={{ SQ001: 'A1' }} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('matrix-radio-SQ001-A1')).toBeChecked()
    expect(screen.getByTestId('matrix-radio-SQ001-A2')).not.toBeChecked()
  })

  it('has an overflow-x-auto scroll container', () => {
    const question = makeQuestion()
    const { container } = render(<MatrixInput value={{}} onChange={vi.fn()} question={question} />)
    expect(container.querySelector('.overflow-x-auto')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// onChange callback
// ---------------------------------------------------------------------------

describe('MatrixInput — onChange', () => {
  it('calls onChange with updated value map when radio is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const options = [makeOption({ code: 'A1' })]
    const question = makeQuestion({ subquestions, answer_options: options })
    render(<MatrixInput value={{}} onChange={onChange} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('matrix-radio-SQ001-A1'))
    })

    expect(onChange).toHaveBeenCalledWith({ SQ001: 'A1' })
  })

  it('preserves existing row selections when a new row is answered', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const subquestions = [
      makeSubquestion({ id: 'sq-1', code: 'SQ001' }),
      makeSubquestion({ id: 'sq-2', code: 'SQ002' }),
    ]
    const options = [makeOption({ code: 'A1' })]
    const question = makeQuestion({ subquestions, answer_options: options })
    render(<MatrixInput value={{ SQ001: 'A1' }} onChange={onChange} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('matrix-radio-SQ002-A1'))
    })

    expect(onChange).toHaveBeenCalledWith({ SQ001: 'A1', SQ002: 'A1' })
  })
})

// ---------------------------------------------------------------------------
// Alternate rows
// ---------------------------------------------------------------------------

describe('MatrixInput — alternate_rows', () => {
  it('applies alternating bg class to even-indexed rows when alternate_rows is true', () => {
    const subquestions = [
      makeSubquestion({ id: 'sq-1', code: 'SQ001' }),
      makeSubquestion({ id: 'sq-2', code: 'SQ002' }),
      makeSubquestion({ id: 'sq-3', code: 'SQ003' }),
    ]
    const question = makeQuestion({
      settings: makeSettings({ alternate_rows: true }),
      subquestions,
    })
    render(<MatrixInput value={{}} onChange={vi.fn()} question={question} />)

    const row1 = screen.getByTestId('matrix-row-SQ001')
    const row2 = screen.getByTestId('matrix-row-SQ002')
    const row3 = screen.getByTestId('matrix-row-SQ003')

    // Row index 0 (SQ001): no alt bg
    expect(row1.className).not.toContain('bg-muted')
    // Row index 1 (SQ002): has alt bg
    expect(row2.className).toContain('bg-muted')
    // Row index 2 (SQ003): no alt bg
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
    render(<MatrixInput value={{}} onChange={vi.fn()} question={question} />)

    const row2 = screen.getByTestId('matrix-row-SQ002')
    expect(row2.className).not.toContain('bg-muted')
  })
})

// ---------------------------------------------------------------------------
// Randomize rows
// ---------------------------------------------------------------------------

describe('MatrixInput — randomize_rows', () => {
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
    render(<MatrixInput value={{}} onChange={vi.fn()} question={question} />)
    expect(screen.getByText('Row A')).toBeInTheDocument()
    expect(screen.getByText('Row B')).toBeInTheDocument()
    expect(screen.getByText('Row C')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// is_all_rows_required validation
// ---------------------------------------------------------------------------

describe('MatrixInput — is_all_rows_required validation', () => {
  it('does not show errors before blur (untouched)', () => {
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const question = makeQuestion({
      settings: makeSettings({ is_all_rows_required: true }),
      subquestions,
    })
    render(<MatrixInput value={{}} onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('matrix-errors')).not.toBeInTheDocument()
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
    render(<MatrixInput value={{ SQ001: 'A1' }} onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('matrix-input-q-matrix-1'))

    expect(screen.getByTestId('matrix-errors')).toHaveTextContent('Please answer all rows.')
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
    render(<MatrixInput value={{ SQ001: 'A1', SQ002: 'A1' }} onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('matrix-input-q-matrix-1'))

    expect(screen.queryByTestId('matrix-errors')).not.toBeInTheDocument()
  })

  it('does not show error when is_all_rows_required is false', () => {
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const question = makeQuestion({
      settings: makeSettings({ is_all_rows_required: false }),
      subquestions,
    })
    render(<MatrixInput value={{}} onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('matrix-input-q-matrix-1'))

    expect(screen.queryByTestId('matrix-errors')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// External errors prop
// ---------------------------------------------------------------------------

describe('MatrixInput — external errors prop', () => {
  it('displays external errors immediately without blur', () => {
    const question = makeQuestion()
    render(
      <MatrixInput value={{}} onChange={vi.fn()} question={question} errors={['Server error occurred']} />
    )
    expect(screen.getByTestId('matrix-errors')).toHaveTextContent('Server error occurred')
  })

  it('overrides internal errors with external errors', () => {
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const question = makeQuestion({
      settings: makeSettings({ is_all_rows_required: true }),
      subquestions,
    })
    render(
      <MatrixInput value={{}} onChange={vi.fn()} question={question} errors={['External error']} />
    )
    expect(screen.getByTestId('matrix-errors')).toHaveTextContent('External error')
    expect(screen.queryByText('Please answer all rows.')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('MatrixInput — accessibility', () => {
  it('does not set aria-invalid when no errors', () => {
    const question = makeQuestion()
    render(<MatrixInput value={{}} onChange={vi.fn()} question={question} />)
    expect(screen.getByRole('table')).toHaveAttribute('aria-invalid', 'false')
  })

  it('sets aria-invalid=true when errors present', () => {
    const question = makeQuestion()
    render(<MatrixInput value={{}} onChange={vi.fn()} question={question} errors={['Required']} />)
    expect(screen.getByRole('table')).toHaveAttribute('aria-invalid', 'true')
  })

  it('sets aria-describedby pointing to error container when errors present', () => {
    const question = makeQuestion({ id: 'q-test' })
    render(<MatrixInput value={{}} onChange={vi.fn()} question={question} errors={['Required']} />)
    const table = screen.getByRole('table')
    expect(table).toHaveAttribute('aria-describedby', 'question-q-test-error')
    expect(screen.getByTestId('matrix-errors')).toHaveAttribute('id', 'question-q-test-error')
  })

  it('error list has role=alert and aria-live=assertive', () => {
    const question = makeQuestion()
    render(<MatrixInput value={{}} onChange={vi.fn()} question={question} errors={['Error']} />)
    const errorList = screen.getByTestId('matrix-errors')
    expect(errorList).toHaveAttribute('role', 'alert')
    expect(errorList).toHaveAttribute('aria-live', 'assertive')
  })
})
