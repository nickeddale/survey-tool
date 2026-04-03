/**
 * Tests for the core validateAnswer() function in validation.ts.
 *
 * Pure Vitest unit tests — no DOM rendering, no RTL, no act() wrappers needed.
 * validateAnswer() is a pure function.
 *
 * Covers all 18 question types:
 * short_text, long_text, huge_text, radio, dropdown, checkbox,
 * ranking, image_picker, matrix, matrix_dropdown, matrix_dynamic,
 * numeric, rating, boolean, date, file_upload, expression, html
 */

import { describe, it, expect } from 'vitest'
import { validateAnswer } from '../validation'
import type { BuilderQuestion } from '../../store/builderStore'
import { getDefaultSettings } from '../../types/questionSettings'
import type {
  ShortTextSettings,
  LongTextSettings,
  HugeTextSettings,
  CheckboxSettings,
  ImagePickerSettings,
  MatrixSettings,
  MatrixDropdownSettings,
  NumericSettings,
  DateSettings,
  FileUploadSettings,
} from '../../types/questionSettings'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuestion(
  questionType: string,
  overrides: Partial<BuilderQuestion> = {},
): BuilderQuestion {
  return {
    id: 'q-1',
    group_id: 'g-1',
    parent_id: null,
    question_type: questionType,
    code: 'Q1',
    title: 'Test question',
    description: null,
    is_required: false,
    sort_order: 1,
    relevance: null,
    validation: null,
    settings: getDefaultSettings(questionType),
    created_at: '2024-01-01T00:00:00Z',
    answer_options: [],
    subquestions: [],
    ...overrides,
  }
}

function makeOption(id: string, code: string, title: string) {
  return {
    id,
    question_id: 'q-1',
    code,
    title,
    sort_order: 0,
    assessment_value: 0,
    image_url: null,
    created_at: '2024-01-01T00:00:00Z',
  }
}

// ---------------------------------------------------------------------------
// short_text
// ---------------------------------------------------------------------------

describe('validateAnswer — short_text', () => {
  it('returns valid for non-empty text', () => {
    const q = makeQuestion('short_text')
    const result = validateAnswer(q, 'hello')
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('returns valid for empty text when not required', () => {
    const q = makeQuestion('short_text', { is_required: false })
    const result = validateAnswer(q, '')
    expect(result.valid).toBe(true)
  })

  it('returns required error when empty and required', () => {
    const q = makeQuestion('short_text', { is_required: true })
    const result = validateAnswer(q, '')
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toBe('This field is required.')
  })

  it('returns required error for whitespace-only when required', () => {
    const q = makeQuestion('short_text', { is_required: true })
    const result = validateAnswer(q, '   ')
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toBe('This field is required.')
  })

  it('returns max_length error when value exceeds limit', () => {
    const settings: ShortTextSettings = { placeholder: null, max_length: 5, input_type: 'text' }
    const q = makeQuestion('short_text', { settings })
    const result = validateAnswer(q, 'toolongvalue')
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('5 characters')
  })

  it('returns no error at exactly max_length', () => {
    const settings: ShortTextSettings = { placeholder: null, max_length: 5, input_type: 'text' }
    const q = makeQuestion('short_text', { settings })
    const result = validateAnswer(q, 'hello')
    expect(result.valid).toBe(true)
  })

  it('returns email error for invalid email', () => {
    const settings: ShortTextSettings = { placeholder: null, max_length: 255, input_type: 'email' }
    const q = makeQuestion('short_text', { settings })
    const result = validateAnswer(q, 'not-an-email')
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('valid email address')
  })

  it('returns no email error for valid email', () => {
    const settings: ShortTextSettings = { placeholder: null, max_length: 255, input_type: 'email' }
    const q = makeQuestion('short_text', { settings })
    const result = validateAnswer(q, 'user@example.com')
    expect(result.valid).toBe(true)
  })

  it('returns url error for invalid URL', () => {
    const settings: ShortTextSettings = { placeholder: null, max_length: 255, input_type: 'url' }
    const q = makeQuestion('short_text', { settings })
    const result = validateAnswer(q, 'not-a-url')
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('valid URL')
  })

  it('returns no url error for valid https URL', () => {
    const settings: ShortTextSettings = { placeholder: null, max_length: 255, input_type: 'url' }
    const q = makeQuestion('short_text', { settings })
    const result = validateAnswer(q, 'https://example.com')
    expect(result.valid).toBe(true)
  })

  it('returns no url error for valid http URL', () => {
    const settings: ShortTextSettings = { placeholder: null, max_length: 255, input_type: 'url' }
    const q = makeQuestion('short_text', { settings })
    const result = validateAnswer(q, 'http://example.com')
    expect(result.valid).toBe(true)
  })

  it('uses question code as field name in errors', () => {
    const q = makeQuestion('short_text', { is_required: true, code: 'MY_CODE' })
    const result = validateAnswer(q, '')
    expect(result.errors[0].field).toBe('MY_CODE')
  })
})

// ---------------------------------------------------------------------------
// long_text
// ---------------------------------------------------------------------------

describe('validateAnswer — long_text', () => {
  it('returns valid for non-empty text', () => {
    const q = makeQuestion('long_text')
    expect(validateAnswer(q, 'hello').valid).toBe(true)
  })

  it('returns required error when empty and required', () => {
    const q = makeQuestion('long_text', { is_required: true })
    const result = validateAnswer(q, '')
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toBe('This field is required.')
  })

  it('returns max_length error when value exceeds limit', () => {
    const settings: LongTextSettings = { placeholder: null, max_length: 10, rows: 4 }
    const q = makeQuestion('long_text', { settings })
    const result = validateAnswer(q, 'this is too long for the field')
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('10 characters')
  })
})

// ---------------------------------------------------------------------------
// huge_text
// ---------------------------------------------------------------------------

describe('validateAnswer — huge_text', () => {
  it('returns valid for non-empty plain text', () => {
    const q = makeQuestion('huge_text')
    expect(validateAnswer(q, 'hello').valid).toBe(true)
  })

  it('returns required error when empty and required (plain text)', () => {
    const q = makeQuestion('huge_text', { is_required: true })
    expect(validateAnswer(q, '').valid).toBe(false)
  })

  it('strips HTML tags for character count when rich_text=true', () => {
    const settings: HugeTextSettings = { placeholder: null, max_length: 10, rows: 10, rich_text: true }
    const q = makeQuestion('huge_text', { settings })
    // HTML is short but plain text is short too — should be valid
    const result = validateAnswer(q, '<p>Hello</p>')
    expect(result.valid).toBe(true)
  })

  it('returns required error when rich text is empty HTML', () => {
    const settings: HugeTextSettings = { placeholder: null, max_length: 50000, rows: 10, rich_text: true }
    const q = makeQuestion('huge_text', { is_required: true, settings })
    // <p></p> strips to empty string
    expect(validateAnswer(q, '<p></p>').valid).toBe(false)
  })

  it('returns max_length error on plain text length when rich_text=true', () => {
    const settings: HugeTextSettings = { placeholder: null, max_length: 5, rows: 10, rich_text: true }
    const q = makeQuestion('huge_text', { settings })
    // <p>toolongvalue</p> → plaintext = 'toolongvalue' (12 chars > 5)
    const result = validateAnswer(q, '<p>toolongvalue</p>')
    expect(result.valid).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// radio
// ---------------------------------------------------------------------------

describe('validateAnswer — radio', () => {
  it('returns valid for non-empty selection', () => {
    const q = makeQuestion('radio')
    expect(validateAnswer(q, 'option-1').valid).toBe(true)
  })

  it('returns valid for empty selection when not required', () => {
    const q = makeQuestion('radio', { is_required: false })
    expect(validateAnswer(q, '').valid).toBe(true)
  })

  it('returns required error when empty and required', () => {
    const q = makeQuestion('radio', { is_required: true })
    const result = validateAnswer(q, '')
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toBe('This field is required.')
  })
})

// ---------------------------------------------------------------------------
// dropdown
// ---------------------------------------------------------------------------

describe('validateAnswer — dropdown', () => {
  it('returns valid for non-empty selection', () => {
    const q = makeQuestion('dropdown')
    expect(validateAnswer(q, 'option-1').valid).toBe(true)
  })

  it('returns required error when empty and required', () => {
    const q = makeQuestion('dropdown', { is_required: true })
    const result = validateAnswer(q, '')
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toBe('This field is required.')
  })
})

// ---------------------------------------------------------------------------
// checkbox
// ---------------------------------------------------------------------------

describe('validateAnswer — checkbox', () => {
  it('returns valid for non-empty selection', () => {
    const q = makeQuestion('checkbox')
    expect(validateAnswer(q, ['opt-1']).valid).toBe(true)
  })

  it('returns valid for empty selection when not required', () => {
    const q = makeQuestion('checkbox', { is_required: false })
    expect(validateAnswer(q, []).valid).toBe(true)
  })

  it('returns required error when empty and required', () => {
    const q = makeQuestion('checkbox', { is_required: true })
    const result = validateAnswer(q, [])
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toBe('This field is required.')
  })

  it('returns min_choices error when below minimum', () => {
    const settings: CheckboxSettings = {
      min_choices: 2, max_choices: null, has_other: false, other_text: 'Other',
      randomize: false, columns: 1, select_all: false, select_all_text: 'Select all',
    }
    const q = makeQuestion('checkbox', { settings })
    const result = validateAnswer(q, ['opt-1'])
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('at least 2')
  })

  it('returns max_choices error when above maximum', () => {
    const settings: CheckboxSettings = {
      min_choices: null, max_choices: 2, has_other: false, other_text: 'Other',
      randomize: false, columns: 1, select_all: false, select_all_text: 'Select all',
    }
    const q = makeQuestion('checkbox', { settings })
    const result = validateAnswer(q, ['opt-1', 'opt-2', 'opt-3'])
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('at most 2')
  })

  it('excludes __other__ sentinel from real count', () => {
    const settings: CheckboxSettings = {
      min_choices: null, max_choices: 2, has_other: true, other_text: 'Other',
      randomize: false, columns: 1, select_all: false, select_all_text: 'Select all',
    }
    const q = makeQuestion('checkbox', { settings })
    // 2 real options + __other__ sentinel = 3 items but only 2 real
    const result = validateAnswer(q, ['opt-1', 'opt-2', '__other__'])
    expect(result.valid).toBe(true)
  })

  it('returns no error when min_choices not yet reached but count is 0', () => {
    // min_choices only triggers if realCount > 0
    const settings: CheckboxSettings = {
      min_choices: 2, max_choices: null, has_other: false, other_text: 'Other',
      randomize: false, columns: 1, select_all: false, select_all_text: 'Select all',
    }
    const q = makeQuestion('checkbox', { is_required: false, settings })
    const result = validateAnswer(q, [])
    expect(result.valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// ranking
// ---------------------------------------------------------------------------

describe('validateAnswer — ranking', () => {
  const options = [makeOption('o1', 'A', 'Option A'), makeOption('o2', 'B', 'Option B')]

  it('returns valid when all options are ranked', () => {
    const q = makeQuestion('ranking', { answer_options: options })
    expect(validateAnswer(q, ['o1', 'o2']).valid).toBe(true)
  })

  it('returns required error when empty and required', () => {
    const q = makeQuestion('ranking', { is_required: true, answer_options: options })
    expect(validateAnswer(q, []).valid).toBe(false)
  })

  it('returns error when not all options are ranked', () => {
    const q = makeQuestion('ranking', { answer_options: options })
    const result = validateAnswer(q, ['o1'])
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('rank all options')
  })

  it('returns valid with empty options list', () => {
    const q = makeQuestion('ranking', { answer_options: [] })
    expect(validateAnswer(q, []).valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// image_picker
// ---------------------------------------------------------------------------

describe('validateAnswer — image_picker', () => {
  it('returns valid for non-empty selection', () => {
    const q = makeQuestion('image_picker')
    expect(validateAnswer(q, ['img-1']).valid).toBe(true)
  })

  it('returns required error when empty and required', () => {
    const q = makeQuestion('image_picker', { is_required: true })
    const result = validateAnswer(q, [])
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toBe('This field is required.')
  })

  it('returns min_choices error for multi-select below min', () => {
    const settings: ImagePickerSettings = {
      multi_select: true, min_choices: 2, max_choices: null,
      image_width: 200, image_height: 150, show_labels: true,
    }
    const q = makeQuestion('image_picker', { settings })
    const result = validateAnswer(q, ['img-1'])
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('at least 2')
  })

  it('returns max_choices error for multi-select above max', () => {
    const settings: ImagePickerSettings = {
      multi_select: true, min_choices: null, max_choices: 2,
      image_width: 200, image_height: 150, show_labels: true,
    }
    const q = makeQuestion('image_picker', { settings })
    const result = validateAnswer(q, ['img-1', 'img-2', 'img-3'])
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('at most 2')
  })

  it('ignores min/max for single-select', () => {
    const settings: ImagePickerSettings = {
      multi_select: false, min_choices: 2, max_choices: 1,
      image_width: 200, image_height: 150, show_labels: true,
    }
    const q = makeQuestion('image_picker', { settings })
    // Single-select: no min/max validation
    expect(validateAnswer(q, ['img-1']).valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// matrix
// ---------------------------------------------------------------------------

describe('validateAnswer — matrix', () => {
  const subquestions = [
    { ...makeQuestion('short_text'), id: 'sq1', code: 'SQ1', parent_id: 'q-1' },
    { ...makeQuestion('short_text'), id: 'sq2', code: 'SQ2', parent_id: 'q-1' },
  ]

  it('returns valid when all rows answered and is_all_rows_required=true', () => {
    const settings: MatrixSettings = { alternate_rows: true, is_all_rows_required: true, randomize_rows: false }
    const q = makeQuestion('matrix', { settings, subquestions })
    expect(validateAnswer(q, { SQ1: 'opt-A', SQ2: 'opt-B' }).valid).toBe(true)
  })

  it('returns error when some rows unanswered and is_all_rows_required=true', () => {
    const settings: MatrixSettings = { alternate_rows: true, is_all_rows_required: true, randomize_rows: false }
    const q = makeQuestion('matrix', { settings, subquestions })
    const result = validateAnswer(q, { SQ1: 'opt-A' })
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('all rows')
  })

  it('returns valid when rows unanswered and is_all_rows_required=false', () => {
    const settings: MatrixSettings = { alternate_rows: true, is_all_rows_required: false, randomize_rows: false }
    const q = makeQuestion('matrix', { settings, subquestions })
    expect(validateAnswer(q, { SQ1: 'opt-A' }).valid).toBe(true)
  })

  it('returns required error when empty and required', () => {
    const q = makeQuestion('matrix', { is_required: true, subquestions })
    const result = validateAnswer(q, {})
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toBe('This field is required.')
  })
})

// ---------------------------------------------------------------------------
// matrix_dropdown
// ---------------------------------------------------------------------------

describe('validateAnswer — matrix_dropdown', () => {
  const subquestions = [
    { ...makeQuestion('short_text'), id: 'sq1', code: 'SQ1', parent_id: 'q-1' },
    { ...makeQuestion('short_text'), id: 'sq2', code: 'SQ2', parent_id: 'q-1' },
  ]

  it('returns valid when all rows answered', () => {
    const settings: MatrixDropdownSettings = {
      alternate_rows: true, is_all_rows_required: true, randomize_rows: false, cell_type: 'dropdown',
    }
    const q = makeQuestion('matrix_dropdown', { settings, subquestions })
    expect(validateAnswer(q, { SQ1: 'opt-A', SQ2: 'opt-B' }).valid).toBe(true)
  })

  it('returns error when rows unanswered and is_all_rows_required=true', () => {
    const settings: MatrixDropdownSettings = {
      alternate_rows: true, is_all_rows_required: true, randomize_rows: false, cell_type: 'dropdown',
    }
    const q = makeQuestion('matrix_dropdown', { settings, subquestions })
    const result = validateAnswer(q, { SQ1: 'opt-A' })
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('all rows')
  })
})

// ---------------------------------------------------------------------------
// matrix_dynamic
// ---------------------------------------------------------------------------

describe('validateAnswer — matrix_dynamic', () => {
  it('always returns valid (no external validation constraints)', () => {
    const q = makeQuestion('matrix_dynamic')
    expect(validateAnswer(q, []).valid).toBe(true)
    expect(validateAnswer(q, [{ col: 'value' }]).valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// numeric
// ---------------------------------------------------------------------------

describe('validateAnswer — numeric', () => {
  it('returns valid for valid number', () => {
    const q = makeQuestion('numeric')
    expect(validateAnswer(q, '42').valid).toBe(true)
  })

  it('returns valid for empty string when not required', () => {
    const q = makeQuestion('numeric', { is_required: false })
    expect(validateAnswer(q, '').valid).toBe(true)
  })

  it('returns required error when empty and required', () => {
    const q = makeQuestion('numeric', { is_required: true })
    const result = validateAnswer(q, '')
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toBe('This field is required.')
  })

  it('returns error for non-numeric string', () => {
    const q = makeQuestion('numeric')
    const result = validateAnswer(q, 'abc')
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('valid number')
  })

  it('returns min error when value below min', () => {
    const settings: NumericSettings = { min: 10, max: null, decimal_places: 0, placeholder: null, prefix: null, suffix: null }
    const q = makeQuestion('numeric', { settings })
    const result = validateAnswer(q, '5')
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('at least 10')
  })

  it('returns max error when value above max', () => {
    const settings: NumericSettings = { min: null, max: 100, decimal_places: 0, placeholder: null, prefix: null, suffix: null }
    const q = makeQuestion('numeric', { settings })
    const result = validateAnswer(q, '150')
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('at most 100')
  })

  it('returns error for too many decimal places', () => {
    const settings: NumericSettings = { min: null, max: null, decimal_places: 2, placeholder: null, prefix: null, suffix: null }
    const q = makeQuestion('numeric', { settings })
    const result = validateAnswer(q, '3.14159')
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('2 decimal places')
  })

  it('returns valid for number at exactly min', () => {
    const settings: NumericSettings = { min: 10, max: null, decimal_places: 0, placeholder: null, prefix: null, suffix: null }
    const q = makeQuestion('numeric', { settings })
    expect(validateAnswer(q, '10').valid).toBe(true)
  })

  it('returns valid for number at exactly max', () => {
    const settings: NumericSettings = { min: null, max: 100, decimal_places: 0, placeholder: null, prefix: null, suffix: null }
    const q = makeQuestion('numeric', { settings })
    expect(validateAnswer(q, '100').valid).toBe(true)
  })

  it('uses singular decimal place message for decimal_places=1', () => {
    const settings: NumericSettings = { min: null, max: null, decimal_places: 1, placeholder: null, prefix: null, suffix: null }
    const q = makeQuestion('numeric', { settings })
    const result = validateAnswer(q, '3.14')
    expect(result.errors[0].message).toContain('1 decimal place')
    expect(result.errors[0].message).not.toContain('places')
  })
})

// ---------------------------------------------------------------------------
// rating
// ---------------------------------------------------------------------------

describe('validateAnswer — rating', () => {
  it('returns valid for non-empty rating', () => {
    const q = makeQuestion('rating')
    expect(validateAnswer(q, '4').valid).toBe(true)
  })

  it('returns valid for empty when not required', () => {
    const q = makeQuestion('rating', { is_required: false })
    expect(validateAnswer(q, '').valid).toBe(true)
  })

  it('returns required error when empty and required', () => {
    const q = makeQuestion('rating', { is_required: true })
    const result = validateAnswer(q, '')
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toBe('This field is required.')
  })
})

// ---------------------------------------------------------------------------
// boolean
// ---------------------------------------------------------------------------

describe('validateAnswer — boolean', () => {
  it('returns valid for "true"', () => {
    const q = makeQuestion('boolean')
    expect(validateAnswer(q, 'true').valid).toBe(true)
  })

  it('returns valid for "false"', () => {
    const q = makeQuestion('boolean')
    expect(validateAnswer(q, 'false').valid).toBe(true)
  })

  it('returns valid for empty when not required', () => {
    const q = makeQuestion('boolean', { is_required: false })
    expect(validateAnswer(q, '').valid).toBe(true)
  })

  it('returns required error when empty and required', () => {
    const q = makeQuestion('boolean', { is_required: true })
    const result = validateAnswer(q, '')
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toBe('This field is required.')
  })
})

// ---------------------------------------------------------------------------
// date
// ---------------------------------------------------------------------------

describe('validateAnswer — date', () => {
  it('returns valid for valid date string', () => {
    const q = makeQuestion('date')
    expect(validateAnswer(q, '2024-06-15').valid).toBe(true)
  })

  it('returns valid for empty when not required', () => {
    const q = makeQuestion('date', { is_required: false })
    expect(validateAnswer(q, '').valid).toBe(true)
  })

  it('returns required error when empty and required', () => {
    const q = makeQuestion('date', { is_required: true })
    const result = validateAnswer(q, '')
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toBe('This field is required.')
  })

  it('returns error for invalid date', () => {
    const q = makeQuestion('date')
    const result = validateAnswer(q, 'not-a-date')
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('valid date')
  })

  it('returns min_date error when date is before min', () => {
    const settings: DateSettings = {
      min_date: '2024-01-01', max_date: null, include_time: false, date_format: 'YYYY-MM-DD', placeholder: null,
    }
    const q = makeQuestion('date', { settings })
    const result = validateAnswer(q, '2023-12-31')
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('on or after')
  })

  it('returns max_date error when date is after max', () => {
    const settings: DateSettings = {
      min_date: null, max_date: '2024-12-31', include_time: false, date_format: 'YYYY-MM-DD', placeholder: null,
    }
    const q = makeQuestion('date', { settings })
    const result = validateAnswer(q, '2025-01-01')
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('on or before')
  })

  it('returns valid for date exactly at min_date', () => {
    const settings: DateSettings = {
      min_date: '2024-01-01', max_date: null, include_time: false, date_format: 'YYYY-MM-DD', placeholder: null,
    }
    const q = makeQuestion('date', { settings })
    expect(validateAnswer(q, '2024-01-01').valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// file_upload
// ---------------------------------------------------------------------------

describe('validateAnswer — file_upload', () => {
  function makeFile(name: string, type: string, sizeBytes: number): File {
    const blob = new Blob(['x'.repeat(sizeBytes)], { type })
    return new File([blob], name, { type })
  }

  it('returns valid for empty file list when not required', () => {
    const q = makeQuestion('file_upload', { is_required: false })
    expect(validateAnswer(q, []).valid).toBe(true)
  })

  it('returns required error for empty file list when required', () => {
    const q = makeQuestion('file_upload', { is_required: true })
    const result = validateAnswer(q, [])
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toBe('This field is required.')
  })

  it('returns valid for allowed file type', () => {
    const settings: FileUploadSettings = { max_size_mb: 10, allowed_types: ['image/*'], max_files: 1 }
    const q = makeQuestion('file_upload', { settings })
    const file = makeFile('photo.jpg', 'image/jpeg', 1024)
    expect(validateAnswer(q, [file]).valid).toBe(true)
  })

  it('returns error for disallowed file type', () => {
    const settings: FileUploadSettings = { max_size_mb: 10, allowed_types: ['image/*'], max_files: 1 }
    const q = makeQuestion('file_upload', { settings })
    const file = makeFile('doc.pdf', 'application/pdf', 1024)
    const result = validateAnswer(q, [file])
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('not an allowed file type')
  })

  it('returns error for file exceeding max size', () => {
    const settings: FileUploadSettings = { max_size_mb: 1, allowed_types: [], max_files: 1 }
    const q = makeQuestion('file_upload', { settings })
    // 2MB file > 1MB limit
    const file = makeFile('big.txt', 'text/plain', 2 * 1024 * 1024)
    const result = validateAnswer(q, [file])
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('exceeds the maximum size')
  })

  it('returns valid when file types are empty (all types allowed)', () => {
    const settings: FileUploadSettings = { max_size_mb: 10, allowed_types: [], max_files: 5 }
    const q = makeQuestion('file_upload', { settings })
    const file = makeFile('any.xyz', 'application/octet-stream', 100)
    expect(validateAnswer(q, [file]).valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// expression (display-only — no validation)
// ---------------------------------------------------------------------------

describe('validateAnswer — expression', () => {
  it('always returns valid', () => {
    const q = makeQuestion('expression')
    expect(validateAnswer(q, '').valid).toBe(true)
    expect(validateAnswer(q, 'some computed value').valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// html (display-only — no validation)
// ---------------------------------------------------------------------------

describe('validateAnswer — html', () => {
  it('always returns valid', () => {
    const q = makeQuestion('html')
    expect(validateAnswer(q, '').valid).toBe(true)
    expect(validateAnswer(q, '<h1>Hello</h1>').valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Unknown question type
// ---------------------------------------------------------------------------

describe('validateAnswer — unknown question type', () => {
  it('returns valid for unknown type', () => {
    const q = makeQuestion('some_future_type')
    expect(validateAnswer(q, '').valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// ValidationResult structure
// ---------------------------------------------------------------------------

describe('validateAnswer — result structure', () => {
  it('returns { valid: true, errors: [] } on success', () => {
    const q = makeQuestion('short_text')
    const result = validateAnswer(q, 'hello')
    expect(result).toEqual({ valid: true, errors: [] })
  })

  it('returns { valid: false, errors: [...] } on failure', () => {
    const q = makeQuestion('short_text', { is_required: true })
    const result = validateAnswer(q, '')
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toHaveProperty('field')
    expect(result.errors[0]).toHaveProperty('message')
  })
})
