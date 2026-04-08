import type { AnswerInput } from '../../services/responseService'
import type { SurveyFullResponse, QuestionGroupResponse, QuestionResponse } from '../../types/survey'
import type { AnswerMap } from '../../hooks/useValidation'

/**
 * Convert answers map to the array format expected by the API.
 *
 * @param answers - The current answer map
 * @param questionTypeMap - Optional map of questionId → question_type for type-aware serialization
 */
export function answersToInput(answers: AnswerMap, questionTypeMap?: Record<string, string>): AnswerInput[] {
  return Object.entries(answers).map(([questionId, value]) => {
    const questionType = questionTypeMap?.[questionId]
    // Backend expects rating as integer, not string
    if (questionType === 'rating' && typeof value === 'string' && value !== '') {
      const parsed = Number(value)
      if (!isNaN(parsed)) {
        return { question_id: questionId, value: parsed }
      }
    }
    // Backend expects yes_no as 'yes'/'no', but BooleanInput stores 'true'/'false'
    if (questionType === 'yes_no' && typeof value === 'string') {
      if (value === 'true') return { question_id: questionId, value: 'yes' }
      if (value === 'false') return { question_id: questionId, value: 'no' }
    }
    return { question_id: questionId, value }
  })
}

/** Flatten all questions from all groups into a single array. */
export function flattenQuestions(groups: QuestionGroupResponse[]): QuestionResponse[] {
  return groups.flatMap((g) => [...g.questions].sort((a, b) => a.sort_order - b.sort_order))
}

/**
 * Replace {variable} placeholders in a string using the pipedTexts map.
 * Falls back to the original text if no piped text is available for a given id.
 */
export function applyPipedText(text: string, pipedTexts: Record<string, string>): string {
  return text.replace(/\{([^}]+)\}/g, (match, key) => pipedTexts[key] ?? match)
}

/**
 * Apply piped text substitutions and filter out hidden questions from survey groups.
 * Hidden questions are removed from display but answers are retained in AnswerMap.
 */
export function buildVisibleSurvey(
  survey: SurveyFullResponse,
  hiddenQuestions: Set<string>,
  hiddenGroups: Set<string>,
  pipedTexts: Record<string, string>,
): SurveyFullResponse {
  const visibleGroups = survey.groups
    .filter((g) => !hiddenGroups.has(g.id))
    .map((g) => ({
      ...g,
      title: applyPipedText(g.title, pipedTexts),
      description: g.description ? applyPipedText(g.description, pipedTexts) : g.description,
      questions: g.questions
        .filter((q) => !hiddenQuestions.has(q.id))
        .map((q) => ({
          ...q,
          title: applyPipedText(q.title, pipedTexts),
          description: q.description ? applyPipedText(q.description, pipedTexts) : q.description,
        })),
    }))

  return { ...survey, groups: visibleGroups }
}
