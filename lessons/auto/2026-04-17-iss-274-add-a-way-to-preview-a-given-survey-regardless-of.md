---
date: "2026-04-17"
ticket_id: "ISS-274"
ticket_title: "add a way to preview a given survey regardless of its status on the survey page"
categories: ["api", "ui", "bug-fix", "feature", "security", "ci-cd", "testing"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-17"
ticket_id: "ISS-274"
ticket_title: "add a way to preview a given survey regardless of its status on the survey page"
categories: ["frontend", "ux", "routing", "api-integration"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/pages/SurveyPreviewPage.tsx"
  - "frontend/src/components/survey-detail/SurveyActions.tsx"
---

# Lessons Learned: add a way to preview a given survey regardless of its status on the survey page

## What Worked Well
- The existing SurveyPreviewPage already had most of the infrastructure needed; the fix was surgical
- Swapping `getPublicSurvey()` for `getSurvey()` was sufficient to unblock all survey statuses without broader refactoring
- The implementation plan accurately predicted the scope — no surprises in affected files

## What Was Challenging
- Identifying the correct API call to use: `getPublicSurvey()` silently fails for non-active surveys rather than returning an obvious error, which can make the root cause non-obvious during debugging
- The "Return to Builder" button needed context-awareness (builder vs. detail page) to navigate correctly, adding a small conditional logic concern

## Key Technical Insights
1. Public survey endpoints (`getPublicSurvey`) typically enforce `status = active` at the API level — always use authenticated endpoints when building owner-facing preview features
2. When a page is reused across multiple entry points (builder toolbar vs. detail page), check all navigation/back-link elements for hardcoded assumptions about the calling context
3. Route guards in App.tsx should be checked early when a feature is "already exists but not exposed" — often the route is unguarded and the blocker is just UI access or wrong API call

## Reusable Patterns
- **Owner preview pattern**: Use authenticated `getSurvey()` for owner preview pages; reserve `getPublicSurvey()` for the actual public respondent flow
- **Context-aware back navigation**: Pass a `returnTo` query param or detect referrer context to make shared pages navigate back correctly depending on entry point
- **Status-agnostic actions**: When adding actions to SurveyActions, default to showing for all statuses unless there's an explicit business reason to restrict, rather than defaulting to hiding

## Files to Review for Similar Tasks
- `frontend/src/pages/SurveyPreviewPage.tsx` — reference for how owner preview fetches and renders survey data
- `frontend/src/components/survey-detail/SurveyActions.tsx` — reference for adding status-aware or status-agnostic action buttons
- `frontend/src/services/surveyService.ts` — distinguish between `getSurvey()` (auth) and `getPublicSurvey()` (public, active-only)
- `frontend/src/App.tsx` — check for route-level guards before assuming a page is inaccessible

## Gotchas and Pitfalls
- `getPublicSurvey()` does not return a clear "survey not active" error — it may return 404 or a generic failure, making it hard to diagnose why preview breaks for draft/closed surveys
- Adding a preview button to SurveyActions without checking existing status-conditional rendering logic can result in the button appearing in unexpected states or being hidden when it should be visible
- The preview page previously assumed it was always reached from the builder; any shared page must be audited for builder-specific assumptions (toolbar visibility, back-link destination, submit behavior)
```
