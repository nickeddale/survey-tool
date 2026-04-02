---
date: "2026-04-02"
ticket_id: "ISS-044"
ticket_title: "3.8: Question Type-Specific Settings Forms"
categories: ["testing", "api", "ui", "refactoring", "bug-fix", "feature", "security", "config", "ci-cd", "documentation"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-044"
ticket_title: "3.8: Question Type-Specific Settings Forms"
categories: ["react", "forms", "typescript", "testing", "state-management"]
outcome: "success"
complexity: "high"
files_modified:
  - "frontend/src/types/questionSettings.ts"
  - "frontend/src/components/survey-builder/QuestionEditor.tsx"
  - "frontend/src/components/survey-builder/settings/QuestionSettingsForm.tsx"
  - "frontend/src/components/survey-builder/settings/TextSettingsForm.tsx"
  - "frontend/src/components/survey-builder/settings/ChoiceSettingsForm.tsx"
  - "frontend/src/components/survey-builder/settings/MatrixSettingsForm.tsx"
  - "frontend/src/components/survey-builder/settings/ScalarSettingsForm.tsx"
  - "frontend/src/components/survey-builder/settings/SpecialSettingsForm.tsx"
---

# Lessons Learned: 3.8: Question Type-Specific Settings Forms

## What Worked Well
- Decomposing settings into five focused sub-form components (Text, Choice, Matrix, Scalar, Special) kept each file manageable and made conditional field rendering straightforward.
- Defining all TypeScript interfaces and helper functions (`getDefaultSettings`, `getCompatibleSettings`) in a single `questionSettings.ts` file before touching any component prevented field-name drift between the interfaces and the actual JSONB payload.
- Keeping `getCompatibleSettings` as a pure function (no side effects, no component state access) made it trivially unit-testable without mounting any component.
- Using a lazy `useState` initializer (`() => question.settings ?? getDefaultSettings(question.type)`) cleanly handled the null-settings case for pre-existing questions without scattering null-checks across the component.
- Tracking the 'Type Settings' collapse state in local `useState` rather than the builder store avoided unnecessary store complexity.

## What Was Challenging
- Ensuring the debounced `schedulePatch` merged settings into the existing pending patch payload rather than replacing it — replacing wholesale would clobber concurrent in-flight title or required-field updates.
- Coordinating the type-change handler sequence: `getCompatibleSettings()` must be called with a snapshot of the current `settingsJson` captured at the start of the handler, before any state update, to avoid reading stale React state inside an async patch callback.
- Managing 18 question types across five form categories while keeping conditional field visibility logic readable and avoiding duplicated toggle/input JSX.
- Preventing double-saves on inline text inputs (e.g., `other_text`, `add_row_text`) where pressing Enter triggers the save handler and then immediately fires `onBlur`.

## Key Technical Insights
1. **Snapshot before async**: Always capture `settingsJson` (and any other state) into a local `const snapshot = settingsJson` at the top of the type-change handler. Never read component state inside an async callback or inside the `schedulePatch` closure — the value may be stale by the time it executes.
2. **Null-coalescing settings init**: `question.settings` is a JSONB column and may be `null` for questions created before this ticket. Initialize with `question.settings ?? getDefaultSettings(question.type)` — never assume it is a populated object.
3. **Merge, don't replace, patch payload**: Settings changes must call `schedulePatch({ settings: newSettings })` where `schedulePatch` internally merges the partial payload with any pending patch, not replaces it. Verify this in `builderStore.ts` before wiring up the `onChange` handler.
4. **Pure compatibility helper**: `getCompatibleSettings(oldType, newType, oldSettings)` returns a new plain object. Fields that exist in both type's interfaces (e.g., `placeholder` shared between `short_text` and `dropdown`) are preserved; incompatible fields are dropped. This is the correct place to handle type-change preservation — not inside `QuestionEditor`.
5. **Fake timer cleanup in tests**: Any test that exercises the debounced `schedulePatch` must call `vi.useRealTimers()` in `afterEach`. Fake timers left running will silently cause downstream MSW promise resolutions to time out, producing confusing failures in unrelated tests.
6. **`act()` wrapping for userEvent**: Wrap all `userEvent` interactions in `act()` when the handler triggers React state updates or debounced effects. Interactions dispatched outside React's `act` boundary produce warnings that contaminate subsequent `renderHook` calls.
7. **MSW handler shape fidelity**: MSW handlers in tests must return the exact backend JSONB shape for `settings` — an object or `null`, never an array or simplified stub. Diverging from the real backend shape hides integration bugs that will surface in staging.

## Reusable Patterns
- **Optimistic settings update with revert**: `const snapshot = settingsJson` → `setSettingsJson(next)` immediately → `schedulePatch({ settings: next })` → on API error: `setSettingsJson(snapshot)` + show toast.
- **Null-coalescing lazy state init**: `useState(() => question.settings ?? getDefaultSettings(question.type))`.
- **Inline input double-save guard**: Call `event.target.blur()` inside the Enter keydown handler and skip the `onBlur` save handler if a `isSaving` ref is set, or use a `justSavedRef` flag that is cleared after one `onBlur` cycle.
- **Type-switcher component pattern**: A single `QuestionSettingsForm` component that receives `type` and `settings` props and delegates to the correct sub-form via a `switch`/`Record` lookup. Sub-forms receive `settings` and `onChange(Partial<Settings>)` — they never call `schedulePatch` directly.
- **Pure settings helpers in a types file**: Co-locate `getDefaultSettings(type)`, `getCompatibleSettings(oldType, newType, old)`, and all typed interfaces in one `questionSettings.ts` file. Import from components; never define defaults inline in component files.
- **afterEach vi.useRealTimers()**: Standard cleanup in any test suite that uses `vi.useFakeTimers()` alongside MSW or async state updates.

## Files to Review for Similar Tasks
- `frontend/src/types/questionSettings.ts` — all settings interfaces, `getDefaultSettings`, `getCompatibleSettings`.
- `frontend/src/components/survey-builder/settings/QuestionSettingsForm.tsx` — type-switcher pattern and prop contract.
- `frontend/src/components/survey-builder/QuestionEditor.tsx` — integration of `settingsJson` state, type-change handler sequence, and `schedulePatch` merge pattern.
- `frontend/src/components/survey-builder/settings/ChoiceSettingsForm.tsx` — best example of conditional field visibility across multiple subtypes within one form.
- `frontend/src/components/survey-builder/__tests__/QuestionSettingsForm.test.tsx` — test structure for type-switching, fake timer cleanup, and `act()` wrapping patterns.
- `frontend/src/mocks/handlers.ts` — reference for JSONB-accurate settings shapes in MSW handlers.

## Gotchas and Pitfalls
- **Do not read `settingsJson` state inside async patch callbacks** — snapshot it at the start of the handler.
- **`schedulePatch` must merge, not replace** — verify in `builderStore.ts` before wiring settings; a replace implementation will silently drop concurrent title/required updates.
- **`question.settings` can be `null`** — always null-coalesce; a missing guard causes a runtime error when spreading settings into form field defaults.
- **Enter + onBlur double-save** — inline text inputs in settings forms (placeholder, other_text, add_row_text, remove_row_text) will fire both the Enter handler and `onBlur`, causing two PATCH requests. Guard explicitly.
- **Fake timers must be restored** — `vi.useRealTimers()` in `afterEach` is non-optional when testing debounced patches alongside MSW; omitting it produces intermittent timeout failures in the next test file in the suite.
- **Type-change sequence is order-sensitive**: snapshot → `getCompatibleSettings()` → `setSettingsJson()` → `schedulePatch()`. Reversing any step risks patching with stale or incompatible settings.
- **Collapse state is local only** — do not add `typeSettingsOpen` or similar to `builderStore`; it belongs in component `useState`.
- **MSW mock fidelity** — a settings mock that returns `[]` instead of `{}` or `null` will pass shallow tests but break any code that spreads or Object.keys the settings value.
```
