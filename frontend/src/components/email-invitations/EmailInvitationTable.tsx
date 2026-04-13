import { RefreshCw, Trash2 } from 'lucide-react'
import { Skeleton } from '../ui/skeleton'
import { Button } from '../ui/button'
import type { EmailInvitationResponse, EmailInvitationType } from '../../types/survey'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-muted text-muted-foreground'
    case 'sent':
      return 'bg-blue-100 text-blue-700'
    case 'delivered':
      return 'bg-green-100 text-green-700'
    case 'bounced':
    case 'failed':
      return 'bg-red-100 text-red-700'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${getStatusBadgeClass(status)}`}
      data-testid={`status-badge-${status}`}
    >
      {status}
    </span>
  )
}

function TypeBadge({ type }: { type: EmailInvitationType }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground capitalize">
      {type}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function EmailInvitationTableSkeleton() {
  return (
    <div className="rounded-lg border border-border overflow-hidden" data-testid="table-skeleton">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {['Recipient', 'Type', 'Status', 'Sent At', 'Actions'].map((h) => (
              <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}>
              <td className="px-4 py-3">
                <Skeleton className="h-4 w-36 mb-1" />
                <Skeleton className="h-3 w-24" />
              </td>
              <td className="px-4 py-3"><Skeleton className="h-5 w-16" /></td>
              <td className="px-4 py-3"><Skeleton className="h-5 w-20" /></td>
              <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
              <td className="px-4 py-3"><Skeleton className="h-8 w-20" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// EmailInvitationTable
// ---------------------------------------------------------------------------

interface EmailInvitationTableProps {
  invitations: EmailInvitationResponse[]
  onResend: (invitation: EmailInvitationResponse) => void
  onDelete: (invitation: EmailInvitationResponse) => void
  resendingId?: string | null
}

function EmailInvitationTable({
  invitations,
  onResend,
  onDelete,
  resendingId,
}: EmailInvitationTableProps) {
  return (
    <div className="rounded-lg border border-border overflow-hidden overflow-x-auto" data-testid="invitation-table">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Recipient</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sent At</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {invitations.map((inv) => (
            <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
              <td className="px-4 py-3">
                <p className="text-foreground font-medium">{inv.recipient_email}</p>
                {inv.recipient_name && (
                  <p className="text-xs text-muted-foreground">{inv.recipient_name}</p>
                )}
              </td>
              <td className="px-4 py-3">
                <TypeBadge type={inv.invitation_type} />
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={inv.status} />
              </td>
              <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.sent_at)}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {(inv.status === 'failed' || inv.status === 'bounced') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onResend(inv)}
                      disabled={resendingId === inv.id}
                      aria-label={`Resend invitation to ${inv.recipient_email}`}
                      data-testid={`resend-button-${inv.id}`}
                    >
                      <RefreshCw size={13} />
                      {resendingId === inv.id ? 'Resending...' : 'Resend'}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(inv)}
                    aria-label={`Delete invitation for ${inv.recipient_email}`}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    data-testid={`delete-button-${inv.id}`}
                  >
                    <Trash2 size={13} />
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

export default EmailInvitationTable
