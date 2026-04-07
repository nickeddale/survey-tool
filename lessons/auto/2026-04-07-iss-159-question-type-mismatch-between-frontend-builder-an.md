---
date: "2026-04-07"
ticket_id: "ISS-159"
ticket_title: "Question type mismatch between frontend builder and backend API"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "documentation", "config", "ci-cd", "refactoring"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-07"
ticket_id: "ISS-159"
ticket_title: "Question type mismatch between frontend builder and backend API"
categories: ["frontend", "api-contracts", "constants", "testing"]
outcome: "success"
complexity: "low"
files_modified:
  - frontend/src/components/survey-builder/QuestionPalette.tsx
  - frontend/src/components/survey-builder/BuilderToolbar.tsx
  - frontend/src/components/survey-builder/QuestionEditor.tsx
  - frontend/src/components/survey-builder/AnswerOptionsEditor.tsx
  - frontend/src/components/survey-builder/QuestionPreview.tsx
  - frontend/src/components/survey-builder/logic/ValueInput.tsx
  - frontend/src/components/survey-builder/previews/ChoicePreview.tsx
  - frontend/src/components/survey-builder/settings/ChoiceSettingsForm.tsx
  - frontend/src/components/survey-builder/settings/QuestionSettingsForm.tsx
  - frontend/src/components/responses/SurveyForm.tsx
  - frontend/src/components/survey/GroupPanel.tsx
  - frontend/src/types/questionSettings.ts
  - frontend/src/mocks/handlers.ts
---

# Lessons Learned: Question type mismatch between frontend builder and backend API

## What Worked Well
- The implementation plan correctly identified the three primary files needing changes upfront (QuestionPalette.tsx, BuilderToolbar.tsx, QuestionEditor.tsx).
- Running `npm run build` before `npm run test:run` surfaced downstream type mismatches quickly, preventing wasted time chasing test failures that were actually TypeScript errors.
- Treating the backend `VALID_QUESTION_TYPES` in `question.py` as the single source of truth gave a clear, authoritative reference list throughout the rename.
- The advance warning about MSW handlers in `handlers.ts` containing stale type strings proved accurate — catching this proactively prevented test failures.

## What Was Challenging
- The old type strings (`text`, `radio`, `checkbox`, `select`, `number`) are common substrings that appear in unrelated contexts (e.g., `short_text` contains `text`, HTML input `type="number"` is unrelated). Bare grep produced many false positives and required context-aware patterns.
- The mismatch was silently broken in switch/case rendering branches — TypeScript did not flag string literal mismatches in switch cases because the type was `string` rather than a strict union, so incorrect branches compiled without errors.
- The fix spread beyond the three originally identified files; `SurveyForm.tsx`, `GroupPanel.tsx`, `AnswerOptionsEditor.tsx`, `QuestionPreview.tsx`, `ValueInput.tsx`, `ChoicePreview.tsx`, `ChoiceSettingsForm.tsx`, `QuestionSettingsForm.tsx`, and `questionSettings.ts` all contained references to old type names.

## Key Technical Insights
1. **String enum mismatches are invisible to TypeScript unless the type is a strict union or literal.** A `type QuestionType = string` (or untyped constant) will not catch `'radio'` vs `'single_choice'` mismatches at compile time. Narrowing the type to a strict union (`'short_text' | 'long_text' | ...`) makes future regressions compile errors rather than runtime 400s.
2. **MSW mock handlers mirror API payload shapes and drift silently.** Whenever backend enum values change, `src/mocks/handlers.ts` must be audited — it is not caught by TypeScript if the handler returns untyped JSON.
3. **Duplicate constant arrays in multiple components are a maintenance hazard.** `QUESTION_TYPES` was defined independently in both `QuestionPalette.tsx` and `BuilderToolbar.tsx`, causing them to drift out of sync. A single shared constant exported from `src/types/` or a dedicated constants file eliminates this class of bug entirely.
4. **Switch/case branches on question type strings silently break the UI when type values change.** Components like `QuestionEditor.tsx` that gate rendering on `case 'radio':` will render nothing (or the wrong thing) when the value becomes `'single_choice'`, with no runtime error — only a blank or missing UI element.

## Reusable Patterns
- **Context-aware grep patterns**: search for `type: 'radio'`, `=== 'checkbox'`, `case 'text':` rather than bare `radio` or `text` to avoid false positives when renaming question type strings.
- **Audit MSW handlers after any API payload shape change**: run `grep -r "question_type\|questionType" src/mocks/` as a checklist item whenever backend enums are modified.
- **Centralise shared constants**: extract repeated literal arrays (like `QUESTION_TYPES`) into `src/types/` or `src/constants/` and import them everywhere — prevents silent drift between components.
- **Upgrade loose string types to strict unions**: after a rename, tighten `questionType: string` to `questionType: QuestionType` in component props and store slices so future mismatches become compiler errors.

## Files to Review for Similar Tasks
- `frontend/src/types/questionSettings.ts` — TypeScript union/literal definitions for question types; must be updated alongside any constant rename.
- `frontend/src/mocks/handlers.ts` — MSW mock payloads; contains hardcoded type strings mirroring the API contract.
- `frontend/src/components/responses/SurveyForm.tsx` — renders question inputs by type; contains switch/case or conditional branches on type strings.
- `frontend/src/components/survey/GroupPanel.tsx` — renders group question UI; may branch on type strings for display logic.
- `frontend/src/components/survey-builder/settings/QuestionSettingsForm.tsx` and `ChoiceSettingsForm.tsx` — settings forms conditionally shown based on question type.
- `frontend/src/components/survey-builder/logic/ValueInput.tsx` — logic/condition value inputs conditionally rendered by type.
- `backend/app/models/question.py` — canonical `VALID_QUESTION_TYPES` list; the single source of truth.

## Gotchas and Pitfalls
- **`text` is a substring of `short_text` and `long_text`** — bare grep for `'text'` will match unrelated hits. Always anchor with surrounding context like `type: 'text'` or `=== 'text'`.
- **`number` matches HTML `<input type="number">`** — grep for `'number'` as a question type will match unrelated input attributes. Use `questionType.*number` or `case 'number':` patterns.
- **Silent UI breakage from stale switch branches** — after renaming type constants, visually inspect each question type in the running builder. A missing choice editor or blank settings panel is the symptom; TypeScript will not warn you.
- **Two independent copies of `QUESTION_TYPES`** existed in `QuestionPalette.tsx` and `BuilderToolbar.tsx` — changing one without the other leaves the toolbar broken while the palette works, or vice versa. Always grep for duplicate definitions after updating a constant.
- **`questionSettings.ts` type unions needed updating** — the TypeScript build caught this, but only because the union was actually used in typed props. If the union had been unused or typed as `string`, it would have silently remained stale.
```
