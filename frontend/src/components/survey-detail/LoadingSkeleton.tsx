import { Skeleton } from '../ui/skeleton'

export function LoadingSkeleton() {
  return (
    <div aria-label="Loading survey" aria-busy="true" data-testid="loading-skeleton">
      <div className="space-y-4">
        <Skeleton className="h-8 w-64 rounded" />
        <Skeleton className="h-4 w-48 rounded" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    </div>
  )
}
