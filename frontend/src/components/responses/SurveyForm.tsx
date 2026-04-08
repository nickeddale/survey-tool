/**
 * SurveyForm — renders survey questions for a respondent.
 *
 * Supports both paged mode (one_page_per_group = true, default) and
 * single-page mode (one_page_per_group = false).
 *
 * In paged mode: shows one group per page with Next/Previous/Submit navigation.
 * In single-page mode: shows all groups on one page with a single Submit button.
 *
 * Uses existing question-input components keyed by question_type.
 * Accepts externally-managed answers and validation errors.
 */

import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { BuilderQuestion } from '../../store/builderStore'
import type { SurveyFullResponse, QuestionGroupResponse } from '../../types/survey'
import type { AnswerMap, ValidationErrors } from '../../hooks/useValidation'
import type { QuestionAnswer } from '../../utils/validation'
import { Button } from '../ui/button'
import {
  ShortTextInput,
  LongTextInput,
  HugeTextInput,
  RadioInput,
  DropdownInput,
  CheckboxInput,
  MatrixInput,
  MatrixDropdownInput,
  MatrixDynamicInput,
  NumericInput,
  RatingInput,
  BooleanInput,
  DateInput,
  RankingInput,
  ImagePickerInput,
  FileUploadInput,
  ExpressionDisplay,
  HtmlContent,
} from '../question-inputs'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SurveyFormProps {
  survey: SurveyFullResponse
  currentPage: number
  answers: AnswerMap
  errors: ValidationErrors
  isSubmitting: boolean
  onChange: (questionId: string, value: QuestionAnswer) => void
  onNext: () => void
  onPrev: () => void
  onSubmit: () => void
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

interface ProgressBarProps {
  current: number
  total: number
}

function ProgressBar({ current, total }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div className="w-full" data-testid="form-progress-bar" aria-label={`Progress: ${pct}%`}>
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>
          {current} of {total}
        </span>
        <span data-testid="form-progress-pct">{pct}%</span>
      </div>
      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
          data-testid="form-progress-fill"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Question input renderer
// ---------------------------------------------------------------------------

interface QuestionInputProps {
  question: BuilderQuestion
  value: QuestionAnswer
  errors: string[]
  onChange: (value: QuestionAnswer) => void
}

function QuestionInput({ question, value, errors, onChange }: QuestionInputProps) {
  switch (question.question_type) {
    case 'short_text':
      return (
        <ShortTextInput
          question={question}
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          errors={errors}
        />
      )
    case 'long_text':
      return (
        <LongTextInput
          question={question}
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          errors={errors}
        />
      )
    case 'huge_text':
      return (
        <HugeTextInput
          question={question}
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          errors={errors}
        />
      )
    case 'single_choice':
      return (
        <RadioInput
          question={question}
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          errors={errors}
        />
      )
    case 'dropdown':
      return (
        <DropdownInput
          question={question}
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          errors={errors}
        />
      )
    case 'multiple_choice':
      return (
        <CheckboxInput
          question={question}
          value={(value as string[]) ?? []}
          onChange={onChange as (v: string[]) => void}
          errors={errors}
        />
      )
    case 'ranking':
      return (
        <RankingInput
          question={question}
          value={(value as string[]) ?? []}
          onChange={onChange as (v: string[]) => void}
          errors={errors}
        />
      )
    case 'image_picker':
      return (
        <ImagePickerInput
          question={question}
          value={(value as string[]) ?? []}
          onChange={onChange as (v: string[]) => void}
          errors={errors}
        />
      )
    case 'matrix':
      return (
        <MatrixInput
          question={question}
          value={(value as Record<string, string>) ?? {}}
          onChange={onChange as (v: Record<string, string>) => void}
          errors={errors}
        />
      )
    case 'matrix_dropdown':
      return (
        <MatrixDropdownInput
          question={question}
          value={(value as Record<string, string>) ?? {}}
          onChange={onChange as (v: Record<string, string>) => void}
          errors={errors}
        />
      )
    case 'matrix_dynamic':
      return (
        <MatrixDynamicInput
          question={question}
          value={(value as Record<string, string>[]) ?? []}
          onChange={onChange as (v: Record<string, string>[]) => void}
          errors={errors}
        />
      )
    case 'numeric':
      return (
        <NumericInput
          question={question}
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          errors={errors}
        />
      )
    case 'rating':
      return (
        <RatingInput
          question={question}
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          errors={errors}
        />
      )
    case 'yes_no':
    case 'boolean':
      return (
        <BooleanInput
          question={question}
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          errors={errors}
        />
      )
    case 'date':
      return (
        <DateInput
          question={question}
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          errors={errors}
        />
      )
    case 'file_upload':
      return (
        <FileUploadInput
          question={question}
          value={(value as File[]) ?? []}
          onChange={onChange as (v: File[]) => void}
          errors={errors}
        />
      )
    case 'expression':
      return <ExpressionDisplay question={question} value={value as string | number | null ?? null} />
    case 'html':
      return <HtmlContent question={question} />
    default:
      return (
        <p className="text-xs text-muted-foreground italic" data-testid="unknown-question-type">
          Unsupported question type: {question.question_type}
        </p>
      )
  }
}

// ---------------------------------------------------------------------------
// Group renderer
// ---------------------------------------------------------------------------

interface GroupFormProps {
  group: QuestionGroupResponse
  answers: AnswerMap
  errors: ValidationErrors
  onChange: (questionId: string, value: QuestionAnswer) => void
}

function GroupForm({ group, answers, errors, onChange }: GroupFormProps) {
  const sortedQuestions = [...group.questions].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div data-testid={`form-group-${group.id}`}>
      <h2 className="text-xl font-semibold text-foreground mb-1" data-testid="form-group-title">
        {group.title}
      </h2>
      {group.description && (
        <p className="text-sm text-muted-foreground mb-4" data-testid="form-group-description">
          {group.description}
        </p>
      )}
      <div className="space-y-4">
        {sortedQuestions.map((question) => (
          <div
            key={question.id}
            className="rounded-lg border border-border bg-background p-4 space-y-3 transition-all duration-300 ease-in-out animate-in fade-in slide-in-from-top-1"
            data-testid={`form-question-${question.id}`}
          >
            {/* Question header */}
            <div className="space-y-1">
              <div className="flex items-start gap-1">
                <p
                  className="text-sm font-medium text-foreground leading-snug"
                  data-testid="form-question-title"
                >
                  {question.title || <span className="text-muted-foreground italic">Untitled question</span>}
                </p>
                {question.is_required && (
                  <span
                    className="text-destructive font-bold text-sm leading-snug shrink-0"
                    aria-label="Required"
                    data-testid="form-required-indicator"
                  >
                    *
                  </span>
                )}
              </div>
              {question.description && (
                <p
                  className="text-xs text-muted-foreground leading-relaxed"
                  data-testid="form-question-description"
                >
                  {question.description}
                </p>
              )}
            </div>

            {/* Question input */}
            <QuestionInput
              question={question as BuilderQuestion}
              value={answers[question.id]}
              errors={errors[question.id] ?? []}
              onChange={(v) => onChange(question.id, v)}
            />
          </div>
        ))}

        {sortedQuestions.length === 0 && (
          <p className="text-sm text-muted-foreground italic" data-testid="form-group-empty">
            No questions in this group.
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main SurveyForm component
// ---------------------------------------------------------------------------

export function SurveyForm({
  survey,
  currentPage,
  answers,
  errors,
  isSubmitting,
  onChange,
  onNext,
  onPrev,
  onSubmit,
}: SurveyFormProps) {
  const sortedGroups = [...survey.groups].sort((a, b) => a.sort_order - b.sort_order)
  const onePagePerGroup = survey.settings?.one_page_per_group !== false
  const totalPages = onePagePerGroup ? sortedGroups.length : 1
  const isFirstPage = currentPage === 0
  const isLastPage = currentPage >= totalPages - 1

  return (
    <div className="flex flex-col h-full" data-testid="survey-form">
      {/* Progress bar */}
      {totalPages > 1 && (
        <div className="px-8 pt-4 max-w-2xl w-full mx-auto shrink-0" data-testid="form-progress-container">
          <ProgressBar current={currentPage + 1} total={totalPages} />
        </div>
      )}

      {/* Questions */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-8 py-8 space-y-8">
          {onePagePerGroup ? (
            sortedGroups[currentPage] ? (
              <GroupForm
                group={sortedGroups[currentPage]}
                answers={answers}
                errors={errors}
                onChange={onChange}
              />
            ) : null
          ) : (
            <div data-testid="form-all-groups">
              {sortedGroups.map((group) => (
                <GroupForm
                  key={group.id}
                  group={group}
                  answers={answers}
                  errors={errors}
                  onChange={onChange}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <footer
        className="flex items-center justify-between px-8 py-4 border-t border-border bg-background shrink-0"
        data-testid="form-navigation"
      >
        <Button
          variant="outline"
          onClick={onPrev}
          disabled={isFirstPage || isSubmitting}
          data-testid="form-previous-button"
          aria-label="Previous page"
        >
          <ArrowLeft size={14} />
          Previous
        </Button>

        {onePagePerGroup && totalPages > 0 && (
          <span className="text-sm text-muted-foreground" data-testid="form-page-indicator">
            {currentPage + 1} / {totalPages}
          </span>
        )}

        {isLastPage || !onePagePerGroup ? (
          <Button
            onClick={onSubmit}
            disabled={isSubmitting}
            data-testid="form-submit-button"
          >
            {isSubmitting ? 'Submitting…' : <>Submit <ArrowRight size={14} /></>}
          </Button>
        ) : (
          <Button
            onClick={onNext}
            disabled={isSubmitting}
            data-testid="form-next-button"
          >
            Next <ArrowRight size={14} />
          </Button>
        )}
      </footer>
    </div>
  )
}

export default SurveyForm
