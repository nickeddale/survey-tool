/**
 * HugeTextInput — interactive large textarea (or rich text editor) for huge_text questions.
 *
 * When rich_text=true: renders a Tiptap rich text editor, strips HTML tags for char count.
 * When rich_text=false: renders a plain textarea.
 *
 * Handles: configurable rows, placeholder, max_length character counter,
 * required validation on blur.
 */

import { useState } from 'react'
import type { BuilderQuestion } from '../../store/builderStore'
import type { HugeTextSettings } from '../../types/questionSettings'
import { RichTextEditor } from './RichTextEditor'
import { ValidationErrors } from '../common/ValidationErrors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HugeTextInputProps {
  value: string
  onChange: (value: string) => void
  question: BuilderQuestion
  errors?: string[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip HTML tags to get plain text character count. */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}

function validate(plainText: string, s: Partial<HugeTextSettings>, isRequired: boolean): string[] {
  const errs: string[] = []
  if (isRequired && plainText.trim() === '') {
    errs.push('This field is required.')
    return errs
  }
  if (plainText === '') return errs
  if (s.max_length && plainText.length > s.max_length) {
    errs.push(`Maximum ${s.max_length} characters allowed.`)
  }
  return errs
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HugeTextInput({ value, onChange, question, errors: externalErrors }: HugeTextInputProps) {
  const s = (question.settings ?? {}) as Partial<HugeTextSettings>
  const rows = s.rows ?? 10
  const maxLength = s.max_length ?? null
  const placeholder = s.placeholder ?? ''
  const isRichText = s.rich_text ?? false

  const [touched, setTouched] = useState(false)
  const [internalErrors, setInternalErrors] = useState<string[]>([])

  const plainText = isRichText ? stripHtml(value) : value
  const charCount = plainText.length

  const displayErrors = externalErrors ?? (touched ? internalErrors : [])
  const hasErrors = displayErrors.length > 0
  const inputId = `question-${question.id}`
  const errorId = `${inputId}-error`

  function handleBlur() {
    setTouched(true)
    setInternalErrors(validate(plainText, s, question.is_required))
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value)
    if (touched) {
      setInternalErrors(validate(e.target.value, s, question.is_required))
    }
  }

  function handleRichTextChange(html: string) {
    onChange(html)
    if (touched) {
      setInternalErrors(validate(stripHtml(html), s, question.is_required))
    }
  }

  return (
    <div className="space-y-1" data-testid={`huge-text-input-${question.id}`}>
      {isRichText ? (
        <RichTextEditor
          value={value}
          onChange={handleRichTextChange}
          onBlur={handleBlur}
          hasErrors={hasErrors}
          editorId={inputId}
          errorId={hasErrors ? errorId : undefined}
        />
      ) : (
        <textarea
          id={inputId}
          value={value}
          onChange={handleTextareaChange}
          onBlur={handleBlur}
          rows={rows}
          placeholder={placeholder}
          maxLength={maxLength ?? undefined}
          aria-invalid={hasErrors}
          aria-describedby={hasErrors ? errorId : undefined}
          className={[
            'w-full rounded-md border bg-background px-3 py-2 text-sm resize-y',
            'focus:outline-none focus:ring-2 focus:ring-ring',
            hasErrors ? 'border-destructive focus:ring-destructive' : 'border-input',
          ].join(' ')}
          data-testid="huge-text-textarea"
        />
      )}

      {maxLength !== null && (
        <p
          className={`text-xs text-right ${charCount > maxLength ? 'text-destructive' : 'text-muted-foreground'}`}
          aria-live="polite"
          data-testid="huge-text-char-counter"
        >
          {charCount}/{maxLength}
        </p>
      )}

      <ValidationErrors errors={displayErrors} id={errorId} />
    </div>
  )
}

export default HugeTextInput
