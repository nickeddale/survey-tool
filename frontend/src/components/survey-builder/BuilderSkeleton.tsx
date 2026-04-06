/**
 * BuilderSkeleton — full-screen loading skeleton for the survey builder page.
 *
 * Displayed while the survey data is being fetched on initial load.
 */

import { Skeleton } from '../ui/skeleton'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BuilderSkeleton() {
  return (
    <div
      className="flex flex-col h-screen"
      aria-label="Loading survey builder"
      aria-busy="true"
      data-testid="builder-loading-skeleton"
    >
      {/* Top bar skeleton */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background">
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-6 w-48 rounded" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      {/* Panels skeleton */}
      <div className="flex flex-1 overflow-hidden">
        <Skeleton className="w-56 h-full" />
        <div className="flex-1 p-4 space-y-3">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
        <Skeleton className="w-72 h-full" />
      </div>
    </div>
  )
}
