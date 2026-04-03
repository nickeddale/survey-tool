import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import quotaService from '../services/quotaService'
import surveyService from '../services/surveyService'
import type { QuotaResponse, QuestionResponse } from '../types/survey'
import { ApiError } from '../types/api'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Skeleton } from '../components/ui/skeleton'
import { Card, CardContent } from '../components/ui/card'
import QuotaForm from '../components/quotas/QuotaForm'
import type { QuotaCreate } from '../types/survey'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PER_PAGE = 10

const ACTION_LABELS: Record<string, string> = {
  terminate: 'Terminate',
  hide_question: 'Hide Question',
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div aria-label="Loading quotas" aria-busy="true" data-testid="loading-skeleton">
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

interface ProgressBarProps {
  current: number
  limit: number
}

function ProgressBar({ current, limit }: ProgressBarProps) {
  const pct = limit > 0 ? Math.min(100, Math.round((current / limit) * 100)) : 0
  const color =
    pct >= 80 ? 'bg-red-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-green-500'

  return (
    <div className="w-full" data-testid="quota-progress-bar">
      <div className="flex justify-between text-xs text-muted-foreground mb-0.5">
        <span>{current}</span>
        <span>{limit}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
          aria-valuenow={current}
          aria-valuemin={0}
          aria-valuemax={limit}
          role="progressbar"
        />
      </div>
      <div className="text-xs text-muted-foreground mt-0.5 text-right">{pct}%</div>
    </div>
  )
}

interface ConfirmDeleteModalProps {
  quotaName: string
  isLoading?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDeleteModal({
  quotaName,
  isLoading,
  error,
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-quota-title"
      data-testid="delete-confirm-modal"
    >
      <Card className="max-w-md w-full mx-4 shadow-lg">
        <CardContent className="p-6">
          <h2 id="delete-quota-title" className="text-lg font-semibold text-foreground mb-2">
            Delete Quota
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Are you sure you want to delete &quot;{quotaName}&quot;? This action cannot be undone.
          </p>
          {error && (
            <div className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md" role="alert">
              {error}
            </div>
          )}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirm}
              disabled={isLoading}
              data-testid="confirm-delete-button"
            >
              {isLoading ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// QuotasPage
// ---------------------------------------------------------------------------

function QuotasPage() {
  const navigate = useNavigate()
  const { id: surveyId } = useParams<{ id: string }>()

  // List state
  const [quotas, setQuotas] = useState<QuotaResponse[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Questions (needed for condition builder)
  const [questions, setQuestions] = useState<QuestionResponse[]>([])

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingQuota, setEditingQuota] = useState<QuotaResponse | null>(null)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Delete confirmation state
  const [deletingQuota, setDeletingQuota] = useState<QuotaResponse | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Toggle loading state (per-quota)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // ---------------------------------------------------------------------------
  // Load quotas
  // ---------------------------------------------------------------------------

  const loadQuotas = useCallback(async () => {
    if (!surveyId) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await quotaService.listQuotas(surveyId, { page, per_page: PER_PAGE })
      setQuotas(data.items)
      setTotal(data.total)
      setTotalPages(data.total_pages ?? Math.max(1, Math.ceil(data.total / PER_PAGE)))
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to load quotas. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }, [surveyId, page])

  useEffect(() => {
    loadQuotas()
  }, [loadQuotas])

  // Load survey questions for the condition builder
  useEffect(() => {
    if (!surveyId) return
    let cancelled = false
    surveyService.getSurvey(surveyId).then((survey) => {
      if (!cancelled) {
        const allQuestions = survey.groups.flatMap((g) => g.questions)
        setQuestions(allQuestions)
      }
    }).catch(() => {
      // Non-critical — condition builder just won't have question options
    })
    return () => { cancelled = true }
  }, [surveyId])

  // ---------------------------------------------------------------------------
  // Create / Edit
  // ---------------------------------------------------------------------------

  function openCreate() {
    setEditingQuota(null)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(quota: QuotaResponse) {
    setEditingQuota(quota)
    setFormError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingQuota(null)
    setFormError(null)
  }

  const handleFormSubmit = useCallback(
    async (data: QuotaCreate) => {
      if (!surveyId) return
      setFormLoading(true)
      setFormError(null)
      try {
        if (editingQuota) {
          await quotaService.updateQuota(surveyId, editingQuota.id, data)
        } else {
          await quotaService.createQuota(surveyId, data)
        }
        closeForm()
        await loadQuotas()
      } catch (err) {
        if (err instanceof ApiError) {
          setFormError(err.message)
        } else {
          setFormError('Failed to save quota. Please try again.')
        }
      } finally {
        setFormLoading(false)
      }
    },
    [surveyId, editingQuota, loadQuotas],
  )

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  function openDelete(quota: QuotaResponse) {
    setDeletingQuota(quota)
    setDeleteError(null)
  }

  function closeDelete() {
    setDeletingQuota(null)
    setDeleteError(null)
  }

  const handleDelete = useCallback(async () => {
    if (!surveyId || !deletingQuota) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      await quotaService.deleteQuota(surveyId, deletingQuota.id)
      closeDelete()
      // Go to previous page if last item on page was deleted
      if (quotas.length === 1 && page > 1) {
        setPage((p) => p - 1)
      } else {
        await loadQuotas()
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setDeleteError(err.message)
      } else {
        setDeleteError('Failed to delete quota. Please try again.')
      }
    } finally {
      setDeleteLoading(false)
    }
  }, [surveyId, deletingQuota, quotas.length, page, loadQuotas])

  // ---------------------------------------------------------------------------
  // Toggle active
  // ---------------------------------------------------------------------------

  const handleToggleActive = useCallback(
    async (quota: QuotaResponse) => {
      if (!surveyId || togglingId) return
      setTogglingId(quota.id)
      try {
        const updated = await quotaService.updateQuota(surveyId, quota.id, {
          is_active: !quota.is_active,
        })
        setQuotas((prev) => prev.map((q) => (q.id === updated.id ? updated : q)))
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message)
        } else {
          setError('Failed to update quota status.')
        }
      } finally {
        setTogglingId(null)
      }
    },
    [surveyId, togglingId],
  )

  // ---------------------------------------------------------------------------
  // Pagination helpers
  // ---------------------------------------------------------------------------

  function pageNumbers(): number[] {
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
    <div className="max-w-4xl mx-auto" data-testid="quotas-page">
      {/* Form modal */}
      {showForm && (
        <QuotaForm
          surveyId={surveyId ?? ''}
          questions={questions}
          quota={editingQuota}
          onSubmit={handleFormSubmit}
          onCancel={closeForm}
          isLoading={formLoading}
          error={formError}
        />
      )}

      {/* Delete confirmation modal */}
      {deletingQuota && (
        <ConfirmDeleteModal
          quotaName={deletingQuota.name}
          isLoading={deleteLoading}
          error={deleteError}
          onConfirm={handleDelete}
          onCancel={closeDelete}
        />
      )}

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
        <h1 className="text-2xl font-bold text-foreground flex-1">Quota Management</h1>
        <Button onClick={openCreate} data-testid="create-quota-button">
          <Plus size={16} />
          Create Quota
        </Button>
      </div>

      {/* Global error */}
      {error && (
        <div className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md" role="alert">
          {error}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : quotas.length === 0 ? (
        <div
          className="text-center py-16 bg-card border border-border rounded-lg"
          data-testid="empty-state"
        >
          <p className="text-muted-foreground text-sm mb-4">
            No quotas have been configured for this survey.
          </p>
          <Button onClick={openCreate}>Create your first quota</Button>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm" role="table">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Progress</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Action</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {quotas.map((quota) => (
                  <tr
                    key={quota.id}
                    className="bg-card hover:bg-muted/30 transition-colors"
                    data-testid={`quota-row-${quota.id}`}
                  >
                    <td className="px-4 py-3 font-medium text-foreground">{quota.name}</td>
                    <td className="px-4 py-3 min-w-[140px]">
                      <ProgressBar current={quota.current_count} limit={quota.limit} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="capitalize">
                        {ACTION_LABELS[quota.action] ?? quota.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {quota.is_active ? (
                        <Badge
                          variant="secondary"
                          className="bg-green-100 text-green-800 hover:bg-green-100"
                          data-testid={`quota-active-badge-${quota.id}`}
                        >
                          Active
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-muted text-muted-foreground hover:bg-muted"
                          data-testid={`quota-inactive-badge-${quota.id}`}
                        >
                          Inactive
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {/* Toggle active */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleActive(quota)}
                          disabled={togglingId === quota.id}
                          aria-label={
                            quota.is_active
                              ? `Deactivate ${quota.name}`
                              : `Activate ${quota.name}`
                          }
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          data-testid={`quota-toggle-${quota.id}`}
                        >
                          {quota.is_active ? (
                            <ToggleRight size={15} />
                          ) : (
                            <ToggleLeft size={15} />
                          )}
                        </Button>

                        {/* Edit */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(quota)}
                          aria-label={`Edit ${quota.name}`}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          data-testid={`quota-edit-${quota.id}`}
                        >
                          <Pencil size={15} />
                        </Button>

                        {/* Delete */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDelete(quota)}
                          aria-label={`Delete ${quota.name}`}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          data-testid={`quota-delete-${quota.id}`}
                        >
                          <Trash2 size={15} />
                        </Button>
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
              Page {page} of {totalPages} &mdash; {total} quota{total !== 1 ? 's' : ''}
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
        </>
      )}
    </div>
  )
}

export default QuotasPage
