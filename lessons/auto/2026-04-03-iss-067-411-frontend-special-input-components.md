---
date: "2026-04-03"
ticket_id: "ISS-067"
ticket_title: "4.11: Frontend — Special Input Components"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-067"
ticket_title: "4.11: Frontend — Special Input Components"
categories: ["frontend", "components", "drag-and-drop", "file-upload", "security", "accessibility"]
outcome: "success"
complexity: "high"
files_modified:
  - frontend/src/components/question-inputs/RankingInput.tsx
  - frontend/src/components/question-inputs/ImagePickerInput.tsx
  - frontend/src/components/question-inputs/FileUploadInput.tsx
  - frontend/src/components/question-inputs/ExpressionDisplay.tsx
  - frontend/src/components/question-inputs/HtmlContent.tsx
  - frontend/src/components/question-inputs/index.ts
  - frontend/src/components/question-inputs/__tests__/RankingInput.test.tsx
  - frontend/src/components/question-inputs/__tests__/ImagePickerInput.test.tsx
  - frontend/src/components/question-inputs/__tests__/FileUploadInput.test.tsx
  - frontend/src/components/question-inputs/__tests__/ExpressionDisplay.test.tsx
  - frontend/src/components/question-inputs/__tests__/HtmlContent.test.tsx
  - frontend/src/types/survey.ts
  - frontend/package.json
---

# Lessons Learned: 4.11: Frontend — Special Input Components

## What Worked Well
- The established component pattern (value/onChange/question/errors, lazy validation on blur, external errors override internal) translated cleanly to all five new types including highly divergent ones like FileUploadInput and HtmlContent.
- `@dnd-kit/core` and `@dnd-kit/sortable` were already in `package.json` — no extra install step required for RankingInput.
- Splitting RankingInput into a `SortableItem` sub-component kept the main component readable and made the drag-handle aria-label attribution straightforward.
- Using `vi.mock('dompurify')` with a simple regex-based stub in HtmlContent tests avoided real DOM sanitization in JSDOM while still verifying that `DOMPurify.sanitize` is called and that the component outputs what the sanitizer returns.
- The session-stable seed approach for `randomize_initial_order` in RankingInput prevents order from changing on every render without requiring external state.
- File type matching logic (`matchesAllowedType`) handled both MIME wildcards (`image/*`) and extension-based matching in a single pass, which kept validation clean.
- ExpressionDisplay's `display_format` settings (number, currency, percent, text) were added as a bonus beyond the spec placeholder, using `Intl.NumberFormat` for locale-aware formatting — a pragmatic enhancement that costs little effort.
- ImagePickerInput correctly uses `role="radiogroup"` for single-select and `role="group"` for multi-select, with each button using the corresponding `role="radio"` or `role="checkbox"` — proper ARIA semantics without a fieldset.

## What Was Challenging
- Testing @dnd-kit drag interactions in JSDOM is not feasible via pointer events; drag-reorder logic had to be tested indirectly (calling `handleDragEnd` equivalent) or omitted in favor of testing the surrounding logic (initial order, external value, blur validation). Keyboard-sensor tests also require complex JSDOM setup, so tests stuck to rendering and validation coverage.
- `URL.createObjectURL` is not available in JSDOM. Tests that exercise image file preview must mock it (`URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')`) before rendering; forgetting this causes a silent failure where the image element is not rendered at all.
- FileUploadInput's dual validation path (internal state errors + `validationErrors` computed live from props) required care — `displayErrors` must merge both while respecting the external-errors override. Getting the merge order right (external wins, else touched ? internal + live : []) was subtle.
- DOMPurify uses browser globals (`window.document`) that are absent in some JSDOM configurations; importing it at the top level in tests causes issues, hence mocking the entire module is mandatory rather than optional.
- `image_url` on `AnswerOptionResponse` is optional (`image_url?: string | null`) — existing tests and the type definition had to accommodate the optional field without breaking prior tests that constructed `AnswerOptionResponse` objects without it.

## Key Technical Insights
1. **@dnd-kit drag tests in JSDOM**: Do not attempt to simulate pointer/touch drag events. Instead, test the `handleDragEnd` logic in isolation by invoking it directly with synthetic `DragEndEvent` data, or accept that drag reorder is integration-tested at a higher level. Cover all observable side-effects (onChange called, validation re-runs) rather than the drag mechanics.
2. **DOMPurify must be mocked in Vitest**: `vi.mock('dompurify', ...)` at the top of the test file is required. The mock should approximate real sanitization (strip `<script>` and `on*` attributes) so XSS-stripping assertions remain meaningful without a real browser DOM.
3. **File validation is non-blocking**: The component does not prevent `onChange` from being called with invalid files. Instead it surfaces errors via the error list. This is intentional — callers may have their own recovery flow. Tests must account for this by passing invalid files as `value` prop (with external `errors`) rather than expecting the component to reject them on drop.
4. **`URL.createObjectURL` stub must be set before rendering**: Setting it inside the test body after `render()` is too late — the `FilePreview` sub-component calls it in `useState` initializer on mount.
5. **ExpressionDisplay is a progressive placeholder**: The M4 implementation renders a static read-only box with formatting support (`Intl.NumberFormat`) so the expression engine in M5 only needs to wire up `value` — the display layer is already complete.
6. **Session-stable shuffle**: Using a `Record<questionId, seed>` module-level cache for `randomize_initial_order` ensures the order is stable for a session (no re-shuffling on re-render) without prop drilling a seed or using `useRef`.

## Reusable Patterns
- **Drop zone component pattern**: `role="button"`, `tabIndex={0}`, `onKeyDown` for Enter/Space, `onDrop`/`onDragOver`/`onDragLeave` — fully keyboard and pointer accessible without a third-party library.
- **Sub-component for list items**: Extract `SortableItem` / `FilePreview` as local (non-exported) components when the item has its own event handlers or state (e.g., `URL.createObjectURL` in `useState`). This keeps JSX concise and isolates concerns.
- **External errors override internal**: `const displayErrors = externalErrors ?? (touched ? internalErrors : [])` — this one-liner is the canonical pattern across all input components; always use this form.
- **MIME wildcard + extension matching**: Check `type.endsWith('/*')` first, then fall back to exact MIME match or file extension suffix — handles `image/*`, `application/pdf`, and `.pdf` equivalently.
- **`dangerouslySetInnerHTML` with DOMPurify**: Always pair with `USE_PROFILES: { html: true }` option, add an `eslint-disable-next-line react/no-danger` comment, and mock DOMPurify entirely in tests.
- **Aria semantics for image grids**: A `<div role="radiogroup">` containing `<button role="radio" aria-checked>` elements is the correct ARIA pattern for a single-select image picker. Switch to `role="group"` + `role="checkbox"` for multi-select. No `<fieldset>` needed.

## Files to Review for Similar Tasks
- `frontend/src/components/question-inputs/RankingInput.tsx` — reference for @dnd-kit integration, session-stable shuffle, and blur-triggered list validation.
- `frontend/src/components/question-inputs/FileUploadInput.tsx` — reference for drop zone pattern, file type/size validation, and `URL.createObjectURL` preview handling.
- `frontend/src/components/question-inputs/HtmlContent.tsx` — reference for safe `dangerouslySetInnerHTML` with DOMPurify and Tailwind prose-like styling via arbitrary variant selectors.
- `frontend/src/components/question-inputs/__tests__/FileUploadInput.test.tsx` — reference for mocking `URL.createObjectURL` and testing file-related components.
- `frontend/src/components/question-inputs/__tests__/HtmlContent.test.tsx` — reference for mocking an entire npm module (`dompurify`) while keeping sanitization assertions meaningful.
- `frontend/src/components/question-inputs/CheckboxInput.tsx` — canonical reference for min/max choice validation logic reused in ImagePickerInput.

## Gotchas and Pitfalls
- **`URL.createObjectURL` is undefined in JSDOM** — must be stubbed with `vi.fn()` before any test that renders a `FilePreview` for an image file; otherwise the `<img>` element is silently not rendered and assertions fail with no obvious cause.
- **@dnd-kit requires `DndContext` wrapper at the component tree root** — `SortableContext` alone is not sufficient; forgetting `DndContext` causes a runtime error ("useDndContext must be used within a DndContext provider").
- **`arrayMove` import path**: import from `@dnd-kit/sortable`, not `@dnd-kit/core` — confusing since `DndContext` comes from core.
- **DOMPurify module mock must use `default` key**: `vi.mock('dompurify', () => ({ default: { sanitize: vi.fn(...) } }))` — the named export pattern does not work because the package uses a default export; missing `default` causes `DOMPurify.sanitize is not a function`.
- **`image_url` is optional on `AnswerOptionResponse`**: Do not add it as a required field in test helper factories — existing tests that build options without it will fail with a TypeScript error.
- **`maxFiles` drives `multiple` boolean**: `multiple = maxFiles > 1` is computed from settings, not a direct `multiple` setting key — watch for this when constructing `makeSettings` in tests (use `max_files`, not `multiple`).
- **FileUploadInput resets `<input type="file">` value after each selection** (`e.target.value = ''`) — this is intentional to allow re-selecting the same file, but it means `fireEvent.change` on the file input in tests requires constructing a fresh `FileList` mock each time.
```
