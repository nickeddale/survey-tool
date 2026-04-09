import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-react'
import assessmentService from '../services/assessmentService'
import surveyService from '../services/surveyService'
import type { AssessmentResponse, QuestionGroupResponse, QuestionResponse } from '../types/survey'
import { ApiError } from '../types/api'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Skeleton } from '../components/ui/skeleton'
import { Card, CardContent } from '../components/ui/card'
import AssessmentForm from '../components/assessments/AssessmentForm'
import type { AssessmentCreate } from '../types/survey'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PER_PAGE = 10

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div aria-label="Loading assessments" aria-busy="true" data-testid="loading-skeleton">
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

interface ConfirmDeleteModalProps {
  assessmentName: string
  isLoading?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDeleteModal({
  assessmentName,
  isLoading,
  error,
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-assessment-title"
      data-testid="delete-confirm-modal"
    >
      <Card className="max-w-md w-full mx-4 shadow-lg">
        <CardContent className="p-6">
          <h2 id="delete-assessment-title" className="text-lg font-semibold text-foreground mb-2">
            Delete Assessment
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Are you sure you want to delete &quot;{assessmentName}&quot;? This action cannot be undone.
          </p>
          {error && (
            <div className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md" role="alert">
              {error}
            </div>
          )}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirm}
              disabled={isLoading}
              data-testid="confirm-delete-button"
            >
              {isLoading ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AssessmentsPage
// ---------------------------------------------------------------------------

function AssessmentsPage() {
  const navigate = useNavigate()
  const { id: surveyId } = useParams<{ id: string }>()

  // List state
  const [assessments, setAssessments] = useState<AssessmentResponse[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Groups and questions (needed for selectors in form)
  const [groups, setGroups] = useState<QuestionGroupResponse[]>([])
  const [questions, setQuestions] = useState<QuestionResponse[]>([])

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingAssessment, setEditingAssessment] = useState<AssessmentResponse | null>(null)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Delete confirmation state
  const [deletingAssessment, setDeletingAssessment] = useState<AssessmentResponse | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // ---------------------------------------------------------------------------
  // Load assessments
  // ---------------------------------------------------------------------------

  const loadAssessments = useCallback(async () => {
    if (!surveyId) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await assessmentService.listAssessments(surveyId, { page, per_page: PER_PAGE })
      setAssessments(data.items)
      setTotal(data.total)
      setTotalPages(data.total_pages ?? Math.max(1, Math.ceil(data.total / PER_PAGE)))
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to load assessments. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }, [surveyId, page])

  useEffect(() => {
    loadAssessments()
  }, [loadAssessments])

  // Load survey groups for the group selector
  useEffect(() => {
    if (!surveyId) return
    let cancelled = false
    surveyService.getSurvey(surveyId).then((survey) => {
      if (!cancelled) {
        setGroups(survey.groups)
        setQuestions(survey.questions)
      }
    }).catch(() => {
      // Non-critical — group/question selectors just won't have options
    })
    return () => { cancelled = true }
  }, [surveyId])

  // ---------------------------------------------------------------------------
  // Create / Edit
  // ---------------------------------------------------------------------------

  function openCreate() {
    setEditingAssessment(null)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(assessment: AssessmentResponse) {
    setEditingAssessment(assessment)
    setFormError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingAssessment(null)
    setFormError(null)
  }

  const handleFormSubmit = useCallback(
    async (data: AssessmentCreate) => {
      if (!surveyId) return
      setFormLoading(true)
      setFormError(null)
      try {
        if (editingAssessment) {
          await assessmentService.updateAssessment(surveyId, editingAssessment.id, data)
        } else {
          await assessmentService.createAssessment(surveyId, data)
        }
        closeForm()
        await loadAssessments()
      } catch (err) {
        if (err instanceof ApiError) {
          setFormError(err.message)
        } else {
          setFormError('Failed to save assessment. Please try again.')
        }
      } finally {
        setFormLoading(false)
      }
    },
    [surveyId, editingAssessment, loadAssessments],
  )

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  function openDelete(assessment: AssessmentResponse) {
    setDeletingAssessment(assessment)
    setDeleteError(null)
  }

  function closeDelete() {
    setDeletingAssessment(null)
    setDeleteError(null)
  }

  const handleDelete = useCallback(async () => {
    if (!surveyId || !deletingAssessment) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      await assessmentService.deleteAssessment(surveyId, deletingAssessment.id)
      closeDelete()
      // Go to previous page if last item on page was deleted
      if (assessments.length === 1 && page > 1) {
        setPage((p) => p - 1)
      } else {
        await loadAssessments()
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setDeleteError(err.message)
      } else {
        setDeleteError('Failed to delete assessment. Please try again.')
      }
    } finally {
      setDeleteLoading(false)
    }
  }, [surveyId, deletingAssessment, assessments.length, page, loadAssessments])

  // ---------------------------------------------------------------------------
  // Pagination helpers
  // ---------------------------------------------------------------------------

  function pageNumbers(): number[] {
    const pages: number[] = []
    const delta = 2
    const left = Math.max(1, page - delta)
    const right = Math.min(totalPages, page + delta)
    for (let i = left; i <= right; i++) pages.push(i)
    return pages
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-4xl mx-auto" data-testid="assessments-page">
      {/* Form modal */}
      {showForm && (
        <AssessmentForm
          surveyId={surveyId ?? ''}
          groups={groups}
          questions={questions}
          assessment={editingAssessment}
          onSubmit={handleFormSubmit}
          onCancel={closeForm}
          isLoading={formLoading}
          error={formError}
        />
      )}

      {/* Delete confirmation modal */}
      {deletingAssessment && (
        <ConfirmDeleteModal
          assessmentName={deletingAssessment.name}
          isLoading={deleteLoading}
          error={deleteError}
          onConfirm={handleDelete}
          onCancel={closeDelete}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/surveys/${surveyId}`)}
          aria-label="Back to survey"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={18} />
        </Button>
        <h1 className="text-2xl font-bold text-foreground flex-1">Assessment Configuration</h1>
        <Button onClick={openCreate} data-testid="create-assessment-button">
          <Plus size={16} />
          Create Assessment
        </Button>
      </div>

      {/* Global error */}
      {error && (
        <div className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md" role="alert">
          {error}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : assessments.length === 0 ? (
        <div
          className="text-center py-16 bg-card border border-border rounded-lg"
          data-testid="empty-state"
        >
          <p className="text-muted-foreground text-sm mb-4">
            No assessments have been configured for this survey.
          </p>
          <Button onClick={openCreate}>Create your first assessment</Button>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm" role="table">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Scope</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Score Range</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Message</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {assessments.map((assessment) => (
                  <tr
                    key={assessment.id}
                    className="bg-card hover:bg-muted/30 transition-colors"
                    data-testid={`assessment-row-${assessment.id}`}
                  >
                    <td className="px-4 py-3 font-medium text-foreground">{assessment.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="capitalize">
                        {assessment.scope}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {assessment.min_score} – {assessment.max_score}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                      {assessment.message}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {/* Edit */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(assessment)}
                          aria-label={`Edit ${assessment.name}`}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          data-testid={`assessment-edit-${assessment.id}`}
                        >
                          <Pencil size={15} />
                        </Button>

                        {/* Delete */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDelete(assessment)}
                          aria-label={`Delete ${assessment.name}`}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          data-testid={`assessment-delete-${assessment.id}`}
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

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
            <p className="text-sm text-muted-foreground" data-testid="pagination-info">
              Page {page} of {totalPages} &mdash; {total} assessment{total !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-1" aria-label="Pagination">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label="Previous page"
              >
                Prev
              </Button>
              {pageNumbers().map((n) => (
                <Button
                  key={n}
                  variant={n === page ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPage(n)}
                  aria-label={`Page ${n}`}
                  aria-current={n === page ? 'page' : undefined}
                >
                  {n}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                aria-label="Next page"
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default AssessmentsPage
