---
date: "2026-04-16"
ticket_id: "ISS-271"
ticket_title: "Public survey form: question and option texts not translated when language switched"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-16"
ticket_id: "ISS-271"
ticket_title: "Public survey form: question and option texts not translated when language switched"
categories: ["frontend", "i18n", "api", "bug-fix"]
outcome: "success"
complexity: "medium"
files_modified:
  - frontend/src/pages/SurveyResponsePage.tsx
  - frontend/src/hooks/useFlowResolution.ts
  - frontend/src/services/responseService.ts
  - backend/app/api/logic.py
  - backend/app/services/translation_service.py
---

# Lessons Learned: Public survey form: question and option texts not translated when language switched

## What Worked Well
- The root cause was quickly narrowed down by verifying the API returned correct translations via curl, which isolated the issue to the frontend rendering pipeline
- The fix was clean and end-to-end: a single `lang` parameter threaded through from the page component down to the HTTP call and then honoured server-side in the resolve-flow endpoint
- The translation infrastructure (`apply_survey_translations` or equivalent) already existed and only needed to be wired into the logic endpoint, avoiding new abstraction work

## What Was Challenging
- The bug was subtle: the survey object was fetched with `?lang=fr` correctly, but a secondary API call (`resolveFlow`) that generates `pipedTexts` was made without the language parameter, silently overriding the correctly-translated values
- Identifying that `pipedTexts` (not the raw survey fields) were the authoritative source for rendered question text required reading multiple layers of the resolve-flow pipeline
- The disconnect between "survey fetched correctly" and "questions render incorrectly" made it easy to initially misattribute the issue to component rendering logic rather than a missing query parameter on a second API call

## Key Technical Insights
1. When a page makes multiple API calls to build its view, every call that produces user-visible text must carry the active locale — missing it on even one call causes partial translation failures that are hard to spot
2. `pipedTexts` from the resolve-flow endpoint acts as the single source of truth for rendered question and option text; the raw translated fields on the survey object are irrelevant if they are later overwritten by un-translated pipe output
3. Backend translation must be applied *before* the piping step — piping operates on already-resolved text, so passing untranslated strings into `pipe_all()` produces untranslated output regardless of what the survey object contains
4. The `lang` parameter should be treated as a first-class concern at every API boundary that returns user-visible text, not just at the top-level survey fetch

## Reusable Patterns
- Thread locale through hooks: `useFlowResolution(lang?)` → `responseService.resolveFlow(surveyId, payload, lang?)` → `POST ...?lang=fr`
- Optional `lang` query parameter pattern on backend endpoints: `lang: str | None = Query(default=None)` with a guard `if lang: apply_translations(...)`
- Verify multi-call pages by checking the network tab for *all* API calls, not just the first one, when diagnosing translation/localisation bugs

## Files to Review for Similar Tasks
- `frontend/src/hooks/useFlowResolution.ts` — pattern for forwarding locale through custom hooks
- `frontend/src/services/responseService.ts` — pattern for appending optional query params to Axios POST requests
- `backend/app/api/logic.py` — pattern for accepting `lang` and applying translations before processing in resolve-flow
- `backend/app/services/translation_service.py` — existing translation helpers (`apply_survey_translations`) that can be reused for other endpoints

## Gotchas and Pitfalls
- Translating the survey object on the frontend side is not sufficient if a secondary endpoint regenerates displayable text server-side without the locale — always audit secondary calls
- `apply_survey_translations` (or equivalent) must be called on questions and their answer options, not just on top-level survey fields; the data shape is nested and partial application leaves visible untranslated strings
- Adding `lang` only to the frontend hook but forgetting to update the service layer (or vice versa) will silently drop the parameter; trace the full call chain in one pass
- If tests are not added for the `?lang=` path on the resolve-flow endpoint, this class of regression is invisible to the test suite — a dedicated test asserting translated `pipedTexts` keys is the correct safety net
```
