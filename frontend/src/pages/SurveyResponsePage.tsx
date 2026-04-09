/**
 * SurveyResponsePage — public-facing survey response form at /s/:survey_id.
 *
 * No authentication required. Flow:
 *   1. Fetch survey → show Skeleton while loading
 *   2. If survey is not active → show unavailable message
 *   3. Show welcome screen (title + description + welcome_message + Start button)
 *   4. On Start → check localStorage for existing response_id → create or resume response
 *   5. Render SurveyForm with paged navigation state
 *   6. On Next → validate current page → save progress → advance page
 *   7. On Submit → validate all → complete response → clear localStorage → show thank-you
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import surveyService from '../services/surveyService'
import responseService from '../services/responseService'
import type { SurveyFullResponse } from '../types/survey'
import type { BuilderQuestion } from '../store/builderStore'
import type { QuestionAnswer } from '../utils/validation'
import { getStoredResponseId, storeResponseId, clearStoredResponseId } from '../utils/localStorage'
import { useValidation, type AnswerMap } from '../hooks/useValidation'
import { useFlowResolution } from '../hooks/useFlowResolution'
import { ApiError } from '../types/api'
import { SurveyForm } from '../components/responses/SurveyForm'
import {
  ResponseSkeleton,
  UnavailableScreen,
  WelcomeScreen,
  ThankYouScreen,
  answersToInput,
  flattenQuestions,
  buildVisibleSurvey,
  type PageScreen,
} from '../components/survey-response'

function SurveyResponsePage() {
  const { survey_id } = useParams<{ survey_id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const langParam = searchParams.get('lang') ?? undefined

  const [survey, setSurvey] = useState<SurveyFullResponse | null>(null)
  const [activeLang, setActiveLang] = useState<string | undefined>(langParam)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [screen, setScreen] = useState<PageScreen>('welcome')
  const [responseId, setResponseId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [isStarting, setIsStarting] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { errors, validateAll, clearErrors } = useValidation()

  const surveyQuestions = useMemo(() => {
    if (!survey) return []
    return survey.groups.flatMap((g) => g.questions)
  }, [survey])

  const { hiddenQuestions, hiddenGroups, pipedTexts, nextQuestionId } =
    useFlowResolution(screen === 'form' ? survey_id : undefined, answers, surveyQuestions)

  const availableLanguages = useMemo(() => {
    if (!survey) return []
    const langs = new Set<string>([survey.default_language])
    Object.keys(survey.translations ?? {}).forEach(l => langs.add(l))
    return Array.from(langs)
  }, [survey])

  useEffect(() => {
    if (!survey_id) return
    let cancelled = false
    async function load() {
      setIsLoading(true)
      setLoadError(null)
      try {
        const data = await surveyService.getPublicSurvey(survey_id!, activeLang)
        if (!cancelled) setSurvey(data)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : 'Failed to load survey. Please try again.')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [survey_id, activeLang]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleLangChange(lang: string) {
    setActiveLang(lang)
    setSearchParams(lang ? { lang } : {})
  }

  const visibleSurvey = useMemo(() => {
    if (!survey) return null
    return buildVisibleSurvey(survey, hiddenQuestions, hiddenGroups, pipedTexts)
  }, [survey, hiddenQuestions, hiddenGroups, pipedTexts])

  const sortedGroups = visibleSurvey
    ? [...visibleSurvey.groups].sort((a, b) => a.sort_order - b.sort_order)
    : []
  const onePagePerGroup = survey?.settings?.one_page_per_group !== false

  // Map of questionId → question_type for type-aware answer serialization
  const questionTypeMap = useMemo<Record<string, string>>(() => {
    if (!survey) return {}
    const map: Record<string, string> = {}
    for (const group of survey.groups) {
      for (const q of group.questions) {
        map[q.id] = q.question_type
      }
    }
    return map
  }, [survey])

  const handleStart = useCallback(async () => {
    if (!survey_id || !survey) return
    setIsStarting(true)
    setSubmitError(null)
    try {
      const existingId = getStoredResponseId(survey_id)
      if (existingId) {
        setResponseId(existingId)
      } else {
        const created = await responseService.createResponse(survey_id)
        setResponseId(created.id)
        storeResponseId(survey_id, created.id)
      }
      setCurrentPage(0)
      setAnswers({})
      clearErrors()
      setScreen('form')
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Failed to start survey. Please try again.')
    } finally {
      setIsStarting(false)
    }
  }, [survey_id, survey, clearErrors])

  const handleChange = useCallback((questionId: string, value: QuestionAnswer) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }))
  }, [])

  const handleNext = useCallback(async () => {
    if (!survey || !survey_id || !responseId) return
    const currentGroup = sortedGroups[currentPage]
    if (!currentGroup) return
    const currentQuestions = [...currentGroup.questions].sort(
      (a, b) => a.sort_order - b.sort_order,
    ) as BuilderQuestion[]
    const valid = validateAll(currentQuestions, answers)
    if (!valid) return
    try { await responseService.saveProgress(survey_id, responseId, answersToInput(answers, questionTypeMap)) } catch { /* Non-fatal */ }
    if (nextQuestionId && onePagePerGroup) {
      const targetIndex = sortedGroups.findIndex((g) => g.questions.some((q) => q.id === nextQuestionId))
      if (targetIndex !== -1 && targetIndex !== currentPage) {
        setCurrentPage(targetIndex)
        clearErrors()
        if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
        return
      }
    }
    setCurrentPage((p) => p + 1)
    clearErrors()
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [survey, survey_id, responseId, sortedGroups, currentPage, answers, validateAll, clearErrors, nextQuestionId, onePagePerGroup])

  const handlePrev = useCallback(() => {
    if (currentPage > 0) {
      setCurrentPage((p) => p - 1)
      clearErrors()
      if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }
  }, [currentPage, clearErrors])
  const handleSubmit = useCallback(async () => {
    if (!survey || !survey_id || !responseId) return
    const pageQuestions = onePagePerGroup
      ? ([...sortedGroups[currentPage]?.questions ?? []].sort((a, b) => a.sort_order - b.sort_order) as BuilderQuestion[])
      : (flattenQuestions(sortedGroups) as BuilderQuestion[])
    if (!validateAll(pageQuestions, answers)) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      await responseService.saveProgress(survey_id, responseId, answersToInput(answers, questionTypeMap))
      await responseService.completeResponse(survey_id, responseId, answersToInput(answers, questionTypeMap))
      clearStoredResponseId(survey_id)
      setScreen('end')
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Failed to submit response. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }, [survey, survey_id, responseId, onePagePerGroup, sortedGroups, currentPage, answers, validateAll])

  if (isLoading) return <ResponseSkeleton />

  if (loadError || !survey) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4" data-testid="response-load-error">
        <div className="p-4 text-sm text-destructive bg-destructive/10 rounded-md max-w-md text-center" role="alert">
          {loadError ?? 'Failed to load survey.'}
        </div>
      </div>
    )
  }

  if (survey.status !== 'active') return <UnavailableScreen status={survey.status} />

  if (screen === 'end') {
    return (
      <div className="min-h-screen bg-background" data-testid="survey-response-page">
        <ThankYouScreen survey={survey} />
      </div>
    )
  }

  if (screen === 'form') {
    return (
      <div className="flex flex-col min-h-screen bg-background" data-testid="survey-response-page">
        {submitError && (
          <div className="max-w-2xl mx-auto px-8 pt-4 w-full" data-testid="submit-error">
            <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md" role="alert">
              {submitError}
            </div>
          </div>
        )}
        <div className="flex-1 flex flex-col">
          <SurveyForm
            survey={visibleSurvey ?? survey}
            currentPage={currentPage}
            answers={answers}
            errors={errors}
            isSubmitting={isSubmitting}
            onChange={handleChange}
            onNext={handleNext}
            onPrev={handlePrev}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    )
  }

  return (
    <WelcomeScreen
      survey={survey}
      onStart={handleStart}
      isStarting={isStarting}
      availableLanguages={availableLanguages}
      activeLang={activeLang}
      onLangChange={handleLangChange}
      submitError={submitError}
    />
  )
}

export default SurveyResponsePage
