---
date: "2026-04-16"
ticket_id: "ISS-269"
ticket_title: "Add matrix question types to builder question type dropdown"
categories: ["frontend", "survey-builder", "ui"]
outcome: "success"
complexity: "low"
files_modified: ["frontend/src/components/survey-builder/GroupPanel.tsx"]
---

# Lessons Learned: Add matrix question types to builder question type dropdown

## What Worked Well
- The implementation was purely additive — two entries appended to an existing constant array with zero risk of regression
- The `QUESTION_TYPES` constant in `GroupPanel.tsx` is the single source of truth for the dropdown, so the change was localized to one place
- No new imports were required; the dropdown renders items as plain text labels, so no icon dependencies needed to be added
- The existing `data-testid` pattern (`group-add-question-type-${group.id}-${type}`) automatically generates correct test IDs for the new types

## What Was Challenging
- Nothing was technically challenging; the main risk was identifying the correct file — the implementation plan initially mentioned checking `QuestionPalette.tsx` for icon conventions, but `GroupPanel.tsx` uses no icons in its dropdown items (just labels), so that comparison was unnecessary

## Key Technical Insights
1. `GroupPanel.tsx` and `QuestionPalette.tsx` are separate UI surfaces that both list question types — changes to one do not propagate to the other. Each must be updated independently when adding new question types.
2. The `QUESTION_TYPES` array in `GroupPanel.tsx` only uses `type` and `label` fields; there are no icon references in the dropdown at all, unlike `QuestionPalette.tsx` which uses `Grid3x3` icons. The implementation plan's step to verify `Grid3x3` import was unnecessary for this file.
3. Backend support for `matrix_dropdown` and `matrix_dynamic` already existed prior to this ticket (added in ISS-265 through ISS-268), so no schema or API changes were required.

## Reusable Patterns
- When adding a new question type to the builder palette, check both `GroupPanel.tsx` (inline dropdown) and `QuestionPalette.tsx` (sidebar palette) — they are independent and both must be updated
- The `QUESTION_TYPES` constant at the top of `GroupPanel.tsx` is the authoritative list for the "+ Question" dropdown; adding an entry there is all that's needed to expose the type in the UI

## Files to Review for Similar Tasks
- `frontend/src/components/survey-builder/GroupPanel.tsx` — `QUESTION_TYPES` constant (lines 51–60) controls the "+ Question" dropdown
- `frontend/src/components/survey-builder/QuestionPalette.tsx` — separate question type palette (sidebar); uses icons from lucide-react
- `frontend/src/store/builderStore.ts` — handles `onAddQuestion` logic that receives the selected type string

## Gotchas and Pitfalls
- Do not assume that adding a type to `GroupPanel.tsx`'s `QUESTION_TYPES` also updates `QuestionPalette.tsx` — they are completely separate lists
- The implementation plan mentioned verifying or adding a `Grid3x3` icon import, but `GroupPanel.tsx` renders dropdown items as text-only labels with no icons; that check was a red herring specific to `QuestionPalette.tsx`'s rendering style
- If a future question type requires special editor/preview support, verify that `QuestionCard`, `QuestionPreview`, and the property editor all handle the new `question_type` value before exposing it in the dropdown