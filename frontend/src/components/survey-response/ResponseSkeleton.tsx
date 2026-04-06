import { Skeleton } from '../ui/skeleton'

export function ResponseSkeleton() {
  return (
    <div
      className="flex flex-col min-h-screen"
      aria-label="Loading survey"
      aria-busy="true"
      data-testid="response-loading-skeleton"
    >
      <div className="max-w-2xl mx-auto px-8 py-12 w-full space-y-6">
        <Skeleton className="h-10 w-2/3 rounded" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
    </div>
  )
}
