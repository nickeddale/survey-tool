import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ResponseDetail, { formatAnswerValue } from '../ResponseDetail'
import type { ResponseDetailFull, ResponseAnswerDetail } from '../../../types/survey'

// ---------------------------------------------------------------------------
// formatAnswerValue unit tests
// ---------------------------------------------------------------------------

describe('formatAnswerValue', () => {
  it('returns — for null', () => {
    expect(formatAnswerValue(null)).toBe('—')
  })

  it('returns — for undefined', () => {
    expect(formatAnswerValue(undefined)).toBe('—')
  })

  it('returns — for empty string', () => {
    expect(formatAnswerValue('')).toBe('—')
  })

  it('returns string as-is for primitives', () => {
    expect(formatAnswerValue('hello')).toBe('hello')
    expect(formatAnswerValue(42)).toBe('42')
    expect(formatAnswerValue(true)).toBe('true')
  })

  it('joins arrays with comma', () => {
    expect(formatAnswerValue(['A1', 'A2', 'A3'])).toBe('A1, A2, A3')
  })

  it('renders plain objects as key: value pairs', () => {
    expect(formatAnswerValue({ SQ001: 'A3', SQ002: 'A1' })).toBe('SQ001: A3, SQ002: A1')
  })

  it('renders matrix_multiple values (object with array values)', () => {
    expect(formatAnswerValue({ SQ001: ['A1', 'A2'], SQ002: ['A3'] })).toBe(
      'SQ001: A1, A2, SQ002: A3'
    )
  })

  it('handles nested objects', () => {
    expect(formatAnswerValue({ col1: 'text', col2: 42 })).toBe('col1: text, col2: 42')
  })

  it('handles empty array', () => {
    expect(formatAnswerValue([])).toBe('')
  })

  it('handles empty object', () => {
    expect(formatAnswerValue({})).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAnswer(overrides: Partial<ResponseAnswerDetail> = {}): ResponseAnswerDetail {
  return {
    question_id: 'q1',
    question_code: 'Q1',
    question_title: 'Test Question',
    question_type: 'matrix',
    value: null,
    values: null,
    selected_option_title: null,
    subquestion_label: null,
    ...overrides,
  }
}

function makeResponse(answers: ResponseAnswerDetail[]): ResponseDetailFull {
  return {
    id: 'resp-1',
    status: 'complete',
    started_at: '2024-01-01T00:00:00Z',
    completed_at: '2024-01-01T01:00:00Z',
    ip_address: null,
    metadata: null,
    participant_id: null,
    answers,
  }
}

// ---------------------------------------------------------------------------
// ResponseDetail component: matrix answer rendering
// ---------------------------------------------------------------------------

describe('ResponseDetail — matrix answers', () => {
  it('renders matrix subquestion answers as a table without [object Object]', () => {
    // Matrix questions appear as subquestions with code Q1_SQ001, Q1_SQ002, etc.
    const answers: ResponseAnswerDetail[] = [
      makeAnswer({
        question_id: 'q1-sq1',
        question_code: 'Q1_SQ001',
        question_title: 'Q1 — Row 1',
        question_type: 'matrix',
        value: 'A3',
        subquestion_label: 'Row 1',
        selected_option_title: 'Agree',
      }),
      makeAnswer({
        question_id: 'q1-sq2',
        question_code: 'Q1_SQ002',
        question_title: 'Q1 — Row 2',
        question_type: 'matrix',
        value: 'A1',
        subquestion_label: 'Row 2',
        selected_option_title: 'Disagree',
      }),
    ]

    render(<ResponseDetail response={makeResponse(answers)} />)

    // Should show selected option titles, not [object Object]
    expect(screen.getByText('Agree')).toBeInTheDocument()
    expect(screen.getByText('Disagree')).toBeInTheDocument()
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument()
  })

  it('renders matrix subquestion answer values when no option title is present', () => {
    const answers: ResponseAnswerDetail[] = [
      makeAnswer({
        question_id: 'q1-sq1',
        question_code: 'Q1_SQ001',
        question_title: 'Q1 — Satisfaction',
        question_type: 'matrix',
        value: 'A2',
        subquestion_label: 'Satisfaction',
        selected_option_title: null,
      }),
    ]

    render(<ResponseDetail response={makeResponse(answers)} />)

    expect(screen.getByText('A2')).toBeInTheDocument()
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument()
  })

  it('renders a matrix answer stored as a plain object without [object Object]', () => {
    // If the backend passes the full object as value on a single answer row
    const answers: ResponseAnswerDetail[] = [
      makeAnswer({
        question_id: 'q1',
        question_code: 'Q1',
        question_title: 'Matrix Question',
        question_type: 'matrix',
        value: { SQ001: 'A3', SQ002: 'A1' } as unknown,
        subquestion_label: null,
        selected_option_title: null,
      }),
    ]

    render(<ResponseDetail response={makeResponse(answers)} />)

    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument()
    // The object should be rendered as key: value pairs
    expect(screen.getByText('SQ001: A3, SQ002: A1')).toBeInTheDocument()
  })

  it('renders matrix_multiple answers (object with array values) without [object Object]', () => {
    const answers: ResponseAnswerDetail[] = [
      makeAnswer({
        question_id: 'q2',
        question_code: 'Q2',
        question_title: 'Multi Matrix Question',
        question_type: 'matrix_multiple',
        value: { SQ001: ['A1', 'A2'], SQ002: ['A3'] } as unknown,
        subquestion_label: null,
        selected_option_title: null,
      }),
    ]

    render(<ResponseDetail response={makeResponse(answers)} />)

    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument()
    expect(screen.getByText('SQ001: A1, A2, SQ002: A3')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// ResponseDetail component: non-matrix answers
// ---------------------------------------------------------------------------

describe('ResponseDetail — non-matrix answers', () => {
  it('shows No answer for null value', () => {
    const answers = [makeAnswer({ value: null, question_type: 'text_input' })]
    render(<ResponseDetail response={makeResponse(answers)} />)
    expect(screen.getByText('No answer')).toBeInTheDocument()
  })

  it('shows selected option title for choice questions', () => {
    const answers = [
      makeAnswer({
        question_type: 'single_choice',
        value: 'A1',
        selected_option_title: 'Option A',
      }),
    ]
    render(<ResponseDetail response={makeResponse(answers)} />)
    expect(screen.getByText('Option A')).toBeInTheDocument()
  })

  it('shows string value for text answers', () => {
    const answers = [makeAnswer({ question_type: 'text_input', value: 'My text answer' })]
    render(<ResponseDetail response={makeResponse(answers)} />)
    expect(screen.getByText('My text answer')).toBeInTheDocument()
  })
})
