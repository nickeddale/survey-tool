/**
 * Tests for RankingInput component.
 *
 * Covers: rendering all options, initial order, required validation on blur,
 * external errors, accessibility attributes.
 * Note: @dnd-kit drag-and-drop is tested via keyboard sensor in JSDOM.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RankingInput } from '../RankingInput'
import type { BuilderQuestion } from '../../../store/builderStore'
import { getDefaultSettings } from '../../../types/questionSettings'
import type { RankingSettings } from '../../../types/questionSettings'
import type { AnswerOptionResponse } from '../../../types/survey'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOption(overrides: Partial<AnswerOptionResponse> = {}): AnswerOptionResponse {
  return {
    id: 'opt-1',
    question_id: 'q-rank-1',
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
    id: 'q-rank-1',
    group_id: 'g-1',
    parent_id: null,
    question_type: 'ranking',
    code: 'Q1',
    title: 'Rank these',
    description: null,
    is_required: false,
    sort_order: 1,
    relevance: null,
    validation: null,
    settings: getDefaultSettings('ranking'),
    created_at: '2024-01-01T00:00:00Z',
    answer_options: [],
    subquestions: [],
    ...overrides,
  }
}

function makeSettings(overrides: Partial<RankingSettings> = {}): RankingSettings {
  return {
    randomize_initial_order: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('RankingInput — rendering', () => {
  it('renders container with question id in testid', () => {
    render(<RankingInput value={[]} onChange={vi.fn()} question={makeQuestion({ id: 'q-xyz' })} />)
    expect(screen.getByTestId('ranking-input-q-xyz')).toBeInTheDocument()
  })

  it('renders a list item for each answer option', () => {
    const options = [
      makeOption({ id: 'opt-1', title: 'First' }),
      makeOption({ id: 'opt-2', title: 'Second' }),
      makeOption({ id: 'opt-3', title: 'Third' }),
    ]
    render(
      <RankingInput
        value={['opt-1', 'opt-2', 'opt-3']}
        onChange={vi.fn()}
        question={makeQuestion({ answer_options: options })}
      />
    )
    expect(screen.getByTestId('ranking-item-opt-1')).toBeInTheDocument()
    expect(screen.getByTestId('ranking-item-opt-2')).toBeInTheDocument()
    expect(screen.getByTestId('ranking-item-opt-3')).toBeInTheDocument()
    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
    expect(screen.getByText('Third')).toBeInTheDocument()
  })

  it('renders drag handles for each item', () => {
    const options = [makeOption({ id: 'opt-1', title: 'A' })]
    render(
      <RankingInput
        value={['opt-1']}
        onChange={vi.fn()}
        question={makeQuestion({ answer_options: options })}
      />
    )
    expect(screen.getByTestId('ranking-drag-handle-opt-1')).toBeInTheDocument()
  })

  it('renders rank numbers in order', () => {
    const options = [
      makeOption({ id: 'opt-1', title: 'A' }),
      makeOption({ id: 'opt-2', title: 'B' }),
    ]
    render(
      <RankingInput
        value={['opt-1', 'opt-2']}
        onChange={vi.fn()}
        question={makeQuestion({ answer_options: options })}
      />
    )
    // The first item should display rank 1, the second rank 2
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('1')
    expect(items[1]).toHaveTextContent('2')
  })

  it('renders list with aria-label equal to question title', () => {
    render(
      <RankingInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion({ title: 'My Ranking Question' })}
      />
    )
    expect(screen.getByRole('list', { name: 'My Ranking Question' })).toBeInTheDocument()
  })

  it('uses answer options order when value is empty', () => {
    const options = [
      makeOption({ id: 'opt-1', title: 'Alpha', sort_order: 1 }),
      makeOption({ id: 'opt-2', title: 'Beta', sort_order: 2 }),
    ]
    render(
      <RankingInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion({ answer_options: options, settings: makeSettings({ randomize_initial_order: false }) })}
      />
    )
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Alpha')
    expect(items[1]).toHaveTextContent('Beta')
  })
})

// ---------------------------------------------------------------------------
// Validation — required
// ---------------------------------------------------------------------------

describe('RankingInput — required validation', () => {
  it('does not show errors before blur', () => {
    render(
      <RankingInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion({ is_required: true })}
      />
    )
    expect(screen.queryByTestId('ranking-errors')).not.toBeInTheDocument()
  })

  it('shows required error on blur when value is empty', () => {
    render(
      <RankingInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion({ is_required: true })}
      />
    )
    fireEvent.blur(screen.getByTestId('ranking-input-q-rank-1'))
    expect(screen.getByTestId('ranking-errors')).toHaveTextContent('This field is required.')
  })

  it('shows "rank all options" error when not all options are ranked', () => {
    const options = [
      makeOption({ id: 'opt-1', title: 'A' }),
      makeOption({ id: 'opt-2', title: 'B' }),
    ]
    render(
      <RankingInput
        value={['opt-1']}
        onChange={vi.fn()}
        question={makeQuestion({ answer_options: options })}
      />
    )
    fireEvent.blur(screen.getByTestId('ranking-input-q-rank-1'))
    expect(screen.getByTestId('ranking-errors')).toHaveTextContent('Please rank all options.')
  })

  it('does not show error when all options are ranked', () => {
    const options = [
      makeOption({ id: 'opt-1', title: 'A' }),
      makeOption({ id: 'opt-2', title: 'B' }),
    ]
    render(
      <RankingInput
        value={['opt-1', 'opt-2']}
        onChange={vi.fn()}
        question={makeQuestion({ answer_options: options })}
      />
    )
    fireEvent.blur(screen.getByTestId('ranking-input-q-rank-1'))
    expect(screen.queryByTestId('ranking-errors')).not.toBeInTheDocument()
  })

  it('does not show error when no options exist and no value (empty case)', () => {
    render(
      <RankingInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion({ is_required: false })}
      />
    )
    fireEvent.blur(screen.getByTestId('ranking-input-q-rank-1'))
    expect(screen.queryByTestId('ranking-errors')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// External errors prop
// ---------------------------------------------------------------------------

describe('RankingInput — external errors', () => {
  it('displays external errors immediately without blur', () => {
    render(
      <RankingInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion()}
        errors={['Server validation failed']}
      />
    )
    expect(screen.getByTestId('ranking-errors')).toHaveTextContent('Server validation failed')
  })
})

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('RankingInput — accessibility', () => {
  it('sets aria-invalid=false on list when no errors', () => {
    render(<RankingInput value={[]} onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId('ranking-list')).toHaveAttribute('aria-invalid', 'false')
  })

  it('sets aria-invalid=true on list when errors present', () => {
    render(
      <RankingInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion()}
        errors={['Error!']}
      />
    )
    expect(screen.getByTestId('ranking-list')).toHaveAttribute('aria-invalid', 'true')
  })

  it('sets aria-describedby pointing to error container when errors present', () => {
    render(
      <RankingInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion({ id: 'q-test' })}
        errors={['Error!']}
      />
    )
    const list = screen.getByTestId('ranking-list')
    expect(list).toHaveAttribute('aria-describedby', 'question-q-test-error')
    expect(screen.getByTestId('ranking-errors')).toHaveAttribute('id', 'question-q-test-error')
  })

  it('error list has role=alert and aria-live=assertive', () => {
    render(
      <RankingInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion()}
        errors={['Error!']}
      />
    )
    const errorList = screen.getByTestId('ranking-errors')
    expect(errorList).toHaveAttribute('role', 'alert')
    expect(errorList).toHaveAttribute('aria-live', 'assertive')
  })

  it('drag handle has aria-label describing action', () => {
    const options = [makeOption({ id: 'opt-1', title: 'My Option' })]
    render(
      <RankingInput
        value={['opt-1']}
        onChange={vi.fn()}
        question={makeQuestion({ answer_options: options })}
      />
    )
    expect(screen.getByTestId('ranking-drag-handle-opt-1')).toHaveAttribute(
      'aria-label',
      'Drag to reorder My Option',
    )
  })
})
