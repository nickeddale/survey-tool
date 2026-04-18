---
date: "2026-04-18"
ticket_id: "ISS-280"
ticket_title: "Matrix answers on response detail page not rendered as tables"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-18"
ticket_id: "ISS-280"
ticket_title: "Matrix answers on response detail page not rendered as tables"
categories: ["frontend", "react", "rendering", "type-matching"]
outcome: "success"
complexity: "low"
files_modified: ["frontend/src/components/responses/ResponseDetail.tsx"]
---

# Lessons Learned: Matrix answers on response detail page not rendered as tables

## What Worked Well
- The implementation plan correctly identified the root cause before any code was written: `isMatrixParent` was only set for `matrix_dynamic`, leaving all other matrix family types falling through to the flat renderer.
- Reading backend source files first (response_query_service.py, schemas/response.py) before touching frontend code confirmed exact enum string values and prevented field-name drift.
- The fix was a single-condition change — extending one equality check to an `includes()` array — which kept the blast radius minimal.

## What Was Challenging
- The bug was entirely invisible at the schema level: `matrix_column_headers` existed in the Pydantic schema and the TypeScript types, giving false confidence that the feature was wired up correctly.
- MSW mock handlers were a latent risk: if they returned simplified answer payloads without `matrix_column_headers`, Vitest tests would pass while the actual rendering path remained untested.
- The condition `questionType === 'matrix_dynamic'` was the only matrix guard, so all other matrix variants silently fell through — no error, no warning, just wrong output.

## Key Technical Insights
1. A field declared in a Pydantic schema and a TypeScript interface does not guarantee runtime population. Always trace the actual population path through the service layer (e.g., `response_query_service.py`) before assuming a field will be present.
2. `isMatrixParent` was gated on a single string equality check. Any time a feature supports a family of variants, the guard condition should enumerate all members of that family, not just the first one added.
3. TypeScript's type narrowing can introduce errors when changing `=== 'literal'` to `.includes([...])` if `questionType` is typed as a union literal. Always run `npm run build` (TypeScript check) immediately after such a change, before running Vitest.
4. The groupAnswers() function's matrix detection logic was the sole gating point; there was no fallback error or warning when a matrix-type question failed to match, making the bug hard to notice without visual inspection.

## Reusable Patterns
- When a dispatch/routing condition covers one member of a variant family (e.g., `matrix_dynamic`), search for sibling types in the backend enum/schema and add all of them to the condition at the same time.
- Before writing any frontend fix that depends on a backend field, read the service layer file and confirm: (a) the field is populated, not just declared, and (b) it is populated for the specific answer shape the frontend will receive (parent vs. subquestion answer).
- After adding string literals to an `includes()` array, cross-check each value against the backend serialized output (snake_case enum values), not assumed naming conventions.
- MSW handlers in `src/mocks/handlers.ts` must mirror the full backend response shape for the code path under test — simplified shapes cause false-green tests.

## Files to Review for Similar Tasks
- `frontend/src/components/responses/ResponseDetail.tsx` — groupAnswers() function and matrix dispatch condition
- `backend/app/services/response_query_service.py` — matrix type constants and matrix_column_headers population logic
- `backend/app/schemas/response.py` — ResponseAnswerDetail and MatrixColumnHeader schemas
- `frontend/src/mocks/handlers.ts` — response detail mock payloads (verify matrix_column_headers is included)

## Gotchas and Pitfalls
- Schema presence ≠ runtime population. `matrix_column_headers` in the schema is not proof the field is non-null in the API response for all question types.
- MSW handlers with simplified shapes give false confidence. A passing Vitest suite does not confirm the matrix rendering path is exercised unless the handler returns a full payload with `matrix_column_headers`.
- String literal arrays in type-narrowing conditions must exactly match backend-serialized values. `'matrix_single'` is not the same as `'matrix-single'` or `'MatrixSingle'` — verify against the source, not convention.
- Flat fallthrough with no error. When `isMatrixParent` is false for a matrix question, the renderer silently produces comma-separated code strings instead of a table — no console error, no thrown exception. This makes the bug easy to miss in automated tests.
- `npm run build` must be run after any `includes()` array change to catch TypeScript type narrowing errors that Vitest will not surface.
```
