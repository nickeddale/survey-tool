const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-green-100 text-green-800',
  closed: 'bg-yellow-100 text-yellow-800',
  archived: 'bg-red-100 text-red-800',
}

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground'
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded text-sm font-medium capitalize ${cls}`}
      data-testid="status-badge"
    >
      {status}
    </span>
  )
}
