import type { AssessmentScoreResponse } from '../../types/survey'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Skeleton } from '../ui/skeleton'

// ---------------------------------------------------------------------------
// AssessmentResults
// ---------------------------------------------------------------------------

interface AssessmentResultsProps {
  result: AssessmentScoreResponse
}

export function AssessmentResults({ result }: AssessmentResultsProps) {
  return (
    <div data-testid="assessment-results">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Assessment Results</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Total score */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Total Score
            </p>
            <p className="text-3xl font-bold text-foreground" data-testid="assessment-score">
              {Number(result.score)}
            </p>
          </div>

          {/* Matching bands */}
          {result.matching_assessments.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Matching Bands
              </p>
              <div className="space-y-2" data-testid="assessment-bands">
                {result.matching_assessments.map((band) => (
                  <div
                    key={band.id}
                    className="rounded-md border border-border bg-muted/30 p-3"
                    data-testid={`assessment-band-${band.id}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-medium text-foreground">{band.name}</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {Number(band.min_score)} – {Number(band.max_score)}
                      </span>
                    </div>
                    {band.scope !== 'total' && (
                      <p className="text-xs text-muted-foreground capitalize mb-1">
                        Scope: {band.scope}
                      </p>
                    )}
                    <p className="text-sm text-foreground">{band.message}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="no-matching-bands">
              No assessment bands matched this response's score.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AssessmentResultsSkeleton
// ---------------------------------------------------------------------------

export function AssessmentResultsSkeleton() {
  return (
    <div data-testid="assessment-results-skeleton">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48 rounded" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-24 rounded" />
          <Skeleton className="h-20 rounded-md" />
        </CardContent>
      </Card>
    </div>
  )
}

export default AssessmentResults
