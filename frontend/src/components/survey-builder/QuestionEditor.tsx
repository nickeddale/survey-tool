/**
 * QuestionEditor — right-panel property editor for survey builder.
 *
 * When a question is selected, displays editable fields and saves changes
 * to the builder store on every change, debouncing PATCH calls (500ms).
 * When no question is selected, shows a prompt to select one.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useBuilderStore } from '../../store/builderStore'
import surveyService from '../../services/surveyService'
import type { BuilderQuestion } from '../../store/builderStore'
import { QuestionSettingsForm } from './settings/QuestionSettingsForm'
import { AnswerOptionsEditor } from './AnswerOptionsEditor'
import { LogicEditor } from './LogicEditor'
import {
  getDefaultSettings,
  getCompatibleSettings,
} from '../../types/questionSettings'
import type { QuestionSettings } from '../../types/questionSettings'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUESTION_TYPE_OPTIONS = [
  // Text types
  { value: 'short_text', label: 'Short Text' },
  { value: 'long_text', label: 'Long Text' },
  { value: 'huge_text', label: 'Huge Text' },
  // Choice types
  { value: 'single_choice', label: 'Single Choice (Radio)' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'multiple_choice', label: 'Multiple Choice (Checkbox)' },
  { value: 'ranking', label: 'Ranking' },
  { value: 'image_picker', label: 'Image Picker' },
  // Matrix types
  { value: 'matrix', label: 'Matrix' },
  { value: 'matrix_dropdown', label: 'Matrix Dropdown' },
  { value: 'matrix_dynamic', label: 'Matrix Dynamic' },
  // Scalar types
  { value: 'numeric', label: 'Numeric' },
  { value: 'rating', label: 'Rating' },
  { value: 'boolean', label: 'Yes/No (Boolean)' },
  { value: 'date', label: 'Date' },
  // Special types
  { value: 'file_upload', label: 'File Upload' },
  { value: 'expression', label: 'Expression' },
  { value: 'html', label: 'HTML Content' },
]

// Types that have answer options — changing away from these loses options data
const CHOICE_TYPES = new Set(['single_choice', 'multiple_choice', 'dropdown', 'ranking', 'image_picker'])

function isIncompatibleTypeChange(from: string, to: string): boolean {
  return CHOICE_TYPES.has(from) !== CHOICE_TYPES.has(to)
}

// Auto-generate a code from a title: uppercase letters/numbers, collapse spaces to underscores
function generateCode(title: string): string {
  return title
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 20) || 'Q'
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuestionEditorProps {
  surveyId: string
  readOnly?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuestionEditor({ surveyId, readOnly = false }: QuestionEditorProps) {
  const selectedItem = useBuilderStore((s) => s.selectedItem)
  const groups = useBuilderStore((s) => s.groups)
  const updateQuestion = useBuilderStore((s) => s.updateQuestion)
  const setSaveStatus = useBuilderStore((s) => s.setSaveStatus)

  // Find selected question and its group
  const selectedGroup = selectedItem?.type === 'question'
    ? groups.find((g) => g.questions.some((q) => q.id === selectedItem.id)) ?? null
    : null

  const selectedQuestion: BuilderQuestion | null = selectedItem?.type === 'question'
    ? (selectedGroup?.questions.find((q) => q.id === selectedItem.id) ?? null)
    : null

  // -------------------------------------------------------------------------
  // Local form state (controlled)
  // -------------------------------------------------------------------------

  const [title, setTitle] = useState('')
  const [code, setCode] = useState('')
  const [codeIsCustom, setCodeIsCustom] = useState(false)
  const [questionType, setQuestionType] = useState('short_text')
  const [description, setDescription] = useState('')
  const [isRequired, setIsRequired] = useState(false)
  const [relevance, setRelevance] = useState('')
  const [validationJson, setValidationJson] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  // Type-specific settings (JSONB)
  const [settingsJson, setSettingsJson] = useState<QuestionSettings>(() =>
    getDefaultSettings('short_text'),
  )

  // Settings section expand/collapse state (local UI only — not persisted)
  const [settingsExpanded, setSettingsExpanded] = useState(true)

  // Incompatible type change warning
  const [pendingType, setPendingType] = useState<string | null>(null)

  // Track current question ID to detect selection change
  const currentQuestionIdRef = useRef<string | null>(null)

  // Debounce timer ref
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  // Sync form state when selected question changes
  useEffect(() => {
    if (!selectedQuestion) {
      currentQuestionIdRef.current = null
      return
    }

    if (selectedQuestion.id !== currentQuestionIdRef.current) {
      currentQuestionIdRef.current = selectedQuestion.id
      setTitle(selectedQuestion.title)
      setCode(selectedQuestion.code)
      // Treat as custom if code doesn't match auto-generated form
      setCodeIsCustom(selectedQuestion.code !== generateCode(selectedQuestion.title))
      setQuestionType(selectedQuestion.question_type)
      setDescription(selectedQuestion.description ?? '')
      setIsRequired(selectedQuestion.is_required)
      setRelevance(selectedQuestion.relevance ?? '')
      setValidationJson(
        selectedQuestion.validation ? JSON.stringify(selectedQuestion.validation, null, 2) : '',
      )
      setValidationError(null)
      setPendingType(null)

      // Initialize settings from question, null-coalescing with defaults
      const initialSettings = (selectedQuestion.settings as QuestionSettings | null) ??
        getDefaultSettings(selectedQuestion.question_type)
      setSettingsJson(initialSettings)

      // Cancel any pending debounce from previous question
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [selectedQuestion])

  // -------------------------------------------------------------------------
  // Debounced PATCH helper
  // -------------------------------------------------------------------------

  const schedulePatch = useCallback(
    (groupId: string, questionId: string, updates: Record<string, unknown>) => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current)
      }
      setSaveStatus('saving')
      debounceTimerRef.current = setTimeout(async () => {
        debounceTimerRef.current = null
        try {
          await surveyService.updateQuestion(surveyId, groupId, questionId, updates)
          setSaveStatus('saved')
        } catch {
          setSaveStatus('error', 'Failed to save changes. Please try again.')
        }
      }, 500)
    },
    [surveyId, setSaveStatus],
  )

  // -------------------------------------------------------------------------
  // Field change handlers
  // -------------------------------------------------------------------------

  function handleTitleChange(value: string) {
    if (!selectedGroup || !selectedQuestion) return
    setTitle(value)
    const newCode = codeIsCustom ? code : generateCode(value)
    if (!codeIsCustom) {
      setCode(newCode)
    }
    updateQuestion(selectedGroup.id, selectedQuestion.id, {
      title: value,
      ...(codeIsCustom ? {} : { code: newCode }),
    })
    schedulePatch(selectedGroup.id, selectedQuestion.id, {
      title: value,
      ...(codeIsCustom ? {} : { code: newCode }),
    })
  }

  function handleCodeChange(value: string) {
    if (!selectedGroup || !selectedQuestion) return
    setCode(value)
    setCodeIsCustom(true)
    updateQuestion(selectedGroup.id, selectedQuestion.id, { code: value })
    schedulePatch(selectedGroup.id, selectedQuestion.id, { code: value })
  }

  function handleAutoCodeToggle() {
    if (!selectedGroup || !selectedQuestion) return
    if (codeIsCustom) {
      // Reset to auto-generated
      const autoCode = generateCode(title)
      setCode(autoCode)
      setCodeIsCustom(false)
      updateQuestion(selectedGroup.id, selectedQuestion.id, { code: autoCode })
      schedulePatch(selectedGroup.id, selectedQuestion.id, { code: autoCode })
    } else {
      setCodeIsCustom(true)
    }
  }

  function handleTypeChange(newType: string) {
    if (!selectedGroup || !selectedQuestion) return
    if (isIncompatibleTypeChange(questionType, newType)) {
      setPendingType(newType)
    } else {
      applyTypeChange(newType)
    }
  }

  function applyTypeChange(newType: string) {
    if (!selectedGroup || !selectedQuestion) return

    // Snapshot current settings BEFORE state mutation (avoid stale closure)
    const currentSettings = settingsJson as unknown as Record<string, unknown>
    const compatibleSettings = getCompatibleSettings(questionType, newType, currentSettings)

    setQuestionType(newType)
    setPendingType(null)
    setSettingsJson(compatibleSettings as unknown as QuestionSettings)

    updateQuestion(selectedGroup.id, selectedQuestion.id, {
      question_type: newType,
      settings: compatibleSettings as unknown as QuestionSettings,
    })
    schedulePatch(selectedGroup.id, selectedQuestion.id, {
      question_type: newType,
      settings: compatibleSettings,
    })
  }

  function handleDescriptionChange(value: string) {
    if (!selectedGroup || !selectedQuestion) return
    setDescription(value)
    updateQuestion(selectedGroup.id, selectedQuestion.id, { description: value || null })
    schedulePatch(selectedGroup.id, selectedQuestion.id, { description: value || null })
  }

  function handleRequiredChange(checked: boolean) {
    if (!selectedGroup || !selectedQuestion) return
    setIsRequired(checked)
    updateQuestion(selectedGroup.id, selectedQuestion.id, { is_required: checked })
    schedulePatch(selectedGroup.id, selectedQuestion.id, { is_required: checked })
  }

  function handleRelevanceChange(value: string) {
    if (!selectedGroup || !selectedQuestion) return
    setRelevance(value)
    updateQuestion(selectedGroup.id, selectedQuestion.id, { relevance: value || null })
    schedulePatch(selectedGroup.id, selectedQuestion.id, { relevance: value || null })
  }

  function handleValidationChange(value: string) {
    if (!selectedGroup || !selectedQuestion) return
    setValidationJson(value)
    if (value === '') {
      setValidationError(null)
      updateQuestion(selectedGroup.id, selectedQuestion.id, { validation: null })
      schedulePatch(selectedGroup.id, selectedQuestion.id, { validation: null })
      return
    }
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>
      setValidationError(null)
      updateQuestion(selectedGroup.id, selectedQuestion.id, { validation: parsed })
      schedulePatch(selectedGroup.id, selectedQuestion.id, { validation: parsed })
    } catch {
      setValidationError('Invalid JSON')
    }
  }

  function handleSettingsChange(updates: Partial<Record<string, unknown>>) {
    if (!selectedGroup || !selectedQuestion) return

    const newSettings = { ...(settingsJson as unknown as Record<string, unknown>), ...updates } as unknown as QuestionSettings
    setSettingsJson(newSettings)
    updateQuestion(selectedGroup.id, selectedQuestion.id, { settings: newSettings })
    schedulePatch(selectedGroup.id, selectedQuestion.id, { settings: newSettings })
  }

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  if (!selectedQuestion || !selectedGroup) {
    return (
      <div
        className="flex-1 flex items-center justify-center p-4"
        data-testid="question-editor-empty"
      >
        <p className="text-xs text-muted-foreground text-center">
          Select a question to edit its properties.
        </p>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render: question editor form
  // -------------------------------------------------------------------------

  return (
    <div className="p-3 space-y-3" data-testid="question-properties">
      {/* Incompatible type change warning dialog */}
      {pendingType && (
        <div
          className="p-3 rounded-md border border-amber-300 bg-amber-50 space-y-2"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm question type change"
          data-testid="type-change-warning"
        >
          <p className="text-xs font-medium text-amber-800">
            Changing the question type may cause answer options to be lost.
          </p>
          <p className="text-xs text-amber-700">
            Switching from &ldquo;{questionType}&rdquo; to &ldquo;{pendingType}&rdquo; is incompatible.
            Do you want to continue?
          </p>
          <div className="flex gap-2">
            <button
              className="px-2 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => applyTypeChange(pendingType)}
              data-testid="type-change-confirm"
            >
              Change type
            </button>
            <button
              className="px-2 py-1 text-xs rounded border border-border hover:bg-muted"
              onClick={() => setPendingType(null)}
              data-testid="type-change-cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Title */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1">Question Title</p>
        <textarea
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm
            focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed
            resize-none"
          rows={3}
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          disabled={readOnly}
          aria-label="Question title"
          data-testid="property-question-title"
        />
      </div>

      {/* Code */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-medium text-muted-foreground">Code</p>
          {!readOnly && (
            <button
              className="text-xs text-primary hover:underline"
              onClick={handleAutoCodeToggle}
              data-testid="code-auto-toggle"
            >
              {codeIsCustom ? 'Reset to auto' : 'Customize'}
            </button>
          )}
        </div>
        <input
          type="text"
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm font-mono
            focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
          value={code}
          onChange={(e) => handleCodeChange(e.target.value)}
          disabled={readOnly || !codeIsCustom}
          aria-label="Question code"
          data-testid="property-question-code"
        />
        {!codeIsCustom && (
          <p className="text-xs text-muted-foreground mt-0.5">Auto-generated from title</p>
        )}
      </div>

      {/* Question Type */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1">Question Type</p>
        <select
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm
            focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
          value={pendingType ?? questionType}
          onChange={(e) => handleTypeChange(e.target.value)}
          disabled={readOnly}
          aria-label="Question type"
          data-testid="property-question-type"
        >
          {QUESTION_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1">Description / Help Text</p>
        <textarea
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm
            focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed
            resize-none"
          rows={2}
          value={description}
          onChange={(e) => handleDescriptionChange(e.target.value)}
          disabled={readOnly}
          aria-label="Question description"
          data-testid="property-question-description"
        />
      </div>

      {/* Required toggle */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="prop-required"
          checked={isRequired}
          onChange={(e) => handleRequiredChange(e.target.checked)}
          disabled={readOnly}
          data-testid="property-question-required"
        />
        <label htmlFor="prop-required" className="text-sm">Required</label>
      </div>

      {/* Relevance expression */}
      <div data-testid="property-question-relevance">
        <p className="text-xs font-medium text-muted-foreground mb-1">Show this question IF</p>
        <LogicEditor
          surveyId={surveyId}
          currentSortOrder={selectedQuestion.sort_order}
          previousQuestions={groups.flatMap((g) => g.questions) as BuilderQuestion[]}
          value={relevance}
          onChange={handleRelevanceChange}
          disabled={readOnly}
        />
      </div>

      {/* Validation JSON */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1">Validation (JSON)</p>
        <textarea
          className={`w-full rounded-md border px-2 py-1.5 text-sm font-mono
            focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed
            resize-none ${validationError ? 'border-destructive' : 'border-input'} bg-background`}
          rows={3}
          value={validationJson}
          onChange={(e) => handleValidationChange(e.target.value)}
          disabled={readOnly}
          aria-label="Validation JSON"
          placeholder='e.g. {"min": 1, "max": 100}'
          data-testid="property-question-validation"
        />
        {validationError && (
          <p
            className="text-xs text-destructive mt-0.5"
            role="alert"
            data-testid="validation-json-error"
          >
            {validationError}
          </p>
        )}
      </div>

      {/* Type Settings collapsible section */}
      <div
        className="rounded-md border border-border"
        data-testid="type-settings-section"
      >
        <button
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground
            hover:bg-muted/50 rounded-md transition-colors"
          onClick={() => setSettingsExpanded((prev) => !prev)}
          aria-expanded={settingsExpanded}
          data-testid="type-settings-toggle"
        >
          <span>Type Settings</span>
          <span className="text-muted-foreground">{settingsExpanded ? '▲' : '▼'}</span>
        </button>
        {settingsExpanded && (
          <div className="px-3 pb-3 pt-1">
            <QuestionSettingsForm
              type={questionType}
              settings={settingsJson}
              onChange={handleSettingsChange}
              readOnly={readOnly}
            />
          </div>
        )}
      </div>

      {/* Answer options editor */}
      <AnswerOptionsEditor
        surveyId={surveyId}
        groupId={selectedGroup.id}
        questionId={selectedQuestion.id}
        questionType={questionType}
        options={selectedQuestion.answer_options}
        readOnly={readOnly}
      />
    </div>
  )
}

export default QuestionEditor
