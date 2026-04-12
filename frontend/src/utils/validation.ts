/**
 * Client-side validation framework mirroring backend validation rules.
 *
 * Core function: validateAnswer(question, answer): ValidationResult
 * Supports all 18 question types with type-specific constraint checks.
 */

import type { BuilderQuestion } from '../store/builderStore'
import type {
  ShortTextSettings,
  LongTextSettings,
  HugeTextSettings,
  RadioSettings,
  DropdownSettings,
  CheckboxSettings,
  RankingSettings,
  ImagePickerSettings,
  MatrixSettings,
  MatrixDropdownSettings,
  NumericSettings,
  RatingSettings,
  BooleanSettings,
  DateSettings,
  FileUploadSettings,
} from '../types/questionSettings'

// ---------------------------------------------------------------------------
// URL safety
// ---------------------------------------------------------------------------

/**
 * Sanitizes the `returnTo` query parameter to prevent open redirect and XSS attacks.
 *
 * Allows only safe internal paths:
 * - Must start with exactly one `/` (not `//` which is protocol-relative)
 * - Must not contain `:` before the first `/` (blocks `javascript:`, `https:`, `data:`, etc.)
 *
 * Returns `/dashboard` as a safe fallback for any null, empty, or invalid input.
 */
export function sanitizeReturnTo(value: string | null): string {
  if (!value) return '/dashboard'
  const decoded = decodeURIComponent(value)
  // Must start with a single '/' but not '//'
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return '/dashboard'
  // Reject any scheme-like prefix (e.g. javascript:, https:, data:)
  const colonIndex = decoded.indexOf(':')
  const slashIndex = decoded.indexOf('/')
  if (colonIndex !== -1 && colonIndex < slashIndex) return '/dashboard'
  return decoded
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface ValidationError {
  field: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

// ---------------------------------------------------------------------------
// Regex constants (same as individual input components)
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL_RE = /^https?:\/\/.+/

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip HTML tags to get plain text (for huge_text with rich_text=true). */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}

/** Check whether a File matches an allowed MIME type or extension pattern. */
function matchesAllowedType(file: File, allowedTypes: string[]): boolean {
  if (allowedTypes.length === 0) return true
  return allowedTypes.some((type) => {
    if (type.endsWith('/*')) {
      const category = type.slice(0, -2)
      return file.type.startsWith(`${category}/`)
    }
    return file.type === type || file.name.toLowerCase().endsWith(`.${type.replace(/^\./, '')}`)
  })
}

// ---------------------------------------------------------------------------
// Type-specific validators (pure functions, return ValidationError[])
// ---------------------------------------------------------------------------

function validateShortText(
  value: string,
  s: Partial<ShortTextSettings>,
  isRequired: boolean,
  field: string
): ValidationError[] {
  const errors: ValidationError[] = []
  if (isRequired && value.trim() === '') {
    errors.push({ field, message: 'This field is required.' })
    return errors
  }
  if (value === '') return errors
  if (s.max_length && value.length > s.max_length) {
    errors.push({ field, message: `Maximum ${s.max_length} characters allowed.` })
  }
  if (s.input_type === 'email' && !EMAIL_RE.test(value)) {
    errors.push({ field, message: 'Please enter a valid email address.' })
  }
  if (s.input_type === 'url' && !URL_RE.test(value)) {
    errors.push({ field, message: 'Please enter a valid URL (starting with http:// or https://).' })
  }
  return errors
}

function validateLongText(
  value: string,
  s: Partial<LongTextSettings>,
  isRequired: boolean,
  field: string
): ValidationError[] {
  const errors: ValidationError[] = []
  if (isRequired && value.trim() === '') {
    errors.push({ field, message: 'This field is required.' })
    return errors
  }
  if (value === '') return errors
  if (s.max_length && value.length > s.max_length) {
    errors.push({ field, message: `Maximum ${s.max_length} characters allowed.` })
  }
  return errors
}

function validateHugeText(
  value: string,
  s: Partial<HugeTextSettings>,
  isRequired: boolean,
  field: string
): ValidationError[] {
  const errors: ValidationError[] = []
  const plainText = s.rich_text ? stripHtml(value) : value
  if (isRequired && plainText.trim() === '') {
    errors.push({ field, message: 'This field is required.' })
    return errors
  }
  if (plainText === '') return errors
  if (s.max_length && plainText.length > s.max_length) {
    errors.push({ field, message: `Maximum ${s.max_length} characters allowed.` })
  }
  return errors
}

function validateRadio(
  value: string,
  _s: Partial<RadioSettings>,
  isRequired: boolean,
  field: string
): ValidationError[] {
  const errors: ValidationError[] = []
  if (isRequired && value === '') {
    errors.push({ field, message: 'This field is required.' })
  }
  // Note: "Other" text validation requires the otherText value which is internal
  // component state; validateAnswer() only receives the stored value (__other__)
  // so we cannot validate the Other text here without additional context.
  return errors
}

function validateDropdown(
  value: string,
  _s: Partial<DropdownSettings>,
  isRequired: boolean,
  field: string
): ValidationError[] {
  const errors: ValidationError[] = []
  if (isRequired && value === '') {
    errors.push({ field, message: 'This field is required.' })
  }
  return errors
}

function validateCheckbox(
  value: string[],
  s: Partial<CheckboxSettings>,
  isRequired: boolean,
  field: string
): ValidationError[] {
  const errors: ValidationError[] = []
  const OTHER_VALUE = '__other__'
  const realCount = value.filter((v) => v !== OTHER_VALUE).length

  if (isRequired && value.length === 0) {
    errors.push({ field, message: 'This field is required.' })
    return errors
  }
  if (
    s.min_choices !== null &&
    s.min_choices !== undefined &&
    realCount > 0 &&
    realCount < s.min_choices
  ) {
    errors.push({
      field,
      message: `Please select at least ${s.min_choices} option${s.min_choices !== 1 ? 's' : ''}.`,
    })
  }
  if (s.max_choices !== null && s.max_choices !== undefined && realCount > s.max_choices) {
    errors.push({
      field,
      message: `Please select at most ${s.max_choices} option${s.max_choices !== 1 ? 's' : ''}.`,
    })
  }
  return errors
}

function validateRanking(
  value: string[],
  _s: Partial<RankingSettings>,
  isRequired: boolean,
  allOptionIds: string[],
  field: string
): ValidationError[] {
  const errors: ValidationError[] = []
  if (isRequired && value.length === 0) {
    errors.push({ field, message: 'This field is required.' })
    return errors
  }
  const allRanked = allOptionIds.every((id) => value.includes(id))
  if (allOptionIds.length > 0 && !allRanked) {
    errors.push({ field, message: 'Please rank all options.' })
  }
  return errors
}

function validateImagePicker(
  value: string[],
  s: Partial<ImagePickerSettings>,
  isRequired: boolean,
  field: string
): ValidationError[] {
  const errors: ValidationError[] = []
  if (isRequired && value.length === 0) {
    errors.push({ field, message: 'This field is required.' })
    return errors
  }
  const multiSelect = s.multi_select ?? false
  if (multiSelect) {
    if (
      s.min_choices !== null &&
      s.min_choices !== undefined &&
      value.length > 0 &&
      value.length < s.min_choices
    ) {
      errors.push({
        field,
        message: `Please select at least ${s.min_choices} image${s.min_choices !== 1 ? 's' : ''}.`,
      })
    }
    if (s.max_choices !== null && s.max_choices !== undefined && value.length > s.max_choices) {
      errors.push({
        field,
        message: `Please select at most ${s.max_choices} image${s.max_choices !== 1 ? 's' : ''}.`,
      })
    }
  }
  return errors
}

function validateMatrix(
  value: Record<string, string>,
  s: Partial<MatrixSettings>,
  isRequired: boolean,
  subquestionCodes: string[],
  field: string
): ValidationError[] {
  const errors: ValidationError[] = []
  const isAllRowsRequired = s.is_all_rows_required ?? false
  if (isRequired && Object.keys(value).length === 0) {
    errors.push({ field, message: 'This field is required.' })
    return errors
  }
  if (isAllRowsRequired) {
    const unanswered = subquestionCodes.filter((code) => !value[code])
    if (unanswered.length > 0) {
      errors.push({ field, message: 'Please answer all rows.' })
    }
  }
  return errors
}

function validateMatrixDropdown(
  value: Record<string, string>,
  s: Partial<MatrixDropdownSettings>,
  isRequired: boolean,
  subquestionCodes: string[],
  field: string
): ValidationError[] {
  const errors: ValidationError[] = []
  const isAllRowsRequired = s.is_all_rows_required ?? false
  if (isRequired && Object.keys(value).length === 0) {
    errors.push({ field, message: 'This field is required.' })
    return errors
  }
  if (isAllRowsRequired) {
    const unanswered = subquestionCodes.filter((code) => !value[code])
    if (unanswered.length > 0) {
      errors.push({ field, message: 'Please answer all rows.' })
    }
  }
  return errors
}

function validateMatrixDynamic(
  _value: Record<string, string>[],
  _isRequired: boolean,
  _field: string
): ValidationError[] {
  // MatrixDynamic has no external validation constraints (no is_all_rows_required)
  // and uses internal row management (min/max row counts control UI, not answer validity).
  return []
}

function validateNumeric(
  value: string,
  s: Partial<NumericSettings>,
  isRequired: boolean,
  field: string
): ValidationError[] {
  const errors: ValidationError[] = []
  if (value.trim() === '') {
    if (isRequired) errors.push({ field, message: 'This field is required.' })
    return errors
  }
  const num = parseFloat(value)
  if (isNaN(num)) {
    errors.push({ field, message: 'Please enter a valid number.' })
    return errors
  }
  if (s.min !== null && s.min !== undefined && num < s.min) {
    errors.push({ field, message: `Value must be at least ${s.min}.` })
  }
  if (s.max !== null && s.max !== undefined && num > s.max) {
    errors.push({ field, message: `Value must be at most ${s.max}.` })
  }
  const decimalPlaces = s.decimal_places ?? 0
  const decimalMatch = value.match(/\.(\d+)$/)
  const actualDecimals = decimalMatch ? decimalMatch[1].length : 0
  if (actualDecimals > decimalPlaces) {
    errors.push({
      field,
      message: `Maximum ${decimalPlaces} decimal place${decimalPlaces === 1 ? '' : 's'} allowed.`,
    })
  }
  return errors
}

function validateRating(
  value: string,
  _s: Partial<RatingSettings>,
  isRequired: boolean,
  field: string
): ValidationError[] {
  const errors: ValidationError[] = []
  if (isRequired && value === '') {
    errors.push({ field, message: 'This field is required.' })
  }
  return errors
}

function validateBoolean(
  value: string,
  _s: Partial<BooleanSettings>,
  isRequired: boolean,
  field: string
): ValidationError[] {
  const errors: ValidationError[] = []
  if (isRequired && value === '') {
    errors.push({ field, message: 'This field is required.' })
  }
  return errors
}

function validateDate(
  value: string,
  s: Partial<DateSettings>,
  isRequired: boolean,
  field: string
): ValidationError[] {
  const errors: ValidationError[] = []
  if (value.trim() === '') {
    if (isRequired) errors.push({ field, message: 'This field is required.' })
    return errors
  }
  const date = new Date(value)
  if (isNaN(date.getTime())) {
    errors.push({ field, message: 'Please enter a valid date.' })
    return errors
  }
  if (s.min_date) {
    const minDate = new Date(s.min_date)
    if (!isNaN(minDate.getTime()) && date < minDate) {
      errors.push({ field, message: `Date must be on or after ${s.min_date}.` })
    }
  }
  if (s.max_date) {
    const maxDate = new Date(s.max_date)
    if (!isNaN(maxDate.getTime()) && date > maxDate) {
      errors.push({ field, message: `Date must be on or before ${s.max_date}.` })
    }
  }
  return errors
}

function validateFileUpload(
  value: File[],
  s: Partial<FileUploadSettings>,
  isRequired: boolean,
  field: string
): ValidationError[] {
  const errors: ValidationError[] = []
  if (isRequired && value.length === 0) {
    errors.push({ field, message: 'This field is required.' })
    return errors
  }
  const allowedTypes = s.allowed_types ?? []
  const maxSizeMb = s.max_size_mb ?? 10
  for (const file of value) {
    if (!matchesAllowedType(file, allowedTypes)) {
      errors.push({ field, message: `"${file.name}" is not an allowed file type.` })
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      errors.push({ field, message: `"${file.name}" exceeds the maximum size of ${maxSizeMb} MB.` })
    }
  }
  return errors
}

// ---------------------------------------------------------------------------
// Answer type union
// ---------------------------------------------------------------------------

export type QuestionAnswer =
  | string // short_text, long_text, huge_text, radio, dropdown, boolean, rating, numeric, date
  | string[] // checkbox, ranking, image_picker
  | Record<string, string> // matrix, matrix_dropdown
  | Record<string, string>[] // matrix_dynamic
  | File[] // file_upload

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Validates a single answer for a question and returns a ValidationResult.
 *
 * @param question - The BuilderQuestion with type, settings, and subquestions/options
 * @param answer   - The current answer value (type depends on question_type)
 * @returns        ValidationResult with valid flag and array of errors
 */
export function validateAnswer(
  question: BuilderQuestion,
  answer: QuestionAnswer
): ValidationResult {
  const field = question.code || question.id
  const s = (question.settings ?? {}) as Record<string, unknown>
  const isRequired = question.is_required

  let errors: ValidationError[] = []

  switch (question.question_type) {
    case 'short_text':
      errors = validateShortText(
        answer as string,
        s as Partial<ShortTextSettings>,
        isRequired,
        field
      )
      break

    case 'long_text':
      errors = validateLongText(answer as string, s as Partial<LongTextSettings>, isRequired, field)
      break

    case 'huge_text':
      errors = validateHugeText(answer as string, s as Partial<HugeTextSettings>, isRequired, field)
      break

    case 'radio':
      errors = validateRadio(answer as string, s as Partial<RadioSettings>, isRequired, field)
      break

    case 'dropdown':
      errors = validateDropdown(answer as string, s as Partial<DropdownSettings>, isRequired, field)
      break

    case 'checkbox':
      errors = validateCheckbox(
        answer as string[],
        s as Partial<CheckboxSettings>,
        isRequired,
        field
      )
      break

    case 'ranking': {
      const allOptionIds = question.answer_options.map((o) => o.id)
      errors = validateRanking(
        answer as string[],
        s as Partial<RankingSettings>,
        isRequired,
        allOptionIds,
        field
      )
      break
    }

    case 'image_picker':
      errors = validateImagePicker(
        answer as string[],
        s as Partial<ImagePickerSettings>,
        isRequired,
        field
      )
      break

    case 'matrix': {
      const subquestionCodes = question.subquestions.map((sq) => sq.code)
      errors = validateMatrix(
        answer as Record<string, string>,
        s as Partial<MatrixSettings>,
        isRequired,
        subquestionCodes,
        field
      )
      break
    }

    case 'matrix_dropdown': {
      const subquestionCodes = question.subquestions.map((sq) => sq.code)
      errors = validateMatrixDropdown(
        answer as Record<string, string>,
        s as Partial<MatrixDropdownSettings>,
        isRequired,
        subquestionCodes,
        field
      )
      break
    }

    case 'matrix_dynamic':
      errors = validateMatrixDynamic(answer as Record<string, string>[], isRequired, field)
      break

    case 'numeric':
      errors = validateNumeric(answer as string, s as Partial<NumericSettings>, isRequired, field)
      break

    case 'rating':
      errors = validateRating(answer as string, s as Partial<RatingSettings>, isRequired, field)
      break

    case 'boolean':
      errors = validateBoolean(answer as string, s as Partial<BooleanSettings>, isRequired, field)
      break

    case 'date':
      errors = validateDate(answer as string, s as Partial<DateSettings>, isRequired, field)
      break

    case 'file_upload':
      errors = validateFileUpload(
        answer as File[],
        s as Partial<FileUploadSettings>,
        isRequired,
        field
      )
      break

    case 'expression':
    case 'html':
      // Display-only types — no validation needed
      errors = []
      break

    default:
      errors = []
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
