/**
 * Tests for MatrixMultipleInput component.
 *
 * Covers: table rendering, checkbox selection updates value map,
 * alternate_rows, randomize_rows, is_all_rows_required validation,
 * external errors, accessibility.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MatrixMultipleInput } from '../MatrixMultipleInput'
import type { BuilderQuestion } from '../../../store/builderStore'
import type { MatrixSettings } from '../../../types/questionSettings'
import type { AnswerOptionResponse } from '../../../types/survey'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOption(overrides: Partial<AnswerOptionResponse> = {}): AnswerOptionResponse {
  return {
    id: 'opt-1',
    question_id: 'q-matrix-mult-1',
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
    parent_id: 'q-matrix-mult-1',
    question_type: 'matrix_multiple',
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
    id: 'q-matrix-mult-1',
    group_id: 'g-1',
    parent_id: null,
    question_type: 'matrix_multiple',
    code: 'Q1',
    title: 'Select all that apply',
    description: null,
    is_required: false,
    sort_order: 1,
    relevance: null,
    validation: null,
    settings: makeSettings(),
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
    transpose: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('MatrixMultipleInput — rendering', () => {
  it('renders container with question id in testid', () => {
    render(
      <MatrixMultipleInput value={{}} onChange={vi.fn()} question={makeQuestion({ id: 'q-abc' })} />
    )
    expect(screen.getByTestId('matrix-multiple-input-q-abc')).toBeInTheDocument()
  })

  it('renders a table with thead and tbody', () => {
    render(<MatrixMultipleInput value={{}} onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByRole('table')).toBeInTheDocument()
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
    render(<MatrixMultipleInput value={{}} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('matrix-multiple-col-A1')).toHaveTextContent('Agree')
    expect(screen.getByTestId('matrix-multiple-col-A2')).toHaveTextContent('Disagree')
  })

  it('renders rows for each subquestion', () => {
    const subquestions = [
      makeSubquestion({ id: 'sq-1', code: 'SQ001', title: 'Row 1' }),
      makeSubquestion({ id: 'sq-2', code: 'SQ002', title: 'Row 2' }),
    ]
    const question = makeQuestion({ subquestions })
    render(<MatrixMultipleInput value={{}} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('matrix-multiple-row-SQ001')).toBeInTheDocument()
    expect(screen.getByTestId('matrix-multiple-row-SQ002')).toBeInTheDocument()
    expect(screen.getByText('Row 1')).toBeInTheDocument()
    expect(screen.getByText('Row 2')).toBeInTheDocument()
  })

  it('renders a checkbox per cell (subquestion × option)', () => {
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const options = [makeOption({ code: 'A1' }), makeOption({ id: 'opt-2', code: 'A2' })]
    const question = makeQuestion({ subquestions, answer_options: options })
    render(<MatrixMultipleInput value={{}} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('matrix-multiple-cell-SQ001-A1')).toBeInTheDocument()
    expect(screen.getByTestId('matrix-multiple-cell-SQ001-A2')).toBeInTheDocument()
    expect(screen.getByTestId('matrix-multiple-checkbox-SQ001-A1')).toBeInTheDocument()
    expect(screen.getByTestId('matrix-multiple-checkbox-SQ001-A2')).toBeInTheDocument()
  })

  it('marks selected checkboxes as checked based on value prop', () => {
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const options = [makeOption({ code: 'A1' }), makeOption({ id: 'opt-2', code: 'A2' })]
    const question = makeQuestion({ subquestions, answer_options: options })
    render(<MatrixMultipleInput value={{ SQ001: ['A1'] }} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('matrix-multiple-checkbox-SQ001-A1')).toBeChecked()
    expect(screen.getByTestId('matrix-multiple-checkbox-SQ001-A2')).not.toBeChecked()
  })
})

// ---------------------------------------------------------------------------
// onChange callback
// ---------------------------------------------------------------------------

describe('MatrixMultipleInput — onChange', () => {
  it('calls onChange with updated value map when checkbox is checked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const options = [makeOption({ code: 'A1' })]
    const question = makeQuestion({ subquestions, answer_options: options })
    render(<MatrixMultipleInput value={{}} onChange={onChange} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('matrix-multiple-checkbox-SQ001-A1'))
    })

    expect(onChange).toHaveBeenCalledWith({ SQ001: ['A1'] })
  })

  it('appends to existing selections when a second checkbox is checked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const options = [
      makeOption({ id: 'opt-1', code: 'A1' }),
      makeOption({ id: 'opt-2', code: 'A2' }),
    ]
    const question = makeQuestion({ subquestions, answer_options: options })
    render(
      <MatrixMultipleInput value={{ SQ001: ['A1'] }} onChange={onChange} question={question} />
    )

    await act(async () => {
      await user.click(screen.getByTestId('matrix-multiple-checkbox-SQ001-A2'))
    })

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(lastCall.SQ001).toContain('A1')
    expect(lastCall.SQ001).toContain('A2')
  })

  it('removes option from selection when checkbox is unchecked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const options = [
      makeOption({ id: 'opt-1', code: 'A1' }),
      makeOption({ id: 'opt-2', code: 'A2' }),
    ]
    const question = makeQuestion({ subquestions, answer_options: options })
    render(
      <MatrixMultipleInput
        value={{ SQ001: ['A1', 'A2'] }}
        onChange={onChange}
        question={question}
      />
    )

    await act(async () => {
      await user.click(screen.getByTestId('matrix-multiple-checkbox-SQ001-A1'))
    })

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(lastCall.SQ001).not.toContain('A1')
    expect(lastCall.SQ001).toContain('A2')
  })

  it('preserves other row selections when a new row is answered', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const subquestions = [
      makeSubquestion({ id: 'sq-1', code: 'SQ001' }),
      makeSubquestion({ id: 'sq-2', code: 'SQ002' }),
    ]
    const options = [makeOption({ code: 'A1' })]
    const question = makeQuestion({ subquestions, answer_options: options })
    render(
      <MatrixMultipleInput value={{ SQ001: ['A1'] }} onChange={onChange} question={question} />
    )

    await act(async () => {
      await user.click(screen.getByTestId('matrix-multiple-checkbox-SQ002-A1'))
    })

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(lastCall.SQ001).toEqual(['A1'])
    expect(lastCall.SQ002).toContain('A1')
  })
})

// ---------------------------------------------------------------------------
// Alternate rows
// ---------------------------------------------------------------------------

describe('MatrixMultipleInput — alternate_rows', () => {
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
    render(<MatrixMultipleInput value={{}} onChange={vi.fn()} question={question} />)

    const row1 = screen.getByTestId('matrix-multiple-row-SQ001')
    const row2 = screen.getByTestId('matrix-multiple-row-SQ002')
    const row3 = screen.getByTestId('matrix-multiple-row-SQ003')

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
    render(<MatrixMultipleInput value={{}} onChange={vi.fn()} question={question} />)

    const row2 = screen.getByTestId('matrix-multiple-row-SQ002')
    expect(row2.className).not.toContain('bg-muted')
  })
})

// ---------------------------------------------------------------------------
// Randomize rows
// ---------------------------------------------------------------------------

describe('MatrixMultipleInput — randomize_rows', () => {
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
    render(<MatrixMultipleInput value={{}} onChange={vi.fn()} question={question} />)
    expect(screen.getByText('Row A')).toBeInTheDocument()
    expect(screen.getByText('Row B')).toBeInTheDocument()
    expect(screen.getByText('Row C')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// is_all_rows_required validation
// ---------------------------------------------------------------------------

describe('MatrixMultipleInput — is_all_rows_required validation', () => {
  it('does not show errors before blur (untouched)', () => {
    const subquestions = [makeSubquestion({ code: 'SQ001' })]
    const question = makeQuestion({
      settings: makeSettings({ is_all_rows_required: true }),
      subquestions,
    })
    render(<MatrixMultipleInput value={{}} onChange={vi.fn()} question={question} />)
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
    render(<MatrixMultipleInput value={{ SQ001: ['A1'] }} onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('matrix-multiple-input-q-matrix-mult-1'))

    expect(screen.getByTestId('validation-errors')).toHaveTextContent('Please answer all rows.')
  })

  it('shows error on blur when a row has an empty array', () => {
    const subquestions = [makeSubquestion({ id: 'sq-1', code: 'SQ001' })]
    const question = makeQuestion({
      settings: makeSettings({ is_all_rows_required: true }),
      subquestions,
    })
    render(<MatrixMultipleInput value={{ SQ001: [] }} onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('matrix-multiple-input-q-matrix-mult-1'))

    expect(screen.getByTestId('validation-errors')).toHaveTextContent('Please answer all rows.')
  })

  it('does not show error when all rows have at least one selection', () => {
    const subquestions = [
      makeSubquestion({ id: 'sq-1', code: 'SQ001' }),
      makeSubquestion({ id: 'sq-2', code: 'SQ002' }),
    ]
    const question = makeQuestion({
      settings: makeSettings({ is_all_rows_required: true }),
      subquestions,
    })
    render(
      <MatrixMultipleInput
        value={{ SQ001: ['A1'], SQ002: ['A1'] }}
        onChange={vi.fn()}
        question={question}
      />
    )

    fireEvent.blur(screen.getByTestId('matrix-multiple-input-q-matrix-mult-1'))

    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// External errors prop
// ---------------------------------------------------------------------------

describe('MatrixMultipleInput — external errors prop', () => {
  it('displays external errors immediately without blur', () => {
    render(
      <MatrixMultipleInput
        value={{}}
        onChange={vi.fn()}
        question={makeQuestion()}
        errors={['Server error occurred']}
      />
    )
    expect(screen.getByTestId('validation-errors')).toHaveTextContent('Server error occurred')
  })
})

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('MatrixMultipleInput — accessibility', () => {
  it('does not set aria-invalid when no errors', () => {
    render(<MatrixMultipleInput value={{}} onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByRole('table')).toHaveAttribute('aria-invalid', 'false')
  })

  it('sets aria-invalid=true when errors present', () => {
    render(
      <MatrixMultipleInput
        value={{}}
        onChange={vi.fn()}
        question={makeQuestion()}
        errors={['Required']}
      />
    )
    expect(screen.getByRole('table')).toHaveAttribute('aria-invalid', 'true')
  })

  it('sets aria-describedby pointing to error container when errors present', () => {
    const question = makeQuestion({ id: 'q-test' })
    render(
      <MatrixMultipleInput
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
})
