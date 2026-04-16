---
date: "2026-04-16"
ticket_id: "ISS-262"
ticket_title: "Response detail page shows [object Object] for matrix answer values"
categories: ["frontend", "rendering", "matrix-questions", "type-safety"]
outcome: "success"
complexity: "low"
files_modified: []
---

# Lessons Learned: Response detail page shows [object Object] for matrix answer values

## What Worked Well
- The fix was well-scoped: a single exported helper function `formatAnswerValue` centralized all value-rendering logic and was easy to test in isolation
- The existing `MatrixAnswerGrid` component already correctly grouped matrix subquestions by code prefix; the bug was only in value stringification, not in data structure or grouping logic
- Exporting `formatAnswerValue` as a named export made pure unit testing straightforward without needing to render the full component
- The two-layer approach (prefer `selected_option_title`, fall back to `formatAnswerValue`) naturally handled both enriched and raw answer shapes

## What Was Challenging
- Matrix questions surface in two distinct shapes in the response payload: (a) as individual subquestion rows with codes like `Q1_SQ001`, each with a scalar value, and (b) as a single row with the parent code and a plain object value — both shapes had to be handled
- `String(someObject)` silently produces `[object Object]` with no runtime error, making this class of bug invisible until manual inspection of the UI

## Key Technical Insights
1. JavaScript's `String()` coercion on a plain object always yields `[object Object]`. Any rendering path that reaches `String(value)` without a prior type guard will silently corrupt object-typed answer values.
2. The `typeof value === 'object'` guard must come after the `Array.isArray(value)` check because arrays also satisfy `typeof x === 'object'`; the order of guards is semantically significant.
3. Recursive application of `formatAnswerValue` inside both the array and object branches handles nested structures (e.g. `matrix_multiple` answers stored as `{ SQ001: ['A1', 'A2'] }`) without needing separate code paths.
4. The `MatrixAnswerGrid` component uses `selected_option_title ?? formatAnswerValue(answer.value)` — the nullish coalesce means enriched answers (with resolved option labels) are always preferred over raw codes, which is the correct display priority.

## Reusable Patterns
- **`formatAnswerValue(value: unknown): string`** — a recursive, null-safe value formatter that handles `null | undefined | '' → '—'`, arrays (comma-joined, recursive), objects (key: value pairs, recursive), and primitives (`String()`) is broadly reusable for any survey answer display context.
- **Export pure helpers alongside components** for easy isolated unit testing; the helper can be imported directly in tests without rendering the component.
- **Guard order for type narrowing**: always check `Array.isArray` before `typeof === 'object'` when both branches are needed.

## Files to Review for Similar Tasks
- `frontend/src/components/responses/ResponseDetail.tsx` — the `formatAnswerValue` helper, `AnswerValue` function, and `MatrixAnswerGrid` component all live here and are the canonical reference for answer rendering logic
- `frontend/src/components/responses/__tests__/ResponseDetail.test.tsx` — covers `formatAnswerValue` with null, undefined, empty string, primitives, arrays, plain objects, and nested object-with-array values; also covers `ResponseDetail` component rendering for matrix, matrix_multiple, non-matrix, and choice answer types

## Gotchas and Pitfalls
- `String(value)` is the implicit default when rendering unknown values in JSX; always add an `typeof === 'object'` guard before reaching a stringification call if the value type is `unknown` or `any`.
- An empty array `[]` joined with `', '` returns `''` which then falls through to displaying nothing rather than `'—'`; if an empty collection should display a placeholder, add an explicit length check before joining.
- An empty object `{}` rendered via `Object.entries(...).map(...).join(', ')` also returns `''`; same caveat applies.
- The `MatrixAnswerGrid` only renders when `subquestion_label` is present on answers; a matrix answer stored as a single row with a parent code and an object value bypasses `MatrixAnswerGrid` entirely and falls through to `AnswerValue` — both paths must be hardened.
- Matrix subquestion grouping relies on the regex `/^([A-Za-z0-9]+)_SQ\d+$/`; question codes that do not match this pattern will not be grouped as matrix parents even if their type is `matrix`.