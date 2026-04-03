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
import type { AnswerInput } from '../services/responseService'
import type { SurveyFullResponse, QuestionGroupResponse, QuestionResponse } from '../types/survey'
import type { BuilderQuestion } from '../store/builderStore'
import type { QuestionAnswer } from '../utils/validation'
import { useValidation, type AnswerMap } from '../hooks/useValidation'
import { useFlowResolution } from '../hooks/useFlowResolution'
import { ApiError } from '../types/api'
import { Skeleton } from '../components/ui/skeleton'
import { Button } from '../components/ui/button'
import { SurveyForm } from '../components/responses/SurveyForm'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function localStorageKey(surveyId: string): string {
  return `survey_response_${surveyId}`
}

function getStoredResponseId(surveyId: string): string | null {
  try {
    return localStorage.getItem(localStorageKey(surveyId))
  } catch {
    return null
  }
}

function storeResponseId(surveyId: string, responseId: string): void {
  try {
    localStorage.setItem(localStorageKey(surveyId), responseId)
  } catch {
    // Ignore localStorage errors (private browsing, storage full, etc.)
  }
}

function clearStoredResponseId(surveyId: string): void {
  try {
    localStorage.removeItem(localStorageKey(surveyId))
  } catch {
    // Ignore
  }
}

/** Convert answers map to the array format expected by the API. */
function answersToInput(answers: AnswerMap): AnswerInput[] {
  return Object.entries(answers).map(([questionId, value]) => ({
    question_id: questionId,
    value,
  }))
}

/** Flatten all questions from all groups into a single array. */
function flattenQuestions(groups: QuestionGroupResponse[]): QuestionResponse[] {
  return groups.flatMap((g) => [...g.questions].sort((a, b) => a.sort_order - b.sort_order))
}

/**
 * Replace {variable} placeholders in a string using the pipedTexts map.
 * Falls back to the original text if no piped text is available for a given id.
 */
function applyPipedText(text: string, pipedTexts: Record<string, string>): string {
  return text.replace(/\{([^}]+)\}/g, (match, key) => pipedTexts[key] ?? match)
}

/**
 * Apply piped text substitutions and filter out hidden questions from survey groups.
 * Hidden questions are removed from display but answers are retained in AnswerMap.
 */
function buildVisibleSurvey(
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

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function ResponseSkeleton() {
  return (
    <div
      className="flex flex-col min-h-screen"
      aria-label="Loading survey"
      aria-busy="true"
      data-testid="response-loading-skeleton"
    >
      <div className="max-w-2xl mx-auto px-8 py-12 w-full space-y-6">
        <Skeleton className="h-10 w-2/3 rounded" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Unavailable screen
// ---------------------------------------------------------------------------

function UnavailableScreen({ status }: { status: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen px-4"
      data-testid="survey-unavailable-screen"
    >
      <div className="max-w-md w-full rounded-lg border border-border bg-background p-8 text-center space-y-3">
        <h1 className="text-2xl font-bold text-foreground" data-testid="unavailable-title">
          Survey Unavailable
        </h1>
        <p className="text-muted-foreground" data-testid="unavailable-message">
          {status === 'closed'
            ? 'This survey has been closed and is no longer accepting responses.'
            : status === 'archived'
            ? 'This survey has been archived and is no longer available.'
            : 'This survey is not currently available.'}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Welcome screen
// ---------------------------------------------------------------------------

interface WelcomeScreenProps {
  survey: SurveyFullResponse
  onStart: () => void
  isStarting: boolean
}

function WelcomeScreen({ survey, onStart, isStarting }: WelcomeScreenProps) {
  return (
    <div
      className="max-w-2xl mx-auto px-8 py-12"
      data-testid="survey-welcome-screen"
    >
      <h1 className="text-3xl font-bold text-foreground mb-4" data-testid="welcome-survey-title">
        {survey.title}
      </h1>
      {survey.description && (
        <p className="text-muted-foreground mb-6" data-testid="welcome-survey-description">
          {survey.description}
        </p>
      )}
      {survey.welcome_message && (
        <div
          className="prose prose-sm max-w-none text-foreground mb-8 p-4 bg-muted/40 rounded-lg"
          data-testid="welcome-message"
        >
          {survey.welcome_message}
        </div>
      )}
      <Button
        onClick={onStart}
        disabled={isStarting}
        size="lg"
        data-testid="start-survey-button"
      >
        {isStarting ? 'Starting…' : 'Start Survey'}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Thank-you screen
// ---------------------------------------------------------------------------

function ThankYouScreen({ survey }: { survey: SurveyFullResponse }) {
  return (
    <div
      className="max-w-2xl mx-auto px-8 py-12"
      data-testid="survey-thankyou-screen"
    >
      <h1 className="text-3xl font-bold text-foreground mb-4" data-testid="thankyou-title">
        Thank You!
      </h1>
      {survey.end_message ? (
        <div
          className="prose prose-sm max-w-none text-foreground p-4 bg-muted/40 rounded-lg"
          data-testid="thankyou-end-message"
        >
          {survey.end_message}
        </div>
      ) : (
        <p className="text-muted-foreground" data-testid="thankyou-default-message">
          Your response has been recorded. Thank you for your time!
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

type PageScreen = 'welcome' | 'form' | 'end'

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  zh: 'Chinese',
  ja: 'Japanese',
  ar: 'Arabic',
}

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

  // -------------------------------------------------------------------------
  // Flow resolution (conditional display + piped text)
  // Only active while the form is on screen; no-ops when survey_id is absent.
  // -------------------------------------------------------------------------

  const {
    hiddenQuestions,
    hiddenGroups,
    pipedTexts,
    nextQuestionId,
  } = useFlowResolution(screen === 'form' ? survey_id : undefined, answers)

  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // Derive available languages from survey translations
  // -------------------------------------------------------------------------

  const availableLanguages = useMemo(() => {
    if (!survey) return []
    const langs = new Set<string>([survey.default_language])
    Object.keys(survey.translations ?? {}).forEach(l => langs.add(l))
    return Array.from(langs)
  }, [survey])

  // -------------------------------------------------------------------------
  // Fetch survey
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!survey_id) return
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setLoadError(null)
      try {
        const data = await surveyService.getSurvey(survey_id!, activeLang)
        if (!cancelled) {
          setSurvey(data)
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError) {
            setLoadError(err.message)
          } else {
            setLoadError('Failed to load survey. Please try again.')
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [survey_id, activeLang]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleLangChange(lang: string) {
    setActiveLang(lang)
    setSearchParams(lang ? { lang } : {})
  }

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  // Build a survey with hidden questions/groups removed and piped text applied.
  // This is memoized to avoid rebuilding on every render.
  const visibleSurvey = useMemo(() => {
    if (!survey) return null
    return buildVisibleSurvey(survey, hiddenQuestions, hiddenGroups, pipedTexts)
  }, [survey, hiddenQuestions, hiddenGroups, pipedTexts])

  const sortedGroups = visibleSurvey
    ? [...visibleSurvey.groups].sort((a, b) => a.sort_order - b.sort_order)
    : []
  const onePagePerGroup = survey?.settings?.one_page_per_group !== false
  const totalPages = onePagePerGroup ? sortedGroups.length : 1

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleStart = useCallback(async () => {
    if (!survey_id || !survey) return
    setIsStarting(true)
    setSubmitError(null)
    try {
      // Check if there's an existing in-progress response in localStorage
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
      if (err instanceof ApiError) {
        setSubmitError(err.message)
      } else {
        setSubmitError('Failed to start survey. Please try again.')
      }
    } finally {
      setIsStarting(false)
    }
  }, [survey_id, survey, clearErrors])

  const handleChange = useCallback((questionId: string, value: QuestionAnswer) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }, [])

  const handleNext = useCallback(async () => {
    if (!survey || !survey_id || !responseId) return

    // Validate current page questions
    const currentGroup = sortedGroups[currentPage]
    if (!currentGroup) return

    const currentQuestions = [...currentGroup.questions].sort(
      (a, b) => a.sort_order - b.sort_order,
    ) as BuilderQuestion[]

    const valid = validateAll(currentQuestions, answers)
    if (!valid) return

    // Save progress
    try {
      await responseService.saveProgress(survey_id, responseId, answersToInput(answers))
    } catch {
      // Non-fatal: continue even if save fails
    }

    // Skip logic: if resolve-flow returned a next_question_id, jump to the group
    // containing that question (skipping any hidden groups in between).
    if (nextQuestionId && onePagePerGroup) {
      const targetIndex = sortedGroups.findIndex((g) =>
        g.questions.some((q) => q.id === nextQuestionId),
      )
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
    // Scroll to top on page change (safe guard for test environments)
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

    // Validate all visible questions on the current page (or all visible questions for single-page mode)
    let questionsToValidate: BuilderQuestion[]
    if (onePagePerGroup) {
      const currentGroup = sortedGroups[currentPage]
      questionsToValidate = currentGroup
        ? ([...currentGroup.questions].sort((a, b) => a.sort_order - b.sort_order) as BuilderQuestion[])
        : []
    } else {
      questionsToValidate = flattenQuestions(sortedGroups) as BuilderQuestion[]
    }

    const valid = validateAll(questionsToValidate, answers)
    if (!valid) return

    setIsSubmitting(true)
    setSubmitError(null)
    try {
      await responseService.completeResponse(survey_id, responseId, answersToInput(answers))
      clearStoredResponseId(survey_id)
      setScreen('end')
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.message)
      } else {
        setSubmitError('Failed to submit response. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [survey, survey_id, responseId, onePagePerGroup, sortedGroups, currentPage, answers, validateAll])

  // -------------------------------------------------------------------------
  // Render: loading
  // -------------------------------------------------------------------------

  if (isLoading) {
    return <ResponseSkeleton />
  }

  // -------------------------------------------------------------------------
  // Render: load error
  // -------------------------------------------------------------------------

  if (loadError || !survey) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen gap-4"
        data-testid="response-load-error"
      >
        <div
          className="p-4 text-sm text-destructive bg-destructive/10 rounded-md max-w-md text-center"
          role="alert"
        >
          {loadError ?? 'Failed to load survey.'}
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render: inactive/closed/archived survey
  // -------------------------------------------------------------------------

  if (survey.status !== 'active') {
    return <UnavailableScreen status={survey.status} />
  }

  // -------------------------------------------------------------------------
  // Render: thank-you screen
  // -------------------------------------------------------------------------

  if (screen === 'end') {
    return (
      <div className="min-h-screen bg-background" data-testid="survey-response-page">
        <ThankYouScreen survey={survey} />
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render: form screen
  // -------------------------------------------------------------------------

  if (screen === 'form') {
    return (
      <div className="flex flex-col min-h-screen bg-background" data-testid="survey-response-page">
        {submitError && (
          <div
            className="max-w-2xl mx-auto px-8 pt-4 w-full"
            data-testid="submit-error"
          >
            <div
              className="p-3 text-sm text-destructive bg-destructive/10 rounded-md"
              role="alert"
            >
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

  // -------------------------------------------------------------------------
  // Render: welcome screen (default)
  // -------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-background" data-testid="survey-response-page">
      {submitError && (
        <div
          className="max-w-2xl mx-auto px-8 pt-4 w-full"
          data-testid="submit-error"
        >
          <div
            className="p-3 text-sm text-destructive bg-destructive/10 rounded-md"
            role="alert"
          >
            {submitError}
          </div>
        </div>
      )}
      {/* Language switcher (shown when survey has multiple languages) */}
      {availableLanguages.length > 1 && (
        <div className="flex justify-end max-w-2xl mx-auto px-8 pt-4" data-testid="language-switcher">
          <div className="flex items-center gap-2">
            <label htmlFor="lang-select" className="text-sm text-muted-foreground">
              Language:
            </label>
            <select
              id="lang-select"
              value={activeLang ?? survey.default_language}
              onChange={e => handleLangChange(e.target.value)}
              className="px-2 py-1 rounded border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              data-testid="response-lang-select"
            >
              {availableLanguages.map(lang => (
                <option key={lang} value={lang}>
                  {LANGUAGE_LABELS[lang] ?? lang}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <WelcomeScreen survey={survey} onStart={handleStart} isStarting={isStarting} />
    </div>
  )
}

export default SurveyResponsePage
