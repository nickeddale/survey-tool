import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Copy, Download, Trash2, ChevronRight, ChevronDown, List } from 'lucide-react'
import surveyService from '../services/surveyService'
import type { SurveyFullResponse, QuestionGroupResponse, QuestionResponse } from '../types/survey'
import { ApiError } from '../types/api'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-green-100 text-green-800',
  closed: 'bg-yellow-100 text-yellow-800',
  archived: 'bg-red-100 text-red-800',
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  zh: 'Chinese',
  ja: 'Japanese',
  ar: 'Arabic',
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
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

function LoadingSkeleton() {
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

interface ConfirmModalProps {
  title: string
  message: string
  confirmLabel: string
  confirmVariant?: 'danger' | 'primary'
  isLoading?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmModal({
  title,
  message,
  confirmLabel,
  confirmVariant = 'primary',
  isLoading,
  error,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      data-testid="confirm-modal"
    >
      <Card className="max-w-md w-full mx-4 shadow-lg">
        <CardContent className="p-6">
          <h2 id="modal-title" className="text-lg font-semibold text-foreground mb-2">
            {title}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">{message}</p>
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
              variant={confirmVariant === 'danger' ? 'destructive' : 'default'}
              onClick={onConfirm}
              disabled={isLoading}
              data-testid="confirm-button"
            >
              {isLoading ? 'Please wait...' : confirmLabel}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Question tree view
// ---------------------------------------------------------------------------

function AnswerOptionItem({ code, title }: { code: string; title: string }) {
  return (
    <div className="flex items-center gap-2 py-1 pl-4">
      <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{code}</span>
      <span className="text-sm text-foreground">{title}</span>
    </div>
  )
}

function QuestionItem({ question }: { question: QuestionResponse }) {
  const [expanded, setExpanded] = useState(true)
  const hasOptions = question.answer_options.length > 0
  const hasSubquestions = question.subquestions.length > 0

  return (
    <div className="border border-border rounded-md bg-card" data-testid={`question-item-${question.id}`}>
      <div
        className="flex items-start gap-2 p-3 cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}
        role="button"
        aria-expanded={expanded}
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((prev) => !prev)}
      >
        <div className="mt-0.5 text-muted-foreground">
          {hasOptions || hasSubquestions ? (
            expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span className="inline-block w-3.5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {question.code}
            </span>
            <span className="text-sm font-medium text-foreground">{question.title}</span>
            <span className="text-xs text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
              {question.question_type}
            </span>
            {question.is_required && (
              <span className="text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">required</span>
            )}
          </div>
          {question.description && (
            <p className="mt-1 text-xs text-muted-foreground">{question.description}</p>
          )}
        </div>
      </div>
      {expanded && (hasOptions || hasSubquestions) && (
        <div className="border-t border-border px-3 pb-2 pt-2 space-y-1">
          {hasOptions &&
            question.answer_options.map((opt) => (
              <AnswerOptionItem key={opt.id} code={opt.code} title={opt.title} />
            ))}
          {hasSubquestions &&
            question.subquestions.map((sub) => <QuestionItem key={sub.id} question={sub} />)}
        </div>
      )}
    </div>
  )
}

function GroupItem({ group }: { group: QuestionGroupResponse }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div
      className="border border-border rounded-lg bg-card/50"
      data-testid={`group-item-${group.id}`}
    >
      <div
        className="flex items-center gap-2 p-4 cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}
        role="button"
        aria-expanded={expanded}
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((prev) => !prev)}
      >
        {expanded ? (
          <ChevronDown size={16} className="text-muted-foreground" />
        ) : (
          <ChevronRight size={16} className="text-muted-foreground" />
        )}
        <h3 className="font-medium text-foreground">{group.title}</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {group.questions.length} question{group.questions.length !== 1 ? 's' : ''}
        </span>
      </div>
      {expanded && group.questions.length > 0 && (
        <div className="px-4 pb-4 space-y-2">
          {group.questions.map((q) => (
            <QuestionItem key={q.id} question={q} />
          ))}
        </div>
      )}
      {expanded && group.questions.length === 0 && (
        <div className="px-4 pb-4">
          <p className="text-sm text-muted-foreground italic">No questions in this group.</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal state type
// ---------------------------------------------------------------------------

type ModalType = 'activate' | 'close' | 'archive' | 'delete' | 'clone' | null

// ---------------------------------------------------------------------------
// SurveyDetailPage
// ---------------------------------------------------------------------------

function SurveyDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()

  const [survey, setSurvey] = useState<SurveyFullResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  const [activeModal, setActiveModal] = useState<ModalType>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  // ---------------------------------------------------------------------------
  // Load survey
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!id) return
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError(null)
      try {
        const data = await surveyService.getSurvey(id!)
        if (!cancelled) setSurvey(data)
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError && err.status === 404) {
            setNotFound(true)
          } else if (err instanceof ApiError) {
            setError(err.message)
          } else {
            setError('Failed to load survey. Please try again.')
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
  }, [id])

  // ---------------------------------------------------------------------------
  // Modal actions
  // ---------------------------------------------------------------------------

  function openModal(type: ModalType) {
    setModalError(null)
    setActiveModal(type)
  }

  function closeModal() {
    setActiveModal(null)
    setModalError(null)
  }

  const handleActivate = useCallback(async () => {
    if (!survey) return
    setModalLoading(true)
    setModalError(null)
    try {
      const updated = await surveyService.activateSurvey(survey.id)
      setSurvey((prev) => (prev ? { ...prev, ...updated } : prev))
      closeModal()
    } catch (err) {
      if (err instanceof ApiError) {
        setModalError(err.message)
      } else {
        setModalError('Failed to activate survey. Please try again.')
      }
    } finally {
      setModalLoading(false)
    }
  }, [survey])

  const handleClose = useCallback(async () => {
    if (!survey) return
    setModalLoading(true)
    setModalError(null)
    try {
      const updated = await surveyService.closeSurvey(survey.id)
      setSurvey((prev) => (prev ? { ...prev, ...updated } : prev))
      closeModal()
    } catch (err) {
      if (err instanceof ApiError) {
        setModalError(err.message)
      } else {
        setModalError('Failed to close survey. Please try again.')
      }
    } finally {
      setModalLoading(false)
    }
  }, [survey])

  const handleArchive = useCallback(async () => {
    if (!survey) return
    setModalLoading(true)
    setModalError(null)
    try {
      const updated = await surveyService.archiveSurvey(survey.id)
      setSurvey((prev) => (prev ? { ...prev, ...updated } : prev))
      closeModal()
    } catch (err) {
      if (err instanceof ApiError) {
        setModalError(err.message)
      } else {
        setModalError('Failed to archive survey. Please try again.')
      }
    } finally {
      setModalLoading(false)
    }
  }, [survey])

  const handleDelete = useCallback(async () => {
    if (!survey) return
    setModalLoading(true)
    setModalError(null)
    try {
      await surveyService.deleteSurvey(survey.id)
      navigate('/surveys')
    } catch (err) {
      if (err instanceof ApiError) {
        setModalError(err.message)
      } else {
        setModalError('Failed to delete survey. Please try again.')
      }
      setModalLoading(false)
    }
  }, [survey, navigate])

  const handleClone = useCallback(async () => {
    if (!survey) return
    setModalLoading(true)
    setModalError(null)
    try {
      const cloned = await surveyService.cloneSurvey(survey.id)
      navigate(`/surveys/${cloned.id}`)
    } catch (err) {
      if (err instanceof ApiError) {
        setModalError(err.message)
      } else {
        setModalError('Failed to clone survey. Please try again.')
      }
      setModalLoading(false)
    }
  }, [survey, navigate])

  const handleExport = useCallback(async () => {
    if (!survey) return
    try {
      const blob = await surveyService.exportSurvey(survey.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${survey.title.replace(/\s+/g, '_')}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to export survey. Please try again.')
      }
    }
  }, [survey])

  // ---------------------------------------------------------------------------
  // Modal confirm dispatch
  // ---------------------------------------------------------------------------

  function handleModalConfirm() {
    if (activeModal === 'activate') handleActivate()
    else if (activeModal === 'close') handleClose()
    else if (activeModal === 'archive') handleArchive()
    else if (activeModal === 'delete') handleDelete()
    else if (activeModal === 'clone') handleClone()
  }

  // ---------------------------------------------------------------------------
  // Modal config
  // ---------------------------------------------------------------------------

  function getModalConfig(): { title: string; message: string; confirmLabel: string; confirmVariant?: 'danger' | 'primary' } | null {
    if (!survey) return null
    if (activeModal === 'activate') {
      return {
        title: 'Activate Survey',
        message: `Are you sure you want to activate "${survey.title}"? Respondents will be able to submit responses once the survey is active.`,
        confirmLabel: 'Activate',
        confirmVariant: 'primary',
      }
    }
    if (activeModal === 'close') {
      return {
        title: 'Close Survey',
        message: `Are you sure you want to close "${survey.title}"? No new responses will be accepted after closing.`,
        confirmLabel: 'Close Survey',
        confirmVariant: 'danger',
      }
    }
    if (activeModal === 'archive') {
      return {
        title: 'Archive Survey',
        message: `Are you sure you want to archive "${survey.title}"? The survey will be hidden from the main list.`,
        confirmLabel: 'Archive',
        confirmVariant: 'danger',
      }
    }
    if (activeModal === 'delete') {
      return {
        title: 'Delete Survey',
        message: `Are you sure you want to delete "${survey.title}"? This action cannot be undone.`,
        confirmLabel: 'Delete',
        confirmVariant: 'danger',
      }
    }
    if (activeModal === 'clone') {
      return {
        title: 'Clone Survey',
        message: `Create a copy of "${survey.title}"? The new survey will be created as a draft.`,
        confirmLabel: 'Clone',
        confirmVariant: 'primary',
      }
    }
    return null
  }

  const modalConfig = getModalConfig()

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
        <Card data-testid="survey-not-found">
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold text-foreground mb-2">Survey Not Found</h2>
            <p className="text-muted-foreground text-sm mb-4">
              The survey you are looking for does not exist or has been deleted.
            </p>
            <Button onClick={() => navigate('/surveys')}>
              Back to Surveys
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: error
  // ---------------------------------------------------------------------------

  if (!survey) {
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

  const formattedDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

  const totalQuestions = survey.groups.reduce((sum, g) => sum + g.questions.length, 0)

  return (
    <div className="max-w-4xl mx-auto" data-testid="survey-detail-page">
      {/* Confirm modal */}
      {activeModal && modalConfig && (
        <ConfirmModal
          title={modalConfig.title}
          message={modalConfig.message}
          confirmLabel={modalConfig.confirmLabel}
          confirmVariant={modalConfig.confirmVariant}
          isLoading={modalLoading}
          error={modalError}
          onConfirm={handleModalConfirm}
          onCancel={closeModal}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/surveys')}
          aria-label="Back to surveys"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-foreground truncate">{survey.title}</h1>
        </div>
        <StatusBadge status={survey.status} />
      </div>

      {/* Global error alert */}
      {error && (
        <div className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md" role="alert">
          {error}
        </div>
      )}

      {/* Action buttons row */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {/* Status transition actions */}
        {survey.status === 'draft' && (
          <Button
            onClick={() => openModal('activate')}
            className="bg-green-600 text-white hover:bg-green-700"
            data-testid="activate-button"
          >
            Activate
          </Button>
        )}
        {survey.status === 'active' && (
          <Button
            onClick={() => openModal('close')}
            className="bg-yellow-600 text-white hover:bg-yellow-700"
            data-testid="close-button"
          >
            Close
          </Button>
        )}
        {survey.status === 'closed' && (
          <Button
            variant="destructive"
            onClick={() => openModal('archive')}
            data-testid="archive-button"
          >
            Archive
          </Button>
        )}

        <div className="flex-1" />

        {/* View Responses */}
        <Button
          variant="outline"
          onClick={() => navigate(`/surveys/${survey.id}/responses`)}
          aria-label="View responses"
          data-testid="view-responses-button"
        >
          <List size={14} />
          Responses
        </Button>

        {/* Always-available actions */}
        {survey.status === 'draft' && (
          <Button
            variant="outline"
            onClick={() => navigate(`/surveys/${survey.id}/edit`)}
            aria-label="Edit survey"
            data-testid="edit-button"
          >
            <Pencil size={14} />
            Edit
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => openModal('clone')}
          aria-label="Clone survey"
          data-testid="clone-button"
        >
          <Copy size={14} />
          Clone
        </Button>
        <Button
          variant="outline"
          onClick={handleExport}
          aria-label="Export survey"
          data-testid="export-button"
        >
          <Download size={14} />
          Export
        </Button>
        <Button
          variant="outline"
          onClick={() => openModal('delete')}
          aria-label="Delete survey"
          className="border-destructive/30 text-destructive hover:bg-destructive/10"
          data-testid="delete-button"
        >
          <Trash2 size={14} />
          Delete
        </Button>
      </div>

      {/* Metadata card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Survey Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {survey.description && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Description</p>
              <p className="text-sm text-foreground">{survey.description}</p>
            </div>
          )}

          {survey.welcome_message && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Welcome Message</p>
              <p className="text-sm text-foreground">{survey.welcome_message}</p>
            </div>
          )}

          {survey.end_message && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">End Message</p>
              <p className="text-sm text-foreground">{survey.end_message}</p>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Language</p>
              <p className="text-sm text-foreground">
                {LANGUAGE_LABELS[survey.default_language] ?? survey.default_language}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Questions</p>
              <p className="text-sm text-foreground">{totalQuestions}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Created</p>
              <p className="text-sm text-foreground">{formattedDate(survey.created_at)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Last Updated</p>
              <p className="text-sm text-foreground">{formattedDate(survey.updated_at)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Question groups tree */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">
          Question Groups
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({survey.groups.length} group{survey.groups.length !== 1 ? 's' : ''})
          </span>
        </h2>

        {survey.groups.length === 0 ? (
          <Card data-testid="no-groups-state">
            <CardContent className="text-center py-10">
              <p className="text-muted-foreground text-sm">No question groups have been added to this survey.</p>
              {survey.status === 'draft' && (
                <Button
                  className="mt-3"
                  onClick={() => navigate(`/surveys/${survey.id}/edit`)}
                >
                  Edit Survey
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3" data-testid="groups-tree">
            {survey.groups.map((group) => (
              <GroupItem key={group.id} group={group} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default SurveyDetailPage
