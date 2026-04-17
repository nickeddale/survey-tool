/**
 * SurveyPreviewPage — full-screen preview of the survey as a respondent would see it.
 *
 * Features:
 *   - Preview Mode banner with Return to Builder button
 *   - Welcome screen, group screens, and end screen
 *   - Next/Previous navigation between groups (when one_page_per_group is true)
 *   - Progress bar showing completion
 *   - Interactive questions (users can fill in answers to test form behavior)
 *   - Single-page mode when one_page_per_group is false
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Eye } from 'lucide-react'
import surveyService from '../services/surveyService'
import type { SurveyFullResponse, QuestionGroupResponse } from '../types/survey'
import type { BuilderQuestion } from '../store/builderStore'
import { ApiError } from '../types/api'
import { Button } from '../components/ui/button'
import { Skeleton } from '../components/ui/skeleton'
import { QuestionPreview } from '../components/survey-builder/QuestionPreview'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PreviewScreen = 'welcome' | 'group' | 'end'

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function PreviewSkeleton() {
  return (
    <div
      className="flex flex-col h-screen"
      aria-label="Loading survey preview"
      aria-busy="true"
      data-testid="preview-loading-skeleton"
    >
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-amber-50">
        <Skeleton className="h-8 w-40 rounded" />
        <Skeleton className="h-8 w-32 rounded ml-auto" />
      </div>
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <Skeleton className="h-10 w-2/3 rounded" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

interface ProgressBarProps {
  current: number
  total: number
}

function ProgressBar({ current, total }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div className="w-full" data-testid="preview-progress-bar" aria-label={`Progress: ${pct}%`}>
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>Progress</span>
        <span data-testid="preview-progress-pct">{pct}%</span>
      </div>
      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
          data-testid="preview-progress-fill"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Group content
// ---------------------------------------------------------------------------

interface GroupContentProps {
  group: QuestionGroupResponse
}

function GroupContent({ group }: GroupContentProps) {
  return (
    <div data-testid={`preview-group-${group.id}`}>
      <h2 className="text-xl font-semibold text-foreground mb-1" data-testid="preview-group-title">
        {group.title}
      </h2>
      {group.description && (
        <p className="text-sm text-muted-foreground mb-4" data-testid="preview-group-description">
          {group.description}
        </p>
      )}
      <div className="space-y-4">
        {group.questions
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((question) => (
            <QuestionPreview key={question.id} question={question as BuilderQuestion} interactive />
          ))}
        {group.questions.length === 0 && (
          <p className="text-sm text-muted-foreground italic" data-testid="preview-group-empty">
            No questions in this group.
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function SurveyPreviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [survey, setSurvey] = useState<SurveyFullResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [screen, setScreen] = useState<PreviewScreen>('welcome')
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0)

  // -------------------------------------------------------------------------
  // Fetch survey
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!id) return
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError(null)
      try {
        const data = await surveyService.getSurvey(id!)
        if (!cancelled) {
          setSurvey(data)
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError) {
            setError(err.message)
          } else {
            setError('Failed to load survey. Please try again.')
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
  }, [id])

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const sortedGroups = survey ? [...survey.groups].sort((a, b) => a.sort_order - b.sort_order) : []

  const onePagePerGroup = survey?.settings?.one_page_per_group !== false
  // Default to true; only false if explicitly set to false

  const totalGroups = sortedGroups.length

  // For progress: welcome = 0, groups = 1..n, end = n+1
  const progressCurrent =
    screen === 'welcome' ? 0 : screen === 'end' ? totalGroups : currentGroupIndex + 1
  const progressTotal = totalGroups

  const handleReturnToSurvey = () => {
    navigate(`/surveys/${id}`)
  }

  const handleStart = () => {
    if (totalGroups === 0) {
      setScreen('end')
    } else {
      setCurrentGroupIndex(0)
      setScreen('group')
    }
  }

  const handleNext = () => {
    if (!onePagePerGroup) {
      // Single page: go straight to end
      setScreen('end')
      return
    }
    if (currentGroupIndex < totalGroups - 1) {
      setCurrentGroupIndex((i) => i + 1)
    } else {
      setScreen('end')
    }
  }

  const handlePrevious = () => {
    if (currentGroupIndex > 0) {
      setCurrentGroupIndex((i) => i - 1)
    } else {
      setScreen('welcome')
    }
  }

  // -------------------------------------------------------------------------
  // Render: loading
  // -------------------------------------------------------------------------

  if (isLoading) {
    return <PreviewSkeleton />
  }

  // -------------------------------------------------------------------------
  // Render: error
  // -------------------------------------------------------------------------

  if (error || !survey) {
    return (
      <div
        className="flex flex-col items-center justify-center h-screen gap-4"
        data-testid="preview-error"
      >
        <div
          className="p-4 text-sm text-destructive bg-destructive/10 rounded-md max-w-md text-center"
          role="alert"
        >
          {error ?? 'Failed to load survey.'}
        </div>
        <Button variant="outline" onClick={() => navigate('/surveys')}>
          Back to Surveys
        </Button>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render: preview page
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-screen overflow-hidden" data-testid="survey-preview-page">
      {/* Preview Mode banner */}
      <header
        className="flex items-center gap-3 px-4 py-3 border-b border-amber-300 bg-amber-50 shrink-0"
        data-testid="preview-banner"
      >
        <Eye size={16} className="text-amber-600 shrink-0" aria-hidden="true" />
        <span className="text-sm font-medium text-amber-700" data-testid="preview-banner-text">
          Preview Mode — this is how respondents will see your survey
        </span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-8 gap-1 border-amber-400 text-amber-700 hover:bg-amber-100"
          onClick={handleReturnToSurvey}
          data-testid="return-to-survey-button"
        >
          <ArrowLeft size={14} />
          Return to Survey
        </Button>
      </header>

      {/* Progress bar (shown when in group or end screen and there are groups) */}
      {totalGroups > 0 && (screen === 'group' || screen === 'end') && (
        <div
          className="px-8 pt-4 max-w-2xl w-full mx-auto shrink-0"
          data-testid="preview-progress-container"
        >
          <ProgressBar current={progressCurrent} total={progressTotal} />
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto" data-testid="preview-main">
        <div className="max-w-2xl mx-auto px-8 py-8">
          {/* Welcome screen */}
          {screen === 'welcome' && (
            <div data-testid="preview-welcome-screen">
              <h1
                className="text-3xl font-bold text-foreground mb-4"
                data-testid="preview-survey-title"
              >
                {survey.title}
              </h1>
              {survey.description && (
                <p className="text-muted-foreground mb-6" data-testid="preview-survey-description">
                  {survey.description}
                </p>
              )}
              {survey.welcome_message && (
                <div
                  className="prose prose-sm max-w-none text-foreground mb-8 p-4 bg-muted/40 rounded-lg"
                  data-testid="preview-welcome-message"
                >
                  {survey.welcome_message}
                </div>
              )}
              {totalGroups === 0 && !survey.welcome_message && (
                <p className="text-muted-foreground italic mb-6" data-testid="preview-no-content">
                  This survey has no questions yet.
                </p>
              )}
              <Button onClick={handleStart} data-testid="preview-start-button" size="lg">
                {totalGroups === 0 ? 'View Results Screen' : 'Start Survey'}
              </Button>
            </div>
          )}

          {/* Group screen(s) */}
          {screen === 'group' && (
            <div data-testid="preview-group-screen">
              {onePagePerGroup ? (
                // One group per page
                sortedGroups[currentGroupIndex] ? (
                  <GroupContent group={sortedGroups[currentGroupIndex]} />
                ) : null
              ) : (
                // All groups on one page
                <div className="space-y-8" data-testid="preview-all-groups">
                  {sortedGroups.map((group) => (
                    <GroupContent key={group.id} group={group} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* End screen */}
          {screen === 'end' && (
            <div data-testid="preview-end-screen">
              <h1
                className="text-3xl font-bold text-foreground mb-4"
                data-testid="preview-end-title"
              >
                Thank You!
              </h1>
              {survey.end_message ? (
                <div
                  className="prose prose-sm max-w-none text-foreground p-4 bg-muted/40 rounded-lg"
                  data-testid="preview-end-message"
                >
                  {survey.end_message}
                </div>
              ) : (
                <p className="text-muted-foreground" data-testid="preview-end-default-message">
                  Your response has been recorded.
                </p>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Navigation footer */}
      {screen === 'group' && (
        <footer
          className="flex items-center justify-between px-8 py-4 border-t border-border bg-background shrink-0"
          data-testid="preview-navigation"
        >
          <Button variant="outline" onClick={handlePrevious} data-testid="preview-previous-button">
            <ArrowLeft size={14} />
            Previous
          </Button>

          {onePagePerGroup && totalGroups > 0 && (
            <span className="text-sm text-muted-foreground" data-testid="preview-page-indicator">
              {currentGroupIndex + 1} / {totalGroups}
            </span>
          )}

          <Button onClick={handleNext} data-testid="preview-next-button">
            {onePagePerGroup && currentGroupIndex < totalGroups - 1 ? (
              <>
                Next <ArrowRight size={14} />
              </>
            ) : (
              <>
                Submit <ArrowRight size={14} />
              </>
            )}
          </Button>
        </footer>
      )}
    </div>
  )
}

export default SurveyPreviewPage
