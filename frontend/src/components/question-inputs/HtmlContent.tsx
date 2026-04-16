/**
 * HtmlContent — renders sanitized HTML content for html question types.
 *
 * Uses DOMPurify to sanitize the HTML before rendering via dangerouslySetInnerHTML.
 * Display-only — no value/onChange props. Applies prose-like styling for
 * readable rendered HTML.
 */

import DOMPurify from 'dompurify'
import type { BuilderQuestion } from '../../store/builderStore'
import type { HtmlSettings } from '../../types/questionSettings'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HtmlContentProps {
  question: BuilderQuestion
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HtmlContent({ question }: HtmlContentProps) {
  const s = (question.settings ?? {}) as Partial<HtmlSettings>
  const rawHtml = s.html_content || question.description || ''

  const sanitized = DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
  })

  return (
    <div
      className={[
        'prose prose-sm max-w-none',
        'text-foreground [&_a]:text-primary [&_a:hover]:underline',
        '[&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-4',
        '[&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-bold',
        '[&_h3]:text-lg [&_h3]:font-semibold',
        '[&_blockquote]:border-l-4 [&_blockquote]:border-muted [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground',
        '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs',
        '[&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-xs',
        '[&_table]:w-full [&_th]:border [&_th]:border-input [&_th]:px-2 [&_th]:py-1',
        '[&_td]:border [&_td]:border-input [&_td]:px-2 [&_td]:py-1',
      ].join(' ')}
      data-testid={`html-content-${question.id}`}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  )
}

export default HtmlContent
