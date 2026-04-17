import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, Plus, Upload, Search, Link, Users } from 'lucide-react'
import participantService from '../services/participantService'
import type {
  ParticipantResponse,
  ParticipantCreate,
  ParticipantUpdate,
  ParticipantCreateResponse,
} from '../types/survey'
import { ApiError } from '../types/api'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import ParticipantTable, {
  ParticipantTableSkeleton,
} from '../components/participants/ParticipantTable'
import ParticipantForm from '../components/participants/ParticipantForm'
import CsvImportDialog from '../components/participants/CsvImportDialog'
import AddFromProfilesDialog from '../components/participant-profiles/AddFromProfilesDialog'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PER_PAGE = 20

// ---------------------------------------------------------------------------
// Delete confirmation modal
// ---------------------------------------------------------------------------

interface ConfirmDeleteModalProps {
  participantLabel: string
  isLoading?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDeleteModal({
  participantLabel,
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
      aria-labelledby="delete-participant-title"
      data-testid="delete-confirm-modal"
    >
      <Card className="max-w-md w-full mx-4 shadow-lg">
        <CardContent className="p-6">
          <h2 id="delete-participant-title" className="text-lg font-semibold text-foreground mb-2">
            Delete Participant
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Are you sure you want to delete &quot;{participantLabel}&quot;? This action cannot be
            undone.
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
// Import results modal
// ---------------------------------------------------------------------------

interface ImportResultsModalProps {
  created: ParticipantCreateResponse[]
  onClose: () => void
}

function ImportResultsModal({ created, onClose }: ImportResultsModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-results-title"
      data-testid="import-results-modal"
    >
      <Card className="max-w-md w-full mx-4 shadow-lg">
        <CardContent className="p-6">
          <h2 id="import-results-title" className="text-lg font-semibold text-foreground mb-2">
            Import Complete
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Successfully created <strong>{created.length}</strong> participant
            {created.length !== 1 ? 's' : ''}.
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            Participant tokens are not shown for batch imports. Use individual creation to receive a
            token.
          </p>
          <div className="flex justify-end">
            <Button onClick={onClose} data-testid="import-results-close">
              Done
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ParticipantsPage
// ---------------------------------------------------------------------------

function ParticipantsPage() {
  const navigate = useNavigate()
  const { id: surveyId } = useParams<{ id: string }>()

  // List state
  const [participants, setParticipants] = useState<ParticipantResponse[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filter state
  const [emailSearch, setEmailSearch] = useState('')
  const [filterCompleted, setFilterCompleted] = useState<boolean | undefined>(undefined)
  const [filterValid, setFilterValid] = useState<boolean | undefined>(undefined)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingParticipant, setEditingParticipant] = useState<ParticipantResponse | null>(null)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [createdToken, setCreatedToken] = useState<string | null>(null)

  // Delete state
  const [deletingParticipant, setDeletingParticipant] = useState<ParticipantResponse | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // CSV import state
  const [showCsvImport, setShowCsvImport] = useState(false)
  const [importResults, setImportResults] = useState<ParticipantCreateResponse[] | null>(null)

  // Copy link error state
  // Add from profiles state
  const [showAddFromProfiles, setShowAddFromProfiles] = useState(false)

  // Copy link error state
  const [copyLinkError, setCopyLinkError] = useState<string | null>(null)

  // ---------------------------------------------------------------------------
  // Load participants
  // ---------------------------------------------------------------------------

  const loadParticipants = useCallback(async () => {
    if (!surveyId) return
    setIsLoading(true)
    setError(null)
    try {
      const params: Record<string, unknown> = { page, per_page: PER_PAGE }
      if (emailSearch) params.email = emailSearch
      if (filterCompleted !== undefined) params.completed = filterCompleted
      if (filterValid !== undefined) params.valid = filterValid

      const data = await participantService.listParticipants(surveyId, params)
      setParticipants(data.items)
      setTotal(data.total)
      setTotalPages(Math.max(1, data.pages))
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to load participants. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }, [surveyId, page, emailSearch, filterCompleted, filterValid])

  useEffect(() => {
    loadParticipants()
  }, [loadParticipants])

  // ---------------------------------------------------------------------------
  // Create / Edit
  // ---------------------------------------------------------------------------

  function openCreate() {
    setEditingParticipant(null)
    setFormError(null)
    setCreatedToken(null)
    setShowForm(true)
  }

  function openEdit(participant: ParticipantResponse) {
    setEditingParticipant(participant)
    setFormError(null)
    setCreatedToken(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingParticipant(null)
    setFormError(null)
    setCreatedToken(null)
  }

  const handleFormSubmit = useCallback(
    async (data: ParticipantCreate | ParticipantUpdate) => {
      if (!surveyId) return
      setFormLoading(true)
      setFormError(null)
      try {
        if (editingParticipant) {
          await participantService.updateParticipant(surveyId, editingParticipant.id, data)
          closeForm()
          await loadParticipants()
        } else {
          const created = await participantService.createParticipant(
            surveyId,
            data as ParticipantCreate
          )
          // Show token once — keep form open in token display mode
          setCreatedToken(created.token)
          await loadParticipants()
        }
      } catch (err) {
        if (err instanceof ApiError) {
          setFormError(err.message)
        } else {
          setFormError('Failed to save participant. Please try again.')
        }
      } finally {
        setFormLoading(false)
      }
    },
    [surveyId, editingParticipant, loadParticipants]
  )

  function handleTokenAcknowledged() {
    closeForm()
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  function openDelete(participant: ParticipantResponse) {
    setDeletingParticipant(participant)
    setDeleteError(null)
  }

  function closeDelete() {
    setDeletingParticipant(null)
    setDeleteError(null)
  }

  const handleDelete = useCallback(async () => {
    if (!surveyId || !deletingParticipant) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      await participantService.deleteParticipant(surveyId, deletingParticipant.id)
      closeDelete()
      if (participants.length === 1 && page > 1) {
        setPage((p) => p - 1)
      } else {
        await loadParticipants()
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setDeleteError(err.message)
      } else {
        setDeleteError('Failed to delete participant. Please try again.')
      }
    } finally {
      setDeleteLoading(false)
    }
  }, [surveyId, deletingParticipant, participants.length, page, loadParticipants])

  // ---------------------------------------------------------------------------
  // Copy survey link
  // ---------------------------------------------------------------------------

  async function handleCopyLink(participant: ParticipantResponse) {
    // token is not available in list view — we can only generate a link if we
    // somehow had the token. Per the ticket spec, the link is generated from
    // the participant object. Since token is hidden after creation, this button
    // is informational only — we note this limitation.
    // For demo purposes we copy a link with a placeholder.
    void participant
    const link = `${window.location.origin}/s/${surveyId}?token=<token>`
    try {
      await navigator.clipboard.writeText(link)
      setCopyLinkError(null)
    } catch {
      setCopyLinkError('Failed to copy link to clipboard')
      setTimeout(() => setCopyLinkError(null), 3000)
    }
  }

  // ---------------------------------------------------------------------------
  // CSV import
  // ---------------------------------------------------------------------------

  function handleCsvComplete(created: ParticipantCreateResponse[]) {
    setShowCsvImport(false)
    setImportResults(created)
    void loadParticipants()
  }

  // ---------------------------------------------------------------------------
  // Filter helpers
  // ---------------------------------------------------------------------------

  function handleEmailSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    void loadParticipants()
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
  // Participant label helper
  // ---------------------------------------------------------------------------

  function participantLabel(p: ParticipantResponse) {
    return p.email ?? p.id
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-5xl mx-auto" data-testid="participants-page">
      {/* Modals */}
      {showForm && (
        <ParticipantForm
          participant={editingParticipant}
          onSubmit={handleFormSubmit}
          onCancel={closeForm}
          isLoading={formLoading}
          error={formError}
          createdToken={createdToken}
          onTokenAcknowledged={handleTokenAcknowledged}
        />
      )}

      {deletingParticipant && (
        <ConfirmDeleteModal
          participantLabel={participantLabel(deletingParticipant)}
          isLoading={deleteLoading}
          error={deleteError}
          onConfirm={handleDelete}
          onCancel={closeDelete}
        />
      )}

      {showCsvImport && (
        <CsvImportDialog
          surveyId={surveyId ?? ''}
          onComplete={handleCsvComplete}
          onCancel={() => setShowCsvImport(false)}
        />
      )}

      {importResults && (
        <ImportResultsModal created={importResults} onClose={() => setImportResults(null)} />
      )}

      {showAddFromProfiles && (
        <AddFromProfilesDialog
          surveyId={surveyId ?? ''}
          onComplete={(created) => {
            setShowAddFromProfiles(false)
            void loadParticipants()
            void created
          }}
          onCancel={() => setShowAddFromProfiles(false)}
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
        <h1 className="text-2xl font-bold text-foreground flex-1">Participant Management</h1>
        <Button
          variant="outline"
          onClick={() => setShowAddFromProfiles(true)}
          className="gap-1.5"
          data-testid="add-from-profiles-button"
        >
          <Users size={15} />
          Add from Profiles
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowCsvImport(true)}
          className="gap-1.5"
          data-testid="csv-import-button"
        >
          <Upload size={15} />
          Import CSV
        </Button>
        <Button onClick={openCreate} data-testid="create-participant-button">
          <Plus size={16} />
          Add Participant
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

      {/* Copy link error */}
      {copyLinkError && (
        <div
          className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md flex items-center gap-2"
          role="alert"
          aria-live="assertive"
          data-testid="copy-link-error"
        >
          <AlertCircle size={14} />
          {copyLinkError}
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
              onChange={(e) => setEmailSearch(e.target.value)}
              placeholder="Search by email"
              className="pl-8 pr-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-52"
              data-testid="email-search-input"
            />
          </div>
          <Button type="submit" variant="outline" size="sm" data-testid="email-search-button">
            Search
          </Button>
        </form>

        {/* Completed filter */}
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="filter-completed" className="text-muted-foreground">
            Completed:
          </label>
          <select
            id="filter-completed"
            value={filterCompleted === undefined ? '' : String(filterCompleted)}
            onChange={(e) => {
              setPage(1)
              setFilterCompleted(e.target.value === '' ? undefined : e.target.value === 'true')
            }}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            data-testid="filter-completed-select"
          >
            <option value="">All</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>

        {/* Valid filter */}
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="filter-valid" className="text-muted-foreground">
            Valid:
          </label>
          <select
            id="filter-valid"
            value={filterValid === undefined ? '' : String(filterValid)}
            onChange={(e) => {
              setPage(1)
              setFilterValid(e.target.value === '' ? undefined : e.target.value === 'true')
            }}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            data-testid="filter-valid-select"
          >
            <option value="">All</option>
            <option value="true">Valid only</option>
            <option value="false">Invalid only</option>
          </select>
        </div>

        {/* Survey link info */}
        <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link size={13} />
          Survey link:{' '}
          <code className="font-mono bg-muted px-1 rounded">/s/{surveyId}?token=...</code>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <ParticipantTableSkeleton />
      ) : participants.length === 0 &&
        !emailSearch &&
        filterCompleted === undefined &&
        filterValid === undefined ? (
        <div
          className="text-center py-16 bg-card border border-border rounded-lg"
          data-testid="empty-state"
        >
          <p className="text-muted-foreground text-sm mb-4">
            No participants have been added to this survey.
          </p>
          <Button onClick={openCreate}>Add your first participant</Button>
        </div>
      ) : (
        <>
          {participants.length === 0 ? (
            <div
              className="text-center py-10 text-muted-foreground text-sm"
              data-testid="no-results"
            >
              No participants match the current filters.
            </div>
          ) : (
            <ParticipantTable
              participants={participants}
              surveyId={surveyId ?? ''}
              onEdit={openEdit}
              onDelete={openDelete}
              onCopyLink={handleCopyLink}
            />
          )}

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
            <p className="text-sm text-muted-foreground" data-testid="pagination-info">
              Page {page} of {totalPages} &mdash; {total} participant{total !== 1 ? 's' : ''}
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

export default ParticipantsPage
