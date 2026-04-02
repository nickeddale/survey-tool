import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import surveyService, { DashboardStats } from '../services/surveyService'
import type { SurveyResponse } from '../types/survey'
import { ApiError } from '../types/api'

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-green-100 text-green-800',
  closed: 'bg-yellow-100 text-yellow-800',
  archived: 'bg-red-100 text-red-800',
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground'
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${cls}`}
      data-testid={`status-badge-${status}`}
    >
      {status}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div aria-label="Loading" aria-busy="true">
      {/* Stat cards skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>

      {/* Recent surveys skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-1">
      <span className="text-2xl font-bold text-foreground">{value}</span>
      <span className="text-sm text-muted-foreground capitalize">{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Survey card
// ---------------------------------------------------------------------------

function SurveyCard({ survey }: { survey: SurveyResponse }) {
  const updatedDate = new Date(survey.updated_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="bg-card border border-border rounded-lg px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <StatusBadge status={survey.status} />
        <span className="text-sm font-medium text-foreground truncate">{survey.title}</span>
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{updatedDate}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DashboardPage
// ---------------------------------------------------------------------------

function DashboardPage() {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentSurveys, setRecentSurveys] = useState<SurveyResponse[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError(null)
      try {
        const data = await surveyService.getDashboardStats()
        if (!cancelled) {
          setStats(data.stats)
          setRecentSurveys(data.recentSurveys)
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError) {
            setError(err.message)
          } else {
            setError('Failed to load dashboard data. Please try again.')
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <button
          onClick={() => navigate('/surveys/new')}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus size={16} />
          Create New Survey
        </button>
      </div>

      {error && (
        <div className="mb-6 p-3 text-sm text-destructive bg-destructive/10 rounded-md" role="alert">
          {error}
        </div>
      )}

      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <>
          {/* Summary stat cards */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
              <StatCard label="Total" value={stats.total} />
              <StatCard label="Draft" value={stats.draft} />
              <StatCard label="Active" value={stats.active} />
              <StatCard label="Closed" value={stats.closed} />
              <StatCard label="Archived" value={stats.archived} />
            </div>
          )}

          {/* Recent surveys */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3">Recent Surveys</h2>
            {recentSurveys.length === 0 ? (
              <div className="text-center py-12 bg-card border border-border rounded-lg">
                <p className="text-muted-foreground text-sm mb-4">
                  You haven&apos;t created any surveys yet.
                </p>
                <button
                  onClick={() => navigate('/surveys/new')}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Create your first survey
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {recentSurveys.map((survey) => (
                  <SurveyCard key={survey.id} survey={survey} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default DashboardPage
