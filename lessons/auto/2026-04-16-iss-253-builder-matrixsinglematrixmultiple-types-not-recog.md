---
date: "2026-04-16"
ticket_id: "ISS-253"
ticket_title: "Builder: matrix_single/matrix_multiple types not recognized in properties panel"
categories: ["testing", "ui", "bug-fix", "feature", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-16"
ticket_id: "ISS-253"
ticket_title: "Builder: matrix_single/matrix_multiple types not recognized in properties panel"
categories: ["frontend", "survey-builder", "type-registry", "matrix-questions"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/components/survey-builder/QuestionEditor.tsx"
  - "frontend/src/components/survey-builder/QuestionPreview.tsx"
  - "frontend/src/components/survey-builder/settings/QuestionSettingsForm.tsx"
---

# Lessons Learned: Builder: matrix_single/matrix_multiple types not recognized in properties panel

## What Worked Well
- The root cause was diagnosed quickly and precisely: the palette was emitting types that weren't registered in any of the three relevant lookup structures (type dropdown, settings form condition, preview registry).
- The fix was purely additive — no existing behavior needed to change, only missing entries needed to be added.
- MatrixPreview.tsx already handled the distinction between radio (matrix_single) and checkbox (matrix_multiple) input types, so no preview logic changes were needed.
- The implementation plan mapped each symptom directly to the file responsible, making execution straightforward.

## What Was Challenging
- Nothing was particularly challenging. The difficulty was recognizing that three separate files each had their own independent registry/condition that all needed updating in sync.

## Key Technical Insights
1. The survey builder has three independent registration points for each question type: (a) the type dropdown in QuestionEditor, (b) the settings routing condition in QuestionSettingsForm, and (c) the preview component map in QuestionPreview. A new type must be registered in all three or it will appear broken in the UI even if backend support is complete.
2. When a palette introduces new question types, the type strings it emits must exactly match the strings used in all downstream registry lookups. A mismatch (e.g., palette emits `matrix_single` but dropdown only knows `matrix`) causes silent fallback to defaults with no error.
3. It is worth verifying render components (like MatrixPreview) before assuming they need changes — in this case MatrixPreview already branched on input type internally, avoiding unnecessary work.

## Reusable Patterns
- **Type registration checklist for new question types**: When adding a new question type to the palette, always update (1) QUESTION_TYPE_OPTIONS in QuestionEditor, (2) the type-routing condition in QuestionSettingsForm, and (3) questionPreviewMap in QuestionPreview.
- **Symptom-to-file mapping**: "Type dropdown shows wrong label" → QuestionEditor; "No additional settings shown" → QuestionSettingsForm; "Preview not available" → QuestionPreview.

## Files to Review for Similar Tasks
- `frontend/src/components/survey-builder/QuestionEditor.tsx` — QUESTION_TYPE_OPTIONS array; must include every type the palette can create.
- `frontend/src/components/survey-builder/settings/QuestionSettingsForm.tsx` — conditional branches that route types to their settings forms.
- `frontend/src/components/survey-builder/QuestionPreview.tsx` — questionPreviewMap; maps type strings to preview components.
- `frontend/src/components/survey-builder/QuestionPalette.tsx` — source of truth for what type strings are emitted when a question is dragged/added.
- `frontend/src/components/survey-builder/previews/MatrixPreview.tsx` — handles matrix rendering; check its internal branching before assuming it needs changes.

## Gotchas and Pitfalls
- The generic `matrix` type and the specific `matrix_single`/`matrix_multiple` types are distinct strings. Do not assume that registering `matrix` covers its subtypes — each must be explicitly listed.
- When the type dropdown falls back to a default (e.g., "Short Text"), it does so silently; there is no console error. This makes the root cause non-obvious without tracing the type string through each registration point.
- Adding a type to the dropdown but forgetting to add it to QuestionSettingsForm will still show "No additional settings" even though the label is now correct — both must be updated together.
- Always check existing preview/render components for internal branching logic before writing new ones; duplication is easy to introduce if you assume the component is a single-type handler.
```
