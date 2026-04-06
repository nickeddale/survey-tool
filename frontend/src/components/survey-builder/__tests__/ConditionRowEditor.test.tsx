/**
 * Unit tests for ValueInput and ConditionRowEditor sub-components.
 * Demonstrates independent testability without mounting the full LogicEditor tree.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ValueInput } from '../logic/ValueInput'
import { ConditionRowEditor } from '../logic/ConditionRowEditor'
import type { BuilderQuestion } from '../../../store/builderStore'
import type { ConditionRow } from '../logic/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.useRealTimers()
})

function makeQuestion(overrides: Partial<BuilderQuestion> = {}): BuilderQuestion {
  return {
    id: 'q1',
    group_id: 'g1',
    parent_id: null,
    question_type: 'short_text',
    code: 'Q1',
    title: 'What is your name?',
    description: null,
    is_required: false,
    sort_order: 1,
    relevance: null,
    validation: null,
    settings: null,
    created_at: '2024-01-08T10:00:00Z',
    subquestions: [],
    answer_options: [],
    ...overrides,
  }
}

function makeRow(overrides: Partial<ConditionRow> = {}): ConditionRow {
  return {
    type: 'condition',
    id: 'row1',
    questionCode: 'Q1',
    operator: '==',
    value: '',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// ValueInput tests
// ---------------------------------------------------------------------------

describe('ValueInput', () => {
  it('renders a text input for short_text question type', () => {
    const onChange = vi.fn()
    render(
      <ValueInput
        question={makeQuestion({ question_type: 'short_text' })}
        value="hello"
        onChange={onChange}
      />,
    )
    const input = screen.getByRole('textbox', { name: /condition value/i })
    expect(input).toBeInTheDocument()
    expect(input).toHaveValue('hello')
  })

  it('renders a number input for numeric question type', () => {
    const onChange = vi.fn()
    render(
      <ValueInput
        question={makeQuestion({ question_type: 'numeric' })}
        value="42"
        onChange={onChange}
      />,
    )
    const input = screen.getByRole('spinbutton', { name: /numeric value/i })
    expect(input).toBeInTheDocument()
    expect(input).toHaveValue(42)
  })

  it('renders a boolean select for boolean question type', () => {
    const onChange = vi.fn()
    render(
      <ValueInput
        question={makeQuestion({ question_type: 'boolean' })}
        value="true"
        onChange={onChange}
      />,
    )
    const select = screen.getByRole('combobox', { name: /boolean value/i })
    expect(select).toBeInTheDocument()
    expect(select).toHaveValue('true')
  })

  it('renders a choice select when answer_options are present', () => {
    const onChange = vi.fn()
    const question = makeQuestion({
      question_type: 'radio',
      answer_options: [
        { id: 'o1', code: 'opt1', title: 'Option 1', sort_order: 1, image_url: null },
        { id: 'o2', code: 'opt2', title: 'Option 2', sort_order: 2, image_url: null },
      ] as BuilderQuestion['answer_options'],
    })
    render(<ValueInput question={question} value="opt1" onChange={onChange} />)
    const select = screen.getByRole('combobox', { name: /choice value/i })
    expect(select).toBeInTheDocument()
    expect(select).toHaveValue('opt1')
  })

  it('falls back to text input for choice type with no answer_options', () => {
    const onChange = vi.fn()
    render(
      <ValueInput
        question={makeQuestion({ question_type: 'radio', answer_options: [] })}
        value=""
        onChange={onChange}
      />,
    )
    // Falls through to the text input fallback
    const input = screen.getByRole('textbox', { name: /condition value/i })
    expect(input).toBeInTheDocument()
  })

  it('calls onChange when text input changes', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ValueInput
        question={makeQuestion({ question_type: 'short_text' })}
        value=""
        onChange={onChange}
      />,
    )
    const input = screen.getByRole('textbox', { name: /condition value/i })
    await act(async () => {
      await user.type(input, 'a')
    })
    expect(onChange).toHaveBeenCalled()
  })

  it('disables input when disabled prop is true', () => {
    render(
      <ValueInput
        question={makeQuestion({ question_type: 'short_text' })}
        value=""
        onChange={vi.fn()}
        disabled
      />,
    )
    expect(screen.getByRole('textbox', { name: /condition value/i })).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// ConditionRowEditor tests
// ---------------------------------------------------------------------------

describe('ConditionRowEditor', () => {
  it('renders question selector with placeholder', () => {
    render(
      <ConditionRowEditor
        row={makeRow({ questionCode: '' })}
        previousQuestions={[makeQuestion()]}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        isOnly={true}
      />,
    )
    expect(screen.getByRole('combobox', { name: /select question/i })).toBeInTheDocument()
  })

  it('renders operator selector', () => {
    render(
      <ConditionRowEditor
        row={makeRow()}
        previousQuestions={[makeQuestion()]}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        isOnly={true}
      />,
    )
    expect(screen.getByRole('combobox', { name: /select operator/i })).toBeInTheDocument()
  })

  it('does not show remove button when isOnly is true', () => {
    render(
      <ConditionRowEditor
        row={makeRow()}
        previousQuestions={[makeQuestion()]}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        isOnly={true}
      />,
    )
    expect(screen.queryByRole('button', { name: /remove condition/i })).not.toBeInTheDocument()
  })

  it('shows remove button when isOnly is false', () => {
    render(
      <ConditionRowEditor
        row={makeRow()}
        previousQuestions={[makeQuestion()]}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        isOnly={false}
      />,
    )
    expect(screen.getByRole('button', { name: /remove condition/i })).toBeInTheDocument()
  })

  it('calls onRemove when remove button is clicked', async () => {
    const onRemove = vi.fn()
    const user = userEvent.setup()
    render(
      <ConditionRowEditor
        row={makeRow()}
        previousQuestions={[makeQuestion()]}
        onChange={vi.fn()}
        onRemove={onRemove}
        isOnly={false}
      />,
    )
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /remove condition/i }))
    })
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('calls onChange with reset operator when question changes', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    const numericQuestion = makeQuestion({ question_type: 'numeric', code: 'Q2', id: 'q2' })
    render(
      <ConditionRowEditor
        row={makeRow({ questionCode: 'Q1', operator: 'contains' })}
        previousQuestions={[makeQuestion(), numericQuestion]}
        onChange={onChange}
        onRemove={vi.fn()}
        isOnly={true}
      />,
    )
    const questionSelect = screen.getByRole('combobox', { name: /select question/i })
    await act(async () => {
      await user.selectOptions(questionSelect, 'Q2')
    })
    expect(onChange).toHaveBeenCalled()
    const callArg = onChange.mock.calls[0][0] as ConditionRow
    // 'contains' is not in NUMERIC_OPERATORS, so operator should reset to first numeric op (==)
    expect(callArg.questionCode).toBe('Q2')
    expect(callArg.operator).toBe('==')
  })

  it('hides ValueInput for is_empty operator', () => {
    render(
      <ConditionRowEditor
        row={makeRow({ operator: 'is_empty' })}
        previousQuestions={[makeQuestion()]}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        isOnly={true}
      />,
    )
    // ValueInput should not be rendered — no text/number/select for value
    expect(screen.queryByRole('textbox', { name: /condition value/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: /numeric value/i })).not.toBeInTheDocument()
  })

  it('disables selects when disabled prop is true', () => {
    render(
      <ConditionRowEditor
        row={makeRow()}
        previousQuestions={[makeQuestion()]}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        isOnly={true}
        disabled={true}
      />,
    )
    const questionSelect = screen.getByRole('combobox', { name: /select question/i })
    expect(questionSelect).toBeDisabled()
  })
})
