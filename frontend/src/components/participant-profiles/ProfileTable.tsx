import { Edit2, Trash2 } from 'lucide-react'
import type { ParticipantProfileResponse } from '../../types/survey'
import { Button } from '../ui/button'

interface ProfileTableProps {
  profiles: ParticipantProfileResponse[]
  onEdit: (profile: ParticipantProfileResponse) => void
  onDelete: (profile: ParticipantProfileResponse) => void
}

function ProfileTable({ profiles, onEdit, onDelete }: ProfileTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border" data-testid="profile-table">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Organization</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tags</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
            <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {profiles.map((profile) => (
            <tr key={profile.id} className="bg-card hover:bg-muted/20 transition-colors">
              <td className="px-4 py-3 text-foreground font-mono text-xs">{profile.email}</td>
              <td className="px-4 py-3 text-foreground">
                {[profile.first_name, profile.last_name].filter(Boolean).join(' ') || (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-foreground">
                {profile.organization ?? <span className="text-muted-foreground">—</span>}
              </td>
              <td className="px-4 py-3">
                {profile.tags && profile.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {profile.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-muted-foreground text-xs">
                {new Date(profile.created_at).toLocaleDateString()}
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(profile)}
                    aria-label={`Edit ${profile.email}`}
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    data-testid={`edit-profile-${profile.id}`}
                  >
                    <Edit2 size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(profile)}
                    aria-label={`Delete ${profile.email}`}
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    data-testid={`delete-profile-${profile.id}`}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ProfileTableSkeleton() {
  return (
    <div className="overflow-x-auto rounded-lg border border-border animate-pulse">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {['Email', 'Name', 'Organization', 'Tags', 'Created', 'Actions'].map((h) => (
              <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {[1, 2, 3].map((i) => (
            <tr key={i} className="bg-card">
              {[1, 2, 3, 4, 5, 6].map((j) => (
                <td key={j} className="px-4 py-3">
                  <div className="h-4 bg-muted rounded w-3/4" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default ProfileTable
