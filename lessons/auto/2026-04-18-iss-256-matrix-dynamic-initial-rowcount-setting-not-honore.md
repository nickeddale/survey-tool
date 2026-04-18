---
date: "2026-04-18"
ticket_id: "ISS-256"
ticket_title: "Matrix Dynamic: initial row_count setting not honored"
categories: ["testing", "database", "ui", "bug-fix", "feature", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-18"
ticket_id: "ISS-256"
ticket_title: "Matrix Dynamic: initial row_count setting not honored"
categories: ["react", "state-management", "frontend", "bug-fix"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/components/question-inputs/MatrixDynamicInput.tsx"
  - "frontend/src/components/question-inputs/__tests__/MatrixDynamicInput.test.tsx"
---

# Lessons Learned: Matrix Dynamic: initial row_count setting not honored

## What Worked Well
- The root cause was quickly identified: `useState` lazy initializers only run once on mount, so a stale `default_row_count` (e.g., from a parent re-render) would never be reflected.
- The fix was minimal and surgical — two targeted changes to `MatrixDynamicInput.tsx`: correcting the initial row count formula with `Math.max(rowCount, minRowCount)` and adding a `useEffect` to re-sync when the setting changes.
- The condition guarding the re-sync (`value.length === 0 && rows.length !== initialRowCount`) correctly prevents overwriting user-entered data when settings change.
- Test coverage was thorough: distinct tests for `default_row_count=2`, prop-change re-sync with empty value, and prop-change with user-entered data (no reset).

## What Was Challenging
- The bug was subtle because `useState` lazy initializers are a common React pattern, but their "run once on mount" semantics mean they silently ignore prop updates — the component appeared correct but produced stale UI.
- Needed to verify whether the field was named `row_count` (backend schema) vs `default_row_count` (frontend type) — a naming inconsistency between layers that required cross-layer inspection.

## Key Technical Insights
1. **`useState` lazy initializers are mount-only.** If a prop used inside the initializer changes after mount, state will not update. A `useEffect` watching the derived value is required to re-sync.
2. **Guard re-sync on both conditions.** Only reset rows when `value.length === 0` (no user data) AND `rows.length !== initialRowCount` (state is actually wrong). Missing either guard causes either data loss or unnecessary re-renders.
3. **`Math.max(default_row_count, min_rows)` is the correct initial row count.** Using only `default_row_count` can violate the `min_rows` constraint on first render.
4. **Frontend field name (`default_row_count`) differs from the ticket's description (`row_count`).** Always verify field names across frontend types, backend schemas, and ticket language before assuming they match.

## Reusable Patterns
- **Re-sync pattern for derived initial state:**
  ```ts
  const [rows, setRows] = useState(() => value.length > 0 ? value : makeInitialRows(count))
  useEffect(() => {
    if (value.length === 0 && rows.length !== count) {
      setRows(makeInitialRows(count))
    }
  }, [count])
  ```
  Use this whenever a component initializes state from a prop-derived value that may change after mount.
- **Test rerenders for prop-change scenarios** using RTL's `rerender()` — always add a case for when the prop changes with empty value and another for when it changes with user data.

## Files to Review for Similar Tasks
- `frontend/src/components/question-inputs/MatrixDynamicInput.tsx` — canonical example of the re-sync pattern for setting-driven initial state.
- `frontend/src/types/questionSettings.ts` — source of truth for frontend field names on question settings types.
- `frontend/src/components/question-inputs/__tests__/MatrixDynamicInput.test.tsx` — reference for testing initial row count, prop-change re-sync, and user-data preservation.

## Gotchas and Pitfalls
- **Do not suppress the `react-hooks/exhaustive-deps` ESLint warning without understanding it.** In this case the suppression is intentional (only `initialRowCount` is the dependency, not `rows` or `value`, to avoid infinite loops), but it must be documented with a comment.
- **Ticket language may use a different field name than the codebase.** The ticket said `row_count`; the actual frontend setting is `default_row_count`. Always read the type definition before assuming the field name.
- **`useEffect` dependency on a derived value (not the raw prop) is correct here.** Depending on `question.settings.default_row_count` directly would also work but is more fragile if the derivation logic changes; depending on `initialRowCount` (the computed value) keeps the effect aligned with what the component actually uses.
- **Empty `value` prop is the sentinel for "no user data."** If the parent passes `[]` as the initial value and later passes a populated array, the component should not reset. The guard `value.length === 0` handles this correctly.
```
