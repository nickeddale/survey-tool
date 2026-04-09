---
date: "2026-04-09"
ticket_id: "ISS-195"
ticket_title: "Add Builder button to survey detail page"
categories: ["frontend", "navigation", "ui"]
outcome: "success"
complexity: "low"
files_modified: []
---

# Lessons Learned: Add Builder button to survey detail page

## What Worked Well
- The existing `SurveyActions` component had a clear, consistent pattern for conditional buttons — adding the Builder button required no architectural changes
- The `onNavigate` prop was already present on the component, so no interface changes were needed beyond adding the icon import
- The `surveyStatus === 'draft'` guard pattern was already established by the Edit button, making the conditional rendering self-documenting

## What Was Challenging
- Nothing materially challenging; the component was well-structured and the addition was straightforward

## Key Technical Insights
1. The Builder button was placed immediately before the Edit button (lines 126–136), both gated on `surveyStatus === 'draft'`, which groups editable-state actions together visually
2. `Wrench` from `lucide-react` was selected as the icon — semantically appropriate for a builder/construction tool
3. The `data-testid="builder-button"` attribute follows the existing convention used by all other buttons in the component, making it trivially testable

## Reusable Patterns
- Adding a conditionally-shown navigation button to `SurveyActions`: import icon from `lucide-react`, add `{surveyStatus === '<status>' && <Button onClick={() => onNavigate(`/surveys/${surveyId}/<route>`)} data-testid="<name>-button">...</Button>}` adjacent to related buttons
- The `onNavigate` prop on `SurveyActions` accepts any string path, so new navigation targets require zero prop changes

## Files to Review for Similar Tasks
- `frontend/src/components/survey-detail/SurveyActions.tsx` — all survey-level action buttons live here; add new navigation or modal-trigger buttons here
- `frontend/src/components/survey-detail/types.ts` — `ModalType` union type; extend this when adding new modal-backed actions (not needed for pure navigation)
- `frontend/src/pages/SurveyDetailPage.tsx` — wires up `onNavigate` (typically `useNavigate` from react-router); review if a new route requires a new handler

## Gotchas and Pitfalls
- Do not add navigation buttons for routes that don't exist yet — the Builder route (`/surveys/:id/builder`) must already be registered in the router for the button to work
- Buttons outside the `surveyStatus === 'draft'` guard (Responses, Quotas, Participants, Clone, Export, Delete) are always visible regardless of status — be deliberate about whether a new button should be unconditional or status-gated
- `BarChart2` is reused for both Quotas and Assessments buttons (lines 103 and 113) — a minor icon inconsistency already present in the codebase; don't replicate it for new buttons