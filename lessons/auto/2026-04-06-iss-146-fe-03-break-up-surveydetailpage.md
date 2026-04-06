---
date: "2026-04-06"
ticket_id: "ISS-146"
ticket_title: "FE-03: Break up SurveyDetailPage"
categories: ["testing", "ui", "refactoring", "bug-fix", "feature", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-146"
ticket_title: "FE-03: Break up SurveyDetailPage"
categories: ["frontend", "refactoring", "component-extraction", "react"]
outcome: "success"
complexity: "low"
files_modified:
  - frontend/src/pages/SurveyDetailPage.tsx
  - frontend/src/components/survey-detail/StatusBadge.tsx
  - frontend/src/components/survey-detail/LoadingSkeleton.tsx
  - frontend/src/components/survey-detail/ConfirmModal.tsx
  - frontend/src/components/survey-detail/QuestionTree.tsx
  - frontend/src/components/survey-detail/GroupItem.tsx
  - frontend/src/components/survey-detail/SurveyActions.tsx
  - frontend/src/components/survey-detail/SurveyMetaCard.tsx
  - frontend/src/components/survey-detail/types.ts
  - frontend/src/components/survey-detail/modalConfig.ts
  - frontend/src/components/survey-detail/index.ts
---

# Lessons Learned: FE-03: Break up SurveyDetailPage

## What Worked Well
- The extraction pattern established by FE-01 (SurveyBuilderPage) and FE-02 (LogicEditor) provided a clear, repeatable template: `components/<page-slug>/` directory with named exports and a barrel `index.ts`.
- The plan's guidance to extract a `modalConfig.ts` alongside `types.ts` was correct — modal configuration data (labels, descriptions, button text) is meaningfully separate from type definitions and benefits from its own file rather than being inlined in `ConfirmModal.tsx`.
- Two components not in the original plan were extracted (`SurveyHeader` from `SurveyActions.tsx` and `SurveyMetaCard`), reflecting organic discovery during implementation that the page had more extractable surface area than the initial line-count estimate suggested.
- Final line count of 248 lines just meets the AC target (under 250), confirming that line-count-based AC for refactors requires some margin — the target was nearly exact.
- Colocating `SurveyHeader` and `SurveyActions` in the same file (`SurveyActions.tsx`) is valid when the two components are tightly coupled by subject matter (both are navigation/header concerns) and keeps the component count manageable.

## What Was Challenging
- The plan predicted 5–6 components but 8 were ultimately extracted (StatusBadge, LoadingSkeleton, ConfirmModal, AnswerOptionItem+QuestionItem in QuestionTree, GroupItem, SurveyHeader, SurveyActions, SurveyMetaCard). Underestimating the number of extractable units is a recurring pattern in large-page refactors — line counts alone don't capture how many logically distinct components are present.
- The `modalConfig.ts` file was an unplanned addition, suggesting that data-only modules (lookup tables, config objects) should be explicitly considered during planning, not only component JSX.

## Key Technical Insights
1. **Separate data modules from component modules**: `modalConfig.ts` holding modal label/description/button config and `types.ts` holding TypeScript interfaces are both valid standalone modules. Pure data/config that doesn't render belongs in `.ts`, not `.tsx`.
2. **Co-location of related small components is acceptable**: `SurveyHeader` and `SurveyActions` live in the same file (`SurveyActions.tsx`) with two named exports — this avoids file proliferation when components are small and tightly coupled.
3. **Barrel exports must re-export types explicitly**: `index.ts` uses both `export { ... }` for values and `export type { ... }` for TypeScript types — mixing these in a single `export { ... }` line causes isolatedModules errors in Vite/Vitest environments.
4. **Line count AC is nearly fragile at exact boundaries**: 248/250 lines means a single added import or blank line could violate the AC. For future tickets, AC should be "under 300 lines" or similar with comfortable headroom, since the goal is readability, not a precise line number.
5. **No dnd-kit hooks were used in extracted components**: The plan's warning about `useSortable`/`useDroppable` requiring additional `vi.mock` declarations was a valid precaution but did not apply here — SurveyDetailPage is read-only and does not use drag-and-drop.

## Reusable Patterns
- **`components/<page-slug>/` directory structure** with `types.ts`, `modalConfig.ts` (if applicable), one `.tsx` per logical component group, and `index.ts` barrel export — this is now the established convention across FE-01, FE-02, FE-03.
- **Named exports only, no default exports** from extracted component files, to keep barrel re-exports uniform and tree-shakeable.
- **Config/data split**: when a component has a non-trivial lookup table or configuration object, extract it to a sibling `.ts` file rather than inlining it in the component.
- **Type-only barrel re-exports**: always include `export type { ... }` entries in `index.ts` for any TypeScript interfaces/types that consumers need, separate from the value exports.

## Files to Review for Similar Tasks
- `frontend/src/components/survey-detail/index.ts` — canonical example of a barrel with both value and type re-exports, plus a config module re-export.
- `frontend/src/components/survey-detail/SurveyActions.tsx` — example of two tightly-related components (`SurveyHeader` + `SurveyActions`) colocated in one file with two named exports.
- `frontend/src/components/survey-detail/modalConfig.ts` — example of a data/config module extracted alongside types, distinct from the component that consumes it.
- `frontend/src/pages/SurveyDetailPage.tsx` — result file at 248 lines; good reference for what a fully-extracted page component should look like.

## Gotchas and Pitfalls
- **Line count AC leaves no margin**: 248/250 is too close. Future refactor tickets should target "under 300" or explicitly note that the 250-line goal is a guideline, not a hard constraint, to avoid artificially constrained code.
- **Planning from line ranges alone misses data/config modules**: the original plan identified only JSX components to extract; `modalConfig.ts` emerged during implementation. When reading the source file, explicitly look for large object literals, lookup tables, and constant arrays as extraction candidates, not just function/component definitions.
- **Component count will exceed estimates**: for pages of 700+ lines, assume 8–12 extractable units rather than 5–6. Plan for the extra files in the directory scaffold step.
- **Unused parameters after extraction**: `SurveyActions` retains an `onBack: _onBack` prop with an underscore prefix to suppress the unused-variable warning — a sign that the interface was designed for the page's needs but the component itself doesn't use all props. Review prop interfaces after extraction to remove dead props if they serve no purpose.
```
