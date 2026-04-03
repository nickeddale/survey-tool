/**
 * useValidation — hook for managing validation state across an entire form.
 *
 * Provides:
 * - errors: Record<questionId, string[]>  — current validation errors per question
 * - validateField(question, answer)        — validate a single field (for blur events)
 * - validateAll(answers)                  — validate all visible questions (for submit)
 * - clearErrors()                         — reset all validation state
 * - isValid                               — true when there are no errors
 */

import { useState, useCallback } from 'react'
import type { BuilderQuestion } from '../store/builderStore'
import { validateAnswer, type QuestionAnswer } from '../utils/validation'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Maps question id to its current error messages. */
export type ValidationErrors = Record<string, string[]>

/** Maps question id to its current answer value. */
export type AnswerMap = Record<string, QuestionAnswer>

export interface UseValidationReturn {
  /** Current validation errors keyed by question id. */
  errors: ValidationErrors
  /** True when there are no validation errors across all validated fields. */
  isValid: boolean
  /** Validate a single field and update errors. Call this on field blur. */
  validateField: (question: BuilderQuestion, answer: QuestionAnswer) => void
  /** Validate all questions against the provided answers map. Call on submit. */
  validateAll: (questions: BuilderQuestion[], answers: AnswerMap) => boolean
  /** Clear all validation errors. */
  clearErrors: () => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useValidation(): UseValidationReturn {
  const [errors, setErrors] = useState<ValidationErrors>({})

  const validateField = useCallback((question: BuilderQuestion, answer: QuestionAnswer) => {
    const result = validateAnswer(question, answer)
    setErrors((prev) => ({
      ...prev,
      [question.id]: result.errors.map((e) => e.message),
    }))
  }, [])

  const validateAll = useCallback((questions: BuilderQuestion[], answers: AnswerMap): boolean => {
    const nextErrors: ValidationErrors = {}
    let allValid = true

    for (const question of questions) {
      const answer = answers[question.id] ?? getDefaultAnswer(question.question_type)
      const result = validateAnswer(question, answer)
      nextErrors[question.id] = result.errors.map((e) => e.message)
      if (!result.valid) {
        allValid = false
      }
    }

    setErrors(nextErrors)
    return allValid
  }, [])

  const clearErrors = useCallback(() => {
    setErrors({})
  }, [])

  const isValid = Object.values(errors).every((errs) => errs.length === 0)

  return { errors, isValid, validateField, validateAll, clearErrors }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a sensible empty/default answer for a question type so that
 * validateAll() can validate unanswered questions without crashing.
 */
function getDefaultAnswer(questionType: string): QuestionAnswer {
  switch (questionType) {
    case 'checkbox':
    case 'ranking':
    case 'image_picker':
      return []
    case 'matrix':
    case 'matrix_dropdown':
      return {}
    case 'matrix_dynamic':
      return []
    case 'file_upload':
      return []
    default:
      return ''
  }
}
