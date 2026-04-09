---
date: "2026-04-09"
ticket_id: "ISS-198"
ticket_title: "QuestionPalette adds questions to wrong group"
categories: ["testing", "api", "ui", "refactoring", "bug-fix", "feature", "performance", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-09"
ticket_id: "ISS-198"
ticket_title: "QuestionPalette adds questions to wrong group"
categories: ["frontend", "state-management", "bug-fix", "zustand"]
outcome: "success"
complexity: "low"
files_modified: ["frontend/src/pages/SurveyBuilderPage.tsx"]
---

# Lessons Learned: QuestionPalette adds questions to wrong group

## What Worked Well
- The root cause was clearly identified in the ticket description — `handlePaletteAddQuestion` always picked the last group rather than consulting `selectedItem` from the builder store
- The implementation plan correctly anticipated the three-case logic: selected group → selected question (find parent group) → fallback to last group
- Pre-implementation exploration of `builderStore.ts` to verify the `SelectedItem` discriminant shape (`type: 'group' | 'question'`) and `BuilderGroup.questions` element type prevented silent fallthrough bugs
- Running `npm run build` before tests caught any TypeScript errors early

## What Was Challenging
- The fallback behavior (last group when nothing is selected) had to be preserved exactly — removing it would break existing behavior for users who haven't selected anything
- The question→group lookup required knowing whether `BuilderGroup.questions` held full `Question` objects or ID strings; a wrong assumption causes a silent no-match that falls through to the wrong group with no error

## Key Technical Insights
1. When resolving a "target" from a selection context, always handle all discriminant cases explicitly and place the fallback last — never assume the first match is sufficient
2. Zustand store `selectedItem` discriminants must be matched with exact string literals (`'group'` vs `'question'`); a typo silently falls through with no runtime error
3. `BuilderGroup.questions` element shape (full objects vs ID strings) must be verified before writing any `.find()` or `.includes()` lookup — a wrong assumption produces a silent fallback, not a crash
4. Running `npm run build` after a TSX edit is a lightweight smoke test that catches type errors before running the full Vitest suite

## Reusable Patterns
- **Three-branch target resolution**: `if selectedItem.type === 'group'` → use directly; `else if selectedItem.type === 'question'` → find parent group; `else` → fallback. Use this pattern anywhere a palette or toolbar action must target the currently focused container.
- **Pure helper for testability**: Extract target-group resolution into `resolveTargetGroup(selectedItem, groups, sortedGroups)` so it can be unit-tested without mounting the full page component.
- **Verify store types before coding conditionals**: Always read the store's TypeScript type definitions for discriminated unions before writing `if (x.type === '...')` — do not guess string literals.

## Files to Review for Similar Tasks
- `frontend/src/pages/SurveyBuilderPage.tsx` — `handlePaletteAddQuestion` function
- `frontend/src/store/builderStore.ts` — `SelectedItem` type and `BuilderGroup` shape
- Any palette/toolbar component that dispatches "add item" actions to a nested data structure

## Gotchas and Pitfalls
- **Silent fallthrough**: If the `selectedItem.type` discriminant string doesn't match exactly, the code silently falls through to `lastGroup` — the bug reproduces with no console error
- **`BuilderGroup.questions` element shape**: If elements are full objects, use `.find(q => q.id === selectedItem.id)`; if IDs only, use `.some(id => id === selectedItem.id)`. A wrong check returns `undefined` and triggers the fallback silently
- **Don't remove the lastGroup fallback**: It preserves correct behavior when the user has not selected any item; removing it breaks the initial state of the builder
- **Sort order**: Groups must be sorted by `sort_order` before taking the last element for the fallback — the store does not guarantee sorted order at call-site
```
