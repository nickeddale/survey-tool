/**
 * Type-specific settings interfaces for each question type.
 * These map to the settings JSONB column in the database.
 */

// ---------------------------------------------------------------------------
// Text types
// ---------------------------------------------------------------------------

export interface ShortTextSettings {
  placeholder: string | null
  max_length: number
  input_type: 'text' | 'email' | 'url' | 'tel'
}

export interface LongTextSettings {
  placeholder: string | null
  max_length: number
  rows: number
}

export interface HugeTextSettings {
  placeholder: string | null
  max_length: number
  rows: number
  rich_text: boolean
}

// ---------------------------------------------------------------------------
// Choice types
// ---------------------------------------------------------------------------

export interface RadioSettings {
  has_other: boolean
  other_text: string
  randomize: boolean
  columns: number
}

export interface DropdownSettings {
  placeholder: string
  searchable: boolean
  has_other: boolean
  other_text: string
}

export interface CheckboxSettings {
  min_choices: number | null
  max_choices: number | null
  has_other: boolean
  other_text: string
  randomize: boolean
  columns: number
  select_all: boolean
  select_all_text: string
}

export interface RankingSettings {
  randomize_initial_order: boolean
}

export interface ImagePickerSettings {
  multi_select: boolean
  min_choices: number | null
  max_choices: number | null
  image_width: number
  image_height: number
  show_labels: boolean
}

// ---------------------------------------------------------------------------
// Matrix types
// ---------------------------------------------------------------------------

export interface MatrixSettings {
  alternate_rows: boolean
  is_all_rows_required: boolean
  randomize_rows: boolean
}

export interface MatrixDropdownSettings {
  alternate_rows: boolean
  is_all_rows_required: boolean
  randomize_rows: boolean
  cell_type: 'dropdown' | 'text' | 'checkbox' | 'radio'
  column_types?: Record<string, 'dropdown' | 'rating' | 'text' | 'number' | 'checkbox' | 'radio'>
}

export interface MatrixDynamicSettings {
  row_count: number
  min_row_count: number
  max_row_count: number | null
  add_row_text: string
  remove_row_text: string
  cell_type: 'dropdown' | 'text' | 'checkbox' | 'radio'
}

// ---------------------------------------------------------------------------
// Scalar types
// ---------------------------------------------------------------------------

export interface NumericSettings {
  min: number | null
  max: number | null
  decimal_places: number
  placeholder: string | null
  prefix: string | null
  suffix: string | null
}

export interface RatingSettings {
  min: number
  max: number
  step: number
  icon: 'star' | 'heart' | 'thumb' | 'smiley'
}

export interface BooleanSettings {
  true_label: string
  false_label: string
  default_value: boolean | null
  render_as: 'toggle' | 'radio' | 'checkbox'
}

export interface DateSettings {
  min_date: string | null
  max_date: string | null
  include_time: boolean
  date_format: string
  placeholder: string | null
}

// ---------------------------------------------------------------------------
// Special types
// ---------------------------------------------------------------------------

export interface FileUploadSettings {
  max_size_mb: number
  allowed_types: string[]
  max_files: number
}

export interface ExpressionSettings {
  expression: string
  display_format: 'text' | 'number' | 'currency' | 'percent'
  currency: string | null
  decimal_places: number
}

export interface HtmlSettings {
  html_content: string
}

// ---------------------------------------------------------------------------
// Union type
// ---------------------------------------------------------------------------

export type QuestionSettings =
  | ShortTextSettings
  | LongTextSettings
  | HugeTextSettings
  | RadioSettings
  | DropdownSettings
  | CheckboxSettings
  | RankingSettings
  | ImagePickerSettings
  | MatrixSettings
  | MatrixDropdownSettings
  | MatrixDynamicSettings
  | NumericSettings
  | RatingSettings
  | BooleanSettings
  | DateSettings
  | FileUploadSettings
  | ExpressionSettings
  | HtmlSettings

// ---------------------------------------------------------------------------
// Default settings helpers
// ---------------------------------------------------------------------------

export function getDefaultSettings(type: string): QuestionSettings {
  switch (type) {
    case 'short_text':
      return { placeholder: null, max_length: 255, input_type: 'text' } satisfies ShortTextSettings
    case 'long_text':
      return { placeholder: null, max_length: 5000, rows: 4 } satisfies LongTextSettings
    case 'huge_text':
      return {
        placeholder: null,
        max_length: 50000,
        rows: 10,
        rich_text: false,
      } satisfies HugeTextSettings
    case 'single_choice':
      return {
        has_other: false,
        other_text: 'Other',
        randomize: false,
        columns: 1,
      } satisfies RadioSettings
    case 'dropdown':
      return {
        placeholder: 'Select an option',
        searchable: false,
        has_other: false,
        other_text: 'Other',
      } satisfies DropdownSettings
    case 'multiple_choice':
      return {
        min_choices: null,
        max_choices: null,
        has_other: false,
        other_text: 'Other',
        randomize: false,
        columns: 1,
        select_all: false,
        select_all_text: 'Select all',
      } satisfies CheckboxSettings
    case 'ranking':
      return { randomize_initial_order: true } satisfies RankingSettings
    case 'image_picker':
      return {
        multi_select: false,
        min_choices: null,
        max_choices: null,
        image_width: 200,
        image_height: 150,
        show_labels: true,
      } satisfies ImagePickerSettings
    case 'matrix':
      return {
        alternate_rows: true,
        is_all_rows_required: false,
        randomize_rows: false,
      } satisfies MatrixSettings
    case 'matrix_dropdown':
      return {
        alternate_rows: true,
        is_all_rows_required: false,
        randomize_rows: false,
        cell_type: 'dropdown',
      } satisfies MatrixDropdownSettings
    case 'matrix_dynamic':
      return {
        row_count: 1,
        min_row_count: 0,
        max_row_count: null,
        add_row_text: 'Add row',
        remove_row_text: 'Remove',
        cell_type: 'text',
      } satisfies MatrixDynamicSettings
    case 'numeric':
      return {
        min: null,
        max: null,
        decimal_places: 0,
        placeholder: null,
        prefix: null,
        suffix: null,
      } satisfies NumericSettings
    case 'rating':
      return { min: 1, max: 5, step: 1, icon: 'star' } satisfies RatingSettings
    case 'boolean':
      return {
        true_label: 'Yes',
        false_label: 'No',
        default_value: null,
        render_as: 'toggle',
      } satisfies BooleanSettings
    case 'date':
      return {
        min_date: null,
        max_date: null,
        include_time: false,
        date_format: 'YYYY-MM-DD',
        placeholder: null,
      } satisfies DateSettings
    case 'file_upload':
      return {
        max_size_mb: 10,
        allowed_types: ['image/*', 'application/pdf'],
        max_files: 1,
      } satisfies FileUploadSettings
    case 'expression':
      return {
        expression: '',
        display_format: 'text',
        currency: null,
        decimal_places: 0,
      } satisfies ExpressionSettings
    case 'html':
      return { html_content: '' } satisfies HtmlSettings
    default:
      return {} as QuestionSettings
  }
}

// ---------------------------------------------------------------------------
// Compatible settings helper
// ---------------------------------------------------------------------------

/**
 * Given an old type, new type, and old settings, returns settings for the new type
 * that preserve fields that are compatible between the two types.
 *
 * This is a pure function — no side effects.
 */
export function getCompatibleSettings(
  oldType: string,
  newType: string,
  oldSettings: Record<string, unknown> | null
): Record<string, unknown> {
  const defaults = getDefaultSettings(newType) as unknown as Record<string, unknown>
  if (!oldSettings) return defaults

  // Fields that can be preserved across compatible type pairs
  const merged: Record<string, unknown> = { ...defaults }

  // placeholder is shared across text types and numeric/date
  const textTypes = new Set(['short_text', 'long_text', 'huge_text', 'numeric', 'date'])
  if (textTypes.has(oldType) && textTypes.has(newType) && 'placeholder' in oldSettings) {
    merged['placeholder'] = oldSettings['placeholder']
  }

  // has_other / other_text shared across single_choice, dropdown, multiple_choice
  const otherTypes = new Set(['single_choice', 'dropdown', 'multiple_choice'])
  if (otherTypes.has(oldType) && otherTypes.has(newType)) {
    if ('has_other' in oldSettings) merged['has_other'] = oldSettings['has_other']
    if ('other_text' in oldSettings) merged['other_text'] = oldSettings['other_text']
  }

  // randomize shared across single_choice and multiple_choice
  const randomizeTypes = new Set(['single_choice', 'multiple_choice'])
  if (randomizeTypes.has(oldType) && randomizeTypes.has(newType)) {
    if ('randomize' in oldSettings) merged['randomize'] = oldSettings['randomize']
    if ('columns' in oldSettings) merged['columns'] = oldSettings['columns']
  }

  // alternate_rows / is_all_rows_required / randomize_rows shared across matrix types
  const matrixTypes = new Set(['matrix', 'matrix_dropdown', 'matrix_dynamic'])
  if (matrixTypes.has(oldType) && matrixTypes.has(newType)) {
    if ('alternate_rows' in oldSettings) merged['alternate_rows'] = oldSettings['alternate_rows']
    if ('is_all_rows_required' in oldSettings)
      merged['is_all_rows_required'] = oldSettings['is_all_rows_required']
    if ('randomize_rows' in oldSettings) merged['randomize_rows'] = oldSettings['randomize_rows']
    if ('cell_type' in oldSettings) merged['cell_type'] = oldSettings['cell_type']
  }

  // min/max shared across numeric and rating
  const minMaxTypes = new Set(['numeric', 'rating'])
  if (minMaxTypes.has(oldType) && minMaxTypes.has(newType)) {
    if ('min' in oldSettings) merged['min'] = oldSettings['min']
    if ('max' in oldSettings) merged['max'] = oldSettings['max']
  }

  return merged
}
