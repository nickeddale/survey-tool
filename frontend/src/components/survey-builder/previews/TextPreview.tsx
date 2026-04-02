/**
 * TextPreview — display-only previews for short_text, long_text, and huge_text question types.
 */

import type { BuilderQuestion } from '../../../store/builderStore'
import type { ShortTextSettings, LongTextSettings, HugeTextSettings } from '../../../types/questionSettings'

export interface QuestionPreviewProps {
  question: BuilderQuestion
}

export function TextPreview({ question }: QuestionPreviewProps) {
  const { question_type, settings } = question

  if (question_type === 'short_text') {
    const s = (settings ?? {}) as Partial<ShortTextSettings>
    return (
      <input
        type={s.input_type ?? 'text'}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
          text-muted-foreground pointer-events-none opacity-60"
        placeholder={s.placeholder ?? ''}
        disabled
        aria-label="Short text answer"
        data-testid="preview-short-text"
      />
    )
  }

  if (question_type === 'long_text') {
    const s = (settings ?? {}) as Partial<LongTextSettings>
    return (
      <textarea
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
          text-muted-foreground pointer-events-none opacity-60 resize-none"
        rows={s.rows ?? 4}
        placeholder={s.placeholder ?? ''}
        disabled
        aria-label="Long text answer"
        data-testid="preview-long-text"
      />
    )
  }

  if (question_type === 'huge_text') {
    const s = (settings ?? {}) as Partial<HugeTextSettings>
    return (
      <textarea
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
          text-muted-foreground pointer-events-none opacity-60 resize-none"
        rows={s.rows ?? 10}
        placeholder={s.placeholder ?? ''}
        disabled
        aria-label="Huge text answer"
        data-testid="preview-huge-text"
      />
    )
  }

  return null
}

export default TextPreview
