/**
 * Tests for MatrixDynamicInput component.
 *
 * Covers: initial rows from row_count, column headers from answer_options,
 * Add Row button (respects max_row_count), Remove Row button (respects min_row_count),
 * cell value changes update values array, external errors, accessibility.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MatrixDynamicInput } from '../MatrixDynamicInput'
import type { BuilderQuestion } from '../../../store/builderStore'
import { getDefaultSettings } from '../../../types/questionSettings'
import type { MatrixDynamicSettings } from '../../../types/questionSettings'
import type { AnswerOptionResponse } from '../../../types/survey'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOption(overrides: Partial<AnswerOptionResponse> = {}): AnswerOptionResponse {
  return {
    id: 'opt-1',
    question_id: 'q-dyn-1',
    code: 'col1',
    title: 'Column 1',
    sort_order: 1,
    assessment_value: 0,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeQuestion(overrides: Partial<BuilderQuestion> = {}): BuilderQuestion {
  return {
    id: 'q-dyn-1',
    group_id: 'g-1',
    parent_id: null,
    question_type: 'matrix_dynamic',
    code: 'Q1',
    title: 'Add rows',
    description: null,
    is_required: false,
    sort_order: 1,
    relevance: null,
    validation: null,
    settings: getDefaultSettings('matrix_dynamic'),
    created_at: '2024-01-01T00:00:00Z',
    answer_options: [],
    subquestions: [],
    ...overrides,
  }
}

function makeSettings(overrides: Partial<MatrixDynamicSettings> = {}): MatrixDynamicSettings {
  return {
    row_count: 1,
    min_row_count: 0,
    max_row_count: null,
    add_row_text: 'Add row',
    remove_row_text: 'Remove',
    cell_type: 'text',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('MatrixDynamicInput — rendering', () => {
  it('renders container with question id in testid', () => {
    render(
      <MatrixDynamicInput value={[]} onChange={vi.fn()} question={makeQuestion({ id: 'q-abc' })} />
    )
    expect(screen.getByTestId('matrix-dynamic-input-q-abc')).toBeInTheDocument()
  })

  it('renders a table with thead and tbody', () => {
    const question = makeQuestion()
    render(<MatrixDynamicInput value={[]} onChange={vi.fn()} question={question} />)
    const table = screen.getByRole('table')
    expect(table.querySelector('thead')).toBeInTheDocument()
    expect(table.querySelector('tbody')).toBeInTheDocument()
  })

  it('renders column headers from answer_options', () => {
    const options = [
      makeOption({ id: 'opt-1', code: 'col1', title: 'First Name' }),
      makeOption({ id: 'opt-2', code: 'col2', title: 'Last Name' }),
    ]
    const question = makeQuestion({ answer_options: options })
    render(<MatrixDynamicInput value={[]} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('matrix-dynamic-col-col1')).toHaveTextContent('First Name')
    expect(screen.getByTestId('matrix-dynamic-col-col2')).toHaveTextContent('Last Name')
  })

  it('renders initial rows based on row_count when value is empty', () => {
    const question = makeQuestion({
      settings: makeSettings({ row_count: 3 }),
    })
    render(<MatrixDynamicInput value={[]} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('matrix-dynamic-row-0')).toBeInTheDocument()
    expect(screen.getByTestId('matrix-dynamic-row-1')).toBeInTheDocument()
    expect(screen.getByTestId('matrix-dynamic-row-2')).toBeInTheDocument()
  })

  it('renders rows from value prop when provided', () => {
    const options = [makeOption({ code: 'col1' })]
    const question = makeQuestion({ answer_options: options })
    const value = [{ col1: 'Alice' }, { col1: 'Bob' }]
    render(<MatrixDynamicInput value={value} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('matrix-dynamic-row-0')).toBeInTheDocument()
    expect(screen.getByTestId('matrix-dynamic-row-1')).toBeInTheDocument()
  })

  it('renders text input per cell', () => {
    const options = [makeOption({ code: 'col1' })]
    const question = makeQuestion({ answer_options: options })
    render(<MatrixDynamicInput value={[{}]} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('matrix-dynamic-input-0-col1')).toBeInTheDocument()
  })

  it('populates cell input with existing value', () => {
    const options = [makeOption({ code: 'col1' })]
    const question = makeQuestion({ answer_options: options })
    render(
      <MatrixDynamicInput value={[{ col1: 'Hello' }]} onChange={vi.fn()} question={question} />
    )
    const input = screen.getByTestId('matrix-dynamic-input-0-col1') as HTMLInputElement
    expect(input.value).toBe('Hello')
  })

  it('shows Add Row button by default', () => {
    const question = makeQuestion()
    render(<MatrixDynamicInput value={[]} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('matrix-dynamic-add-row')).toBeInTheDocument()
    expect(screen.getByTestId('matrix-dynamic-add-row')).toHaveTextContent('Add row')
  })

  it('uses custom add_row_text for the Add Row button', () => {
    const question = makeQuestion({
      settings: makeSettings({ add_row_text: 'Add entry' }),
    })
    render(<MatrixDynamicInput value={[]} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('matrix-dynamic-add-row')).toHaveTextContent('Add entry')
  })

  it('uses custom remove_row_text for the Remove button', () => {
    const question = makeQuestion({
      settings: makeSettings({ remove_row_text: 'Delete', min_row_count: 0 }),
    })
    render(<MatrixDynamicInput value={[{}]} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('matrix-dynamic-remove-0')).toHaveTextContent('Delete')
  })

  it('has an overflow-x-auto scroll container', () => {
    const question = makeQuestion()
    const { container } = render(
      <MatrixDynamicInput value={[]} onChange={vi.fn()} question={question} />
    )
    expect(container.querySelector('.overflow-x-auto')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Add Row
// ---------------------------------------------------------------------------

describe('MatrixDynamicInput — Add Row', () => {
  it('calls onChange with an extra empty row when Add Row is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const question = makeQuestion()
    render(<MatrixDynamicInput value={[{}]} onChange={onChange} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('matrix-dynamic-add-row'))
    })

    expect(onChange).toHaveBeenCalledWith([{}, {}])
  })

  it('hides Add Row button when max_row_count is reached', () => {
    const question = makeQuestion({
      settings: makeSettings({ max_row_count: 2 }),
    })
    render(<MatrixDynamicInput value={[{}, {}]} onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('matrix-dynamic-add-row')).not.toBeInTheDocument()
  })

  it('shows Add Row button when below max_row_count', () => {
    const question = makeQuestion({
      settings: makeSettings({ max_row_count: 3 }),
    })
    render(<MatrixDynamicInput value={[{}, {}]} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('matrix-dynamic-add-row')).toBeInTheDocument()
  })

  it('shows Add Row button when max_row_count is null (unlimited)', () => {
    const question = makeQuestion({
      settings: makeSettings({ max_row_count: null }),
    })
    render(<MatrixDynamicInput value={[{}, {}]} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('matrix-dynamic-add-row')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Remove Row
// ---------------------------------------------------------------------------

describe('MatrixDynamicInput — Remove Row', () => {
  it('calls onChange with row removed when Remove is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const options = [makeOption({ code: 'col1' })]
    const question = makeQuestion({ answer_options: options })
    render(
      <MatrixDynamicInput
        value={[{ col1: 'Alice' }, { col1: 'Bob' }]}
        onChange={onChange}
        question={question}
      />
    )

    await act(async () => {
      await user.click(screen.getByTestId('matrix-dynamic-remove-0'))
    })

    expect(onChange).toHaveBeenCalledWith([{ col1: 'Bob' }])
  })

  it('hides Remove button when at min_row_count', () => {
    const question = makeQuestion({
      settings: makeSettings({ min_row_count: 1 }),
    })
    render(<MatrixDynamicInput value={[{}]} onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('matrix-dynamic-remove-0')).not.toBeInTheDocument()
  })

  it('shows Remove button when above min_row_count', () => {
    const question = makeQuestion({
      settings: makeSettings({ min_row_count: 1 }),
    })
    render(<MatrixDynamicInput value={[{}, {}]} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('matrix-dynamic-remove-0')).toBeInTheDocument()
  })

  it('shows Remove button when min_row_count is 0 and rows > 0', () => {
    const question = makeQuestion({
      settings: makeSettings({ min_row_count: 0 }),
    })
    render(<MatrixDynamicInput value={[{}]} onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('matrix-dynamic-remove-0')).toBeInTheDocument()
  })

  it('hides Remove button when row_count=0 and value is empty (no rows rendered)', () => {
    const question = makeQuestion({
      settings: makeSettings({ row_count: 0, min_row_count: 0 }),
    })
    render(<MatrixDynamicInput value={[]} onChange={vi.fn()} question={question} />)
    // No rows, so no Remove button
    expect(screen.queryByTestId('matrix-dynamic-remove-0')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Cell value changes
// ---------------------------------------------------------------------------

describe('MatrixDynamicInput — cell value changes', () => {
  it('calls onChange with updated cell value when typing in a cell', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const options = [makeOption({ code: 'col1' })]
    const question = makeQuestion({ answer_options: options })
    render(<MatrixDynamicInput value={[{}]} onChange={onChange} question={question} />)

    await act(async () => {
      await user.type(screen.getByTestId('matrix-dynamic-input-0-col1'), 'Alice')
    })

    // Last call should have the full typed value
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(lastCall[0]['col1']).toBe('Alice')
  })

  it('only updates the changed row, preserving other rows', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const options = [makeOption({ code: 'col1' })]
    const question = makeQuestion({ answer_options: options })
    render(
      <MatrixDynamicInput
        value={[{ col1: 'Alice' }, { col1: 'Bob' }]}
        onChange={onChange}
        question={question}
      />
    )

    await act(async () => {
      await user.clear(screen.getByTestId('matrix-dynamic-input-1-col1'))
      await user.type(screen.getByTestId('matrix-dynamic-input-1-col1'), 'Charlie')
    })

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(lastCall[0]['col1']).toBe('Alice')
    expect(lastCall[1]['col1']).toBe('Charlie')
  })
})

// ---------------------------------------------------------------------------
// External errors prop
// ---------------------------------------------------------------------------

describe('MatrixDynamicInput — external errors prop', () => {
  it('displays external errors immediately', () => {
    const question = makeQuestion()
    render(
      <MatrixDynamicInput
        value={[]}
        onChange={vi.fn()}
        question={question}
        errors={['At least one row required']}
      />
    )
    expect(screen.getByTestId('validation-errors')).toHaveTextContent('At least one row required')
  })

  it('does not show error container when no errors', () => {
    const question = makeQuestion()
    render(<MatrixDynamicInput value={[]} onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('MatrixDynamicInput — accessibility', () => {
  it('does not set aria-invalid when no errors', () => {
    const question = makeQuestion()
    render(<MatrixDynamicInput value={[]} onChange={vi.fn()} question={question} />)
    expect(screen.getByRole('table')).toHaveAttribute('aria-invalid', 'false')
  })

  it('sets aria-invalid=true when errors present', () => {
    const question = makeQuestion()
    render(
      <MatrixDynamicInput value={[]} onChange={vi.fn()} question={question} errors={['Error']} />
    )
    expect(screen.getByRole('table')).toHaveAttribute('aria-invalid', 'true')
  })

  it('sets aria-describedby pointing to error container when errors present', () => {
    const question = makeQuestion({ id: 'q-test' })
    render(
      <MatrixDynamicInput value={[]} onChange={vi.fn()} question={question} errors={['Error']} />
    )
    const table = screen.getByRole('table')
    expect(table).toHaveAttribute('aria-describedby', 'question-q-test-error')
    expect(screen.getByTestId('validation-errors')).toHaveAttribute('id', 'question-q-test-error')
  })

  it('error list has role=alert and aria-live=assertive', () => {
    const question = makeQuestion()
    render(
      <MatrixDynamicInput value={[]} onChange={vi.fn()} question={question} errors={['Error']} />
    )
    const errorList = screen.getByTestId('validation-errors')
    expect(errorList).toHaveAttribute('role', 'alert')
    expect(errorList).toHaveAttribute('aria-live', 'assertive')
  })
})
