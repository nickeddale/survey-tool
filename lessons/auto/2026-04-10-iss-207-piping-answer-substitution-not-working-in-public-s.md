---
date: "2026-04-10"
ticket_id: "ISS-207"
ticket_title: "Piping (answer substitution) not working in public survey form question titles"
categories: ["frontend", "bug-fix", "survey-logic", "testing"]
outcome: "success"
complexity: "medium"
files_modified: []
---

# Lessons Learned: Piping (answer substitution) not working in public survey form question titles

## What Worked Well
- The existing `buildVisibleSurvey` function in `responseHelpers.ts` was already the right abstraction — the fix was confined to changing how it looked up keys in `pipedTexts` rather than restructuring the data flow
- `SurveyResponsePage.tsx` already threaded `pipedTexts` from `useFlowResolution` through `buildVisibleSurvey` into the `visibleSurvey` memo and passed that to `SurveyForm` — no wiring changes were needed
- The `applyPipedText` utility was retained as a documented fallback/legacy helper rather than deleted, preserving its usefulness for ad-hoc substitution outside `buildVisibleSurvey`
- Unit tests for `responseHelpers.ts` were colocated in a new `__tests__/` directory, consistent with frontend testing conventions

## What Was Challenging
- The root cause was a key-format mismatch between frontend and backend: the frontend looked up raw `{CODE}` tokens as direct keys, but the backend's `pipe_all()` returns fully-resolved strings keyed as `{code}_title`, `{code}_description`, and `{code}_{opt_code}_title` — easy to miss without reading both sides
- The fix required understanding backend piping semantics: unlike client-side regex substitution, backend keys already contain the fully resolved text, so `buildVisibleSurvey` must use the pre-resolved value directly, not re-apply regex replacement on top of it

## Key Technical Insights
1. **Backend key format is `{code}_title` / `{code}_description` / `{code}_{opt_code}_title`**: The backend's `pipe_all()` in `piping.py` produces a flat dict where each value is the *fully substituted* string. The frontend must index into this dict using those compound keys, not the raw variable name from the `{VARIABLE}` placeholder.
2. **Don't double-substitute**: Once the backend has resolved `{NAME}` inside a title string, the frontend should use that resolved string as-is. Applying a second regex pass would break if resolved text happened to contain braces.
3. **`null` description must stay `null`**: `buildVisibleSurvey` must guard against replacing a `null` description with a string from `pipedTexts` — the check `q.description !== null && q.description !== undefined` is necessary to preserve `null` semantics downstream.
4. **`visibleSurvey ?? survey` fallback in JSX**: `SurveyResponsePage` passes `visibleSurvey ?? survey` to `SurveyForm`, ensuring the raw survey is shown before flow resolution completes rather than showing nothing.

## Reusable Patterns
- **Pre-resolved backend piping**: When the backend returns fully-resolved piped text, the frontend should treat each entry as a complete replacement value indexed by a compound key (`{code}_field`), not as a dictionary of variable values to substitute into a template.
- **Null-safe field replacement**: When overlaying backend-resolved text onto optional fields (`description`, `answer_options`), always null-check before applying the override to avoid converting intentionally-absent fields to empty strings.
- **Colocating unit tests for helpers**: Pure transformation functions like `applyPipedText` and `buildVisibleSurvey` benefit from exhaustive unit tests in a colocated `__tests__/` file that covers happy-path, fallback, null-preservation, and immutability cases independently from integration tests.

## Files to Review for Similar Tasks
- `frontend/src/components/survey-response/responseHelpers.ts` — canonical location for survey display transformation logic (piping, filtering, answer serialization)
- `frontend/src/components/survey-response/__tests__/responseHelpers.test.ts` — unit test coverage for piping key-format assumptions; update these when backend key format changes
- `backend/app/services/expressions/piping.py` — defines `pipe_all()` and the exact key naming convention (`{code}_title`, `{code}_description`, `{code}_{opt_code}_title`)
- `frontend/src/hooks/useFlowResolution.ts` — where `pipedTexts` originates; any changes to the resolve-flow API response shape must be reflected here first
- `frontend/src/pages/__tests__/SurveyResponsePage.test.tsx` — integration test for the piped-text flow, covering `resolve-flow` MSW mock shape

## Gotchas and Pitfalls
- **Backend key format is not `{CODE}` but `{code}_title`**: A common mistake is to assume `pipedTexts['NAME']` holds the resolved title for the `NAME` question; it does not — the correct key is `pipedTexts['NAME_title']`
- **Answer option keys use three segments**: Option piping uses `{q_code}_{opt_code}_title`, not `{opt_code}_title` alone — collisions across questions are avoided by prefixing the parent question code
- **`applyPipedText` uses a different key convention**: That utility expects raw variable names as keys (e.g., `{ NAME: 'Alice' }`) and does client-side regex substitution — it is not compatible with the backend-keyed `pipedTexts` map and should not be used as a drop-in for `buildVisibleSurvey`'s piping logic
- **Test MSW handlers must mirror the exact backend response shape**: Integration tests that mock `resolve-flow` must return `piped_texts` with `{code}_title` keys to accurately test the full substitution path; using raw variable name keys in mocks will produce false positives