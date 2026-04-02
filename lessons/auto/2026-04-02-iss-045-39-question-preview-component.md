---
date: "2026-04-02"
ticket_id: "ISS-045"
ticket_title: "3.9: Question Preview Component"
categories: ["testing", "ui", "bug-fix", "feature", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

Now I have a thorough understanding of the implementation. Here is the lessons learned document:

```yaml
---
date: "2026-04-02"
ticket_id: "ISS-045"
ticket_title: "3.9: Question Preview Component"
categories: ["react", "survey-builder", "ui-components", "testing"]
outcome: "success"
complexity: "high"
files_modified:
  - "frontend/src/components/survey-builder/QuestionPreview.tsx"
  - "frontend/src/components/survey-builder/previews/TextPreview.tsx"
  - "frontend/src/components/survey-builder/previews/ChoicePreview.tsx"
  - "frontend/src/components/survey-builder/previews/MatrixPreview.tsx"
  - "frontend/src/components/survey-builder/previews/ScalarPreview.tsx"
  - "frontend/src/components/survey-builder/previews/SpecialPreview.tsx"
  - "frontend/src/pages/SurveyBuilderPage.tsx"
  - "frontend/src/components/survey/GroupPanel.tsx"
  - "frontend/src/components/survey-builder/__tests__/QuestionPreview.test.tsx"
---

# Lessons Learned: 3.9: Question Preview Component

## What Worked Well
- The registry pattern (`questionPreviewMap: Record<QuestionType, FC<QuestionPreviewProps>>`) provided a clean, exhaustive mapping of all 18 types with zero runtime switching logic in the main component.
- Grouping related types into shared category files (TextPreview, ChoicePreview, MatrixPreview, ScalarPreview, SpecialPreview) kept each file focused and manageable; the inner `if (question_type === '...')` branching within each file was easy to reason about.
- Using `pointer-events-none` on the wrapper and `disabled` on all inputs achieved non-interactivity reliably without complex state management.
- The `UnknownTypePreview` fallback with a `data-testid` allowed unknown-type regression tests to be written straightforwardly.
- Casting settings as `Partial<XSettings>` with nullish-coalescing defaults (`?? fallback`) everywhere prevented crashes when a question had `settings: null` or partially-formed settings.
- Preview mode was threaded through as a single boolean prop (`isPreviewMode`) from `SurveyBuilderPage` → `SurveyCanvas` → `SortableGroupPanel` → `GroupPanel`, keeping state ownership at the page level and avoiding context overhead for a simple toggle.
- The DragOverlay in `SurveyBuilderPage` conditionally renders `QuestionPreview` vs `QuestionCard` based on `isPreviewMode`, so the drag ghost is consistent with the current display mode.
- Unit tests using `it.each(allTypes)` with a single `makeQuestion` helper covered all 18 types in a compact, maintainable block, catching any registry omissions immediately.

## What Was Challenging
- The `matrix_dropdown` and `matrix_dynamic` types share structural similarities but diverge meaningfully in data shape (`subquestions` + `answer_options` for matrix_dropdown vs `answer_options` as columns for matrix_dynamic). Keeping them in the same file required careful internal branching.
- Rating icon rendering required four SVG icon components with color variants (`filled` prop). Inline SVG paths avoid external icon dependencies but are verbose and harder to visually verify without a browser.
- The `boolean` type has three distinct visual representations (`toggle`, `radio`, `checkbox`) determined by `render_as` setting; the toggle variant required a custom CSS-only switch (no Radix or Headless UI toggle available in the codebase without adding a dependency), using `translate-x-1` to position the knob.
- The `html` type uses `dangerouslySetInnerHTML` without a real sanitization library (DOMPurify was noted in a comment but not installed). This is an intentional deferral but creates a security footprint that must be addressed before production use.
- Tailwind's dynamic class generation (`grid-cols-${columns}`) only works for classes present at build time. Using `Math.min(columns, 4)` caps at 4 columns, and since `grid-cols-1` through `grid-cols-4` are common enough to be in the default Tailwind purge safelist, this worked — but would silently break for unusual column values or a stricter purge config.
- Threading `isPreviewMode` through three layers of components (Page → Canvas → SortableGroupPanel → GroupPanel) required updating prop interfaces at each level. This is manageable at current depth but would benefit from React context if the component tree deepens.

## Key Technical Insights
1. **Registry + fallback pattern**: `questionPreviewMap[type] ?? UnknownTypePreview` is safer than a switch or bare index access; it ensures TypeScript exhaustiveness at the map definition site while still rendering gracefully for unknown types at runtime.
2. **`pointer-events-none` on wrapper + `disabled` on inputs**: Both are necessary — `pointer-events-none` blocks hover/click on wrapper elements and labels, while `disabled` is required on form controls both for semantics and to prevent browser-native interaction (e.g., radio group navigation via keyboard).
3. **`Partial<XSettings>` casting**: Because `question.settings` is typed broadly as `QuestionSettings | null`, every preview component must cast and treat all fields as optional. This is the right defensive pattern — never assume settings are fully populated in the builder.
4. **Rating icon count**: The formula `max - min + 1` (not just `max`) is the correct icon count for a rating scale. Using only `max` would be off-by-one for scales starting at values other than 0 (e.g., a 1–5 scale has 5 icons, not 5).
5. **`dangerouslySetInnerHTML` without sanitization**: Rendering user-supplied HTML content is XSS-prone. The current implementation is acceptable only in the builder (trusted author context) but must be sanitized (e.g., DOMPurify) before rendering to survey respondents.
6. **Preview mode toggle as `aria-pressed`**: The toggle button uses `aria-pressed={isPreviewMode}` on a `<Button>`, which correctly communicates state to screen readers without needing a separate visually-hidden status element.

## Reusable Patterns
- **Registry component pattern**: `const componentMap: Record<EnumType, FC<Props>> = { ... }; const C = componentMap[type] ?? Fallback; return <C {...props} />` — reusable for any type-dispatched rendering (e.g., question result views, report widgets).
- **`makeQuestion` + `makeOption` test helpers**: Minimal factory functions with spread overrides are the correct pattern for builder component tests; they avoid tight coupling to full API response shapes and make test intent clear.
- **`it.each(allTypes)(...)` exhaustiveness test**: Running a smoke render test over all enum values in a single `it.each` is an effective way to catch registry gaps or crash-on-render regressions without writing 18 individual tests.
- **Disabled display-only form control styling**: `pointer-events-none opacity-60` on inputs/selects provides a consistent "preview" appearance across all question types without custom CSS.
- **Settings nullish-coalescing chain**: `const s = (settings ?? {}) as Partial<XSettings>; const value = s.field ?? defaultValue` is the canonical pattern for safely reading question settings throughout this codebase.

## Files to Review for Similar Tasks
- `frontend/src/components/survey-builder/QuestionPreview.tsx` — registry structure and `QuestionPreviewProps` interface; reference for adding a new question type preview.
- `frontend/src/components/survey-builder/previews/MatrixPreview.tsx` — most complex preview; reference for table-based grid rendering with subquestions and answer options as axes.
- `frontend/src/components/survey-builder/previews/ScalarPreview.tsx` — reference for inline SVG icon components and the `render_as` multi-variant pattern.
- `frontend/src/types/questionSettings.ts` — authoritative source for all settings interfaces; consult before writing any preview that reads settings fields.
- `frontend/src/components/survey/GroupPanel.tsx` — shows how `isPreviewMode` switches between `QuestionPreview` and `QuestionCard`; reference for any future canvas-level rendering mode.
- `frontend/src/pages/SurveyBuilderPage.tsx` — shows preview toggle state ownership, toolbar button with `aria-pressed`, and DragOverlay mode-conditional rendering.
- `frontend/src/components/survey-builder/__tests__/QuestionPreview.test.tsx` — full test coverage reference including `makeQuestion`/`makeOption` helpers and `it.each` registry smoke test.

## Gotchas and Pitfalls
- **Tailwind dynamic class names**: `grid-cols-${n}` strings are not statically analyzable by Tailwind's JIT/purge. If column counts outside 1–4 are needed, add them to `safelist` in `tailwind.config.*` or switch to inline `style={{ gridTemplateColumns: \`repeat(${n}, 1fr)\` }}`.
- **`dangerouslySetInnerHTML` in `html` type**: Currently unsanitized. Must not be used outside trusted-author (builder) context. Add DOMPurify before any respondent-facing rendering.
- **`screen.unmount?.()` in `it.each` loop**: `screen` does not have an `unmount` method — this is a no-op. Use `cleanup()` from `@testing-library/react` (which is called automatically between tests in Vitest) or render into a container and call `unmount()` on the returned render result if manual cleanup is needed.
- **Preview mode disables question selection**: When `isPreviewMode` is true and `QuestionPreview` replaces `QuestionCard`, clicking a question no longer calls `onSelectItem`. If the right-panel `PropertyEditor` should remain active during preview, selection state must be preserved independently of the rendered component.
- **`subquestions` field on `BuilderQuestion`**: Matrix types depend on `subquestions` being populated in the builder store. If a question is loaded without subquestions (e.g., partial API response), the matrix preview will render the empty-rows state, which may be confusing to the author.
- **`image_picker` uses placeholder boxes, not real images**: The current `ImagePickerPreview` renders a titled placeholder box because answer options in the builder do not carry image URLs. A future iteration will need to extend `AnswerOption` with an image URL field and render actual `<img>` elements.
```
