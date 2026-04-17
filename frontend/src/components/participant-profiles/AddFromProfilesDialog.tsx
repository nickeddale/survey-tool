import { useState, useCallback, useEffect } from 'react'
import { Search, Check } from 'lucide-react'
import type { ParticipantCreateResponse, ParticipantProfileResponse } from '../../types/survey'
import participantProfileService from '../../services/participantProfileService'
import { ApiError } from '../../types/api'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'

interface AddFromProfilesDialogProps {
  surveyId: string
  onComplete: (created: ParticipantCreateResponse[]) => void
  onCancel: () => void
}

function AddFromProfilesDialog({ surveyId, onComplete, onCancel }: AddFromProfilesDialogProps) {
  const [searchEmail, setSearchEmail] = useState('')
  const [profiles, setProfiles] = useState<ParticipantProfileResponse[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isAssigning, setIsAssigning] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)

  const handleSearch = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault()
      setIsSearching(true)
      setSearchError(null)
      try {
        const data = await participantProfileService.listProfiles({
          email: searchEmail || undefined,
          per_page: 50,
        })
        setProfiles(data.items)
      } catch (err) {
        if (err instanceof ApiError) {
          setSearchError(err.message)
        } else {
          setSearchError('Failed to search profiles.')
        }
      } finally {
        setIsSearching(false)
      }
    },
    [searchEmail]
  )

  // Load profiles on mount
  useEffect(() => {
    void handleSearch()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleSelect(profileId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(profileId)) {
        next.delete(profileId)
      } else {
        next.add(profileId)
      }
      return next
    })
  }

  async function handleAssign() {
    if (selectedIds.size === 0) return
    setIsAssigning(true)
    setAssignError(null)
    try {
      const created = await participantProfileService.assignFromProfiles(surveyId, {
        profile_ids: Array.from(selectedIds),
      })
      onComplete(created)
    } catch (err) {
      if (err instanceof ApiError) {
        setAssignError(err.message)
      } else {
        setAssignError('Failed to assign profiles to survey.')
      }
    } finally {
      setIsAssigning(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-from-profiles-title"
      data-testid="add-from-profiles-dialog"
    >
      <Card className="max-w-2xl w-full mx-4 shadow-lg max-h-[90vh] flex flex-col">
        <CardContent className="p-6 flex flex-col flex-1 overflow-hidden">
          <h2 id="add-from-profiles-title" className="text-lg font-semibold text-foreground mb-4">
            Add Participants from Profiles
          </h2>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                placeholder="Search by email"
                className="pl-8 pr-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-full"
                data-testid="profiles-search-input"
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={isSearching}
              data-testid="profiles-search-button"
            >
              {isSearching ? 'Searching...' : 'Search'}
            </Button>
          </form>

          {searchError && (
            <div
              className="mb-3 p-3 text-sm text-destructive bg-destructive/10 rounded-md"
              role="alert"
            >
              {searchError}
            </div>
          )}

          {assignError && (
            <div
              className="mb-3 p-3 text-sm text-destructive bg-destructive/10 rounded-md"
              role="alert"
              data-testid="assign-error"
            >
              {assignError}
            </div>
          )}

          {/* Profile list */}
          <div className="flex-1 overflow-y-auto rounded border border-border mb-4">
            {profiles.length === 0 ? (
              <div
                className="text-center py-8 text-muted-foreground text-sm"
                data-testid="profiles-empty"
              >
                No profiles found. Try a different search or{' '}
                <button
                  type="button"
                  className="underline text-primary"
                  onClick={() => {
                    setSearchEmail('')
                    void handleSearch()
                  }}
                >
                  clear the search
                </button>
                .
              </div>
            ) : (
              <table className="w-full text-sm" data-testid="profiles-select-table">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="w-8 px-3 py-2" />
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Email</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Org</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {profiles.map((profile) => {
                    const isSelected = selectedIds.has(profile.id)
                    return (
                      <tr
                        key={profile.id}
                        className={`bg-card cursor-pointer hover:bg-muted/20 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
                        onClick={() => toggleSelect(profile.id)}
                        data-testid={`profile-row-${profile.id}`}
                      >
                        <td className="px-3 py-2 text-center">
                          <div
                            className={`w-4 h-4 rounded border-2 inline-flex items-center justify-center transition-colors ${
                              isSelected
                                ? 'bg-primary border-primary text-primary-foreground'
                                : 'border-input'
                            }`}
                          >
                            {isSelected && <Check size={10} />}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{profile.email}</td>
                        <td className="px-3 py-2">
                          {[profile.first_name, profile.last_name].filter(Boolean).join(' ') || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {profile.organization ?? <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {selectedIds.size} profile{selectedIds.size !== 1 ? 's' : ''} selected
            </span>
            <div className="flex gap-3">
              <Button variant="outline" onClick={onCancel} disabled={isAssigning}>
                Cancel
              </Button>
              <Button
                onClick={handleAssign}
                disabled={selectedIds.size === 0 || isAssigning}
                data-testid="assign-profiles-button"
              >
                {isAssigning
                  ? 'Adding...'
                  : `Add ${selectedIds.size > 0 ? selectedIds.size : ''} to Survey`}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default AddFromProfilesDialog
