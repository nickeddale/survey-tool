/**
 * SurveyBuilderPage — three-panel layout for building/editing surveys.
 *
 * Layout:
 *   Left panel  – Question type palette (drag-to-add question types)
 *   Center panel – Survey canvas (groups and questions list)
 *   Right panel  – Property editor (fields for selected group or question)
 *
 * On mount: fetches the full survey via GET /api/v1/surveys/:id and loads it
 * into the builder Zustand store. Non-draft surveys are rendered read-only.
 */

import { useContext, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, UNSAFE_DataRouterContext } from 'react-router-dom'
import surveyService from '../services/surveyService'
import { useBuilderStore } from '../store/builderStore'
import { ApiError } from '../types/api'
import { Button } from '../components/ui/button'
import { BuilderToolbar } from '../components/survey-builder/BuilderToolbar'
import { BuilderSkeleton } from '../components/survey-builder/BuilderSkeleton'
import { QuestionPalette } from '../components/survey-builder/QuestionPalette'
import { SurveyCanvas } from '../components/survey-builder/SurveyCanvas'
import { PropertyEditor } from '../components/survey-builder/PropertyEditor'
import { NavigationBlocker } from '../components/survey-builder/NavigationBlocker'

function SurveyBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const {
    surveyId,
    status,
    selectedItem,
    isLoading,
    error,
    saveStatus,
    setSaveStatus,
    loadSurvey,
    setLoading,
    setError,
    setSelectedItem,
    undo,
    redo,
    undoStack,
    redoStack,
    isTranslationMode,
    setTranslationMode,
    groups,
    addQuestion,
  } = useBuilderStore()

  const readOnly = status !== '' && status !== 'draft'
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const undoRedoPendingRef = useRef(false)
  const hasUnsavedChanges = saveStatus === 'saving' || saveStatus === 'error'

  const QUESTION_TYPE_LABELS: Record<string, string> = {
    text: 'Short Text',
    textarea: 'Long Text',
    radio: 'Single Choice',
    checkbox: 'Multiple Choice',
    select: 'Dropdown',
    number: 'Number',
  }

  async function handlePaletteAddQuestion(questionType: string) {
    if (readOnly || !surveyId) return
    const sortedGroups = [...groups].sort((a, b) => a.sort_order - b.sort_order)
    const lastGroup = sortedGroups[sortedGroups.length - 1]
    if (!lastGroup) return
    const label = QUESTION_TYPE_LABELS[questionType] ?? 'New Question'
    try {
      const newQuestion = await surveyService.createQuestion(surveyId, lastGroup.id, {
        question_type: questionType,
        title: `New ${label}`,
      })
      addQuestion(lastGroup.id, {
        ...newQuestion,
        answer_options: newQuestion.answer_options ?? [],
        subquestions: [],
      })
    } catch {
      setSaveStatus('error', 'Failed to add question. Please try again.')
    }
  }

  // Undo/redo keyboard shortcuts: Ctrl+Z / Cmd+Z and Ctrl+Shift+Z / Cmd+Shift+Z
  useEffect(() => {
    if (readOnly) return

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }
      const isMeta = e.metaKey || e.ctrlKey
      if (isMeta && e.shiftKey && e.key === 'z') {
        e.preventDefault()
        if (redoStack.length > 0) { undoRedoPendingRef.current = true; redo() }
      } else if (isMeta && !e.shiftKey && e.key === 'z') {
        e.preventDefault()
        if (undoStack.length > 0) { undoRedoPendingRef.current = true; undo() }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [readOnly, undo, redo, undoStack.length, redoStack.length])

  // Auto-save after undo/redo: resolve 'saving' status set by store actions
  useEffect(() => {
    if (saveStatus === 'saving' && undoRedoPendingRef.current) {
      undoRedoPendingRef.current = false
      setSaveStatus('saved')
    }
  }, [saveStatus, setSaveStatus])

  const dataRouterContext = useContext(UNSAFE_DataRouterContext)

  // Block browser close / tab refresh when there are unsaved changes
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (hasUnsavedChanges) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  // Fetch survey on mount
  useEffect(() => {
    if (!id) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await surveyService.getSurvey(id!)
        if (!cancelled) loadSurvey(data)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load survey. Please try again.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <BuilderSkeleton />

  if (error || !surveyId) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4" data-testid="builder-error">
        <div className="p-4 text-sm text-destructive bg-destructive/10 rounded-md max-w-md text-center" role="alert">
          {error ?? 'Failed to load survey.'}
        </div>
        <Button variant="outline" onClick={() => navigate('/surveys')}>Back to Surveys</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden" data-testid="survey-builder-page">
      <BuilderToolbar
        surveyId={surveyId ?? ''}
        isPreviewMode={isPreviewMode}
        onTogglePreview={() => setIsPreviewMode((prev) => !prev)}
        isTranslationMode={isTranslationMode}
        onToggleTranslation={() => setTranslationMode(!isTranslationMode)}
        readOnly={readOnly}
        undoRedoPendingRef={undoRedoPendingRef}
      />
      <div className="flex flex-1 overflow-hidden">
        <QuestionPalette readOnly={readOnly} onAddQuestion={handlePaletteAddQuestion} />
        <SurveyCanvas
          surveyId={surveyId ?? ''}
          readOnly={readOnly}
          selectedItem={selectedItem}
          onSelectItem={setSelectedItem}
          isPreviewMode={isPreviewMode}
        />
        <PropertyEditor surveyId={surveyId ?? ''} readOnly={readOnly} selectedItem={selectedItem} />
      </div>
      {dataRouterContext && !readOnly && (
        <NavigationBlocker shouldBlock={hasUnsavedChanges} />
      )}
    </div>
  )
}

export default SurveyBuilderPage
