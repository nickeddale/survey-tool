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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUESTION_TYPE_OPTIONS = [
  { value: 'text', label: 'Short Text' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'radio', label: 'Single Choice' },
  { value: 'checkbox', label: 'Multiple Choice' },
  { value: 'select', label: 'Dropdown' },
  { value: 'number', label: 'Number' },
]

// Types that have answer options — changing away from these loses options data
const CHOICE_TYPES = new Set(['radio', 'checkbox', 'select'])

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
  const [questionType, setQuestionType] = useState('text')
  const [description, setDescription] = useState('')
  const [isRequired, setIsRequired] = useState(false)
  const [relevance, setRelevance] = useState('')
  const [validationJson, setValidationJson] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [patchError, setPatchError] = useState<string | null>(null)

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
      setPatchError(null)
      setPendingType(null)

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
      debounceTimerRef.current = setTimeout(async () => {
        debounceTimerRef.current = null
        try {
          await surveyService.updateQuestion(surveyId, groupId, questionId, updates)
          setPatchError(null)
        } catch {
          setPatchError('Failed to save changes. Please try again.')
        }
      }, 500)
    },
    [surveyId],
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
    setQuestionType(newType)
    setPendingType(null)
    updateQuestion(selectedGroup.id, selectedQuestion.id, { question_type: newType })
    schedulePatch(selectedGroup.id, selectedQuestion.id, { question_type: newType })
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

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  if (!selectedQuestion) {
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
      {/* Save error */}
      {patchError && (
        <div
          className="p-2 text-xs text-destructive bg-destructive/10 rounded"
          role="alert"
          data-testid="question-editor-patch-error"
        >
          {patchError}
        </div>
      )}

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
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1">Relevance Expression</p>
        <input
          type="text"
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm font-mono
            focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
          value={relevance}
          onChange={(e) => handleRelevanceChange(e.target.value)}
          disabled={readOnly}
          aria-label="Relevance expression"
          placeholder="e.g. Q1 == 'yes'"
          data-testid="property-question-relevance"
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

      {/* Answer options (read-only display) */}
      {selectedQuestion.answer_options.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">
            Answer Options ({selectedQuestion.answer_options.length})
          </p>
          <div className="space-y-1">
            {selectedQuestion.answer_options.map((opt) => (
              <div
                key={opt.id}
                className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2 py-1 rounded"
              >
                <span className="font-mono">{opt.code}</span>
                <span className="flex-1 truncate">{opt.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default QuestionEditor
