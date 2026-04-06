/**
 * Tests for BooleanInput component.
 *
 * Covers: all three render_as modes (toggle/radio/checkbox), custom labels,
 * required validation, aria attributes.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BooleanInput } from '../BooleanInput'
import type { BuilderQuestion } from '../../../store/builderStore'
import { getDefaultSettings } from '../../../types/questionSettings'
import type { BooleanSettings } from '../../../types/questionSettings'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuestion(overrides: Partial<BuilderQuestion> = {}): BuilderQuestion {
  return {
    id: 'q-boolean-1',
    group_id: 'g-1',
    parent_id: null,
    question_type: 'boolean',
    code: 'Q1',
    title: 'Yes or No?',
    description: null,
    is_required: false,
    sort_order: 1,
    relevance: null,
    validation: null,
    settings: getDefaultSettings('boolean'),
    created_at: '2024-01-01T00:00:00Z',
    answer_options: [],
    subquestions: [],
    ...overrides,
  }
}

function makeSettings(overrides: Partial<BooleanSettings> = {}): BooleanSettings {
  return {
    true_label: 'Yes',
    false_label: 'No',
    default_value: null,
    render_as: 'toggle',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Toggle mode
// ---------------------------------------------------------------------------

describe('BooleanInput — toggle mode', () => {
  it('renders container with question id in testid', () => {
    render(<BooleanInput value="" onChange={vi.fn()} question={makeQuestion({ id: 'q-abc' })} />)
    expect(screen.getByTestId('boolean-input-q-abc')).toBeInTheDocument()
  })

  it('renders toggle button', () => {
    render(<BooleanInput value="" onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId('boolean-toggle')).toBeInTheDocument()
  })

  it('toggle is not checked when value is empty', () => {
    render(<BooleanInput value="" onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId('boolean-toggle')).toHaveAttribute('aria-checked', 'false')
  })

  it('toggle is checked when value is "true"', () => {
    render(<BooleanInput value="true" onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId('boolean-toggle')).toHaveAttribute('aria-checked', 'true')
  })

  it('toggle is not checked when value is "false"', () => {
    render(<BooleanInput value="false" onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId('boolean-toggle')).toHaveAttribute('aria-checked', 'false')
  })

  it('calls onChange with "true" when toggled from false', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<BooleanInput value="false" onChange={onChange} question={makeQuestion()} />)

    await act(async () => {
      await user.click(screen.getByTestId('boolean-toggle'))
    })

    expect(onChange).toHaveBeenCalledWith('true')
  })

  it('calls onChange with "false" when toggled from true', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<BooleanInput value="true" onChange={onChange} question={makeQuestion()} />)

    await act(async () => {
      await user.click(screen.getByTestId('boolean-toggle'))
    })

    expect(onChange).toHaveBeenCalledWith('false')
  })

  it('shows false_label when value is not true', () => {
    const question = makeQuestion({ settings: makeSettings({ false_label: 'Nope' }) })
    render(<BooleanInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('boolean-toggle-current-label')).toHaveTextContent('Nope')
  })

  it('shows true_label when value is "true"', () => {
    const question = makeQuestion({ settings: makeSettings({ true_label: 'Sure' }) })
    render(<BooleanInput value="true" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('boolean-toggle-current-label')).toHaveTextContent('Sure')
  })

  it('toggle has role=switch', () => {
    render(<BooleanInput value="" onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByRole('switch')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Radio mode
// ---------------------------------------------------------------------------

describe('BooleanInput — radio mode', () => {
  it('renders radio group', () => {
    const question = makeQuestion({ settings: makeSettings({ render_as: 'radio' }) })
    render(<BooleanInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('boolean-radio-group')).toBeInTheDocument()
    expect(screen.getByRole('radiogroup')).toBeInTheDocument()
  })

  it('renders true and false radio buttons', () => {
    const question = makeQuestion({ settings: makeSettings({ render_as: 'radio' }) })
    render(<BooleanInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('boolean-radio-true')).toBeInTheDocument()
    expect(screen.getByTestId('boolean-radio-false')).toBeInTheDocument()
  })

  it('shows custom true/false labels', () => {
    const question = makeQuestion({
      settings: makeSettings({ render_as: 'radio', true_label: 'Agree', false_label: 'Disagree' }),
    })
    render(<BooleanInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByText('Agree')).toBeInTheDocument()
    expect(screen.getByText('Disagree')).toBeInTheDocument()
  })

  it('checks the true radio when value is "true"', () => {
    const question = makeQuestion({ settings: makeSettings({ render_as: 'radio' }) })
    render(<BooleanInput value="true" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('boolean-radio-true')).toBeChecked()
    expect(screen.getByTestId('boolean-radio-false')).not.toBeChecked()
  })

  it('checks the false radio when value is "false"', () => {
    const question = makeQuestion({ settings: makeSettings({ render_as: 'radio' }) })
    render(<BooleanInput value="false" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('boolean-radio-false')).toBeChecked()
    expect(screen.getByTestId('boolean-radio-true')).not.toBeChecked()
  })

  it('calls onChange with "true" when true radio is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const question = makeQuestion({ settings: makeSettings({ render_as: 'radio' }) })
    render(<BooleanInput value="" onChange={onChange} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('boolean-radio-true'))
    })

    expect(onChange).toHaveBeenCalledWith('true')
  })

  it('calls onChange with "false" when false radio is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const question = makeQuestion({ settings: makeSettings({ render_as: 'radio' }) })
    render(<BooleanInput value="" onChange={onChange} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('boolean-radio-false'))
    })

    expect(onChange).toHaveBeenCalledWith('false')
  })
})

// ---------------------------------------------------------------------------
// Checkbox mode
// ---------------------------------------------------------------------------

describe('BooleanInput — checkbox mode', () => {
  it('renders checkbox', () => {
    const question = makeQuestion({ settings: makeSettings({ render_as: 'checkbox' }) })
    render(<BooleanInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('boolean-checkbox')).toBeInTheDocument()
  })

  it('checkbox is checked when value is "true"', () => {
    const question = makeQuestion({ settings: makeSettings({ render_as: 'checkbox' }) })
    render(<BooleanInput value="true" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('boolean-checkbox')).toBeChecked()
  })

  it('checkbox is not checked when value is "false"', () => {
    const question = makeQuestion({ settings: makeSettings({ render_as: 'checkbox' }) })
    render(<BooleanInput value="false" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('boolean-checkbox')).not.toBeChecked()
  })

  it('calls onChange with "true" when checkbox is checked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const question = makeQuestion({ settings: makeSettings({ render_as: 'checkbox' }) })
    render(<BooleanInput value="false" onChange={onChange} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('boolean-checkbox'))
    })

    expect(onChange).toHaveBeenCalledWith('true')
  })

  it('calls onChange with "false" when checkbox is unchecked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const question = makeQuestion({ settings: makeSettings({ render_as: 'checkbox' }) })
    render(<BooleanInput value="true" onChange={onChange} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('boolean-checkbox'))
    })

    expect(onChange).toHaveBeenCalledWith('false')
  })

  it('shows true_label when checked', () => {
    const question = makeQuestion({
      settings: makeSettings({ render_as: 'checkbox', true_label: 'Confirmed' }),
    })
    render(<BooleanInput value="true" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('boolean-checkbox-label')).toHaveTextContent('Confirmed')
  })

  it('shows false_label when unchecked', () => {
    const question = makeQuestion({
      settings: makeSettings({ render_as: 'checkbox', false_label: 'Not confirmed' }),
    })
    render(<BooleanInput value="false" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('boolean-checkbox-label')).toHaveTextContent('Not confirmed')
  })
})

// ---------------------------------------------------------------------------
// Required validation
// ---------------------------------------------------------------------------

describe('BooleanInput — required validation (toggle)', () => {
  it('does not show errors before blur (untouched)', () => {
    const question = makeQuestion({ is_required: true })
    render(<BooleanInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })

  it('shows required error on blur when no value and required', () => {
    const question = makeQuestion({ is_required: true })
    render(<BooleanInput value="" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('boolean-toggle'))

    expect(screen.getByTestId('validation-errors')).toHaveTextContent('This field is required.')
  })

  it('does not show required error when not required', () => {
    const question = makeQuestion({ is_required: false })
    render(<BooleanInput value="" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('boolean-toggle'))

    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })
})

describe('BooleanInput — required validation (radio)', () => {
  it('shows required error on blur when no value and required', () => {
    const question = makeQuestion({
      is_required: true,
      settings: makeSettings({ render_as: 'radio' }),
    })
    render(<BooleanInput value="" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('boolean-radio-group'))

    expect(screen.getByTestId('validation-errors')).toHaveTextContent('This field is required.')
  })
})

// ---------------------------------------------------------------------------
// External errors prop
// ---------------------------------------------------------------------------

describe('BooleanInput — external errors prop', () => {
  it('displays external errors immediately without blur', () => {
    render(
      <BooleanInput value="" onChange={vi.fn()} question={makeQuestion()} errors={['Server error']} />
    )
    expect(screen.getByTestId('validation-errors')).toHaveTextContent('Server error')
  })
})

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('BooleanInput — accessibility (toggle)', () => {
  it('does not set aria-invalid when no errors', () => {
    render(<BooleanInput value="" onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId('boolean-toggle')).toHaveAttribute('aria-invalid', 'false')
  })

  it('sets aria-invalid=true when errors present', () => {
    render(
      <BooleanInput value="" onChange={vi.fn()} question={makeQuestion()} errors={['Required']} />
    )
    expect(screen.getByTestId('boolean-toggle')).toHaveAttribute('aria-invalid', 'true')
  })

  it('sets aria-describedby pointing to error container when errors present', () => {
    const question = makeQuestion({ id: 'q-test' })
    render(
      <BooleanInput value="" onChange={vi.fn()} question={question} errors={['Required']} />
    )
    const toggle = screen.getByTestId('boolean-toggle')
    expect(toggle).toHaveAttribute('aria-describedby', 'question-q-test-error')
    expect(screen.getByTestId('validation-errors')).toHaveAttribute('id', 'question-q-test-error')
  })
})
