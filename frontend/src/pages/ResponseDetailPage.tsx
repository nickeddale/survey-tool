import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import responseService from '../services/responseService'
import type { ResponseDetailFull } from '../types/survey'
import { ApiError } from '../types/api'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import ResponseDetail from '../components/responses/ResponseDetail'

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div aria-label="Loading response" aria-busy="true" data-testid="loading-skeleton">
      <div className="space-y-4">
        <Skeleton className="h-8 w-64 rounded" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ResponseDetailPage
// ---------------------------------------------------------------------------

function ResponseDetailPage() {
  const navigate = useNavigate()
  const { id: surveyId, rid: responseId } = useParams<{ id: string; rid: string }>()

  const [response, setResponse] = useState<ResponseDetailFull | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  // ---------------------------------------------------------------------------
  // Load response detail
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!surveyId || !responseId) return
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError(null)
      try {
        const data = await responseService.getResponseDetail(surveyId!, responseId!)
        if (!cancelled) setResponse(data)
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError && err.status === 404) {
            setNotFound(true)
          } else if (err instanceof ApiError) {
            setError(err.message)
          } else {
            setError('Failed to load response. Please try again.')
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [surveyId, responseId])

  // ---------------------------------------------------------------------------
  // Render: loading
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <LoadingSkeleton />
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: not found
  // ---------------------------------------------------------------------------

  if (notFound) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card data-testid="response-not-found">
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold text-foreground mb-2">Response Not Found</h2>
            <p className="text-muted-foreground text-sm mb-4">
              The response you are looking for does not exist or has been deleted.
            </p>
            <Button onClick={() => navigate(`/surveys/${surveyId}/responses`)}>
              Back to Responses
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: error
  // ---------------------------------------------------------------------------

  if (!response) {
    return (
      <div className="max-w-2xl mx-auto">
        {error && (
          <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md" role="alert">
            {error}
          </div>
        )}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: full detail
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-4xl mx-auto" data-testid="response-detail-page">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/surveys/${surveyId}/responses`)}
          aria-label="Back to responses"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-foreground">Response Detail</h1>
          <p className="text-sm text-muted-foreground">
            <Link
              to={`/surveys/${surveyId}/responses`}
              className="hover:text-primary hover:underline transition-colors"
            >
              ← Back to responses
            </Link>
          </p>
        </div>
      </div>

      {/* Global error alert */}
      {error && (
        <div
          className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md"
          role="alert"
        >
          {error}
        </div>
      )}

      <ResponseDetail response={response} />
    </div>
  )
}

export default ResponseDetailPage
