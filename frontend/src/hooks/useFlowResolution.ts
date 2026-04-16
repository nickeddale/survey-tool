/**
 * useFlowResolution — debounced hook that calls POST /surveys/{id}/logic/resolve-flow
 * whenever answers change, and returns the resolved visibility and piped-text state.
 *
 * Key behaviors:
 * - Debounces API calls by 300ms so rapid typing does not flood the server.
 * - Hidden questions are tracked in a Set; they are removed from the rendered form
 *   but their answers are kept in the parent's AnswerMap so they can be restored
 *   if the question becomes visible again.
 * - Piped texts (Record<id, string>) replace {variable} placeholders in question
 *   titles and descriptions in the parent component.
 * - isResolving is true while a debounced call is pending or in-flight.
 * - Errors from the API are swallowed silently (all questions remain visible).
 */

import { useState, useEffect, useRef } from 'react'
import responseService from '../services/responseService'
import type { AnswerMap } from './useValidation'
import type { QuestionResponse, ResolveFlowResponse } from '../types/survey'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FlowResolutionState {
  /** Set of question ids that should be visible */
  visibleQuestions: Set<string>
  /** Set of question ids that are currently hidden */
  hiddenQuestions: Set<string>
  /** Set of group ids that should be visible */
  visibleGroups: Set<string>
  /** Set of group ids that are currently hidden */
  hiddenGroups: Set<string>
  /** Maps question/group id to resolved text (piped substitutions applied) */
  pipedTexts: Record<string, string>
  /** Next question id returned by skip logic (null when no skip target) */
  nextQuestionId: string | null
  /** True while a debounced resolve call is pending or the API is in-flight */
  isResolving: boolean
}

/**
 * Computes the initial set of hidden question ids from a flat list of questions.
 * Questions that have a non-empty relevance expression are hidden by default until
 * the first resolve-flow API response arrives, preventing a flash of visibility.
 */
export function computeInitialHiddenQuestions(questions: QuestionResponse[]): Set<string> {
  const hidden = new Set<string>()
  for (const q of questions) {
    if (q.relevance != null && q.relevance !== '') {
      hidden.add(q.id)
    }
  }
  return hidden
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFlowResolution(
  surveyId: string | undefined,
  answers: AnswerMap,
  questions?: QuestionResponse[]
): FlowResolutionState {
  const initialHidden = questions ? computeInitialHiddenQuestions(questions) : new Set<string>()

  const [state, setState] = useState<FlowResolutionState>({
    visibleQuestions: new Set(),
    hiddenQuestions: initialHidden,
    visibleGroups: new Set(),
    hiddenGroups: new Set(),
    pipedTexts: {},
    nextQuestionId: null,
    isResolving: false,
  })

  // Stable refs so the async callback always reads the current values without
  // being included as effect dependencies (which would cause infinite re-runs).
  const answersRef = useRef<AnswerMap>(answers)
  answersRef.current = answers

  const surveyIdRef = useRef<string | undefined>(surveyId)
  surveyIdRef.current = surveyId

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [])

  // Trigger effect only when the serialized answers content or surveyId actually changes.
  // We compute the key as a stable primitive that can safely be used as a dep.
  const answersKey = surveyId
    ? JSON.stringify(Object.entries(answers).sort(([a], [b]) => a.localeCompare(b)))
    : null

  useEffect(() => {
    if (!surveyId || answersKey === null) {
      return
    }

    // Mark as resolving immediately
    setState((prev) => (prev.isResolving ? prev : { ...prev, isResolving: true }))

    // Reset and arm the debounce timer
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(async () => {
      debounceTimerRef.current = null

      if (!isMountedRef.current || !surveyIdRef.current) return

      try {
        const currentAnswers = answersRef.current
        const answerInputs = Object.entries(currentAnswers).map(([questionId, value]) => ({
          question_id: questionId,
          value,
        }))

        const result: ResolveFlowResponse = await responseService.resolveFlow(surveyIdRef.current, {
          answers: answerInputs,
        })

        if (!isMountedRef.current) return

        setState({
          visibleQuestions: new Set(result.visible_questions),
          hiddenQuestions: new Set(result.hidden_questions),
          visibleGroups: new Set(result.visible_groups),
          hiddenGroups: new Set(result.hidden_groups),
          pipedTexts: result.piped_texts ?? {},
          nextQuestionId: result.next_question_id,
          isResolving: false,
        })
      } catch {
        // Swallow API errors — keep previous visibility state, mark resolve done
        if (isMountedRef.current) {
          setState((prev) => ({ ...prev, isResolving: false }))
        }
      }
    }, 300)
  }, [surveyId, answersKey])
  // Note: `answersKey` is derived from `answers` contents (not the reference),
  // so this effect only re-fires when the actual answer values change.
  // `setState` is stable and does NOT need to be listed as a dependency.

  return state
}

export default useFlowResolution
