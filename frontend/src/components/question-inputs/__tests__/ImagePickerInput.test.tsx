/**
 * Tests for ImagePickerInput component.
 *
 * Covers: rendering image grid, single-select, multi-select with min/max_choices,
 * selection indicator, show_labels toggle, external errors, accessibility.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImagePickerInput } from '../ImagePickerInput'
import type { BuilderQuestion } from '../../../store/builderStore'
import { getDefaultSettings } from '../../../types/questionSettings'
import type { ImagePickerSettings } from '../../../types/questionSettings'
import type { AnswerOptionResponse } from '../../../types/survey'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOption(overrides: Partial<AnswerOptionResponse> = {}): AnswerOptionResponse {
  return {
    id: 'opt-1',
    question_id: 'q-ip-1',
    code: 'O1',
    title: 'Image Option 1',
    sort_order: 1,
    assessment_value: 0,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeQuestion(overrides: Partial<BuilderQuestion> = {}): BuilderQuestion {
  return {
    id: 'q-ip-1',
    group_id: 'g-1',
    parent_id: null,
    question_type: 'image_picker',
    code: 'Q1',
    title: 'Pick an image',
    description: null,
    is_required: false,
    sort_order: 1,
    relevance: null,
    validation: null,
    settings: getDefaultSettings('image_picker'),
    created_at: '2024-01-01T00:00:00Z',
    answer_options: [],
    subquestions: [],
    ...overrides,
  }
}

function makeSettings(overrides: Partial<ImagePickerSettings> = {}): ImagePickerSettings {
  return {
    multi_select: false,
    min_choices: null,
    max_choices: null,
    image_width: 200,
    image_height: 150,
    show_labels: true,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('ImagePickerInput — rendering', () => {
  it('renders container with question id in testid', () => {
    render(<ImagePickerInput value={[]} onChange={vi.fn()} question={makeQuestion({ id: 'q-abc' })} />)
    expect(screen.getByTestId('image-picker-input-q-abc')).toBeInTheDocument()
  })

  it('renders a button for each answer option', () => {
    const options = [
      makeOption({ id: 'opt-1', title: 'Cat' }),
      makeOption({ id: 'opt-2', title: 'Dog' }),
    ]
    render(<ImagePickerInput value={[]} onChange={vi.fn()} question={makeQuestion({ answer_options: options })} />)
    expect(screen.getByTestId('image-picker-option-opt-1')).toBeInTheDocument()
    expect(screen.getByTestId('image-picker-option-opt-2')).toBeInTheDocument()
  })

  it('renders image when option has image_url', () => {
    const options = [makeOption({ id: 'opt-1', image_url: 'https://example.com/cat.jpg', title: 'Cat' })]
    render(<ImagePickerInput value={[]} onChange={vi.fn()} question={makeQuestion({ answer_options: options })} />)
    expect(screen.getByTestId('image-picker-img-opt-1')).toBeInTheDocument()
    expect(screen.getByTestId('image-picker-img-opt-1')).toHaveAttribute('src', 'https://example.com/cat.jpg')
  })

  it('renders placeholder when option has no image_url', () => {
    const options = [makeOption({ id: 'opt-1', image_url: null, title: 'Cat' })]
    render(<ImagePickerInput value={[]} onChange={vi.fn()} question={makeQuestion({ answer_options: options })} />)
    expect(screen.getByTestId('image-picker-placeholder-opt-1')).toBeInTheDocument()
    expect(screen.getByText('No image')).toBeInTheDocument()
  })

  it('shows labels when show_labels is true', () => {
    const options = [makeOption({ id: 'opt-1', title: 'Cat Label' })]
    render(
      <ImagePickerInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion({ answer_options: options, settings: makeSettings({ show_labels: true }) })}
      />
    )
    expect(screen.getByTestId('image-picker-label-opt-1')).toBeInTheDocument()
    expect(screen.getByText('Cat Label')).toBeInTheDocument()
  })

  it('hides labels when show_labels is false', () => {
    const options = [makeOption({ id: 'opt-1', title: 'Cat Label' })]
    render(
      <ImagePickerInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion({ answer_options: options, settings: makeSettings({ show_labels: false }) })}
      />
    )
    expect(screen.queryByTestId('image-picker-label-opt-1')).not.toBeInTheDocument()
  })

  it('applies correct image dimensions', () => {
    const options = [makeOption({ id: 'opt-1' })]
    render(
      <ImagePickerInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion({ answer_options: options, settings: makeSettings({ image_width: 300, image_height: 200 }) })}
      />
    )
    const btn = screen.getByTestId('image-picker-option-opt-1')
    expect(btn).toHaveStyle({ width: '300px', minWidth: '300px' })
  })
})

// ---------------------------------------------------------------------------
// Single-select behavior
// ---------------------------------------------------------------------------

describe('ImagePickerInput — single-select', () => {
  it('calls onChange with selected option id on click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const options = [makeOption({ id: 'opt-1', title: 'A' })]
    render(
      <ImagePickerInput
        value={[]}
        onChange={onChange}
        question={makeQuestion({ answer_options: options })}
      />
    )
    await act(async () => {
      await user.click(screen.getByTestId('image-picker-option-opt-1'))
    })
    expect(onChange).toHaveBeenCalledWith(['opt-1'])
  })

  it('replaces selection when a different option is clicked (single-select)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const options = [
      makeOption({ id: 'opt-1', title: 'A' }),
      makeOption({ id: 'opt-2', title: 'B' }),
    ]
    render(
      <ImagePickerInput
        value={['opt-1']}
        onChange={onChange}
        question={makeQuestion({ answer_options: options })}
      />
    )
    await act(async () => {
      await user.click(screen.getByTestId('image-picker-option-opt-2'))
    })
    expect(onChange).toHaveBeenCalledWith(['opt-2'])
  })

  it('deselects when the same option is clicked again', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const options = [makeOption({ id: 'opt-1', title: 'A' })]
    render(
      <ImagePickerInput
        value={['opt-1']}
        onChange={onChange}
        question={makeQuestion({ answer_options: options })}
      />
    )
    await act(async () => {
      await user.click(screen.getByTestId('image-picker-option-opt-1'))
    })
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('shows selection overlay on selected item', () => {
    const options = [makeOption({ id: 'opt-1' })]
    render(
      <ImagePickerInput
        value={['opt-1']}
        onChange={vi.fn()}
        question={makeQuestion({ answer_options: options })}
      />
    )
    expect(screen.getByTestId('image-picker-overlay-opt-1')).toBeInTheDocument()
  })

  it('does not show overlay on unselected item', () => {
    const options = [makeOption({ id: 'opt-1' })]
    render(
      <ImagePickerInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion({ answer_options: options })}
      />
    )
    expect(screen.queryByTestId('image-picker-overlay-opt-1')).not.toBeInTheDocument()
  })

  it('uses radio role for single-select', () => {
    const options = [makeOption({ id: 'opt-1', title: 'A' })]
    render(
      <ImagePickerInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion({ answer_options: options, settings: makeSettings({ multi_select: false }) })}
      />
    )
    expect(screen.getByTestId('image-picker-option-opt-1')).toHaveAttribute('role', 'radio')
  })
})

// ---------------------------------------------------------------------------
// Multi-select behavior
// ---------------------------------------------------------------------------

describe('ImagePickerInput — multi-select', () => {
  it('uses checkbox role for multi-select', () => {
    const options = [makeOption({ id: 'opt-1', title: 'A' })]
    render(
      <ImagePickerInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion({ answer_options: options, settings: makeSettings({ multi_select: true }) })}
      />
    )
    expect(screen.getByTestId('image-picker-option-opt-1')).toHaveAttribute('role', 'checkbox')
  })

  it('allows multiple selections in multi-select mode', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const options = [
      makeOption({ id: 'opt-1', title: 'A' }),
      makeOption({ id: 'opt-2', title: 'B' }),
    ]
    render(
      <ImagePickerInput
        value={['opt-1']}
        onChange={onChange}
        question={makeQuestion({ answer_options: options, settings: makeSettings({ multi_select: true }) })}
      />
    )
    await act(async () => {
      await user.click(screen.getByTestId('image-picker-option-opt-2'))
    })
    expect(onChange).toHaveBeenCalledWith(['opt-1', 'opt-2'])
  })

  it('shows min_choices error on blur when too few selected', () => {
    const options = [
      makeOption({ id: 'opt-1', title: 'A' }),
      makeOption({ id: 'opt-2', title: 'B' }),
      makeOption({ id: 'opt-3', title: 'C' }),
    ]
    render(
      <ImagePickerInput
        value={['opt-1']}
        onChange={vi.fn()}
        question={makeQuestion({
          answer_options: options,
          settings: makeSettings({ multi_select: true, min_choices: 2 }),
        })}
      />
    )
    fireEvent.blur(screen.getByTestId('image-picker-input-q-ip-1'))
    expect(screen.getByTestId('validation-errors')).toHaveTextContent('at least 2')
  })

  it('shows max_choices error on blur when too many selected', () => {
    const options = [
      makeOption({ id: 'opt-1', title: 'A' }),
      makeOption({ id: 'opt-2', title: 'B' }),
      makeOption({ id: 'opt-3', title: 'C' }),
    ]
    render(
      <ImagePickerInput
        value={['opt-1', 'opt-2', 'opt-3']}
        onChange={vi.fn()}
        question={makeQuestion({
          answer_options: options,
          settings: makeSettings({ multi_select: true, max_choices: 2 }),
        })}
      />
    )
    fireEvent.blur(screen.getByTestId('image-picker-input-q-ip-1'))
    expect(screen.getByTestId('validation-errors')).toHaveTextContent('at most 2')
  })
})

// ---------------------------------------------------------------------------
// Validation — required
// ---------------------------------------------------------------------------

describe('ImagePickerInput — required validation', () => {
  it('does not show error before blur', () => {
    render(
      <ImagePickerInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion({ is_required: true })}
      />
    )
    expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument()
  })

  it('shows required error on blur when nothing selected', () => {
    render(
      <ImagePickerInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion({ is_required: true })}
      />
    )
    fireEvent.blur(screen.getByTestId('image-picker-input-q-ip-1'))
    expect(screen.getByTestId('validation-errors')).toHaveTextContent('This field is required.')
  })
})

// ---------------------------------------------------------------------------
// External errors prop
// ---------------------------------------------------------------------------

describe('ImagePickerInput — external errors', () => {
  it('displays external errors immediately without blur', () => {
    render(
      <ImagePickerInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion()}
        errors={['An error from server']}
      />
    )
    expect(screen.getByTestId('validation-errors')).toHaveTextContent('An error from server')
  })
})

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('ImagePickerInput — accessibility', () => {
  it('sets aria-invalid=false on grid when no errors', () => {
    render(<ImagePickerInput value={[]} onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId('image-picker-grid')).toHaveAttribute('aria-invalid', 'false')
  })

  it('sets aria-invalid=true when errors present', () => {
    render(
      <ImagePickerInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion()}
        errors={['Error']}
      />
    )
    expect(screen.getByTestId('image-picker-grid')).toHaveAttribute('aria-invalid', 'true')
  })

  it('sets aria-describedby pointing to error container when errors present', () => {
    render(
      <ImagePickerInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion({ id: 'q-test' })}
        errors={['Error']}
      />
    )
    const grid = screen.getByTestId('image-picker-grid')
    expect(grid).toHaveAttribute('aria-describedby', 'question-q-test-error')
    expect(screen.getByTestId('validation-errors')).toHaveAttribute('id', 'question-q-test-error')
  })

  it('sets aria-checked=true on selected option', () => {
    const options = [makeOption({ id: 'opt-1', title: 'A' })]
    render(
      <ImagePickerInput
        value={['opt-1']}
        onChange={vi.fn()}
        question={makeQuestion({ answer_options: options })}
      />
    )
    expect(screen.getByTestId('image-picker-option-opt-1')).toHaveAttribute('aria-checked', 'true')
  })

  it('sets aria-checked=false on unselected option', () => {
    const options = [makeOption({ id: 'opt-1', title: 'A' })]
    render(
      <ImagePickerInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion({ answer_options: options })}
      />
    )
    expect(screen.getByTestId('image-picker-option-opt-1')).toHaveAttribute('aria-checked', 'false')
  })
})
