import { useState, useEffect, useCallback } from 'react'
import { Users, Plus, Upload, Search } from 'lucide-react'
import participantProfileService from '../services/participantProfileService'
import type {
  ParticipantProfileResponse,
  ParticipantProfileCreate,
  ParticipantProfileUpdate,
} from '../types/survey'
import { ApiError } from '../types/api'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import ProfileTable, { ProfileTableSkeleton } from '../components/participant-profiles/ProfileTable'
import ProfileForm from '../components/participant-profiles/ProfileForm'
import ProfileCsvImport from '../components/participant-profiles/ProfileCsvImport'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PER_PAGE = 20

// ---------------------------------------------------------------------------
// Delete confirmation modal
// ---------------------------------------------------------------------------

interface ConfirmDeleteModalProps {
  profileLabel: string
  isLoading?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDeleteModal({
  profileLabel,
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
      aria-labelledby="delete-profile-title"
      data-testid="delete-profile-modal"
    >
      <Card className="max-w-md w-full mx-4 shadow-lg">
        <CardContent className="p-6">
          <h2 id="delete-profile-title" className="text-lg font-semibold text-foreground mb-2">
            Delete Profile
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Are you sure you want to delete &quot;{profileLabel}&quot;? Survey participants linked
            to this profile will be unlinked (not deleted).
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
              data-testid="confirm-delete-profile-button"
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
  count: number
  onClose: () => void
}

function ImportResultsModal({ count, onClose }: ImportResultsModalProps) {
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
            Successfully imported <strong>{count}</strong> profile{count !== 1 ? 's' : ''}.
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
// ParticipantProfilesPage
// ---------------------------------------------------------------------------

function ParticipantProfilesPage() {
  // List state
  const [profiles, setProfiles] = useState<ParticipantProfileResponse[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filter state
  const [emailSearch, setEmailSearch] = useState('')
  const [nameSearch, setNameSearch] = useState('')
  const [orgSearch, setOrgSearch] = useState('')
  const [tagSearch, setTagSearch] = useState('')

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingProfile, setEditingProfile] = useState<ParticipantProfileResponse | null>(null)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Delete state
  const [deletingProfile, setDeletingProfile] = useState<ParticipantProfileResponse | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Import state
  const [showCsvImport, setShowCsvImport] = useState(false)
  const [importCount, setImportCount] = useState<number | null>(null)

  // ---------------------------------------------------------------------------
  // Load profiles
  // ---------------------------------------------------------------------------

  const loadProfiles = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params: Record<string, unknown> = { page, per_page: PER_PAGE }
      if (emailSearch) params.email = emailSearch
      if (nameSearch) params.name = nameSearch
      if (orgSearch) params.organization = orgSearch
      if (tagSearch) params.tag = tagSearch

      const data = await participantProfileService.listProfiles(params)
      setProfiles(data.items)
      setTotal(data.total)
      setTotalPages(Math.max(1, data.pages))
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to load profiles. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }, [page, emailSearch, nameSearch, orgSearch, tagSearch])

  useEffect(() => {
    void loadProfiles()
  }, [loadProfiles])

  // ---------------------------------------------------------------------------
  // Create / Edit
  // ---------------------------------------------------------------------------

  function openCreate() {
    setEditingProfile(null)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(profile: ParticipantProfileResponse) {
    setEditingProfile(profile)
    setFormError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingProfile(null)
    setFormError(null)
  }

  const handleFormSubmit = useCallback(
    async (data: ParticipantProfileCreate | ParticipantProfileUpdate) => {
      setFormLoading(true)
      setFormError(null)
      try {
        if (editingProfile) {
          await participantProfileService.updateProfile(editingProfile.id, data)
        } else {
          await participantProfileService.createProfile(data as ParticipantProfileCreate)
        }
        closeForm()
        await loadProfiles()
      } catch (err) {
        if (err instanceof ApiError) {
          setFormError(err.message)
        } else {
          setFormError('Failed to save profile. Please try again.')
        }
      } finally {
        setFormLoading(false)
      }
    },
    [editingProfile, loadProfiles]
  )

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  function openDelete(profile: ParticipantProfileResponse) {
    setDeletingProfile(profile)
    setDeleteError(null)
  }

  function closeDelete() {
    setDeletingProfile(null)
    setDeleteError(null)
  }

  const handleDelete = useCallback(async () => {
    if (!deletingProfile) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      await participantProfileService.deleteProfile(deletingProfile.id)
      closeDelete()
      if (profiles.length === 1 && page > 1) {
        setPage((p) => p - 1)
      } else {
        await loadProfiles()
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setDeleteError(err.message)
      } else {
        setDeleteError('Failed to delete profile. Please try again.')
      }
    } finally {
      setDeleteLoading(false)
    }
  }, [deletingProfile, profiles.length, page, loadProfiles])

  // ---------------------------------------------------------------------------
  // CSV import
  // ---------------------------------------------------------------------------

  function handleCsvComplete(created: ParticipantProfileResponse[]) {
    setShowCsvImport(false)
    setImportCount(created.length)
    void loadProfiles()
  }

  // ---------------------------------------------------------------------------
  // Search / filter
  // ---------------------------------------------------------------------------

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    void loadProfiles()
  }

  // ---------------------------------------------------------------------------
  // Pagination
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

  const hasFilters = Boolean(emailSearch || nameSearch || orgSearch || tagSearch)

  return (
    <div className="max-w-5xl mx-auto" data-testid="participant-profiles-page">
      {/* Modals */}
      {showForm && (
        <ProfileForm
          profile={editingProfile}
          onSubmit={handleFormSubmit}
          onCancel={closeForm}
          isLoading={formLoading}
          error={formError}
        />
      )}

      {deletingProfile && (
        <ConfirmDeleteModal
          profileLabel={deletingProfile.email}
          isLoading={deleteLoading}
          error={deleteError}
          onConfirm={handleDelete}
          onCancel={closeDelete}
        />
      )}

      {showCsvImport && (
        <ProfileCsvImport onComplete={handleCsvComplete} onCancel={() => setShowCsvImport(false)} />
      )}

      {importCount !== null && (
        <ImportResultsModal count={importCount} onClose={() => setImportCount(null)} />
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Users size={24} className="text-muted-foreground" />
        <h1 className="text-2xl font-bold text-foreground flex-1">Participant Profiles</h1>
        <Button
          variant="outline"
          onClick={() => setShowCsvImport(true)}
          className="gap-1.5"
          data-testid="csv-import-button"
        >
          <Upload size={15} />
          Import CSV
        </Button>
        <Button onClick={openCreate} data-testid="create-profile-button">
          <Plus size={16} />
          Add Profile
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div
          className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Filters */}
      <form onSubmit={handleSearchSubmit} className="mb-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Email</label>
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={emailSearch}
              onChange={(e) => setEmailSearch(e.target.value)}
              placeholder="Search email"
              className="pl-8 pr-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-44"
              data-testid="email-search-input"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Name</label>
          <input
            type="text"
            value={nameSearch}
            onChange={(e) => setNameSearch(e.target.value)}
            placeholder="Search name"
            className="px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-36"
            data-testid="name-search-input"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Organization</label>
          <input
            type="text"
            value={orgSearch}
            onChange={(e) => setOrgSearch(e.target.value)}
            placeholder="Search org"
            className="px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-36"
            data-testid="org-search-input"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Tag</label>
          <input
            type="text"
            value={tagSearch}
            onChange={(e) => setTagSearch(e.target.value)}
            placeholder="Filter by tag"
            className="px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-32"
            data-testid="tag-search-input"
          />
        </div>
        <Button type="submit" variant="outline" size="sm" data-testid="search-button">
          Search
        </Button>
        {hasFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setEmailSearch('')
              setNameSearch('')
              setOrgSearch('')
              setTagSearch('')
              setPage(1)
            }}
            data-testid="clear-filters-button"
          >
            Clear filters
          </Button>
        )}
      </form>

      {/* Content */}
      {isLoading ? (
        <ProfileTableSkeleton />
      ) : profiles.length === 0 && !hasFilters ? (
        <div
          className="text-center py-16 bg-card border border-border rounded-lg"
          data-testid="empty-state"
        >
          <Users size={32} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground text-sm mb-4">
            No participant profiles yet. Add a profile or import from CSV.
          </p>
          <Button onClick={openCreate}>Add your first profile</Button>
        </div>
      ) : (
        <>
          {profiles.length === 0 ? (
            <div
              className="text-center py-10 text-muted-foreground text-sm"
              data-testid="no-results"
            >
              No profiles match the current filters.
            </div>
          ) : (
            <ProfileTable profiles={profiles} onEdit={openEdit} onDelete={openDelete} />
          )}

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
            <p className="text-sm text-muted-foreground" data-testid="pagination-info">
              Page {page} of {totalPages} &mdash; {total} profile{total !== 1 ? 's' : ''}
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

export default ParticipantProfilesPage
