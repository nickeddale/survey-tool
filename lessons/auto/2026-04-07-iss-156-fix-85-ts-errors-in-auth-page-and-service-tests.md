---
date: "2026-04-07"
ticket_id: "ISS-156"
ticket_title: "Fix 85 TS errors in auth, page, and service tests"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-07"
ticket_id: "ISS-156"
ticket_title: "Fix 85 TS errors in auth, page, and service tests"
categories: ["typescript", "testing", "auth", "refactoring", "frontend"]
outcome: "success"
complexity: "medium"
files_modified:
  - frontend/src/components/__tests__/AppLayout.test.tsx
  - frontend/src/components/__tests__/ProtectedRoute.test.tsx
  - frontend/src/components/__tests__/PublicRoute.test.tsx
  - frontend/src/contexts/__tests__/AuthContext.test.tsx
  - frontend/src/pages/__tests__/DashboardPage.test.tsx
  - frontend/src/pages/__tests__/SurveysPage.test.tsx
  - frontend/src/pages/__tests__/SurveyBuilderPage.test.tsx
  - frontend/src/pages/__tests__/SurveyDetailPage.test.tsx
  - frontend/src/pages/__tests__/SurveyPreviewPage.test.tsx
  - frontend/src/pages/__tests__/SurveyFormPage.test.tsx
  - frontend/src/pages/__tests__/ParticipantsPage.test.tsx
  - frontend/src/pages/__tests__/QuotasPage.test.tsx
  - frontend/src/pages/__tests__/WebhooksPage.test.tsx
  - frontend/src/pages/__tests__/AssessmentsPage.test.tsx
  - frontend/src/pages/__tests__/LoginPage.test.tsx
  - frontend/src/pages/__tests__/RegisterPage.test.tsx
  - frontend/src/components/survey-builder/__tests__/QuestionEditor.test.tsx
  - frontend/src/components/survey-builder/__tests__/GroupPanel.test.tsx
  - frontend/src/services/__tests__/assessmentService.test.ts
  - frontend/src/services/__tests__/participantService.test.ts
  - frontend/src/hooks/__tests__/useValidation.test.ts
  - frontend/src/mocks/handlers.ts
  - frontend/src/contexts/__tests__/AuthContext.test.tsx
  - frontend/src/services/__tests__/authService.test.ts
---

# Lessons Learned: Fix 85 TS errors in auth, page, and service tests

## What Worked Well
- Treating the work as a single-axis change (remove `refresh_token` from all TokenResponse mocks) made it easy to batch across 24 files systematically
- Running `npx tsc --noEmit` and `npm run build` independently caught divergence early — Vite can succeed while tsc still reports errors due to different tsconfig exclusion rules
- The MSW handler in `src/mocks/handlers.ts` was updated alongside the type fixes, keeping handler response shapes and TypeScript types in sync and preventing silent divergence
- Error count per file (26, 8, 2, 27, 19, 4, 1) gave a clear audit trail to verify completeness — after fixes, each file's error count dropped to zero as expected

## What Was Challenging
- The 85 errors were spread across 24 files in 6 different directories, making it easy to miss files without a systematic inventory up front
- Argument count mismatches in `vi.fn()` mocks are silently accepted by TypeScript at the mock declaration site but cause failures at call sites — they don't always surface until tsc checks the call expression in context
- Distinguishing between "field removed from schema" and "field explicitly excluded from response" requires reading both the Pydantic schema and the service layer — omitting `refresh_token` from `TokenResponse` doesn't guarantee it won't appear if a response is constructed manually elsewhere

## Key Technical Insights
1. When an auth refactoring moves a token from the response body to an httpOnly cookie, every mock in the test suite that constructs a `TokenResponse` object becomes stale — the number of affected files scales with how widely the token shape is copied across test fixtures.
2. `npm run build` (Vite) and `npx tsc --noEmit` can disagree: Vite uses its own tsconfig include/exclude rules and may not type-check all test files. Always run both as separate validation steps after bulk type fixes.
3. MSW handlers in `src/mocks/handlers.ts` are not type-checked against the application's TypeScript types by default — they can return stale shapes that tests accept at runtime while the real API has diverged. Treat handler response bodies as first-class type artifacts and update them in the same commit as the type changes.
4. For survey-builder test files that use dnd-kit components, module-level `vi.mock('@dnd-kit/sortable')` and `vi.mock('@dnd-kit/core')` are required to avoid JSDOM pointer event failures — component prop mismatches from auth refactoring can mask this underlying requirement until the prop errors are fixed.
5. The `from __future__ import annotations` + `request: Request` + `@limiter.limit` combination in FastAPI router files causes ForwardRef resolution failures in Pydantic — when touching auth service files, verify this combination is absent before modifying function signatures.

## Reusable Patterns
- **Batch mock audit**: After any API response shape change, run `grep -r "refresh_token\|TokenResponse" frontend/src --include="*.ts" --include="*.tsx" -l` to enumerate all affected files before writing a single fix
- **Dual validation**: Always run both `npm run build` and `npx tsc --noEmit` after bulk type fixes — use the tsc output as the authoritative error count
- **Handler parity check**: After updating a response type, grep `src/mocks/handlers.ts` for the old field names to confirm the MSW handler was updated in the same pass
- **Arity verification**: When fixing mocked function argument counts, cross-reference the actual function signature in `src/services/authService.ts` rather than inferring arity from call sites — call sites may themselves be wrong
- **Explicit absence assertion**: In tests that validate token responses, add an assertion that `response.refresh_token` is `undefined` — type omission alone does not prevent a runtime property from existing if the mock is constructed via type assertion (`as TokenResponse`)

## Files to Review for Similar Tasks
- `frontend/src/types/auth.ts` — canonical TokenResponse shape; any change here fans out to all test mocks
- `frontend/src/mocks/handlers.ts` — MSW handler response bodies must stay in sync with type definitions; divergence here causes tests to pass while masking real type mismatches
- `frontend/src/services/authService.ts` — function arity source of truth for all `vi.fn()` mocks across test files
- `frontend/src/contexts/AuthContext.tsx` — auth context shape drives mock requirements in ProtectedRoute, PublicRoute, and AppLayout tests
- `frontend/src/components/__tests__/AppLayout.test.tsx` — highest error count (26); good reference for the full pattern of stale mock cleanup

## Gotchas and Pitfalls
- **Silent arity mismatch**: TypeScript does not error on `vi.fn()` declarations with wrong argument counts at the mock site — errors only surface at typed call sites. Always verify mock arity against the real implementation.
- **Vite/tsc discrepancy**: A passing `npm run build` does not mean zero tsc errors. Vite may exclude test files from its type-check pass. Run `npx tsc --noEmit` explicitly.
- **Handler shape drift**: `src/mocks/handlers.ts` is not type-checked against API response schemas. It can silently return `{ access_token, refresh_token, token_type }` after the type has been narrowed to `{ access_token, token_type, expires_in }` — tests will pass while masking the divergence.
- **Field omission vs. exclusion**: Removing `refresh_token` from `TokenResponse` in Pydantic/TypeScript does not prevent it from appearing in a manually constructed mock object cast with `as TokenResponse`. Add explicit `undefined` assertions in tests that must guarantee the field is absent.
- **Survey-builder dnd-kit tests**: Fixing component prop mismatches in `QuestionEditor.test.tsx` and `GroupPanel.test.tsx` may expose hidden dnd-kit pointer event failures in JSDOM — add `vi.mock('@dnd-kit/sortable')` and `vi.mock('@dnd-kit/core')` proactively when touching these files.
- **ForwardRef/Pydantic trap**: Do not add `request: Request` to FastAPI endpoint signatures in files that use `from __future__ import annotations` alongside `@limiter.limit` — this triggers ForwardRef resolution failures that manifest as 400 errors, not type errors.
```
