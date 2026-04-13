/**
 * QuestionPreview — renders each question as a respondent would see it.
 *
 * This is a display-only (non-interactive) component that is visually accurate.
 * It uses a registry (questionPreviewMap) to delegate rendering to type-specific
 * preview components for all 18 question types.
 *
 * Used in the survey builder canvas when preview mode is active.
 */

import type { BuilderQuestion } from '../../store/builderStore'
import { TextPreview } from './previews/TextPreview'
import { ChoicePreview } from './previews/ChoicePreview'
import { MatrixPreview } from './previews/MatrixPreview'
import { ScalarPreview } from './previews/ScalarPreview'
import { SpecialPreview } from './previews/SpecialPreview'
import type { FC } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuestionPreviewProps {
  question: BuilderQuestion
  interactive?: boolean
}

type QuestionType =
  | 'short_text'
  | 'long_text'
  | 'huge_text'
  | 'single_choice'
  | 'multiple_choice'
  | 'dropdown'
  | 'ranking'
  | 'image_picker'
  | 'matrix'
  | 'matrix_dropdown'
  | 'matrix_dynamic'
  | 'numeric'
  | 'rating'
  | 'boolean'
  | 'date'
  | 'file_upload'
  | 'expression'
  | 'html'

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const questionPreviewMap: Record<QuestionType, FC<QuestionPreviewProps>> = {
  // Text types
  short_text: TextPreview,
  long_text: TextPreview,
  huge_text: TextPreview,
  // Choice types
  single_choice: ChoicePreview,
  multiple_choice: ChoicePreview,
  dropdown: ChoicePreview,
  // Special choice types
  ranking: SpecialPreview,
  image_picker: SpecialPreview,
  // Matrix types
  matrix: MatrixPreview,
  matrix_dropdown: MatrixPreview,
  matrix_dynamic: MatrixPreview,
  // Scalar types
  numeric: ScalarPreview,
  rating: ScalarPreview,
  boolean: ScalarPreview,
  date: ScalarPreview,
  // Special types
  file_upload: SpecialPreview,
  expression: SpecialPreview,
  html: SpecialPreview,
}

// ---------------------------------------------------------------------------
// Fallback for unknown types
// ---------------------------------------------------------------------------

function UnknownTypePreview({ question }: QuestionPreviewProps) {
  return (
    <p className="text-xs text-muted-foreground italic" data-testid="preview-unknown-type">
      Preview not available for type: {question.question_type}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function QuestionPreview({ question, interactive = false }: QuestionPreviewProps) {
  const PreviewComponent =
    questionPreviewMap[question.question_type as QuestionType] ?? UnknownTypePreview

  return (
    <div
      className={`rounded-lg border border-border bg-background p-4 space-y-3${interactive ? '' : ' pointer-events-none'}`}
      data-testid={`question-preview-${question.id}`}
    >
      {/* Question header */}
      <div className="space-y-1">
        <div className="flex items-start gap-1">
          <p
            className="text-sm font-medium text-foreground leading-snug"
            data-testid="preview-title"
          >
            {question.title || (
              <span className="text-muted-foreground italic">Untitled question</span>
            )}
          </p>
          {question.is_required && (
            <span
              className="text-destructive font-bold text-sm leading-snug shrink-0"
              aria-label="Required"
              data-testid="preview-required-indicator"
            >
              *
            </span>
          )}
        </div>
        {question.description && (
          <p
            className="text-xs text-muted-foreground leading-relaxed"
            data-testid="preview-description"
          >
            {question.description}
          </p>
        )}
      </div>

      {/* Type-specific preview */}
      <div data-testid="preview-content">
        <PreviewComponent question={question} />
      </div>
    </div>
  )
}

export default QuestionPreview
