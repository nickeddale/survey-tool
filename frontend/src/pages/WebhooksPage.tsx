import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Play } from 'lucide-react'
import webhookService from '../services/webhookService'
import surveyService from '../services/surveyService'
import type {
  WebhookResponse,
  WebhookCreate,
  SurveyResponse,
  WebhookCreateResponse,
} from '../types/survey'
import { ApiError } from '../types/api'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Skeleton } from '../components/ui/skeleton'
import { Card, CardContent } from '../components/ui/card'
import WebhookForm from '../components/webhooks/WebhookForm'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PER_PAGE = 10

const EVENT_LABELS: Record<string, string> = {
  'response.created': 'Response Created',
  'response.updated': 'Response Updated',
  'response.completed': 'Response Completed',
  'survey.activated': 'Survey Activated',
  'survey.closed': 'Survey Closed',
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div aria-label="Loading webhooks" aria-busy="true" data-testid="loading-skeleton">
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

interface ConfirmDeleteModalProps {
  webhookUrl: string
  isLoading?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDeleteModal({
  webhookUrl,
  isLoading,
  error,
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  // Truncate URL for display
  const displayUrl = webhookUrl.length > 50 ? webhookUrl.slice(0, 50) + '…' : webhookUrl

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-webhook-title"
      data-testid="delete-confirm-modal"
    >
      <Card className="max-w-md w-full mx-4 shadow-lg">
        <CardContent className="p-6">
          <h2 id="delete-webhook-title" className="text-lg font-semibold text-foreground mb-2">
            Delete Webhook
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Are you sure you want to delete the webhook for &quot;{displayUrl}&quot;? This action
            cannot be undone.
          </p>
          {error && (
            <div
              className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md"
              role="alert"
            >
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
// WebhooksPage
// ---------------------------------------------------------------------------

function WebhooksPage() {
  const navigate = useNavigate()

  // List state
  const [webhooks, setWebhooks] = useState<WebhookResponse[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Surveys (for survey selector in form)
  const [surveys, setSurveys] = useState<SurveyResponse[]>([])

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingWebhook, setEditingWebhook] = useState<WebhookResponse | null>(null)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [createdSecret, setCreatedSecret] = useState<string | null>(null)

  // Delete confirmation state
  const [deletingWebhook, setDeletingWebhook] = useState<WebhookResponse | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Toggle loading state (per-webhook)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Test webhook state (per-webhook)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{
    id: string
    success: boolean
    message: string
  } | null>(null)

  // ---------------------------------------------------------------------------
  // Load webhooks
  // ---------------------------------------------------------------------------

  const loadWebhooks = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await webhookService.listWebhooks({ page, per_page: PER_PAGE })
      setWebhooks(data.items)
      setTotal(data.total)
      setTotalPages(data.total_pages ?? Math.max(1, Math.ceil(data.total / PER_PAGE)))
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to load webhooks. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }, [page])

  useEffect(() => {
    loadWebhooks()
  }, [loadWebhooks])

  // Load surveys for the survey selector
  useEffect(() => {
    let cancelled = false
    surveyService
      .fetchSurveys({ per_page: 100 })
      .then((data) => {
        if (!cancelled) {
          setSurveys(data.items)
        }
      })
      .catch(() => {
        // Non-critical — survey selector just won't have options
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Create / Edit
  // ---------------------------------------------------------------------------

  function openCreate() {
    setEditingWebhook(null)
    setFormError(null)
    setCreatedSecret(null)
    setShowForm(true)
  }

  function openEdit(webhook: WebhookResponse) {
    setEditingWebhook(webhook)
    setFormError(null)
    setCreatedSecret(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingWebhook(null)
    setFormError(null)
    setCreatedSecret(null)
  }

  const handleFormSubmit = useCallback(
    async (data: WebhookCreate) => {
      setFormLoading(true)
      setFormError(null)
      try {
        if (editingWebhook) {
          await webhookService.updateWebhook(editingWebhook.id, data)
          closeForm()
          await loadWebhooks()
        } else {
          const created = (await webhookService.createWebhook(data)) as WebhookCreateResponse
          // Stay on the form to show the secret, but reload the list
          setCreatedSecret(created.secret)
          await loadWebhooks()
        }
      } catch (err) {
        if (err instanceof ApiError) {
          setFormError(err.message)
        } else {
          setFormError('Failed to save webhook. Please try again.')
        }
      } finally {
        setFormLoading(false)
      }
    },
    [editingWebhook, loadWebhooks]
  )

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  function openDelete(webhook: WebhookResponse) {
    setDeletingWebhook(webhook)
    setDeleteError(null)
  }

  function closeDelete() {
    setDeletingWebhook(null)
    setDeleteError(null)
  }

  const handleDelete = useCallback(async () => {
    if (!deletingWebhook) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      await webhookService.deleteWebhook(deletingWebhook.id)
      closeDelete()
      // Go to previous page if last item on page was deleted
      if (webhooks.length === 1 && page > 1) {
        setPage((p) => p - 1)
      } else {
        await loadWebhooks()
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setDeleteError(err.message)
      } else {
        setDeleteError('Failed to delete webhook. Please try again.')
      }
    } finally {
      setDeleteLoading(false)
    }
  }, [deletingWebhook, webhooks.length, page, loadWebhooks])

  // ---------------------------------------------------------------------------
  // Toggle active
  // ---------------------------------------------------------------------------

  const handleToggleActive = useCallback(
    async (webhook: WebhookResponse) => {
      if (togglingId) return
      setTogglingId(webhook.id)
      try {
        const updated = await webhookService.updateWebhook(webhook.id, {
          is_active: !webhook.is_active,
        })
        setWebhooks((prev) => prev.map((w) => (w.id === updated.id ? updated : w)))
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message)
        } else {
          setError('Failed to update webhook status.')
        }
      } finally {
        setTogglingId(null)
      }
    },
    [togglingId]
  )

  // ---------------------------------------------------------------------------
  // Test webhook
  // ---------------------------------------------------------------------------

  const handleTest = useCallback(
    async (webhook: WebhookResponse) => {
      if (testingId) return
      setTestingId(webhook.id)
      setTestResult(null)
      try {
        const result = await webhookService.testWebhook(webhook.id)
        setTestResult({
          id: webhook.id,
          success: result.success,
          message: result.success
            ? `Test succeeded (HTTP ${result.status_code})`
            : (result.error ?? 'Test failed'),
        })
      } catch (err) {
        setTestResult({
          id: webhook.id,
          success: false,
          message: err instanceof ApiError ? err.message : 'Test request failed.',
        })
      } finally {
        setTestingId(null)
      }
    },
    [testingId]
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
  // Helpers
  // ---------------------------------------------------------------------------

  function truncateUrl(url: string, maxLength = 40): string {
    return url.length > maxLength ? url.slice(0, maxLength) + '…' : url
  }

  function getSurveyTitle(surveyId: string | null): string {
    if (!surveyId) return 'All surveys'
    const survey = surveys.find((s) => s.id === surveyId)
    return survey ? survey.title : surveyId
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-5xl mx-auto" data-testid="webhooks-page">
      {/* Form modal */}
      {showForm && (
        <WebhookForm
          webhook={editingWebhook}
          surveys={surveys}
          onSubmit={handleFormSubmit}
          onCancel={closeForm}
          isLoading={formLoading}
          error={formError}
          createdSecret={createdSecret}
        />
      )}

      {/* Delete confirmation modal */}
      {deletingWebhook && (
        <ConfirmDeleteModal
          webhookUrl={deletingWebhook.url}
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
          onClick={() => navigate('/dashboard')}
          aria-label="Back to dashboard"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={18} />
        </Button>
        <h1 className="text-2xl font-bold text-foreground flex-1">Webhook Management</h1>
        <Button onClick={openCreate} data-testid="create-webhook-button">
          <Plus size={16} />
          Create Webhook
        </Button>
      </div>

      {/* Global error */}
      {error && (
        <div
          className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Test result banner */}
      {testResult && (
        <div
          className={`mb-4 p-3 text-sm rounded-md ${
            testResult.success
              ? 'text-green-800 bg-green-50 border border-green-200'
              : 'text-destructive bg-destructive/10'
          }`}
          role="status"
          data-testid="test-result-banner"
        >
          {testResult.message}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : webhooks.length === 0 ? (
        <div
          className="text-center py-16 bg-card border border-border rounded-lg"
          data-testid="empty-state"
        >
          <p className="text-muted-foreground text-sm mb-4">
            No webhooks have been configured yet.
          </p>
          <Button onClick={openCreate}>Create your first webhook</Button>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm" role="table">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">URL</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Events</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Survey</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {webhooks.map((webhook) => (
                  <tr
                    key={webhook.id}
                    className="bg-card hover:bg-muted/30 transition-colors"
                    data-testid={`webhook-row-${webhook.id}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-foreground" title={webhook.url}>
                      {truncateUrl(webhook.url)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {webhook.events.map((event) => (
                          <Badge
                            key={event}
                            variant="secondary"
                            className="text-xs"
                            data-testid={`webhook-event-badge-${webhook.id}-${event}`}
                          >
                            {EVENT_LABELS[event] ?? event}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {getSurveyTitle(webhook.survey_id)}
                    </td>
                    <td className="px-4 py-3">
                      {webhook.is_active ? (
                        <Badge
                          variant="secondary"
                          className="bg-green-100 text-green-800 hover:bg-green-100"
                          data-testid={`webhook-active-badge-${webhook.id}`}
                        >
                          Active
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-muted text-muted-foreground hover:bg-muted"
                          data-testid={`webhook-inactive-badge-${webhook.id}`}
                        >
                          Inactive
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {/* Test webhook */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleTest(webhook)}
                          disabled={testingId === webhook.id}
                          aria-label={`Test webhook ${webhook.url}`}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          data-testid={`webhook-test-${webhook.id}`}
                        >
                          <Play size={15} />
                        </Button>

                        {/* Toggle active */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleActive(webhook)}
                          disabled={togglingId === webhook.id}
                          aria-label={
                            webhook.is_active
                              ? `Deactivate webhook ${webhook.url}`
                              : `Activate webhook ${webhook.url}`
                          }
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          data-testid={`webhook-toggle-${webhook.id}`}
                        >
                          {webhook.is_active ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                        </Button>

                        {/* Edit */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(webhook)}
                          aria-label={`Edit webhook ${webhook.url}`}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          data-testid={`webhook-edit-${webhook.id}`}
                        >
                          <Pencil size={15} />
                        </Button>

                        {/* Delete */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDelete(webhook)}
                          aria-label={`Delete webhook ${webhook.url}`}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          data-testid={`webhook-delete-${webhook.id}`}
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
              Page {page} of {totalPages} &mdash; {total} webhook{total !== 1 ? 's' : ''}
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

export default WebhooksPage
