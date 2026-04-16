/**
 * Tests for RatingInput component.
 *
 * Covers: icon rendering for each type, hover state, click-to-select,
 * required validation, aria attributes.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RatingInput } from '../RatingInput'
import type { BuilderQuestion } from '../../../store/builderStore'
import { getDefaultSettings } from '../../../types/questionSettings'
import type { RatingSettings } from '../../../types/questionSettings'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuestion(overrides: Partial<BuilderQuestion> = {}): BuilderQuestion {
  return {
    id: 'q-rating-1',
    group_id: 'g-1',
    parent_id: null,
    question_type: 'rating',
    code: 'Q1',
    title: 'Rate this',
    description: null,
    is_required: false,
    sort_order: 1,
    relevance: null,
    validation: null,
    settings: getDefaultSettings('rating'),
    created_at: '2024-01-01T00:00:00Z',
    answer_options: [],
    subquestions: [],
    ...overrides,
  }
}

function makeSettings(overrides: Partial<RatingSettings> = {}): RatingSettings {
  return {
    min: 1,
    max: 5,
    step: 1,
    icon: 'star',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('RatingInput — rendering', () => {
  it('renders container with question id in testid', () => {
    render(<RatingInput value="" onChange={vi.fn()} question={makeQuestion({ id: 'q-abc' })} />)
    expect(screen.getByTestId('rating-input-q-abc')).toBeInTheDocument()
  })

  it('renders the correct number of rating icons (1-5)', () => {
    const question = makeQuestion({ settings: makeSettings({ min: 1, max: 5, step: 1 }) })
    render(<RatingInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('rating-icon-1')).toBeInTheDocument()
    expect(screen.getByTestId('rating-icon-2')).toBeInTheDocument()
    expect(screen.getByTestId('rating-icon-3')).toBeInTheDocument()
    expect(screen.getByTestId('rating-icon-4')).toBeInTheDocument()
    expect(screen.getByTestId('rating-icon-5')).toBeInTheDocument()
  })

  it('renders icons for custom min/max range', () => {
    const question = makeQuestion({ settings: makeSettings({ min: 2, max: 4, step: 1 }) })
    render(<RatingInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('rating-icon-1')).not.toBeInTheDocument()
    expect(screen.getByTestId('rating-icon-2')).toBeInTheDocument()
    expect(screen.getByTestId('rating-icon-3')).toBeInTheDocument()
    expect(screen.getByTestId('rating-icon-4')).toBeInTheDocument()
    expect(screen.queryByTestId('rating-icon-5')).not.toBeInTheDocument()
  })

  it('renders icons with step > 1', () => {
    const question = makeQuestion({ settings: makeSettings({ min: 1, max: 10, step: 2 }) })
    render(<RatingInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('rating-icon-1')).toBeInTheDocument()
    expect(screen.getByTestId('rating-icon-3')).toBeInTheDocument()
    expect(screen.getByTestId('rating-icon-5')).toBeInTheDocument()
    expect(screen.queryByTestId('rating-icon-2')).not.toBeInTheDocument()
  })

  it('renders icons as radiogroup', () => {
    render(<RatingInput value="" onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId('rating-icons-group')).toBeInTheDocument()
    expect(screen.getByRole('radiogroup')).toBeInTheDocument()
  })

  it('marks the selected icon with aria-checked=true', () => {
    const question = makeQuestion({ settings: makeSettings({ min: 1, max: 5 }) })
    render(<RatingInput value="3" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('rating-icon-3')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('rating-icon-1')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByTestId('rating-icon-5')).toHaveAttribute('aria-checked', 'false')
  })

  it('marks icons up to selected value as filled', () => {
    const question = makeQuestion({ settings: makeSettings({ min: 1, max: 5 }) })
    render(<RatingInput value="3" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('rating-icon-1')).toHaveAttribute('data-filled', 'true')
    expect(screen.getByTestId('rating-icon-2')).toHaveAttribute('data-filled', 'true')
    expect(screen.getByTestId('rating-icon-3')).toHaveAttribute('data-filled', 'true')
    expect(screen.getByTestId('rating-icon-4')).toHaveAttribute('data-filled', 'false')
    expect(screen.getByTestId('rating-icon-5')).toHaveAttribute('data-filled', 'false')
  })

  it('renders no icons as filled when value is empty', () => {
    const question = makeQuestion({ settings: makeSettings({ min: 1, max: 3 }) })
    render(<RatingInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('rating-icon-1')).toHaveAttribute('data-filled', 'false')
    expect(screen.getByTestId('rating-icon-2')).toHaveAttribute('data-filled', 'false')
    expect(screen.getByTestId('rating-icon-3')).toHaveAttribute('data-filled', 'false')
  })
})

// ---------------------------------------------------------------------------
// Icon types
// ---------------------------------------------------------------------------

describe('RatingInput — icon types', () => {
  it.each(['star', 'heart', 'thumb', 'smiley'] as const)(
    'renders with %s icon type without errors',
    (icon) => {
      const question = makeQuestion({ settings: makeSettings({ icon }) })
      render(<RatingInput value="" onChange={vi.fn()} question={question} />)
      expect(screen.getByTestId('rating-icons-group')).toBeInTheDocument()
    }
  )
})

// ---------------------------------------------------------------------------
// Hover state
// ---------------------------------------------------------------------------

describe('RatingInput — hover state', () => {
  it('fills icons up to hovered value on mouseenter', () => {
    const question = makeQuestion({ settings: makeSettings({ min: 1, max: 5 }) })
    render(<RatingInput value="" onChange={vi.fn()} question={question} />)

    fireEvent.mouseEnter(screen.getByTestId('rating-icon-3'))

    expect(screen.getByTestId('rating-icon-1')).toHaveAttribute('data-filled', 'true')
    expect(screen.getByTestId('rating-icon-2')).toHaveAttribute('data-filled', 'true')
    expect(screen.getByTestId('rating-icon-3')).toHaveAttribute('data-filled', 'true')
    expect(screen.getByTestId('rating-icon-4')).toHaveAttribute('data-filled', 'false')
    expect(screen.getByTestId('rating-icon-5')).toHaveAttribute('data-filled', 'false')
  })

  it('reverts fill state on mouseleave', () => {
    const question = makeQuestion({ settings: makeSettings({ min: 1, max: 5 }) })
    render(<RatingInput value="" onChange={vi.fn()} question={question} />)

    fireEvent.mouseEnter(screen.getByTestId('rating-icon-3'))
    fireEvent.mouseLeave(screen.getByTestId('rating-icon-3'))

    expect(screen.getByTestId('rating-icon-1')).toHaveAttribute('data-filled', 'false')
    expect(screen.getByTestId('rating-icon-3')).toHaveAttribute('data-filled', 'false')
  })

  it('reverts to selected value fill state on mouseleave', () => {
    const question = makeQuestion({ settings: makeSettings({ min: 1, max: 5 }) })
    render(<RatingInput value="2" onChange={vi.fn()} question={question} />)

    fireEvent.mouseEnter(screen.getByTestId('rating-icon-5'))
    fireEvent.mouseLeave(screen.getByTestId('rating-icon-5'))

    expect(screen.getByTestId('rating-icon-1')).toHaveAttribute('data-filled', 'true')
    expect(screen.getByTestId('rating-icon-2')).toHaveAttribute('data-filled', 'true')
    expect(screen.getByTestId('rating-icon-3')).toHaveAttribute('data-filled', 'false')
    expect(screen.getByTestId('rating-icon-5')).toHaveAttribute('data-filled', 'false')
  })
})

// ---------------------------------------------------------------------------
// Click to select
// ---------------------------------------------------------------------------

describe('RatingInput — click to select', () => {
  it('calls onChange with rating value when icon is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const question = makeQuestion({ settings: makeSettings({ min: 1, max: 5 }) })
    render(<RatingInput value="" onChange={onChange} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('rating-icon-4'))
    })

    expect(onChange).toHaveBeenCalledWith('4')
  })

  it('calls onChange with min value when first icon is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const question = makeQuestion({ settings: makeSettings({ min: 1, max: 5 }) })
    render(<RatingInput value="" onChange={onChange} question={question} />)

    await act(async () => {
      await user.click(screen.getByTestId('rating-icon-1'))
    })

    expect(onChange).toHaveBeenCalledWith('1')
  })
})

// ---------------------------------------------------------------------------
// Required validation
// ---------------------------------------------------------------------------

describe('RatingInput — required validation', () => {
  it('does not show errors before blur (untouched)', () => {
    const question = makeQuestion({ is_required: true })
    render(<RatingInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })

  it('shows required error on blur when no rating selected', () => {
    const question = makeQuestion({ is_required: true })
    render(<RatingInput value="" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('rating-icons-group'))

    expect(screen.getByTestId('validation-errors')).toHaveTextContent('This field is required.')
  })

  it('does not show required error when not required', () => {
    const question = makeQuestion({ is_required: false })
    render(<RatingInput value="" onChange={vi.fn()} question={question} />)

    fireEvent.blur(screen.getByTestId('rating-icons-group'))

    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })

  it('shows required error after clicking an icon and clearing (via click)', async () => {
    const user = userEvent.setup()
    const question = makeQuestion({ is_required: true })
    render(<RatingInput value="" onChange={vi.fn()} question={question} />)

    // After clicking (which sets touched), blur without value triggers error
    await act(async () => {
      await user.click(screen.getByTestId('rating-icon-1'))
    })

    fireEvent.blur(screen.getByTestId('rating-icons-group'))
    // value prop is still "" (controlled), so should show error
    expect(screen.getByTestId('validation-errors')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// External errors prop
// ---------------------------------------------------------------------------

describe('RatingInput — external errors prop', () => {
  it('displays external errors immediately without blur', () => {
    render(
      <RatingInput
        value=""
        onChange={vi.fn()}
        question={makeQuestion()}
        errors={['Server error']}
      />
    )
    expect(screen.getByTestId('validation-errors')).toHaveTextContent('Server error')
  })
})

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('RatingInput — accessibility', () => {
  it('does not set aria-invalid on group when no errors', () => {
    render(<RatingInput value="" onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId('rating-icons-group')).toHaveAttribute('aria-invalid', 'false')
  })

  it('sets aria-invalid=true on group when errors present', () => {
    render(
      <RatingInput value="" onChange={vi.fn()} question={makeQuestion()} errors={['Required']} />
    )
    expect(screen.getByTestId('rating-icons-group')).toHaveAttribute('aria-invalid', 'true')
  })

  it('sets aria-describedby pointing to error container when errors present', () => {
    const question = makeQuestion({ id: 'q-test' })
    render(<RatingInput value="" onChange={vi.fn()} question={question} errors={['Required']} />)
    const group = screen.getByTestId('rating-icons-group')
    expect(group).toHaveAttribute('aria-describedby', 'question-q-test-error')
    expect(screen.getByTestId('validation-errors')).toHaveAttribute('id', 'question-q-test-error')
  })

  it('sets aria-label on each icon button', () => {
    const question = makeQuestion({ settings: makeSettings({ min: 1, max: 3 }) })
    render(<RatingInput value="" onChange={vi.fn()} question={question} />)
    expect(screen.getByTestId('rating-icon-1')).toHaveAttribute('aria-label', 'Rate 1')
    expect(screen.getByTestId('rating-icon-2')).toHaveAttribute('aria-label', 'Rate 2')
    expect(screen.getByTestId('rating-icon-3')).toHaveAttribute('aria-label', 'Rate 3')
  })
})
