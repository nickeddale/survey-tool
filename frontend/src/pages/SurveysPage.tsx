import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Plus, Eye, Pencil, Trash2 } from 'lucide-react'
import surveyService from '../services/surveyService'
import type { SurveyResponse } from '../types/survey'
import { ApiError } from '../types/api'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PER_PAGE = 10

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
  { value: 'archived', label: 'Archived' },
]

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-green-100 text-green-800',
  closed: 'bg-yellow-100 text-yellow-800',
  archived: 'bg-red-100 text-red-800',
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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

function LoadingSkeleton() {
  return (
    <div aria-label="Loading" aria-busy="true" data-testid="loading-skeleton">
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SurveysPage
// ---------------------------------------------------------------------------

function SurveysPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Initialize state directly from URL params to avoid two-render sync loop
  const [page, setPage] = useState<number>(() => {
    const p = parseInt(searchParams.get('page') ?? '1', 10)
    return isNaN(p) || p < 1 ? 1 : p
  })
  const [statusFilter, setStatusFilter] = useState<string>(
    () => searchParams.get('status') ?? 'all',
  )
  const [searchInput, setSearchInput] = useState<string>(
    () => searchParams.get('search') ?? '',
  )
  // The debounced search value that actually triggers the fetch
  const [debouncedSearch, setDebouncedSearch] = useState<string>(
    () => searchParams.get('search') ?? '',
  )

  const [surveys, setSurveys] = useState<SurveyResponse[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchInput)
      setPage(1)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchInput])

  // Sync state to URL params whenever relevant state changes
  useEffect(() => {
    const params: Record<string, string> = {}
    if (page > 1) params.page = String(page)
    if (statusFilter && statusFilter !== 'all') params.status = statusFilter
    if (debouncedSearch) params.search = debouncedSearch
    setSearchParams(params, { replace: true })
  }, [page, statusFilter, debouncedSearch, setSearchParams])

  // Fetch surveys when page, statusFilter, or debouncedSearch changes
  useEffect(() => {
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
        if (debouncedSearch) params.search = debouncedSearch

        const data = await surveyService.fetchSurveys(params)
        if (!cancelled) {
          setSurveys(data.items)
          setTotal(data.total)
          const tp = data.total_pages ?? Math.max(1, Math.ceil(data.total / PER_PAGE))
          setTotalPages(tp)
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError) {
            setError(err.message)
          } else {
            setError('Failed to load surveys. Please try again.')
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
  }, [page, statusFilter, debouncedSearch])

  const handleStatusChange = useCallback((value: string) => {
    setStatusFilter(value)
    setPage(1)
  }, [])

  const handleDelete = useCallback(
    async (survey: SurveyResponse) => {
      if (!window.confirm(`Delete "${survey.title}"? This cannot be undone.`)) return
      try {
        await surveyService.deleteSurvey(survey.id)
        // Refetch current page
        const data = await surveyService.fetchSurveys({
          page,
          per_page: PER_PAGE,
          ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
        })
        setSurveys(data.items)
        setTotal(data.total)
        const tp = data.total_pages ?? Math.max(1, Math.ceil(data.total / PER_PAGE))
        setTotalPages(tp)
        if (data.items.length === 0 && page > 1) {
          setPage((p) => p - 1)
        }
      } catch {
        setError('Failed to delete survey. Please try again.')
      }
    },
    [page, statusFilter, debouncedSearch],
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
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-foreground">Surveys</h1>
        <button
          onClick={() => navigate('/surveys/new')}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus size={16} />
          Create New Survey
        </button>
      </div>

      {/* Error alert */}
      {error && (
        <div className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md" role="alert">
          {error}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input
          type="text"
          placeholder="Search surveys..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search surveys"
          className="flex-1 px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <select
          value={statusFilter}
          onChange={(e) => handleStatusChange(e.target.value)}
          aria-label="Filter by status"
          className="px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : surveys.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-lg" data-testid="empty-state">
          <p className="text-muted-foreground text-sm mb-4">
            {debouncedSearch || statusFilter !== 'all'
              ? 'No surveys match your filters.'
              : "You haven't created any surveys yet."}
          </p>
          {!debouncedSearch && statusFilter === 'all' && (
            <button
              onClick={() => navigate('/surveys/new')}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Create your first survey
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm" role="table">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Title</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Questions</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {surveys.map((survey) => (
                  <tr key={survey.id} className="bg-card hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">
                      <Link
                        to={`/surveys/${survey.id}`}
                        className="hover:text-primary hover:underline transition-colors"
                      >
                        {survey.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={survey.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">0</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(survey.created_at).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => navigate(`/surveys/${survey.id}`)}
                          aria-label={`View ${survey.title}`}
                          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        >
                          <Eye size={15} />
                        </button>
                        {survey.status === 'draft' && (
                          <button
                            onClick={() => navigate(`/surveys/${survey.id}/edit`)}
                            aria-label={`Edit ${survey.title}`}
                            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          >
                            <Pencil size={15} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(survey)}
                          aria-label={`Delete ${survey.title}`}
                          className="p-1.5 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
            <p className="text-sm text-muted-foreground" data-testid="pagination-info">
              Page {page} of {totalPages} &mdash; {total} survey{total !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-1" aria-label="Pagination">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label="Previous page"
                className="px-3 py-1.5 text-sm border border-border rounded-md bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Prev
              </button>
              {pageNumbers().map((n) => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  aria-label={`Page ${n}`}
                  aria-current={n === page ? 'page' : undefined}
                  className={`px-3 py-1.5 text-sm border rounded-md transition-colors ${
                    n === page
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border bg-background hover:bg-muted'
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                aria-label="Next page"
                className="px-3 py-1.5 text-sm border border-border rounded-md bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default SurveysPage
