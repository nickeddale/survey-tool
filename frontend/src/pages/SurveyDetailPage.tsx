import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import surveyService from '../services/surveyService'
import type { SurveyFullResponse } from '../types/survey'
import { ApiError } from '../types/api'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import {
  StatusBadge,
  LoadingSkeleton,
  ConfirmModal,
  GroupItem,
  SurveyHeader,
  SurveyActions,
  SurveyMetaCard,
  getModalConfig,
} from '../components/survey-detail'
import type { ModalType } from '../components/survey-detail'

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
          if (err instanceof ApiError && err.status === 404) setNotFound(true)
          else if (err instanceof ApiError) setError(err.message)
          else setError('Failed to load survey. Please try again.')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  function openModal(type: ModalType) { setModalError(null); setActiveModal(type) }
  function closeModal() { setActiveModal(null); setModalError(null) }

  const handleActivate = useCallback(async () => {
    if (!survey) return
    setModalLoading(true); setModalError(null)
    try {
      const updated = await surveyService.activateSurvey(survey.id)
      setSurvey((prev) => (prev ? { ...prev, ...updated } : prev))
      closeModal()
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : 'Failed to activate survey. Please try again.')
    } finally { setModalLoading(false) }
  }, [survey])

  const handleClose = useCallback(async () => {
    if (!survey) return
    setModalLoading(true); setModalError(null)
    try {
      const updated = await surveyService.closeSurvey(survey.id)
      setSurvey((prev) => (prev ? { ...prev, ...updated } : prev))
      closeModal()
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : 'Failed to close survey. Please try again.')
    } finally { setModalLoading(false) }
  }, [survey])

  const handleArchive = useCallback(async () => {
    if (!survey) return
    setModalLoading(true); setModalError(null)
    try {
      const updated = await surveyService.archiveSurvey(survey.id)
      setSurvey((prev) => (prev ? { ...prev, ...updated } : prev))
      closeModal()
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : 'Failed to archive survey. Please try again.')
    } finally { setModalLoading(false) }
  }, [survey])

  const handleDelete = useCallback(async () => {
    if (!survey) return
    setModalLoading(true); setModalError(null)
    try {
      await surveyService.deleteSurvey(survey.id)
      navigate('/surveys')
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : 'Failed to delete survey. Please try again.')
      setModalLoading(false)
    }
  }, [survey, navigate])

  const handleClone = useCallback(async () => {
    if (!survey) return
    setModalLoading(true); setModalError(null)
    try {
      const cloned = await surveyService.cloneSurvey(survey.id)
      closeModal()
      navigate(`/surveys/${cloned.id}`)
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : 'Failed to clone survey. Please try again.')
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
      setError(err instanceof ApiError ? err.message : 'Failed to export survey. Please try again.')
    }
  }, [survey])

  function handleModalConfirm() {
    if (activeModal === 'activate') handleActivate()
    else if (activeModal === 'close') handleClose()
    else if (activeModal === 'archive') handleArchive()
    else if (activeModal === 'delete') handleDelete()
    else if (activeModal === 'clone') handleClone()
  }

  if (isLoading) return <div className="max-w-4xl mx-auto"><LoadingSkeleton /></div>

  if (notFound) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card data-testid="survey-not-found">
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold text-foreground mb-2">Survey Not Found</h2>
            <p className="text-muted-foreground text-sm mb-4">
              The survey you are looking for does not exist or has been deleted.
            </p>
            <Button onClick={() => navigate('/surveys')}>Back to Surveys</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!survey) {
    return (
      <div className="max-w-2xl mx-auto">
        {error && <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md" role="alert">{error}</div>}
      </div>
    )
  }

  const modalConfig = getModalConfig(activeModal, survey.title)
  const totalQuestions = survey.groups.reduce((sum, g) => sum + g.questions.length, 0)

  return (
    <div className="max-w-4xl mx-auto" data-testid="survey-detail-page">
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

      <SurveyHeader
        title={survey.title}
        onBack={() => navigate('/surveys')}
        statusBadge={<StatusBadge status={survey.status} />}
      />

      {error && (
        <div className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md" role="alert">{error}</div>
      )}

      <SurveyActions
        surveyId={survey.id}
        surveyStatus={survey.status}
        onNavigate={navigate}
        onOpenModal={openModal}
        onExport={handleExport}
        onBack={() => navigate('/surveys')}
      />

      <SurveyMetaCard
        description={survey.description}
        welcomeMessage={survey.welcome_message}
        endMessage={survey.end_message}
        defaultLanguage={survey.default_language}
        totalQuestions={totalQuestions}
        createdAt={survey.created_at}
        updatedAt={survey.updated_at}
      />

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
                <Button className="mt-3" onClick={() => navigate(`/surveys/${survey.id}/edit`)}>
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
