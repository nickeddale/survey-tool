---
date: "2026-04-03"
ticket_id: "ISS-063"
ticket_title: "4.7: Frontend — Text Input Components"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-063"
ticket_title: "4.7: Frontend — Text Input Components"
categories: ["frontend", "react", "components", "forms", "accessibility", "rich-text", "testing"]
outcome: "success"
complexity: "medium"
files_modified:
  - "frontend/src/components/question-inputs/ShortTextInput.tsx"
  - "frontend/src/components/question-inputs/LongTextInput.tsx"
  - "frontend/src/components/question-inputs/HugeTextInput.tsx"
  - "frontend/src/components/question-inputs/index.ts"
  - "frontend/package.json"
---

# Lessons Learned: 4.7: Frontend — Text Input Components

## What Worked Well
- Building on existing Shadcn UI primitives kept component styling consistent without needing custom CSS
- The shared `value/onChange/question/errors` prop interface across all three components made them composable and predictable
- Character counter logic was straightforward to centralize: track `value.length` for plain inputs, strip HTML tags before counting for rich text
- Client-side validation on blur (rather than on every keystroke) reduced noise and matched user expectations
- Tiptap's modular architecture allowed installing only `@tiptap/react` and `@tiptap/starter-kit` without pulling in unnecessary extensions

## What Was Challenging
- Tiptap's internal async state updates required extra care in tests — editor initialization does not complete synchronously, requiring `findBy*` queries and additional `act()` wrapping after render
- HTML tag stripping for character counting in rich text mode needed a consistent utility (regex-based `replace(/<[^>]*>/g, '')`) to avoid counting markup characters
- Email and URL format validation required deciding on blur vs. submit timing and keeping error state in sync with parent-controlled `errors` prop
- `input_type` variants on ShortTextInput (text/email/url/tel) needed to conditionally apply format validation only when the corresponding type was active, not universally

## Key Technical Insights
1. When using Tiptap in tests, always `await screen.findBy*` after render — the editor mounts asynchronously and `getBy*` will fail before it is ready.
2. Character counters for rich text must strip HTML before counting: `value.replace(/<[^>]*>/g, '').length` gives the user-visible character count.
3. `input_type=email` and `input_type=url` validation should only fire on blur or form submission, not on every keystroke, to avoid premature error states while the user is still typing.
4. Accessibility requires `aria-invalid="true"` on the input when errors are present, `aria-describedby` pointing to the error message element id, and a visible `<label>` associated via `htmlFor`.
5. Tiptap's `onUpdate` callback fires inside its own event loop; wrapping test interactions that trigger it in `act(async () => { ... })` is mandatory to prevent act() warnings.
6. The `rows` prop on LongTextInput should read from `question.settings.rows` with a sensible fallback (e.g., 4) so the component is safe even when settings are partially populated.

## Reusable Patterns
- **HTML strip utility**: `const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '')` — reuse for any future rich text character counting.
- **Blur validation hook pattern**: maintain local `touched` state; only show validation errors when `touched === true` or when `errors` prop is non-empty from parent submit.
- **Character counter display**: `{currentLength}/{maxLength}` rendered below the input, conditionally colored red when `currentLength >= maxLength`.
- **Conditional rich text rendering in HugeTextInput**: `question.settings.rich_text ? <TiptapEditor ... /> : <textarea ... />` — keeps the plain textarea path zero-cost when rich text is not needed.
- **act() test pattern for all three components** (from MEMORY.md): wrap every `userEvent.type()` and `userEvent.click()` in `await act(async () => { ... })`, use `findBy*` after async changes.

## Files to Review for Similar Tasks
- `frontend/src/components/question-inputs/ShortTextInput.tsx` — reference for input_type branching, blur validation, and aria attributes
- `frontend/src/components/question-inputs/LongTextInput.tsx` — reference for textarea with configurable rows and character counter
- `frontend/src/components/question-inputs/HugeTextInput.tsx` — reference for conditional Tiptap integration and HTML-stripped character counting
- `frontend/src/components/question-inputs/index.ts` — barrel export pattern to follow for future question-input component groups
- MEMORY.md — act() warning fix patterns remain the authoritative reference for all React Testing Library test files in this project

## Gotchas and Pitfalls
- **Do not use `getBy*` after Tiptap renders** — the editor is async; always use `findBy*` or wrap assertions in `waitFor`.
- **Do not count HTML tags in rich text character limits** — always strip HTML before comparing against `max_length`.
- **Do not apply email/url format validation when `input_type` is not `email`/`url`** — the validation must be gated on the active input type, not applied globally to ShortTextInput.
- **Do not forget `aria-describedby`** — linking the input to its error message element is required for screen reader announcements; missing this breaks accessibility even if the error is visually present.
- **Tiptap tests will produce act() warnings if editor updates are not wrapped** — this is the same root cause as the AuthProvider warnings documented in MEMORY.md: async state updates outside act().
- **react-quill is effectively unmaintained** — prefer Tiptap (`@tiptap/react` + `@tiptap/starter-kit`) for any future rich text requirements in this project.
```
