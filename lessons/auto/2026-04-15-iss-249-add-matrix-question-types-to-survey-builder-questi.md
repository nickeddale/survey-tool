---
date: "2026-04-15"
ticket_id: "ISS-249"
ticket_title: "Add matrix question types to survey builder question palette"
categories: ["testing", "ui", "bug-fix", "feature", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-15"
ticket_id: "ISS-249"
ticket_title: "Add matrix question types to survey builder question palette"
categories: ["frontend", "survey-builder", "ui", "question-types"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/components/survey-builder/QuestionPalette.tsx"
  - "frontend/src/components/survey-builder/BuilderToolbar.tsx"
---

# Lessons Learned: Add matrix question types to survey builder question palette

## What Worked Well
- The implementation plan matched the actual change exactly — two files, two array extensions, one icon import
- The `QUESTION_TYPES` array pattern in both files is clean and data-driven; adding new types required no structural changes, only new entries
- `Grid3x3` from `lucide-react` was a natural fit for matrix question types and was already available in the icon library
- Both files iterated `QUESTION_TYPES` via `.map()`, so the new entries were automatically picked up by all rendering paths (palette buttons, toolbar dropdown, overflow mobile menu) without any additional wiring

## What Was Challenging
- Nothing significant — this was a pure additive change with no logic modifications
- The only risk was missing one of the two files, since the same `QUESTION_TYPES` constant is defined independently in both components rather than being shared

## Key Technical Insights
1. `BuilderToolbar.tsx` renders `QUESTION_TYPES` in **two** places: the main "Add Question" dropdown (desktop) and the overflow `MoreHorizontal` dropdown (mobile). Adding entries to the shared constant automatically populated both, but a reviewer must be aware both paths exist.
2. `QuestionPalette.tsx` exports `QUESTION_TYPES` as a named export (`export const`), while `BuilderToolbar.tsx` keeps it module-private (`const`). The two constants are not shared, which means they can silently diverge in future changes.
3. The backend validators and frontend rendering components for matrix types were already fully implemented — this ticket was entirely a UI discoverability gap, not a missing capability.

## Reusable Patterns
- When adding a new question type to the survey builder, the minimal touch points are: `QuestionPalette.tsx` (palette sidebar) and `BuilderToolbar.tsx` (toolbar dropdown + mobile overflow). Both maintain a `QUESTION_TYPES` array that must be kept in sync.
- Icon selection for question types: use `lucide-react` icons. Match icon semantics to question format (e.g., `Grid3x3` for matrix/tabular, `Hash` for number, `List` for dropdown).
- The `data-testid` attributes follow the pattern `palette-question-type-{type}` (palette) and `add-question-type-{type}` / `overflow-add-question-type-{type}` (toolbar), which can be used directly in Playwright or RTL tests.

## Files to Review for Similar Tasks
- `frontend/src/components/survey-builder/QuestionPalette.tsx` — palette sidebar; owns `QUESTION_TYPES` (exported)
- `frontend/src/components/survey-builder/BuilderToolbar.tsx` — toolbar + mobile overflow; owns a parallel `QUESTION_TYPES` (private)
- `frontend/src/types/` — if a new question type requires TypeScript union type extensions, check type definitions here
- `frontend/src/store/builderStore.ts` — if the new question type needs special initial state or handling in `addQuestion`
- `backend/app/services/validators/` — backend validator for any new question type must exist before the UI change is meaningful

## Gotchas and Pitfalls
- **Duplicate constant risk**: `QUESTION_TYPES` is defined independently in both files. There is no single source of truth. If one file is updated and the other is missed, the palette and toolbar will silently show different sets of question types. Consider extracting to a shared constants file (e.g., `src/components/survey-builder/questionTypes.ts`) in a future refactor.
- **Mobile overflow menu**: `BuilderToolbar.tsx` renders question types in a second dropdown for small screens. It is easy to assume only one dropdown exists and miss the mobile path during testing.
- **Icon reuse**: Multiple matrix subtypes share the same `Grid3x3` icon. This is intentional for visual grouping, but if individual matrix types ever need distinct icons, all four entries must be updated.
- **No backend change needed**: Matrix question type validators already existed. Do not add backend migrations or schema changes for a ticket of this class — the gap was purely in UI enumeration.
```
