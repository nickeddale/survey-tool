import { Eye } from 'lucide-react'
import type { ResponseSummary } from '../../types/survey'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Skeleton } from '../ui/skeleton'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RESPONSE_STATUS_STYLES: Record<string, string> = {
  incomplete: 'bg-yellow-100 text-yellow-800',
  complete: 'bg-green-100 text-green-800',
  disqualified: 'bg-red-100 text-red-800',
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ResponseStatusBadge({ status }: { status: string }) {
  const cls = RESPONSE_STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground'
  return (
    <Badge
      variant="secondary"
      className={`capitalize ${cls} hover:${cls}`}
      data-testid={`response-status-badge-${status}`}
    >
      {status}
    </Badge>
  )
}

function TableLoadingSkeleton() {
  return (
    <div aria-label="Loading responses" aria-busy="true" data-testid="response-table-loading">
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ResponseTable
// ---------------------------------------------------------------------------

interface ResponseTableProps {
  responses: ResponseSummary[]
  isLoading: boolean
  onView: (response: ResponseSummary) => void
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function truncateId(id: string): string {
  return id.slice(0, 8) + '…'
}

function ResponseTable({ responses, isLoading, onView }: ResponseTableProps) {
  if (isLoading) {
    return <TableLoadingSkeleton />
  }

  if (responses.length === 0) {
    return (
      <div
        className="text-center py-16 bg-card border border-border rounded-lg"
        data-testid="response-table-empty"
      >
        <p className="text-muted-foreground text-sm">No responses found.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border" data-testid="response-table">
      <table className="w-full text-sm" role="table">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">ID</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Started</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Completed</th>
            <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {responses.map((response) => (
            <tr
              key={response.id}
              className="bg-card hover:bg-muted/30 transition-colors cursor-pointer"
              onClick={() => onView(response)}
              data-testid={`response-row-${response.id}`}
            >
              <td className="px-4 py-3 font-mono text-sm text-muted-foreground" title={response.id}>
                {truncateId(response.id)}
              </td>
              <td className="px-4 py-3">
                <ResponseStatusBadge status={response.status} />
              </td>
              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                {formatDate(response.started_at)}
              </td>
              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                {formatDate(response.completed_at)}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      onView(response)
                    }}
                    aria-label={`View response ${truncateId(response.id)}`}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  >
                    <Eye size={15} />
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

export default ResponseTable
