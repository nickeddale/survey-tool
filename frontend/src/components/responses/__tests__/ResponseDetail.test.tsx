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
    matrix_column_headers: null,
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

const SAMPLE_COLUMN_HEADERS = [
  { code: 'A1', title: 'Strongly Agree' },
  { code: 'A2', title: 'Agree' },
  { code: 'A3', title: 'Disagree' },
  { code: 'A4', title: 'Strongly Disagree' },
]

// ---------------------------------------------------------------------------
// ResponseDetail component: matrix_single / matrix answer grid rendering
// ---------------------------------------------------------------------------

describe('ResponseDetail — matrix_single grid rendering', () => {
  it('renders column headers as table headers', () => {
    const answers: ResponseAnswerDetail[] = [
      makeAnswer({
        question_id: 'q1-sq1',
        question_code: 'Q1_SQ001',
        question_title: 'Q1 — Row 1',
        question_type: 'matrix_single',
        value: 'A2',
        subquestion_label: 'Row 1',
        matrix_column_headers: SAMPLE_COLUMN_HEADERS,
      }),
    ]

    render(<ResponseDetail response={makeResponse(answers)} />)

    expect(screen.getByText('Strongly Agree')).toBeInTheDocument()
    expect(screen.getByText('Agree')).toBeInTheDocument()
    expect(screen.getByText('Disagree')).toBeInTheDocument()
    expect(screen.getByText('Strongly Disagree')).toBeInTheDocument()
  })

  it('marks the selected column with a checkmark', () => {
    const answers: ResponseAnswerDetail[] = [
      makeAnswer({
        question_id: 'q1-sq1',
        question_code: 'Q1_SQ001',
        question_title: 'Q1 — Row 1',
        question_type: 'matrix_single',
        value: 'A2',
        subquestion_label: 'Row 1',
        matrix_column_headers: SAMPLE_COLUMN_HEADERS,
      }),
    ]

    render(<ResponseDetail response={makeResponse(answers)} />)

    // Selected cell has aria-label="selected"
    const selectedCells = screen.getAllByLabelText('selected')
    expect(selectedCells).toHaveLength(1)
  })

  it('renders subquestion labels as row headers', () => {
    const answers: ResponseAnswerDetail[] = [
      makeAnswer({
        question_id: 'q1-sq1',
        question_code: 'Q1_SQ001',
        question_title: 'Q1 — Row 1',
        question_type: 'matrix_single',
        value: 'A1',
        subquestion_label: 'Row One',
        matrix_column_headers: SAMPLE_COLUMN_HEADERS,
      }),
      makeAnswer({
        question_id: 'q1-sq2',
        question_code: 'Q1_SQ002',
        question_title: 'Q1 — Row 2',
        question_type: 'matrix_single',
        value: 'A3',
        subquestion_label: 'Row Two',
        matrix_column_headers: SAMPLE_COLUMN_HEADERS,
      }),
    ]

    render(<ResponseDetail response={makeResponse(answers)} />)

    expect(screen.getByText('Row One')).toBeInTheDocument()
    expect(screen.getByText('Row Two')).toBeInTheDocument()
  })

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
        matrix_column_headers: SAMPLE_COLUMN_HEADERS,
      }),
      makeAnswer({
        question_id: 'q1-sq2',
        question_code: 'Q1_SQ002',
        question_title: 'Q1 — Row 2',
        question_type: 'matrix',
        value: 'A1',
        subquestion_label: 'Row 2',
        selected_option_title: 'Disagree',
        matrix_column_headers: SAMPLE_COLUMN_HEADERS,
      }),
    ]

    render(<ResponseDetail response={makeResponse(answers)} />)

    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument()
    // Column headers should be shown
    expect(screen.getAllByLabelText('selected')).toHaveLength(2)
  })

  it('falls back gracefully when column headers are absent', () => {
    const answers: ResponseAnswerDetail[] = [
      makeAnswer({
        question_id: 'q1-sq1',
        question_code: 'Q1_SQ001',
        question_title: 'Q1 — Satisfaction',
        question_type: 'matrix',
        value: 'A2',
        subquestion_label: 'Satisfaction',
        selected_option_title: null,
        matrix_column_headers: null,
      }),
    ]

    render(<ResponseDetail response={makeResponse(answers)} />)

    // Without column headers, matrix grid renders nothing (returns null) — no crash
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument()
    // The question group card is still rendered
    expect(screen.getByTestId('answer-group-Q1')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// ResponseDetail component: matrix_multiple grid rendering
// ---------------------------------------------------------------------------

describe('ResponseDetail — matrix_multiple grid rendering', () => {
  it('renders checkmarks for all selected options per subquestion', () => {
    const answers: ResponseAnswerDetail[] = [
      makeAnswer({
        question_id: 'q2-sq1',
        question_code: 'Q2_SQ001',
        question_title: 'Q2 — Row 1',
        question_type: 'matrix_multiple',
        value: ['A1', 'A3'],
        subquestion_label: 'Feature A',
        matrix_column_headers: SAMPLE_COLUMN_HEADERS,
      }),
      makeAnswer({
        question_id: 'q2-sq2',
        question_code: 'Q2_SQ002',
        question_title: 'Q2 — Row 2',
        question_type: 'matrix_multiple',
        value: ['A2'],
        subquestion_label: 'Feature B',
        matrix_column_headers: SAMPLE_COLUMN_HEADERS,
      }),
    ]

    render(<ResponseDetail response={makeResponse(answers)} />)

    // Row 1 has A1 and A3 selected (2 checkmarks), Row 2 has A2 selected (1 checkmark)
    const selectedCells = screen.getAllByLabelText('selected')
    expect(selectedCells).toHaveLength(3)
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument()
  })

  it('renders matrix_multiple answers without [object Object] (legacy test)', () => {
    const answers: ResponseAnswerDetail[] = [
      makeAnswer({
        question_id: 'q2',
        question_code: 'Q2',
        question_title: 'Multi Matrix Question',
        question_type: 'matrix_multiple',
        value: { SQ001: ['A1', 'A2'], SQ002: ['A3'] } as unknown,
        subquestion_label: null,
        selected_option_title: null,
        matrix_column_headers: null,
      }),
    ]

    render(<ResponseDetail response={makeResponse(answers)} />)

    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument()
    expect(screen.getByText('SQ001: A1, A2, SQ002: A3')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// ResponseDetail component: matrix_dropdown grid rendering
// ---------------------------------------------------------------------------

describe('ResponseDetail — matrix_dropdown grid rendering', () => {
  const dropdownHeaders = [
    { code: 'col1', title: 'First Name' },
    { code: 'col2', title: 'Last Name' },
    { code: 'col3', title: 'Age' },
  ]

  it('renders per-cell values in a table grid', () => {
    const answers: ResponseAnswerDetail[] = [
      makeAnswer({
        question_id: 'q3-sq1',
        question_code: 'Q3_SQ001',
        question_title: 'Q3 — Person 1',
        question_type: 'matrix_dropdown',
        value: { col1: 'Alice', col2: 'Smith', col3: '30' },
        subquestion_label: 'Person 1',
        matrix_column_headers: dropdownHeaders,
      }),
      makeAnswer({
        question_id: 'q3-sq2',
        question_code: 'Q3_SQ002',
        question_title: 'Q3 — Person 2',
        question_type: 'matrix_dropdown',
        value: { col1: 'Bob', col2: 'Jones', col3: '25' },
        subquestion_label: 'Person 2',
        matrix_column_headers: dropdownHeaders,
      }),
    ]

    render(<ResponseDetail response={makeResponse(answers)} />)

    expect(screen.getByText('First Name')).toBeInTheDocument()
    expect(screen.getByText('Last Name')).toBeInTheDocument()
    expect(screen.getByText('Age')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Smith')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument()
  })

  it('shows — for missing cell values', () => {
    const answers: ResponseAnswerDetail[] = [
      makeAnswer({
        question_id: 'q3-sq1',
        question_code: 'Q3_SQ001',
        question_title: 'Q3 — Person 1',
        question_type: 'matrix_dropdown',
        value: { col1: 'Alice' }, // col2 and col3 missing
        subquestion_label: 'Person 1',
        matrix_column_headers: dropdownHeaders,
      }),
    ]

    render(<ResponseDetail response={makeResponse(answers)} />)

    expect(screen.getByText('Alice')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// ResponseDetail component: matrix_dynamic grid rendering
// ---------------------------------------------------------------------------

describe('ResponseDetail — matrix_dynamic grid rendering', () => {
  const dynamicHeaders = [
    { code: 'name', title: 'Name' },
    { code: 'score', title: 'Score' },
  ]

  it('renders dynamic rows in a table with column headers', () => {
    const answers: ResponseAnswerDetail[] = [
      makeAnswer({
        question_id: 'q4',
        question_code: 'Q4',
        question_title: 'Dynamic Matrix',
        question_type: 'matrix_dynamic',
        value: [
          { name: 'Alice', score: '90' },
          { name: 'Bob', score: '85' },
        ],
        subquestion_label: null,
        matrix_column_headers: dynamicHeaders,
      }),
    ]

    render(<ResponseDetail response={makeResponse(answers)} />)

    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Score')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('90')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('85')).toBeInTheDocument()
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument()
  })

  it('derives column headers from row keys when matrix_column_headers is null', () => {
    const answers: ResponseAnswerDetail[] = [
      makeAnswer({
        question_id: 'q4',
        question_code: 'Q4',
        question_title: 'Dynamic Matrix',
        question_type: 'matrix_dynamic',
        value: [{ product: 'Widget', qty: '5' }],
        subquestion_label: null,
        matrix_column_headers: null,
      }),
    ]

    render(<ResponseDetail response={makeResponse(answers)} />)

    // Derived headers from keys: "product" and "qty"
    expect(screen.getByText('product')).toBeInTheDocument()
    expect(screen.getByText('qty')).toBeInTheDocument()
    expect(screen.getByText('Widget')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders row numbers as first column', () => {
    const answers: ResponseAnswerDetail[] = [
      makeAnswer({
        question_id: 'q4',
        question_code: 'Q4',
        question_title: 'Dynamic Matrix',
        question_type: 'matrix_dynamic',
        value: [
          { name: 'Alice', score: '90' },
          { name: 'Bob', score: '85' },
          { name: 'Carol', score: '95' },
        ],
        subquestion_label: null,
        matrix_column_headers: dynamicHeaders,
      }),
    ]

    render(<ResponseDetail response={makeResponse(answers)} />)

    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// ResponseDetail component: matrix answer (legacy plain object format)
// ---------------------------------------------------------------------------

describe('ResponseDetail — matrix answers (legacy)', () => {
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
        matrix_column_headers: null,
      }),
    ]

    render(<ResponseDetail response={makeResponse(answers)} />)

    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument()
    // The object should be rendered as key: value pairs
    expect(screen.getByText('SQ001: A3, SQ002: A1')).toBeInTheDocument()
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
