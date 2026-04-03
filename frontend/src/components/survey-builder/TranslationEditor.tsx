/**
 * TranslationEditor — side-by-side panel for editing translations in the survey builder.
 *
 * Shows source language fields (read-only) alongside target language editable fields.
 * Supports translatable fields for:
 *   - Survey: title, description, welcome_message, end_message
 *   - QuestionGroup: title, description
 *   - Question: title, description
 *   - AnswerOption: title
 *
 * Saves translations via debounced PATCH calls to the appropriate endpoint.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { Languages } from 'lucide-react'
import surveyService from '../../services/surveyService'
import type { SurveyFullResponse, QuestionGroupResponse, QuestionResponse, AnswerOptionResponse, TranslationsMap } from '../../types/survey'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

const SURVEY_FIELDS = ['title', 'description', 'welcome_message', 'end_message'] as const
const GROUP_FIELDS = ['title', 'description'] as const
const QUESTION_FIELDS = ['title', 'description'] as const
const OPTION_FIELDS = ['title'] as const

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  welcome_message: 'Welcome Message',
  end_message: 'End Message',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TranslationTarget =
  | { type: 'survey'; survey: SurveyFullResponse }
  | { type: 'group'; survey: SurveyFullResponse; group: QuestionGroupResponse }
  | { type: 'question'; survey: SurveyFullResponse; group: QuestionGroupResponse; question: QuestionResponse }
  | { type: 'option'; survey: SurveyFullResponse; group: QuestionGroupResponse; question: QuestionResponse; option: AnswerOptionResponse }

interface TranslationEditorProps {
  surveyId: string
  target: TranslationTarget
  defaultLanguage: string
  availableLanguages: string[]
}

// ---------------------------------------------------------------------------
// Helper: get translatable fields and their values from the target
// ---------------------------------------------------------------------------

function getFields(target: TranslationTarget): readonly string[] {
  switch (target.type) {
    case 'survey': return SURVEY_FIELDS
    case 'group': return GROUP_FIELDS
    case 'question': return QUESTION_FIELDS
    case 'option': return OPTION_FIELDS
  }
}

function getSourceValues(target: TranslationTarget): Record<string, string> {
  switch (target.type) {
    case 'survey': {
      const s = target.survey
      return {
        title: s.title ?? '',
        description: s.description ?? '',
        welcome_message: s.welcome_message ?? '',
        end_message: s.end_message ?? '',
      }
    }
    case 'group': {
      const g = target.group
      return {
        title: g.title ?? '',
        description: g.description ?? '',
      }
    }
    case 'question': {
      const q = target.question
      return {
        title: q.title ?? '',
        description: q.description ?? '',
      }
    }
    case 'option': {
      const o = target.option
      return {
        title: o.title ?? '',
      }
    }
  }
}

function getTranslations(target: TranslationTarget): TranslationsMap {
  switch (target.type) {
    case 'survey': return target.survey.translations ?? {}
    case 'group': return target.group.translations ?? {}
    case 'question': return target.question.translations ?? {}
    case 'option': return target.option.translations ?? {}
  }
}

// ---------------------------------------------------------------------------
// Debounce hook
// ---------------------------------------------------------------------------

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ---------------------------------------------------------------------------
// TranslationEditor component
// ---------------------------------------------------------------------------

export function TranslationEditor({
  surveyId,
  target,
  defaultLanguage,
  availableLanguages,
}: TranslationEditorProps) {
  // Determine all languages (at least the default + any languages with existing translations)
  const allLangs = Array.from(new Set([
    ...availableLanguages,
    ...Object.keys(getTranslations(target)),
  ])).filter(l => l !== defaultLanguage)

  const [targetLang, setTargetLang] = useState<string>(allLangs[0] ?? 'fr')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fields = getFields(target)
  const sourceValues = getSourceValues(target)
  const translations = getTranslations(target)

  // Initialize field values from translations when target or targetLang changes
  useEffect(() => {
    const langTranslations = translations[targetLang] ?? {}
    const initial: Record<string, string> = {}
    for (const field of fields) {
      initial[field] = langTranslations[field] ?? ''
    }
    setFieldValues(initial)
  }, [target, targetLang]) // eslint-disable-line react-hooks/exhaustive-deps

  const debouncedFieldValues = useDebounce(fieldValues, 800)
  const prevFieldValuesRef = useRef<Record<string, string> | null>(null)

  // Save translations when debounced values change
  const saveTranslations = useCallback(async (values: Record<string, string>) => {
    // Build payload — only include non-empty strings, null to remove
    const translationsPayload: Record<string, string | null> = {}
    for (const field of fields) {
      const v = values[field]
      translationsPayload[field] = v && v.trim() ? v.trim() : null
    }

    setSaveStatus('saving')
    try {
      switch (target.type) {
        case 'survey':
          await surveyService.updateSurveyTranslations(surveyId, {
            lang: targetLang,
            translations: translationsPayload,
          })
          break
        case 'group':
          await surveyService.updateGroupTranslations(surveyId, target.group.id, {
            lang: targetLang,
            translations: translationsPayload,
          })
          break
        case 'question':
          await surveyService.updateQuestionTranslations(surveyId, target.group.id, target.question.id, {
            lang: targetLang,
            translations: translationsPayload,
          })
          break
        case 'option':
          await surveyService.updateOptionTranslations(surveyId, target.question.id, target.option.id, {
            lang: targetLang,
            translations: translationsPayload,
          })
          break
      }
      setSaveStatus('saved')
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current)
      saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
    }
  }, [surveyId, target, targetLang, fields])

  useEffect(() => {
    // Skip initial render
    if (prevFieldValuesRef.current === null) {
      prevFieldValuesRef.current = debouncedFieldValues
      return
    }
    // Only save if values actually changed
    if (JSON.stringify(prevFieldValuesRef.current) === JSON.stringify(debouncedFieldValues)) {
      return
    }
    prevFieldValuesRef.current = debouncedFieldValues
    saveTranslations(debouncedFieldValues)
  }, [debouncedFieldValues]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleFieldChange(field: string, value: string) {
    setFieldValues(prev => ({ ...prev, [field]: value }))
  }

  function handleLangChange(lang: string) {
    setTargetLang(lang)
    setSaveStatus('idle')
    prevFieldValuesRef.current = null
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const entityLabel = target.type === 'survey'
    ? 'Survey'
    : target.type === 'group'
    ? 'Group'
    : target.type === 'question'
    ? 'Question'
    : 'Answer Option'

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="translation-editor">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Languages size={18} className="text-muted-foreground shrink-0" />
        <h3 className="text-sm font-semibold text-foreground">Translations — {entityLabel}</h3>
      </div>

      {/* Language selector */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            Source
          </label>
          <div className="px-3 py-1.5 rounded border border-border bg-muted text-sm text-muted-foreground">
            {LANGUAGE_LABELS[defaultLanguage] ?? defaultLanguage}
          </div>
        </div>

        <div className="flex flex-col gap-1 flex-1">
          <label htmlFor="target-lang-select" className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            Target Language
          </label>
          <div className="flex gap-2">
            <select
              id="target-lang-select"
              value={targetLang}
              onChange={e => handleLangChange(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              data-testid="target-lang-select"
            >
              {Object.entries(LANGUAGE_LABELS)
                .filter(([code]) => code !== defaultLanguage)
                .map(([code, label]) => (
                  <option key={code} value={code}>{label} ({code})</option>
                ))}
            </select>
            {saveStatus === 'saving' && (
              <span className="self-center text-xs text-muted-foreground" data-testid="translation-save-indicator">
                Saving…
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="self-center text-xs text-green-600" data-testid="translation-save-indicator">
                Saved
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="self-center text-xs text-destructive" data-testid="translation-save-indicator">
                Error
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Side-by-side fields */}
      <div className="flex flex-col gap-4" data-testid="translation-fields">
        {fields.map(field => (
          <div key={field} className="flex flex-col gap-1">
            <label className="text-xs font-medium text-foreground">
              {FIELD_LABELS[field] ?? field}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {/* Source field (read-only) */}
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">
                  {LANGUAGE_LABELS[defaultLanguage] ?? defaultLanguage} (source)
                </div>
                <textarea
                  readOnly
                  value={sourceValues[field] ?? ''}
                  className="w-full px-3 py-2 rounded border border-border bg-muted text-sm text-muted-foreground resize-none min-h-[60px]"
                  rows={2}
                  data-testid={`source-field-${field}`}
                  aria-label={`Source ${FIELD_LABELS[field] ?? field}`}
                />
              </div>

              {/* Target field (editable) */}
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">
                  {LANGUAGE_LABELS[targetLang] ?? targetLang}
                </div>
                <textarea
                  value={fieldValues[field] ?? ''}
                  onChange={e => handleFieldChange(field, e.target.value)}
                  className="w-full px-3 py-2 rounded border border-border bg-background text-sm text-foreground resize-none min-h-[60px] focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder={`Enter ${FIELD_LABELS[field] ?? field} in ${LANGUAGE_LABELS[targetLang] ?? targetLang}…`}
                  rows={2}
                  data-testid={`target-field-${field}`}
                  aria-label={`${LANGUAGE_LABELS[targetLang] ?? targetLang} ${FIELD_LABELS[field] ?? field}`}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default TranslationEditor
