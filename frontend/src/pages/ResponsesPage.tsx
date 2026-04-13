import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { ArrowLeft, Download, BarChart2, List } from 'lucide-react'
import responseService from '../services/responseService'
import surveyService from '../services/surveyService'
import type { ResponseSummary, QuestionResponse } from '../types/survey'
import { ApiError } from '../types/api'
import { Button } from '../components/ui/button'
import ResponseTable from '../components/responses/ResponseTable'
import ExportDialog from '../components/responses/ExportDialog'
import StatisticsDashboard from '../components/responses/StatisticsDashboard'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PER_PAGE = 20

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'incomplete', label: 'Incomplete' },
  { value: 'complete', label: 'Complete' },
  { value: 'disqualified', label: 'Disqualified' },
]

type ActiveView = 'responses' | 'statistics'

// ---------------------------------------------------------------------------
// ResponsesPage
// ---------------------------------------------------------------------------

function ResponsesPage() {
  const navigate = useNavigate()
  const { id: surveyId } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const [activeView, setActiveView] = useState<ActiveView>(() =>
    searchParams.get('view') === 'statistics' ? 'statistics' : 'responses'
  )
  const [page, setPage] = useState<number>(() => {
    const p = parseInt(searchParams.get('page') ?? '1', 10)
    return isNaN(p) || p < 1 ? 1 : p
  })
  const [statusFilter, setStatusFilter] = useState<string>(
    () => searchParams.get('status') ?? 'all'
  )

  const [responses, setResponses] = useState<ResponseSummary[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [questions, setQuestions] = useState<QuestionResponse[]>([])
  const [exportDialogOpen, setExportDialogOpen] = useState(false)

  // Load survey questions for export column selection
  useEffect(() => {
    if (!surveyId) return
    surveyService
      .getSurvey(surveyId)
      .then((survey) => {
        setQuestions(survey.questions ?? [])
      })
      .catch(() => {
        // Non-critical — export dialog will show no columns
      })
  }, [surveyId])

  // Sync state to URL params
  useEffect(() => {
    const params: Record<string, string> = {}
    if (page > 1) params.page = String(page)
    if (statusFilter && statusFilter !== 'all') params.status = statusFilter
    if (activeView === 'statistics') params.view = 'statistics'
    setSearchParams(params, { replace: true })
  }, [page, statusFilter, activeView, setSearchParams])

  // Fetch responses (only when responses tab is active)
  useEffect(() => {
    if (!surveyId || activeView !== 'responses') return
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError(null)
      try {
        const params: Record<string, unknown> = {
          page,
          per_page: PER_PAGE,
        }
        if (statusFilter && statusFilter !== 'all') params.status = statusFilter

        const data = await responseService.listResponses(
          surveyId!,
          params as Parameters<typeof responseService.listResponses>[1]
        )
        if (!cancelled) {
          setResponses(data.items)
          setTotal(data.total)
          setTotalPages(Math.max(1, data.pages))
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError) {
            setError(err.message)
          } else {
            setError('Failed to load responses. Please try again.')
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
  }, [surveyId, page, statusFilter, activeView])

  const handleStatusChange = useCallback((value: string) => {
    setStatusFilter(value)
    setPage(1)
  }, [])

  const handleView = useCallback(
    (response: ResponseSummary) => {
      navigate(`/surveys/${surveyId}/responses/${response.id}`)
    },
    [surveyId, navigate]
  )

  // ---------------------------------------------------------------------------
  // Pagination helpers
  // ---------------------------------------------------------------------------

  const pageNumbers = () => {
    const pages: number[] = []
    const delta = 2
    const left = Math.max(1, page - delta)
    const right = Math.min(totalPages, page + delta)
    for (let i = left; i <= right; i++) pages.push(i)
    return pages
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div data-testid="responses-page">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/surveys/${surveyId}`)}
          aria-label="Back to survey"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-foreground">Responses</h1>
          <p className="text-sm text-muted-foreground">
            <Link
              to={`/surveys/${surveyId}`}
              className="hover:text-primary hover:underline transition-colors"
            >
              ← Back to survey
            </Link>
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExportDialogOpen(true)}
          data-testid="open-export-dialog"
        >
          <Download size={15} className="mr-2" />
          Export
        </Button>
      </div>

      {/* View toggle */}
      <div className="flex gap-1 mb-5 border-b border-border">
        <button
          onClick={() => setActiveView('responses')}
          data-testid="tab-responses"
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeView === 'responses'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <List size={14} />
          Responses
        </button>
        <button
          onClick={() => setActiveView('statistics')}
          data-testid="tab-statistics"
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeView === 'statistics'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <BarChart2 size={14} />
          Statistics
        </button>
      </div>

      {/* Statistics view */}
      {activeView === 'statistics' && surveyId && <StatisticsDashboard surveyId={surveyId} />}

      {/* Responses view */}
      {activeView === 'responses' && (
        <>
          {/* Error alert */}
          {error && (
            <div
              className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* Filter bar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <select
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              aria-label="Filter by status"
              className="px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              data-testid="status-filter"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <div className="flex-1" />
            <p className="text-sm text-muted-foreground self-center" data-testid="total-count">
              {total} response{total !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Table */}
          <ResponseTable responses={responses} isLoading={isLoading} onView={handleView} />

          {/* Pagination */}
          {!isLoading && totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
              <p className="text-sm text-muted-foreground" data-testid="pagination-info">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-1" aria-label="Pagination">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  aria-label="Previous page"
                >
                  Prev
                </Button>
                {pageNumbers().map((n) => (
                  <Button
                    key={n}
                    variant={n === page ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPage(n)}
                    aria-label={`Page ${n}`}
                    aria-current={n === page ? 'page' : undefined}
                  >
                    {n}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  aria-label="Next page"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Export dialog */}
      {surveyId && (
        <ExportDialog
          open={exportDialogOpen}
          onOpenChange={setExportDialogOpen}
          surveyId={surveyId}
          questions={questions}
        />
      )}
    </div>
  )
}

export default ResponsesPage
