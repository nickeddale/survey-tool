import { Skeleton } from '../ui/skeleton'

export function SurveyListSkeleton() {
  return (
    <div aria-label="Loading" aria-busy="true" data-testid="loading-skeleton">
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    </div>
  )
}
