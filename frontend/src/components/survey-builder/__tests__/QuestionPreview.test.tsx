/**
 * Unit tests for QuestionPreview and type-specific preview components.
 *
 * Patterns:
 * - Pure unit tests — no store/MSW needed (components are display-only)
 * - Test all 18 question types render without error
 * - Test required indicator, title/description, type-specific elements
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QuestionPreview } from '../QuestionPreview'
import type { BuilderQuestion } from '../../../store/builderStore'
import { getDefaultSettings } from '../../../types/questionSettings'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuestion(overrides: Partial<BuilderQuestion> = {}): BuilderQuestion {
  return {
    id: 'q-1',
    group_id: 'g-1',
    parent_id: null,
    question_type: 'short_text',
    code: 'Q1',
    title: 'Test Question',
    description: null,
    is_required: false,
    sort_order: 1,
    relevance: null,
    validation: null,
    settings: getDefaultSettings('short_text'),
    created_at: '2024-01-01T00:00:00Z',
    answer_options: [],
    subquestions: [],
    ...overrides,
  }
}

function makeOption(id: string, title: string, code: string = id) {
  return {
    id,
    question_id: 'q-1',
    code,
    title,
    sort_order: 0,
    assessment_value: 0,
    created_at: '2024-01-01T00:00:00Z',
  }
}

// ---------------------------------------------------------------------------
// Registry completeness — all 18 types render without error
// ---------------------------------------------------------------------------

describe('QuestionPreview registry completeness', () => {
  const allTypes = [
    'short_text',
    'long_text',
    'huge_text',
    'radio',
    'checkbox',
    'dropdown',
    'ranking',
    'image_picker',
    'matrix',
    'matrix_dropdown',
    'matrix_dynamic',
    'numeric',
    'rating',
    'boolean',
    'date',
    'file_upload',
    'expression',
    'html',
  ]

  it.each(allTypes)('renders without error for type: %s', (type) => {
    const question = makeQuestion({
      question_type: type,
      settings: getDefaultSettings(type),
    })

    expect(() => render(<QuestionPreview question={question} />)).not.toThrow()
    // Each type renders the main preview wrapper
    expect(screen.getByTestId(`question-preview-${question.id}`)).toBeInTheDocument()

    // Clean up for the next iteration
    screen.unmount?.()
  })
})

// ---------------------------------------------------------------------------
// Required indicator
// ---------------------------------------------------------------------------

describe('QuestionPreview required indicator', () => {
  it('shows required indicator (*) when question is required', () => {
    const question = makeQuestion({ is_required: true })
    render(<QuestionPreview question={question} />)
    expect(screen.getByTestId('preview-required-indicator')).toBeInTheDocument()
    expect(screen.getByTestId('preview-required-indicator')).toHaveTextContent('*')
  })

  it('does not show required indicator when not required', () => {
    const question = makeQuestion({ is_required: false })
    render(<QuestionPreview question={question} />)
    expect(screen.queryByTestId('preview-required-indicator')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Title and description
// ---------------------------------------------------------------------------

describe('QuestionPreview title and description', () => {
  it('displays the question title', () => {
    const question = makeQuestion({ title: 'What is your name?' })
    render(<QuestionPreview question={question} />)
    expect(screen.getByTestId('preview-title')).toHaveTextContent('What is your name?')
  })

  it('displays the question description when present', () => {
    const question = makeQuestion({ description: 'Please enter your full name.' })
    render(<QuestionPreview question={question} />)
    expect(screen.getByTestId('preview-description')).toHaveTextContent('Please enter your full name.')
  })

  it('does not render description element when description is null', () => {
    const question = makeQuestion({ description: null })
    render(<QuestionPreview question={question} />)
    expect(screen.queryByTestId('preview-description')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Unknown type fallback
// ---------------------------------------------------------------------------

describe('QuestionPreview unknown type fallback', () => {
  it('renders a fallback message for an unknown question type', () => {
    const question = makeQuestion({ question_type: 'totally_unknown_type' })
    render(<QuestionPreview question={question} />)
    expect(screen.getByTestId('preview-unknown-type')).toBeInTheDocument()
    expect(screen.getByTestId('preview-unknown-type')).toHaveTextContent('totally_unknown_type')
  })
})

// ---------------------------------------------------------------------------
// TextPreview
// ---------------------------------------------------------------------------

describe('TextPreview', () => {
  it('renders a disabled text input for short_text', () => {
    const question = makeQuestion({
      question_type: 'short_text',
      settings: { placeholder: 'Enter text here', max_length: 100, input_type: 'text' },
    })
    render(<QuestionPreview question={question} />)
    const input = screen.getByTestId('preview-short-text')
    expect(input).toBeInTheDocument()
    expect(input).toBeDisabled()
    expect(input).toHaveAttribute('placeholder', 'Enter text here')
  })

  it('renders a disabled textarea for long_text', () => {
    const question = makeQuestion({
      question_type: 'long_text',
      settings: { placeholder: 'Write here…', max_length: 5000, rows: 6 },
    })
    render(<QuestionPreview question={question} />)
    const textarea = screen.getByTestId('preview-long-text')
    expect(textarea).toBeInTheDocument()
    expect(textarea).toBeDisabled()
    expect(textarea).toHaveAttribute('rows', '6')
  })

  it('renders a larger textarea for huge_text', () => {
    const question = makeQuestion({
      question_type: 'huge_text',
      settings: { placeholder: 'Big text…', max_length: 50000, rows: 12, rich_text: false },
    })
    render(<QuestionPreview question={question} />)
    const textarea = screen.getByTestId('preview-huge-text')
    expect(textarea).toBeInTheDocument()
    expect(textarea).toBeDisabled()
    expect(textarea).toHaveAttribute('rows', '12')
  })
})

// ---------------------------------------------------------------------------
// ChoicePreview
// ---------------------------------------------------------------------------

describe('ChoicePreview', () => {
  it('renders radio buttons for each answer option', () => {
    const question = makeQuestion({
      question_type: 'radio',
      settings: getDefaultSettings('radio'),
      answer_options: [
        makeOption('o1', 'Option A'),
        makeOption('o2', 'Option B'),
        makeOption('o3', 'Option C'),
      ],
    })
    render(<QuestionPreview question={question} />)
    const container = screen.getByTestId('preview-radio')
    expect(container).toBeInTheDocument()
    // Three radio buttons for options + 0 other
    const radios = container.querySelectorAll('input[type="radio"]')
    expect(radios).toHaveLength(3)
    expect(screen.getByText('Option A')).toBeInTheDocument()
    expect(screen.getByText('Option B')).toBeInTheDocument()
  })

  it('shows "Other" option when has_other is true for radio', () => {
    const question = makeQuestion({
      question_type: 'radio',
      settings: { has_other: true, other_text: 'Something else', randomize: false, columns: 1 },
      answer_options: [makeOption('o1', 'Option A')],
    })
    render(<QuestionPreview question={question} />)
    expect(screen.getByText('Something else')).toBeInTheDocument()
  })

  it('shows randomize note when randomize is true for radio', () => {
    const question = makeQuestion({
      question_type: 'radio',
      settings: { has_other: false, other_text: 'Other', randomize: true, columns: 1 },
      answer_options: [makeOption('o1', 'Option A')],
    })
    render(<QuestionPreview question={question} />)
    expect(screen.getByText(/randomized/i)).toBeInTheDocument()
  })

  it('renders checkboxes for checkbox type', () => {
    const question = makeQuestion({
      question_type: 'checkbox',
      settings: getDefaultSettings('checkbox'),
      answer_options: [
        makeOption('o1', 'Choice A'),
        makeOption('o2', 'Choice B'),
      ],
    })
    render(<QuestionPreview question={question} />)
    const container = screen.getByTestId('preview-checkbox')
    expect(container).toBeInTheDocument()
    const checkboxes = container.querySelectorAll('input[type="checkbox"]')
    expect(checkboxes.length).toBeGreaterThanOrEqual(2)
  })

  it('shows min/max hint for checkbox when set', () => {
    const question = makeQuestion({
      question_type: 'checkbox',
      settings: {
        min_choices: 1,
        max_choices: 3,
        has_other: false,
        other_text: 'Other',
        randomize: false,
        columns: 1,
        select_all: false,
        select_all_text: 'Select all',
      },
      answer_options: [makeOption('o1', 'A')],
    })
    render(<QuestionPreview question={question} />)
    expect(screen.getByText(/Select between 1 and 3/i)).toBeInTheDocument()
  })

  it('renders a disabled select for dropdown type', () => {
    const question = makeQuestion({
      question_type: 'dropdown',
      settings: { placeholder: 'Pick one…', searchable: false, has_other: false, other_text: 'Other' },
      answer_options: [
        makeOption('o1', 'Alpha'),
        makeOption('o2', 'Beta'),
      ],
    })
    render(<QuestionPreview question={question} />)
    const container = screen.getByTestId('preview-dropdown')
    expect(container).toBeInTheDocument()
    const select = container.querySelector('select')
    expect(select).toBeDisabled()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('shows searchable hint for dropdown when searchable is true', () => {
    const question = makeQuestion({
      question_type: 'dropdown',
      settings: { placeholder: 'Select', searchable: true, has_other: false, other_text: 'Other' },
      answer_options: [],
    })
    render(<QuestionPreview question={question} />)
    expect(screen.getByText(/Searchable/i)).toBeInTheDocument()
  })

  it('shows no-options message when answer_options is empty for radio', () => {
    const question = makeQuestion({
      question_type: 'radio',
      settings: getDefaultSettings('radio'),
      answer_options: [],
    })
    render(<QuestionPreview question={question} />)
    expect(screen.getByTestId('preview-no-options')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// MatrixPreview
// ---------------------------------------------------------------------------

describe('MatrixPreview', () => {
  it('renders matrix grid with radio cells', () => {
    const subq: BuilderQuestion = makeQuestion({
      id: 'sub-1',
      question_type: 'short_text',
      title: 'Row 1',
      settings: getDefaultSettings('short_text'),
    })
    const question = makeQuestion({
      question_type: 'matrix',
      settings: getDefaultSettings('matrix'),
      answer_options: [makeOption('c1', 'Agree'), makeOption('c2', 'Disagree')],
      subquestions: [subq],
    })
    render(<QuestionPreview question={question} />)
    const container = screen.getByTestId('preview-matrix')
    expect(container).toBeInTheDocument()
    expect(screen.getByText('Row 1')).toBeInTheDocument()
    expect(screen.getByText('Agree')).toBeInTheDocument()
    expect(screen.getByText('Disagree')).toBeInTheDocument()
    const radios = container.querySelectorAll('input[type="radio"]')
    expect(radios.length).toBe(2) // 1 row × 2 columns
  })

  it('shows no-rows message when subquestions is empty for matrix', () => {
    const question = makeQuestion({
      question_type: 'matrix',
      settings: getDefaultSettings('matrix'),
      answer_options: [makeOption('c1', 'Agree')],
      subquestions: [],
    })
    render(<QuestionPreview question={question} />)
    expect(screen.getByTestId('preview-no-rows')).toBeInTheDocument()
  })

  it('renders matrix_dropdown with select cells', () => {
    const subq: BuilderQuestion = makeQuestion({ id: 'sub-1', title: 'Row 1', settings: getDefaultSettings('short_text') })
    const question = makeQuestion({
      question_type: 'matrix_dropdown',
      settings: { ...getDefaultSettings('matrix_dropdown'), cell_type: 'dropdown' },
      answer_options: [makeOption('c1', 'Col 1')],
      subquestions: [subq],
    })
    render(<QuestionPreview question={question} />)
    const container = screen.getByTestId('preview-matrix-dropdown')
    expect(container).toBeInTheDocument()
    const selects = container.querySelectorAll('select')
    expect(selects.length).toBeGreaterThanOrEqual(1)
  })

  it('renders matrix_dynamic with rows and add-row button', () => {
    const question = makeQuestion({
      question_type: 'matrix_dynamic',
      settings: {
        row_count: 2,
        min_row_count: 0,
        max_row_count: null,
        add_row_text: 'Add row',
        remove_row_text: 'Remove',
        cell_type: 'text',
      },
      answer_options: [makeOption('c1', 'Col A'), makeOption('c2', 'Col B')],
      subquestions: [],
    })
    render(<QuestionPreview question={question} />)
    expect(screen.getByTestId('preview-matrix-dynamic')).toBeInTheDocument()
    expect(screen.getByText(/Add row/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// ScalarPreview
// ---------------------------------------------------------------------------

describe('ScalarPreview', () => {
  it('renders disabled number input for numeric type', () => {
    const question = makeQuestion({
      question_type: 'numeric',
      settings: { min: 0, max: 100, decimal_places: 2, placeholder: 'Enter number', prefix: '$', suffix: 'USD' },
    })
    render(<QuestionPreview question={question} />)
    const container = screen.getByTestId('preview-numeric')
    expect(container).toBeInTheDocument()
    expect(screen.getByTestId('preview-numeric-input')).toBeDisabled()
    expect(screen.getByText('$')).toBeInTheDocument()
    expect(screen.getByText('USD')).toBeInTheDocument()
  })

  it('renders rating stars with correct count', () => {
    const question = makeQuestion({
      question_type: 'rating',
      settings: { min: 1, max: 5, step: 1, icon: 'star' },
    })
    render(<QuestionPreview question={question} />)
    const container = screen.getByTestId('preview-rating')
    expect(container).toBeInTheDocument()
    const svgs = container.querySelectorAll('svg')
    expect(svgs).toHaveLength(5) // max - min + 1 = 5
  })

  it('renders boolean toggle by default', () => {
    const question = makeQuestion({
      question_type: 'boolean',
      settings: { true_label: 'Yes', false_label: 'No', default_value: null, render_as: 'toggle' },
    })
    render(<QuestionPreview question={question} />)
    const container = screen.getByTestId('preview-boolean')
    expect(container).toBeInTheDocument()
    expect(screen.getByText('Yes')).toBeInTheDocument()
    expect(screen.getByText('No')).toBeInTheDocument()
  })

  it('renders boolean as radio buttons when render_as is radio', () => {
    const question = makeQuestion({
      question_type: 'boolean',
      settings: { true_label: 'True', false_label: 'False', default_value: null, render_as: 'radio' },
    })
    render(<QuestionPreview question={question} />)
    const container = screen.getByTestId('preview-boolean')
    const radios = container.querySelectorAll('input[type="radio"]')
    expect(radios).toHaveLength(2)
  })

  it('renders date input for date type', () => {
    const question = makeQuestion({
      question_type: 'date',
      settings: { min_date: null, max_date: null, include_time: false, date_format: 'YYYY-MM-DD', placeholder: null },
    })
    render(<QuestionPreview question={question} />)
    expect(screen.getByTestId('preview-date')).toBeInTheDocument()
    expect(screen.getByTestId('preview-date-input')).toBeDisabled()
    expect(screen.getByTestId('preview-date-input')).toHaveAttribute('type', 'date')
  })

  it('renders datetime-local input when include_time is true', () => {
    const question = makeQuestion({
      question_type: 'date',
      settings: { min_date: null, max_date: null, include_time: true, date_format: 'YYYY-MM-DD HH:mm', placeholder: null },
    })
    render(<QuestionPreview question={question} />)
    expect(screen.getByTestId('preview-date-input')).toHaveAttribute('type', 'datetime-local')
  })
})

// ---------------------------------------------------------------------------
// SpecialPreview
// ---------------------------------------------------------------------------

describe('SpecialPreview', () => {
  it('renders ranking items with numbered handles', () => {
    const question = makeQuestion({
      question_type: 'ranking',
      settings: { randomize_initial_order: false },
      answer_options: [makeOption('o1', 'First'), makeOption('o2', 'Second'), makeOption('o3', 'Third')],
    })
    render(<QuestionPreview question={question} />)
    const container = screen.getByTestId('preview-ranking')
    expect(container).toBeInTheDocument()
    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
    expect(screen.getByText('Third')).toBeInTheDocument()
    // Numbered handles 1, 2, 3
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders image picker with option thumbnails', () => {
    const question = makeQuestion({
      question_type: 'image_picker',
      settings: { multi_select: false, min_choices: null, max_choices: null, image_width: 200, image_height: 150, show_labels: true },
      answer_options: [makeOption('o1', 'Image A'), makeOption('o2', 'Image B')],
    })
    render(<QuestionPreview question={question} />)
    expect(screen.getByTestId('preview-image-picker')).toBeInTheDocument()
  })

  it('renders file upload dropzone', () => {
    const question = makeQuestion({
      question_type: 'file_upload',
      settings: { max_size_mb: 5, allowed_types: ['image/*', '.pdf'], max_files: 3 },
    })
    render(<QuestionPreview question={question} />)
    const container = screen.getByTestId('preview-file-upload')
    expect(container).toBeInTheDocument()
    expect(screen.getByText(/5 MB/)).toBeInTheDocument()
    expect(screen.getByText(/image\/\*, \.pdf/)).toBeInTheDocument()
  })

  it('renders expression placeholder with expression code', () => {
    const question = makeQuestion({
      question_type: 'expression',
      settings: { expression: 'Q1 + Q2', display_format: 'number', currency: null, decimal_places: 0 },
    })
    render(<QuestionPreview question={question} />)
    expect(screen.getByTestId('preview-expression')).toBeInTheDocument()
    expect(screen.getByText('Q1 + Q2')).toBeInTheDocument()
  })

  it('renders html content directly', () => {
    const question = makeQuestion({
      question_type: 'html',
      settings: { html_content: '<p data-testid="html-para">Hello World</p>' },
    })
    render(<QuestionPreview question={question} />)
    expect(screen.getByTestId('preview-html')).toBeInTheDocument()
    expect(screen.getByTestId('html-para')).toBeInTheDocument()
    expect(screen.getByText('Hello World')).toBeInTheDocument()
  })

  it('renders fallback message for html when no content is defined', () => {
    const question = makeQuestion({
      question_type: 'html',
      settings: { html_content: '' },
    })
    render(<QuestionPreview question={question} />)
    expect(screen.getByTestId('preview-html')).toBeInTheDocument()
    expect(screen.getByText(/No HTML content defined/i)).toBeInTheDocument()
  })

  it('shows no-options message when ranking has empty answer_options', () => {
    const question = makeQuestion({
      question_type: 'ranking',
      settings: { randomize_initial_order: false },
      answer_options: [],
    })
    render(<QuestionPreview question={question} />)
    expect(screen.getByText(/No answer options defined/i)).toBeInTheDocument()
  })
})
