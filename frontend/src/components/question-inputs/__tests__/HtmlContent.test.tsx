/**
 * Tests for HtmlContent component.
 *
 * Covers: renders sanitized HTML, strips script tags and event handlers via DOMPurify,
 * renders plain text safely, uses html_content from settings, falls back to description.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HtmlContent } from '../HtmlContent'
import type { BuilderQuestion } from '../../../store/builderStore'
import { getDefaultSettings } from '../../../types/questionSettings'
import type { HtmlSettings } from '../../../types/questionSettings'

// ---------------------------------------------------------------------------
// Mock DOMPurify
// ---------------------------------------------------------------------------

vi.mock('dompurify', () => ({
  default: {
    sanitize: vi.fn((html: string) => {
      // Simple mock: strip <script> tags and inline event handlers
      return (
        html
          // eslint-disable-next-line security/detect-unsafe-regex -- test mock pattern, not used in production
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/\s+on\w+="[^"]*"/gi, '')
          .replace(/\s+on\w+='[^']*'/gi, '')
      )
    }),
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuestion(overrides: Partial<BuilderQuestion> = {}): BuilderQuestion {
  return {
    id: 'q-html-1',
    group_id: 'g-1',
    parent_id: null,
    question_type: 'html',
    code: 'Q1',
    title: 'HTML Content',
    description: null,
    is_required: false,
    sort_order: 1,
    relevance: null,
    validation: null,
    settings: getDefaultSettings('html'),
    created_at: '2024-01-01T00:00:00Z',
    answer_options: [],
    subquestions: [],
    ...overrides,
  }
}

function makeSettings(overrides: Partial<HtmlSettings> = {}): HtmlSettings {
  return {
    html_content: '',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('HtmlContent — rendering', () => {
  it('renders container with question id in testid', () => {
    render(<HtmlContent question={makeQuestion({ id: 'q-abc' })} />)
    expect(screen.getByTestId('html-content-q-abc')).toBeInTheDocument()
  })

  it('renders HTML content from settings.html_content', () => {
    render(
      <HtmlContent
        question={makeQuestion({
          settings: makeSettings({ html_content: '<p>Hello World</p>' }),
        })}
      />
    )
    expect(screen.getByText('Hello World')).toBeInTheDocument()
  })

  it('renders heading element from HTML', () => {
    render(
      <HtmlContent
        question={makeQuestion({
          settings: makeSettings({ html_content: '<h1>My Heading</h1>' }),
        })}
      />
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My Heading')
  })

  it('renders list items from HTML', () => {
    render(
      <HtmlContent
        question={makeQuestion({
          settings: makeSettings({ html_content: '<ul><li>Item A</li><li>Item B</li></ul>' }),
        })}
      />
    )
    expect(screen.getByText('Item A')).toBeInTheDocument()
    expect(screen.getByText('Item B')).toBeInTheDocument()
  })

  it('renders link element from HTML', () => {
    render(
      <HtmlContent
        question={makeQuestion({
          settings: makeSettings({ html_content: '<a href="https://example.com">Visit</a>' }),
        })}
      />
    )
    expect(screen.getByRole('link', { name: 'Visit' })).toBeInTheDocument()
  })

  it('falls back to question.description when html_content is empty', () => {
    render(
      <HtmlContent
        question={makeQuestion({
          description: '<p>From description</p>',
          settings: makeSettings({ html_content: '' }),
        })}
      />
    )
    expect(screen.getByText('From description')).toBeInTheDocument()
  })

  it('renders empty when both html_content and description are empty', () => {
    render(
      <HtmlContent
        question={makeQuestion({
          description: null,
          settings: makeSettings({ html_content: '' }),
        })}
      />
    )
    const container = screen.getByTestId('html-content-q-html-1')
    expect(container.innerHTML).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

describe('HtmlContent — sanitization', () => {
  it('strips script tags from HTML content', () => {
    render(
      <HtmlContent
        question={makeQuestion({
          settings: makeSettings({ html_content: '<p>Safe text</p><script>alert("xss")</script>' }),
        })}
      />
    )
    const container = screen.getByTestId('html-content-q-html-1')
    expect(container.innerHTML).not.toContain('<script>')
    expect(container.innerHTML).not.toContain('alert')
    expect(screen.getByText('Safe text')).toBeInTheDocument()
  })

  it('strips inline event handlers from HTML content', () => {
    render(
      <HtmlContent
        question={makeQuestion({
          settings: makeSettings({
            html_content: '<button onclick="alert(\'xss\')">Click me</button>',
          }),
        })}
      />
    )
    const container = screen.getByTestId('html-content-q-html-1')
    expect(container.innerHTML).not.toContain('onclick')
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('calls DOMPurify.sanitize with the raw HTML', async () => {
    const DOMPurify = await import('dompurify')
    const sanitizeSpy = vi.spyOn(DOMPurify.default, 'sanitize')

    render(
      <HtmlContent
        question={makeQuestion({
          settings: makeSettings({ html_content: '<b>Bold text</b>' }),
        })}
      />
    )

    expect(sanitizeSpy).toHaveBeenCalledWith('<b>Bold text</b>', expect.any(Object))
  })

  it('renders plain text safely without interpretation as HTML', () => {
    render(
      <HtmlContent
        question={makeQuestion({
          settings: makeSettings({ html_content: 'Just plain text without tags' }),
        })}
      />
    )
    expect(screen.getByText('Just plain text without tags')).toBeInTheDocument()
  })
})
