---
date: "2026-04-06"
ticket_id: "ISS-116"
ticket_title: "SEC-02: Sanitize HTML in SpecialPreview with DOMPurify"
categories: ["testing", "feature", "documentation", "ci-cd", "ui"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-116"
ticket_title: "SEC-02: Sanitize HTML in SpecialPreview with DOMPurify"
categories: ["security", "frontend", "xss-prevention"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/components/survey-builder/previews/SpecialPreview.tsx"
  - "frontend/src/components/survey-builder/__tests__/QuestionPreview.test.tsx"
---

# Lessons Learned: SEC-02: Sanitize HTML in SpecialPreview with DOMPurify

## What Worked Well
- A prior, identical fix in `HtmlContent.tsx` provided a clear, proven pattern to replicate — no design decisions were needed
- The scope was tightly bounded to a single component and one call site, making the change low-risk and reviewable at a glance
- DOMPurify was already a project dependency, so no new packages were required

## What Was Challenging
- Nothing significant; the task was straightforward pattern replication
- Ensuring the test correctly asserted absence of `<script>` in the rendered DOM (rather than just checking raw HTML string output) required care with how jsdom/testing-library exposes the DOM

## Key Technical Insights
1. `dangerouslySetInnerHTML` without sanitization is an XSS vector whenever user-controlled or server-sourced HTML is rendered — it must always be paired with DOMPurify or equivalent
2. `DOMPurify.sanitize(input, { USE_PROFILES: { html: true } })` is the project-standard call signature; using a profile rather than custom config reduces misconfiguration risk
3. DOMPurify strips `<script>` tags and event handler attributes by default under the `html` profile — no additional configuration is needed for the common XSS cases
4. The fix pattern is: derive a `sanitized` const before the JSX return, then use `__html: sanitized` — avoids inline expressions in JSX and keeps the sanitization call visible and auditable

## Reusable Patterns
- **Standard DOMPurify import and usage:**
  ```ts
  import DOMPurify from 'dompurify';
  // ...
  const sanitized = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
  // ...
  <div dangerouslySetInnerHTML={{ __html: sanitized }} />
  ```
- **Test pattern for XSS stripping:** render the component with `html_content` containing `<script>alert(1)</script>`, then assert `container.querySelector('script')` is `null`
- When `dangerouslySetInnerHTML` appears in a code review, immediately check whether the input passes through DOMPurify before rendering

## Files to Review for Similar Tasks
- `frontend/src/components/survey-builder/previews/HtmlContent.tsx` — canonical reference implementation for DOMPurify usage in this codebase
- `frontend/src/components/survey-builder/previews/SpecialPreview.tsx` — updated implementation; review if new HTML-rendering branches are added later
- `frontend/src/components/survey-builder/__tests__/QuestionPreview.test.tsx` — reference for how to write XSS-stripping assertions

## Gotchas and Pitfalls
- DOMPurify only runs in browser environments; in SSR or Node test environments (jsdom), ensure jsdom is configured or the sanitize call degrades gracefully — jsdom does support DOMPurify
- Do not pass `html_content` directly as `__html` even when it appears safe at the call site; the sanitization must be explicit so future data-source changes cannot silently re-introduce the vulnerability
- If `html_content` can be `undefined` or `null`, guard before calling `DOMPurify.sanitize` to avoid a runtime error — `DOMPurify.sanitize(s.html_content ?? '')`
- A TODO/comment noting "sanitization missing" left in code after the fix would be misleading; always remove or update such comments as part of the same commit
```
