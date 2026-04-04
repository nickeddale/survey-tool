import { Copy, Link, Pencil, Trash2 } from 'lucide-react'
import type { ParticipantResponse } from '../../types/survey'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskToken(token?: string): string {
  if (!token || token.length <= 4) return '••••'
  return '••••' + token.slice(-4)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString()
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

export function ParticipantTableSkeleton() {
  return (
    <div aria-label="Loading participants" aria-busy="true" data-testid="loading-skeleton">
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ParticipantTable
// ---------------------------------------------------------------------------

interface ParticipantTableProps {
  participants: ParticipantResponse[]
  surveyId: string
  onEdit: (participant: ParticipantResponse) => void
  onDelete: (participant: ParticipantResponse) => void
  onCopyLink: (participant: ParticipantResponse) => void
}

function ParticipantTable({
  participants,
  surveyId: _surveyId,
  onEdit,
  onDelete,
  onCopyLink,
}: ParticipantTableProps) {
  if (participants.length === 0) {
    return (
      <div
        className="text-center py-16 bg-card border border-border rounded-lg"
        data-testid="empty-state"
      >
        <p className="text-muted-foreground text-sm mb-4">
          No participants have been added to this survey.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm" role="table">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Token</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Uses Remaining</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Valid From</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Valid Until</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
            <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {participants.map((p) => (
            <tr
              key={p.id}
              className="bg-card hover:bg-muted/30 transition-colors"
              data-testid={`participant-row-${p.id}`}
            >
              <td className="px-4 py-3 text-foreground">
                {p.email ?? <span className="text-muted-foreground italic">—</span>}
              </td>
              <td className="px-4 py-3">
                <code
                  className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded"
                  data-testid={`participant-token-${p.id}`}
                >
                  {maskToken()}
                </code>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {p.uses_remaining !== null ? p.uses_remaining : '∞'}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{formatDate(p.valid_from)}</td>
              <td className="px-4 py-3 text-muted-foreground">{formatDate(p.valid_until)}</td>
              <td className="px-4 py-3">
                {p.completed ? (
                  <Badge
                    variant="secondary"
                    className="bg-green-100 text-green-800 hover:bg-green-100"
                    data-testid={`participant-completed-badge-${p.id}`}
                  >
                    Completed
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className="bg-muted text-muted-foreground hover:bg-muted"
                    data-testid={`participant-pending-badge-${p.id}`}
                  >
                    Pending
                  </Badge>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onCopyLink(p)}
                    aria-label={`Copy survey link for ${p.email ?? p.id}`}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    data-testid={`participant-copy-link-${p.id}`}
                  >
                    <Link size={15} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(p)}
                    aria-label={`Edit participant ${p.email ?? p.id}`}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    data-testid={`participant-edit-${p.id}`}
                  >
                    <Pencil size={15} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(p)}
                    aria-label={`Delete participant ${p.email ?? p.id}`}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    data-testid={`participant-delete-${p.id}`}
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
  )
}

// Separate copy-token button used in token-once display
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  function handleCopy() {
    navigator.clipboard.writeText(text).catch(() => {})
  }
  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
      <Copy size={14} />
      {label}
    </Button>
  )
}

export default ParticipantTable
