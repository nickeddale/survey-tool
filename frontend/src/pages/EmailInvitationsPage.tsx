import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Upload, Search, Bell } from 'lucide-react'
import emailInvitationService from '../services/emailInvitationService'
import type {
  EmailInvitationResponse,
  EmailInvitationStats,
  EmailInvitationBatchResponse,
  EmailInvitationCreate,
  SendRemindersRequest,
  SendRemindersResponse,
} from '../types/survey'
import { ApiError } from '../types/api'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import EmailStatsCards from '../components/email-invitations/EmailStatsCards'
import EmailInvitationTable, {
  EmailInvitationTableSkeleton,
} from '../components/email-invitations/EmailInvitationTable'
import EmailInvitationForm from '../components/email-invitations/EmailInvitationForm'
import EmailBatchDialog from '../components/email-invitations/EmailBatchDialog'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PER_PAGE = 20

// ---------------------------------------------------------------------------
// Delete confirmation modal
// ---------------------------------------------------------------------------

interface ConfirmDeleteModalProps {
  invitationLabel: string
  isLoading?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDeleteModal({
  invitationLabel,
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
      aria-labelledby="delete-invitation-title"
      data-testid="delete-confirm-modal"
    >
      <Card className="max-w-md w-full mx-4 shadow-lg">
        <CardContent className="p-6">
          <h2 id="delete-invitation-title" className="text-lg font-semibold text-foreground mb-2">
            Delete Invitation
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Are you sure you want to delete the invitation for &quot;{invitationLabel}&quot;? This
            action cannot be undone.
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
// Batch results modal
// ---------------------------------------------------------------------------

interface BatchResultsModalProps {
  result: EmailInvitationBatchResponse
  onClose: () => void
}

function BatchResultsModal({ result, onClose }: BatchResultsModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-results-title"
      data-testid="batch-results-modal"
    >
      <Card className="max-w-md w-full mx-4 shadow-lg">
        <CardContent className="p-6">
          <h2 id="batch-results-title" className="text-lg font-semibold text-foreground mb-2">
            Batch Send Complete
          </h2>
          <div className="text-sm text-muted-foreground mb-4 space-y-1">
            <p>
              <strong className="text-foreground">{result.sent}</strong> invitation
              {result.sent !== 1 ? 's' : ''} sent successfully.
            </p>
            {result.skipped > 0 && (
              <p>
                <strong>{result.skipped}</strong> skipped (already sent).
              </p>
            )}
            {result.failed > 0 && (
              <p className="text-destructive">
                <strong>{result.failed}</strong> failed.
              </p>
            )}
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose} data-testid="batch-results-close">
              Done
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Send Reminders dialog
// ---------------------------------------------------------------------------

interface SendRemindersDialogProps {
  isLoading?: boolean
  error?: string | null
  onConfirm: (params: SendRemindersRequest) => void
  onCancel: () => void
}

function SendRemindersDialog({ isLoading, error, onConfirm, onCancel }: SendRemindersDialogProps) {
  const [daysSinceInvite, setDaysSinceInvite] = useState<string>('')
  const [maxReminders, setMaxReminders] = useState<string>('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const params: SendRemindersRequest = {}
    const days = parseInt(daysSinceInvite, 10)
    const max = parseInt(maxReminders, 10)
    if (!isNaN(days) && days >= 1) params.days_since_invite = days
    if (!isNaN(max) && max >= 1) params.max_reminders = max
    onConfirm(params)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-reminders-title"
      data-testid="send-reminders-dialog"
    >
      <Card className="max-w-md w-full mx-4 shadow-lg">
        <CardContent className="p-6">
          <h2 id="send-reminders-title" className="text-lg font-semibold text-foreground mb-2">
            Send Reminder Emails
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Send reminder emails to participants who have not yet completed the survey. Only
            participants with an existing invitation will be reminded.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="days-since-invite"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Minimum days since original invite
              </label>
              <input
                id="days-since-invite"
                type="number"
                min={1}
                value={daysSinceInvite}
                onChange={(e) => setDaysSinceInvite(e.target.value)}
                placeholder="e.g. 3 (leave blank for any)"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="days-since-invite-input"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Only remind participants whose invite was sent at least this many days ago.
              </p>
            </div>
            <div>
              <label
                htmlFor="max-reminders"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Maximum reminders per participant
              </label>
              <input
                id="max-reminders"
                type="number"
                min={1}
                value={maxReminders}
                onChange={(e) => setMaxReminders(e.target.value)}
                placeholder="e.g. 2 (leave blank for unlimited)"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="max-reminders-input"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Skip participants who have already received this many reminders.
              </p>
            </div>
            {error && (
              <div
                className="p-3 text-sm text-destructive bg-destructive/10 rounded-md"
                role="alert"
              >
                {error}
              </div>
            )}
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" type="button" onClick={onCancel} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} data-testid="send-reminders-confirm">
                {isLoading ? 'Sending...' : 'Send Reminders'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reminder results modal
// ---------------------------------------------------------------------------

interface ReminderResultsModalProps {
  result: SendRemindersResponse
  onClose: () => void
}

function ReminderResultsModal({ result, onClose }: ReminderResultsModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reminder-results-title"
      data-testid="reminder-results-modal"
    >
      <Card className="max-w-md w-full mx-4 shadow-lg">
        <CardContent className="p-6">
          <h2 id="reminder-results-title" className="text-lg font-semibold text-foreground mb-2">
            Reminders Sent
          </h2>
          <div className="text-sm text-muted-foreground mb-4 space-y-1">
            <p>
              <strong className="text-foreground">{result.sent}</strong> reminder
              {result.sent !== 1 ? 's' : ''} sent successfully.
            </p>
            {result.skipped > 0 && (
              <p>
                <strong>{result.skipped}</strong> skipped (already completed or limit reached).
              </p>
            )}
            {result.failed > 0 && (
              <p className="text-destructive">
                <strong>{result.failed}</strong> failed.
              </p>
            )}
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose} data-testid="reminder-results-close">
              Done
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// EmailInvitationsPage
// ---------------------------------------------------------------------------

function EmailInvitationsPage() {
  const navigate = useNavigate()
  const { id: surveyId } = useParams<{ id: string }>()

  // List state
  const [invitations, setInvitations] = useState<EmailInvitationResponse[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Stats state
  const [stats, setStats] = useState<EmailInvitationStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  // Filter state
  const [emailSearch, setEmailSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Delete state
  const [deletingInvitation, setDeletingInvitation] = useState<EmailInvitationResponse | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Resend state
  const [resendingId, setResendingId] = useState<string | null>(null)

  // Batch state
  const [showBatch, setShowBatch] = useState(false)
  const [batchResult, setBatchResult] = useState<EmailInvitationBatchResponse | null>(null)

  // Reminders state
  const [showReminders, setShowReminders] = useState(false)
  const [remindersLoading, setRemindersLoading] = useState(false)
  const [remindersError, setRemindersError] = useState<string | null>(null)
  const [remindersResult, setRemindersResult] = useState<SendRemindersResponse | null>(null)

  // ---------------------------------------------------------------------------
  // Load data
  // ---------------------------------------------------------------------------

  const loadStats = useCallback(async () => {
    if (!surveyId) return
    setStatsLoading(true)
    try {
      const data = await emailInvitationService.getStats(surveyId)
      setStats(data)
    } catch {
      // Stats failure is non-blocking
    } finally {
      setStatsLoading(false)
    }
  }, [surveyId])

  const loadInvitations = useCallback(async () => {
    if (!surveyId) return
    setIsLoading(true)
    setError(null)
    try {
      const params: Record<string, unknown> = { page, per_page: PER_PAGE }
      if (filterStatus) params.status = filterStatus
      if (filterType) params.invitation_type = filterType
      if (emailSearch) params.recipient_email = emailSearch

      const data = await emailInvitationService.listInvitations(surveyId, params)
      setInvitations(data.items)
      setTotal(data.total)
      setTotalPages(Math.max(1, data.pages))
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to load invitations. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }, [surveyId, page, filterStatus, filterType, emailSearch])

  useEffect(() => {
    loadInvitations()
  }, [loadInvitations])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  // ---------------------------------------------------------------------------
  // Send invitation
  // ---------------------------------------------------------------------------

  function openForm() {
    setFormError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setFormError(null)
  }

  const handleFormSubmit = useCallback(
    async (data: EmailInvitationCreate) => {
      if (!surveyId) return
      setFormLoading(true)
      setFormError(null)
      try {
        await emailInvitationService.sendInvitation(surveyId, data)
        closeForm()
        await Promise.all([loadInvitations(), loadStats()])
      } catch (err) {
        if (err instanceof ApiError) {
          setFormError(err.message)
        } else {
          setFormError('Failed to send invitation. Please try again.')
        }
      } finally {
        setFormLoading(false)
      }
    },
    [surveyId, loadInvitations, loadStats]
  )

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  function openDelete(invitation: EmailInvitationResponse) {
    setDeletingInvitation(invitation)
    setDeleteError(null)
  }

  function closeDelete() {
    setDeletingInvitation(null)
    setDeleteError(null)
  }

  const handleDelete = useCallback(async () => {
    if (!surveyId || !deletingInvitation) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      await emailInvitationService.deleteInvitation(surveyId, deletingInvitation.id)
      closeDelete()
      if (invitations.length === 1 && page > 1) {
        setPage((p) => p - 1)
      } else {
        await Promise.all([loadInvitations(), loadStats()])
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setDeleteError(err.message)
      } else {
        setDeleteError('Failed to delete invitation. Please try again.')
      }
    } finally {
      setDeleteLoading(false)
    }
  }, [surveyId, deletingInvitation, invitations.length, page, loadInvitations, loadStats])

  // ---------------------------------------------------------------------------
  // Resend
  // ---------------------------------------------------------------------------

  const handleResend = useCallback(
    async (invitation: EmailInvitationResponse) => {
      if (!surveyId) return
      setResendingId(invitation.id)
      try {
        await emailInvitationService.resendInvitation(surveyId, invitation.id)
        await Promise.all([loadInvitations(), loadStats()])
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to resend invitation.')
      } finally {
        setResendingId(null)
      }
    },
    [surveyId, loadInvitations, loadStats]
  )

  // ---------------------------------------------------------------------------
  // Batch
  // ---------------------------------------------------------------------------

  function handleBatchComplete(result: EmailInvitationBatchResponse) {
    setShowBatch(false)
    setBatchResult(result)
    void Promise.all([loadInvitations(), loadStats()])
  }

  // ---------------------------------------------------------------------------
  // Send Reminders
  // ---------------------------------------------------------------------------

  const handleSendReminders = useCallback(
    async (params: SendRemindersRequest) => {
      if (!surveyId) return
      setRemindersLoading(true)
      setRemindersError(null)
      try {
        const result = await emailInvitationService.sendReminders(surveyId, params)
        setShowReminders(false)
        setRemindersResult(result)
        void Promise.all([loadInvitations(), loadStats()])
      } catch (err) {
        if (err instanceof ApiError) {
          setRemindersError(err.message)
        } else {
          setRemindersError('Failed to send reminders. Please try again.')
        }
      } finally {
        setRemindersLoading(false)
      }
    },
    [surveyId, loadInvitations, loadStats]
  )

  // ---------------------------------------------------------------------------
  // Filter helpers
  // ---------------------------------------------------------------------------

  function handleEmailSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    void loadInvitations()
  }

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

  const hasFilters = !!filterStatus || !!filterType || !!emailSearch

  return (
    <div className="max-w-5xl mx-auto" data-testid="email-invitations-page">
      {/* Modals */}
      {showForm && (
        <EmailInvitationForm
          onSubmit={handleFormSubmit}
          onCancel={closeForm}
          isLoading={formLoading}
          error={formError}
        />
      )}

      {deletingInvitation && (
        <ConfirmDeleteModal
          invitationLabel={deletingInvitation.recipient_email}
          isLoading={deleteLoading}
          error={deleteError}
          onConfirm={handleDelete}
          onCancel={closeDelete}
        />
      )}

      {showBatch && (
        <EmailBatchDialog
          surveyId={surveyId ?? ''}
          onComplete={handleBatchComplete}
          onCancel={() => setShowBatch(false)}
        />
      )}

      {batchResult && (
        <BatchResultsModal result={batchResult} onClose={() => setBatchResult(null)} />
      )}

      {showReminders && (
        <SendRemindersDialog
          isLoading={remindersLoading}
          error={remindersError}
          onConfirm={handleSendReminders}
          onCancel={() => {
            setShowReminders(false)
            setRemindersError(null)
          }}
        />
      )}

      {remindersResult && (
        <ReminderResultsModal result={remindersResult} onClose={() => setRemindersResult(null)} />
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
        <h1 className="text-2xl font-bold text-foreground flex-1">Email Invitations</h1>
        <Button
          variant="outline"
          onClick={() => {
            setRemindersError(null)
            setShowReminders(true)
          }}
          className="gap-1.5"
          data-testid="send-reminders-button"
        >
          <Bell size={15} />
          Send Reminders
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowBatch(true)}
          className="gap-1.5"
          data-testid="send-batch-button"
        >
          <Upload size={15} />
          Send Batch
        </Button>
        <Button onClick={openForm} data-testid="send-invitation-button">
          <Plus size={16} />
          Send Invitation
        </Button>
      </div>

      {/* Stats cards */}
      <EmailStatsCards stats={stats} isLoading={statsLoading} />

      {/* Global error */}
      {error && (
        <div
          className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md"
          role="alert"
          data-testid="page-error"
        >
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3 items-center">
        <form onSubmit={handleEmailSearch} className="flex gap-2">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={emailSearch}
              onChange={(e) => {
                setEmailSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search by email"
              className="pl-8 pr-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-52"
              data-testid="email-search-input"
            />
          </div>
          <Button type="submit" variant="outline" size="sm" data-testid="email-search-button">
            Search
          </Button>
        </form>

        {/* Status filter */}
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="filter-status" className="text-muted-foreground">
            Status:
          </label>
          <select
            id="filter-status"
            value={filterStatus}
            onChange={(e) => {
              setPage(1)
              setFilterStatus(e.target.value)
            }}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            data-testid="filter-status-select"
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="sent">Sent</option>
            <option value="delivered">Delivered</option>
            <option value="bounced">Bounced</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {/* Type filter */}
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="filter-type" className="text-muted-foreground">
            Type:
          </label>
          <select
            id="filter-type"
            value={filterType}
            onChange={(e) => {
              setPage(1)
              setFilterType(e.target.value)
            }}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            data-testid="filter-type-select"
          >
            <option value="">All</option>
            <option value="invite">Invite</option>
            <option value="reminder">Reminder</option>
          </select>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <EmailInvitationTableSkeleton />
      ) : invitations.length === 0 && !hasFilters ? (
        <div
          className="text-center py-16 bg-card border border-border rounded-lg"
          data-testid="empty-state"
        >
          <p className="text-muted-foreground text-sm mb-4">
            No invitations have been sent for this survey.
          </p>
          <Button onClick={openForm}>Send your first invitation</Button>
        </div>
      ) : (
        <>
          {invitations.length === 0 ? (
            <div
              className="text-center py-10 text-muted-foreground text-sm"
              data-testid="no-results"
            >
              No invitations match the current filters.
            </div>
          ) : (
            <EmailInvitationTable
              invitations={invitations}
              onResend={handleResend}
              onDelete={openDelete}
              resendingId={resendingId}
            />
          )}

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
            <p className="text-sm text-muted-foreground" data-testid="pagination-info">
              Page {page} of {totalPages} &mdash; {total} invitation{total !== 1 ? 's' : ''}
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

export default EmailInvitationsPage
