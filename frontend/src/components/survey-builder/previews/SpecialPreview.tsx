/**
 * SpecialPreview — display-only previews for ranking, image_picker, file_upload, expression, and html types.
 */

import type { BuilderQuestion } from '../../../store/builderStore'
import type { RankingSettings, ImagePickerSettings, FileUploadSettings, ExpressionSettings, HtmlSettings } from '../../../types/questionSettings'

export interface QuestionPreviewProps {
  question: BuilderQuestion
}

export function SpecialPreview({ question }: QuestionPreviewProps) {
  const { question_type, answer_options, settings } = question

  if (question_type === 'ranking') {
    const s = (settings ?? {}) as Partial<RankingSettings>

    return (
      <div className="space-y-2 pointer-events-none" data-testid="preview-ranking">
        {answer_options.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No answer options defined.</p>
        ) : (
          answer_options.map((opt, idx) => (
            <div
              key={opt.id}
              className="flex items-center gap-3 p-2 rounded-md border border-border bg-background opacity-70"
            >
              <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full
                bg-muted text-xs font-medium text-muted-foreground">
                {idx + 1}
              </span>
              <span className="text-sm flex-1">{opt.title}</span>
              <span className="text-muted-foreground opacity-60 text-xs">⠿</span>
            </div>
          ))
        )}
        {s.randomize_initial_order && (
          <p className="text-xs text-muted-foreground italic mt-1">
            (Initial order will be randomized for respondents)
          </p>
        )}
      </div>
    )
  }

  if (question_type === 'image_picker') {
    const s = (settings ?? {}) as Partial<ImagePickerSettings>
    const width = s.image_width ?? 200
    const height = s.image_height ?? 150
    const showLabels = s.show_labels ?? true

    return (
      <div data-testid="preview-image-picker">
        {answer_options.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No answer options defined.</p>
        ) : (
          <div className="flex flex-wrap gap-3 pointer-events-none">
            {answer_options.map((opt) => (
              <div
                key={opt.id}
                className="flex flex-col items-center gap-1 opacity-70"
              >
                <div
                  className="rounded-md border-2 border-border bg-muted flex items-center justify-center"
                  style={{ width: Math.min(width, 160), height: Math.min(height, 120) }}
                >
                  <span className="text-xs text-muted-foreground">{opt.title}</span>
                </div>
                {showLabels && (
                  <span className="text-xs text-center max-w-[160px] truncate">{opt.title}</span>
                )}
              </div>
            ))}
          </div>
        )}
        {s.multi_select && (
          <p className="text-xs text-muted-foreground italic mt-2">
            Multiple selections allowed
            {(s.min_choices != null || s.max_choices != null) &&
              ` (${s.min_choices ?? 0}–${s.max_choices ?? '∞'})`}
          </p>
        )}
      </div>
    )
  }

  if (question_type === 'file_upload') {
    const s = (settings ?? {}) as Partial<FileUploadSettings>
    const maxSize = s.max_size_mb ?? 10
    const maxFiles = s.max_files ?? 1
    const allowedTypes = s.allowed_types ?? []

    return (
      <div
        className="rounded-md border-2 border-dashed border-border p-6 text-center bg-muted/20
          pointer-events-none opacity-70"
        data-testid="preview-file-upload"
      >
        <div className="text-4xl mb-2">📁</div>
        <p className="text-sm text-muted-foreground">
          Drop file{maxFiles > 1 ? 's' : ''} here or{' '}
          <span className="text-primary underline">click to browse</span>
        </p>
        <div className="mt-2 space-y-0.5">
          {allowedTypes.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Accepted: {allowedTypes.join(', ')}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Max size: {maxSize} MB
            {maxFiles > 1 ? ` · Up to ${maxFiles} files` : ''}
          </p>
        </div>
      </div>
    )
  }

  if (question_type === 'expression') {
    const s = (settings ?? {}) as Partial<ExpressionSettings>
    const format = s.display_format ?? 'text'

    return (
      <div
        className="rounded-md border border-dashed border-border p-3 bg-muted/20 opacity-70"
        data-testid="preview-expression"
      >
        <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide font-medium">
          Computed Value ({format})
        </p>
        {s.expression ? (
          <code className="text-xs font-mono text-foreground">{s.expression}</code>
        ) : (
          <p className="text-xs text-muted-foreground italic">No expression defined.</p>
        )}
        <p className="text-xs text-muted-foreground italic mt-1">
          Value will be calculated when respondent fills out the survey.
        </p>
      </div>
    )
  }

  if (question_type === 'html') {
    const s = (settings ?? {}) as Partial<HtmlSettings>

    if (!s.html_content) {
      return (
        <div className="rounded-md border border-dashed border-border p-3 bg-muted/20 opacity-70" data-testid="preview-html">
          <p className="text-xs text-muted-foreground italic">No HTML content defined.</p>
        </div>
      )
    }

    return (
      <div
        className="rounded-md border border-border p-3 bg-background pointer-events-none"
        data-testid="preview-html"
        // HTML content is rendered as-is — in a real app, sanitize with DOMPurify
        dangerouslySetInnerHTML={{ __html: s.html_content }}
      />
    )
  }

  return null
}

export default SpecialPreview
