import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import type {
  SurveyStatisticsResponse,
  QuestionStatistics,
  ChoiceQuestionStats,
  NumericQuestionStats,
  RatingQuestionStats,
  TextQuestionStats,
} from '../../types/survey'
import responseService from '../../services/responseService'
import { ApiError } from '../../types/api'
import AssessmentSummary from './AssessmentSummary'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—'
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m < 60) return rem > 0 ? `${m}m ${rem}s` : `${m}m`
  const h = Math.floor(m / 60)
  const remM = m % 60
  return remM > 0 ? `${h}h ${remM}m` : `${h}h`
}

function formatPercent(value: number): string {
  return `${Math.round(value * 10) / 10}%`
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isChoiceStats(stats: QuestionStatistics['stats']): stats is ChoiceQuestionStats {
  return 'options' in stats && Array.isArray((stats as ChoiceQuestionStats).options)
}

function isNumericStats(stats: QuestionStatistics['stats']): stats is NumericQuestionStats {
  return 'mean' in stats && !('average' in stats)
}

function isRatingStats(stats: QuestionStatistics['stats']): stats is RatingQuestionStats {
  return 'average' in stats && 'distribution' in stats
}

function isTextStats(stats: QuestionStatistics['stats']): stats is TextQuestionStats {
  return !isChoiceStats(stats) && !isNumericStats(stats) && !isRatingStats(stats)
}

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------

interface MetricCardProps {
  label: string
  value: string | number
  subtitle?: string
  testId?: string
}

function MetricCard({ label, value, subtitle, testId }: MetricCardProps) {
  return (
    <Card data-testid={testId}>
      <CardContent className="p-5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
          {label}
        </p>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Metric card loading skeleton
// ---------------------------------------------------------------------------

function MetricCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-5">
        <Skeleton className="h-3 w-24 mb-2" />
        <Skeleton className="h-7 w-16 mb-1" />
        <Skeleton className="h-3 w-20" />
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Progress bar for choice options
// ---------------------------------------------------------------------------

interface ProgressBarProps {
  percentage: number
  label: string
}

function ProgressBar({ percentage, label }: ProgressBarProps) {
  const width = Math.min(100, Math.max(0, percentage))
  return (
    <div
      className="h-4 bg-primary/20 rounded-full overflow-hidden"
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
// Per-question stat renderers
// ---------------------------------------------------------------------------

function ChoiceQuestionSummary({ stats }: { stats: ChoiceQuestionStats }) {
  const sorted = [...stats.options].sort((a, b) => b.count - a.count)
  return (
    <div className="space-y-2" data-testid="choice-stats">
      {sorted.map((opt) => (
        <div key={opt.option_code}>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span className="truncate mr-2">{opt.option_title ?? opt.option_code}</span>
            <span className="shrink-0">
              {opt.count} ({formatPercent(opt.percentage)})
            </span>
          </div>
          <ProgressBar percentage={opt.percentage} label={opt.option_title ?? opt.option_code} />
        </div>
      ))}
      {stats.options.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No responses yet.</p>
      )}
    </div>
  )
}

function NumericQuestionSummary({ stats }: { stats: NumericQuestionStats }) {
  return (
    <div className="grid grid-cols-3 gap-3 text-center" data-testid="numeric-stats">
      {[
        {
          label: 'Mean',
          value: stats.mean !== null ? String(Math.round(stats.mean * 100) / 100) : '—',
        },
        { label: 'Min', value: stats.min !== null ? String(stats.min) : '—' },
        { label: 'Max', value: stats.max !== null ? String(stats.max) : '—' },
      ].map(({ label, value }) => (
        <div key={label} className="bg-muted/50 rounded-md p-2">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm font-semibold text-foreground">{value}</p>
        </div>
      ))}
    </div>
  )
}

function RatingQuestionSummary({ stats }: { stats: RatingQuestionStats }) {
  const maxCount = Math.max(...stats.distribution.map((d) => d.count), 1)
  return (
    <div data-testid="rating-stats">
      {stats.average !== null && (
        <p className="text-sm text-muted-foreground mb-2">
          Average:{' '}
          <span className="font-semibold text-foreground">
            {Math.round(stats.average * 10) / 10}
          </span>
        </p>
      )}
      <div className="space-y-1.5">
        {stats.distribution.map((entry) => {
          const pct = (entry.count / maxCount) * 100
          return (
            <div key={entry.value} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-6 text-right">{entry.value}</span>
              <div className="flex-1">
                <ProgressBar percentage={pct} label={`Rating ${entry.value}`} />
              </div>
              <span className="text-xs text-muted-foreground w-8 text-right">{entry.count}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TextQuestionSummary({ stats }: { stats: TextQuestionStats }) {
  return (
    <p className="text-xs text-muted-foreground italic" data-testid="text-stats">
      {stats.response_count} text response{stats.response_count !== 1 ? 's' : ''} recorded.
    </p>
  )
}

// ---------------------------------------------------------------------------
// Single question statistics card
// ---------------------------------------------------------------------------

function QuestionStatCard({ question }: { question: QuestionStatistics }) {
  return (
    <Card data-testid={`question-stat-${question.question_code}`}>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start gap-2">
          <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded mt-0.5 shrink-0">
            {question.question_code}
          </span>
          <div className="min-w-0">
            <CardTitle className="text-sm font-medium leading-snug">
              {question.question_title}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {question.stats.response_count} response
              {question.stats.response_count !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {isChoiceStats(question.stats) && <ChoiceQuestionSummary stats={question.stats} />}
        {isNumericStats(question.stats) && <NumericQuestionSummary stats={question.stats} />}
        {isRatingStats(question.stats) && <RatingQuestionSummary stats={question.stats} />}
        {isTextStats(question.stats) && <TextQuestionSummary stats={question.stats} />}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Question stat loading skeleton
// ---------------------------------------------------------------------------

function QuestionStatSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start gap-2">
          <Skeleton className="h-5 w-10 rounded" />
          <div className="flex-1">
            <Skeleton className="h-4 w-48 mb-1" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        <Skeleton className="h-4 rounded-full" />
        <Skeleton className="h-4 rounded-full w-3/4" />
        <Skeleton className="h-4 rounded-full w-1/2" />
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// StatisticsDashboard
// ---------------------------------------------------------------------------

interface StatisticsDashboardProps {
  surveyId: string
}

function StatisticsDashboard({ surveyId }: StatisticsDashboardProps) {
  const [stats, setStats] = useState<SurveyStatisticsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!surveyId) return
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError(null)
      try {
        const data = await responseService.getSurveyStatistics(surveyId)
        if (!cancelled) setStats(data)
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError) {
            setError(err.message)
          } else {
            setError('Failed to load statistics. Please try again.')
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

  if (error) {
    return (
      <div
        className="p-3 text-sm text-destructive bg-destructive/10 rounded-md"
        role="alert"
        data-testid="statistics-error"
      >
        {error}
      </div>
    )
  }

  return (
    <div data-testid="statistics-dashboard">
      {/* Summary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {isLoading ? (
          <>
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </>
        ) : stats ? (
          <>
            <MetricCard
              label="Total Responses"
              value={stats.total_responses}
              testId="metric-total-responses"
            />
            <MetricCard
              label="Completion Rate"
              value={formatPercent(stats.completion_rate * 100)}
              subtitle={`${stats.complete_responses} of ${stats.total_responses} complete`}
              testId="metric-completion-rate"
            />
            <MetricCard
              label="Avg. Completion Time"
              value={formatDuration(stats.average_completion_time_seconds)}
              testId="metric-avg-completion-time"
            />
            <MetricCard
              label="Incomplete"
              value={stats.incomplete_responses}
              subtitle={`${stats.disqualified_responses} disqualified`}
              testId="metric-incomplete"
            />
          </>
        ) : null}
      </div>

      {/* Per-question summaries */}
      {isLoading ? (
        <div className="space-y-4" data-testid="questions-loading">
          {Array.from({ length: 3 }).map((_, i) => (
            <QuestionStatSkeleton key={i} />
          ))}
        </div>
      ) : stats && stats.questions.length > 0 ? (
        <div className="space-y-4" data-testid="questions-list">
          {stats.questions.map((q) => (
            <QuestionStatCard key={q.question_id} question={q} />
          ))}
        </div>
      ) : stats && stats.questions.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm" data-testid="no-questions">
          No question statistics available yet.
        </div>
      ) : null}

      {/* Assessment aggregate summary (hidden when no assessment rules defined) */}
      <div className="mt-6">
        <AssessmentSummary surveyId={surveyId} />
      </div>
    </div>
  )
}

export default StatisticsDashboard
