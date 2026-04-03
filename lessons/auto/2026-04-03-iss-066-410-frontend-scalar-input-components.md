---
date: "2026-04-03"
ticket_id: "ISS-066"
ticket_title: "4.10: Frontend — Scalar Input Components"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-066"
ticket_title: "4.10: Frontend — Scalar Input Components"
categories: ["frontend", "components", "testing", "react", "forms"]
outcome: "success"
complexity: "medium"
files_modified:
  - "frontend/src/components/question-inputs/NumericInput.tsx"
  - "frontend/src/components/question-inputs/RatingInput.tsx"
  - "frontend/src/components/question-inputs/BooleanInput.tsx"
  - "frontend/src/components/question-inputs/DateInput.tsx"
  - "frontend/src/components/question-inputs/index.ts"
  - "frontend/src/components/question-inputs/__tests__/NumericInput.test.tsx"
  - "frontend/src/components/question-inputs/__tests__/RatingInput.test.tsx"
  - "frontend/src/components/question-inputs/__tests__/BooleanInput.test.tsx"
  - "frontend/src/components/question-inputs/__tests__/DateInput.test.tsx"
---

# Lessons Learned: 4.10: Frontend — Scalar Input Components

## What Worked Well
- Following the established input component pattern (value/onChange/question/errors props) kept implementation consistent with existing RadioInput and similar components
- Extracting settings from `question.settings` using typed interfaces (NumericSettings, RatingSettings, etc.) from `questionSettings.ts` made components predictable and type-safe
- Using native HTML input attributes (`min`, `max`, `step`, `type="date"`, `type="datetime-local"`) for DateInput and NumericInput leveraged browser validation as a first layer before custom blur validation
- Touched-state tracking scoped to each component kept validation UX consistent: errors only show after user interaction
- Barrel export via `index.ts` kept imports clean across consuming files

## What Was Challenging
- RatingInput hover state required careful handling: JSDOM pointer events do not reliably simulate hover, so tests needed to assert on resulting state (icon fill class) rather than the hover animation itself
- BooleanInput's three render modes (toggle/radio/checkbox) required branching logic and separate accessibility attribute strategies for each mode
- DateInput behavior varies between JSDOM versions — using `fireEvent.change` with a value string was more reliable than simulating a calendar picker interaction
- Ensuring act() compliance across all userEvent interactions in tests required discipline; missing wrappers on blur events in particular produced warnings that contaminated downstream tests

## Key Technical Insights
1. For RatingInput, map over the range from `min` to `max` using the configured step, and track hover index separately from selected value in local state. Reset hover index on `mouseLeave` from the container, not individual icons.
2. For DateInput, drive the input type from `include_time`: use `type="datetime-local"` when true, `type="date"` otherwise. Pass `min_date`/`max_date` directly as HTML `min`/`max` attributes and re-validate on blur to produce user-facing error messages.
3. For BooleanInput, the `render_as: 'toggle'` mode maps to a shadcn/ui Switch component; `render_as: 'radio'` renders two `<input type="radio">` elements with `true_label`/`false_label`; `render_as: 'checkbox'` renders a single `<input type="checkbox">`. Each mode needs its own aria role and label association.
4. For NumericInput, `decimal_places` validation is a blur-time check (count decimal digits in the string value) rather than a browser attribute — the `step` attribute only constrains the stepper UI, not freeform typing.
5. Do not leave fake timers running across tests. Call `vi.useRealTimers()` in `afterEach` whenever blur/debounce timers are used, or all subsequent tests relying on promise resolution will silently time out.

## Reusable Patterns
- **Touched-state validation**: Track a `touched` boolean in local state; only display validation errors after first blur. Reset on external `errors` prop changes.
- **Blur validation hook pattern**: On blur, run all applicable validators in sequence, set the first error found (or clear), and mark as touched.
- **RatingInput icon map**: `{ star: Star, heart: Heart, thumb: ThumbsUp, smiley: Smile }` from lucide-react — keep the map at module level to avoid re-creation on each render.
- **BooleanInput render branching**: Use a `renderAs` local variable derived from `question.settings.render_as ?? 'toggle'` and branch JSX via early returns for each mode to keep each branch readable.
- **DateInput min/max passthrough**: Pass ISO date strings directly to `min`/`max` HTML attributes; validate the same constraint on blur to surface a friendly error message alongside the browser's native constraint.

## Files to Review for Similar Tasks
- `frontend/src/components/question-inputs/NumericInput.tsx` — reference for prefix/suffix label layout and decimal validation
- `frontend/src/components/question-inputs/RatingInput.tsx` — reference for hover state management and icon rendering
- `frontend/src/components/question-inputs/BooleanInput.tsx` — reference for multi-mode rendering with shared validation
- `frontend/src/components/question-inputs/DateInput.tsx` — reference for native date input with min/max enforcement
- `frontend/src/components/question-inputs/__tests__/RatingInput.test.tsx` — reference for testing hover state without userEvent.hover
- `frontend/src/types/questionSettings.ts` — source of truth for all settings interfaces and getDefaultSettings() defaults

## Gotchas and Pitfalls
- **Never use `userEvent.hover` for RatingInput tests** — JSDOM pointer event support is inconsistent. Use `fireEvent.mouseEnter`/`fireEvent.mouseLeave` directly on the icon element and assert on the resulting CSS class.
- **Always use `fireEvent.change` with a value string for DateInput tests** — simulating calendar picker interactions in JSDOM is unreliable and JSDOM version differences can silently break tests.
- **Remove `devtracker_refresh_token` from localStorage in `beforeEach`** — leaving it causes AuthProvider's async `initialize()` to fire outside act(), producing warnings that contaminate all tests in the file.
- **Wrap every `userEvent` interaction in `await act(async () => { ... })`** — missing wrappers on click, type, or blur events will produce act() warnings. This applies to all four component test files.
- **Call `vi.useRealTimers()` in `afterEach` if any test uses fake timers** — a fake timer left running will cause all subsequent promise-based assertions to silently time out without a clear error.
- **`step` attribute does not prevent freeform decimal input** — always validate `decimal_places` on blur in addition to setting the `step` HTML attribute; do not rely on the browser to enforce it.
- **`type="number"` inputs return empty string for invalid input** — guard against empty string in onChange before parsing to float; pass `undefined` or the previous valid value rather than `NaN`.
```
