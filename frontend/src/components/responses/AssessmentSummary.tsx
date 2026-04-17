import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import type { AssessmentSummaryResponse } from '../../types/survey'
import assessmentService from '../../services/assessmentService'
import axios from 'axios'

// ---------------------------------------------------------------------------
// Progress bar for band distribution
// ---------------------------------------------------------------------------

interface ProgressBarProps {
  percentage: number
  label: string
}

function ProgressBar({ percentage, label }: ProgressBarProps) {
  const width = Math.min(100, Math.max(0, percentage))
  return (
    <div
      className="h-3 bg-primary/20 rounded-full overflow-hidden"
      role="progressbar"
      aria-valuenow={width}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full bg-primary rounded-full transition-all duration-500"
        style={{ width: `${width}%` }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// AssessmentSummary
// ---------------------------------------------------------------------------

interface AssessmentSummaryProps {
  surveyId: string
}

function AssessmentSummary({ surveyId }: AssessmentSummaryProps) {
  const [summary, setSummary] = useState<AssessmentSummaryResponse | null>(null)
  const [hasAssessment, setHasAssessment] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!surveyId) return
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError(null)
      try {
        const data = await assessmentService.getAssessmentSummary(surveyId)
        if (!cancelled) setSummary(data)
      } catch (err) {
        if (!cancelled) {
          if (axios.isAxiosError(err) && err.response?.status === 404) {
            setHasAssessment(false)
          } else {
            setError('Failed to load assessment summary. Please try again.')
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
  }, [surveyId])

  // No assessment rules defined — hide the component entirely
  if (!hasAssessment) return null

  if (error) {
    return (
      <div
        className="p-3 text-sm text-destructive bg-destructive/10 rounded-md"
        role="alert"
        data-testid="assessment-summary-error"
      >
        {error}
      </div>
    )
  }

  return (
    <Card data-testid="assessment-summary">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-base font-semibold">Assessment Summary</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {isLoading ? (
          <div data-testid="assessment-summary-skeleton" className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-14 rounded-md" />
              <Skeleton className="h-14 rounded-md" />
              <Skeleton className="h-14 rounded-md" />
            </div>
            <Skeleton className="h-4 w-40 mt-4" />
            <Skeleton className="h-6 rounded-full" />
            <Skeleton className="h-6 rounded-full" />
          </div>
        ) : summary ? (
          <>
            {/* Aggregate stats */}
            <div
              className="grid grid-cols-3 gap-3 text-center mb-5"
              data-testid="assessment-summary-stats"
            >
              <div className="bg-muted/50 rounded-md p-3">
                <p className="text-xs text-muted-foreground">Avg Score</p>
                <p className="text-lg font-bold text-foreground" data-testid="avg-score">
                  {summary.average_score !== null
                    ? String(Math.round(Number(summary.average_score) * 100) / 100)
                    : '—'}
                </p>
              </div>
              <div className="bg-muted/50 rounded-md p-3">
                <p className="text-xs text-muted-foreground">Min / Max</p>
                <p className="text-lg font-bold text-foreground" data-testid="min-max-score">
                  {summary.min_score !== null && summary.max_score !== null
                    ? `${summary.min_score} / ${summary.max_score}`
                    : '—'}
                </p>
              </div>
              <div className="bg-muted/50 rounded-md p-3">
                <p className="text-xs text-muted-foreground">Responses</p>
                <p className="text-lg font-bold text-foreground" data-testid="total-responses">
                  {summary.total_responses}
                </p>
              </div>
            </div>

            {/* Band distribution */}
            {summary.bands.length > 0 ? (
              <div data-testid="band-distribution">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                  Band Distribution
                </p>
                <div className="space-y-3">
                  {summary.bands.map((band) => (
                    <div key={band.name} data-testid={`band-row-${band.name}`}>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span className="font-medium text-foreground truncate mr-2">
                          {band.name}
                        </span>
                        <span className="shrink-0">
                          {band.count} ({band.percentage}%)
                        </span>
                      </div>
                      <ProgressBar percentage={band.percentage} label={band.name} />
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Score range: {String(band.min_score)} – {String(band.max_score)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {summary.total_responses === 0 && (
              <p
                className="text-xs text-muted-foreground italic mt-2"
                data-testid="no-completed-responses"
              >
                No completed responses yet.
              </p>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default AssessmentSummary
