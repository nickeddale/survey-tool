---
date: "2026-04-08"
ticket_id: "ISS-166"
ticket_title: "Single-page survey submit fails with 422 validation error"
categories: ["testing", "api", "ui", "bug-fix", "feature"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-08"
ticket_id: "ISS-166"
ticket_title: "Single-page survey submit fails with 422 validation error"
categories: ["frontend", "bug-fix", "api-integration", "validation"]
outcome: "success"
complexity: "low"
files_modified: ["frontend/src/pages/SurveyResponsePage.tsx"]
---

# Lessons Learned: Single-page survey submit fails with 422 validation error

## What Worked Well
- Root cause was identified clearly from the ticket description: single-page surveys never trigger `saveProgress` because there are no page transitions, so the backend completion endpoint validates against an empty answer set
- The fix was minimal and surgical — a single `await saveProgress(...)` call before `completeResponse` in `handleSubmit`
- The fix is idempotent with multi-page survey behavior since the backend uses upsert logic for partial saves, meaning the extra `saveProgress` call on final submit is harmless

## What Was Challenging
- No tests were added despite the implementation plan calling for both a backend test and a frontend Vitest test — this is a gap that leaves the fix unverified by automated regression
- Understanding why multi-page surveys worked required tracing the `handleNext` flow to see where `saveProgress` was being called implicitly

## Key Technical Insights
1. The backend completion endpoint validates against **previously stored answers**, not answers provided in the completion request body — this asymmetry between single-page and multi-page flows is the root of the bug
2. Multi-page surveys inherently call `saveProgress` on every page transition, masking this backend dependency; single-page surveys expose it because they go straight to completion
3. The fix at the frontend level (calling `saveProgress` before `completeResponse`) is simpler than the alternative backend fix (accepting answers in the completion request body), but the backend approach would be more robust and self-contained

## Reusable Patterns
- When a completion/finalization endpoint validates state that was built up incrementally, always ensure all state is flushed/persisted before calling the finalization step — don't assume prior calls have done it
- For multi-step vs. single-step flows sharing a common completion endpoint, audit whether the single-step path skips any intermediate persistence that the multi-step path relies on

## Files to Review for Similar Tasks
- `frontend/src/pages/SurveyResponsePage.tsx` — `handleSubmit` and `handleNext` callbacks show the save/complete lifecycle
- `frontend/src/services/responseService.ts` — `saveProgress` and `completeResponse` signatures and behavior
- `backend/app/api/responses.py` — completion endpoint validation logic (validates against stored answers)

## Gotchas and Pitfalls
- The backend completion endpoint does NOT accept answers in its request body for validation — it reads from stored state, so the frontend must ensure answers are saved first
- Skipping the `saveProgress` + `completeResponse` test coverage means future refactors could reintroduce this bug silently; adding tests for single-page submit should be a follow-up
- The `saveProgress` call in `handleSubmit` must use `answersToInput(answers)` (the same transformation used in `handleNext`) to ensure format consistency with what the backend expects
```
