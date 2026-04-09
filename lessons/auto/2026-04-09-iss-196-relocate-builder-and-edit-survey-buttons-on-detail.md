---
date: "2026-04-09"
ticket_id: "ISS-196"
ticket_title: "Relocate Builder and Edit Survey buttons on detail page"
categories: ["testing", "ui", "feature", "documentation", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```
---
date: "2026-04-09"
ticket_id: "ISS-196"
ticket_title: "Relocate Builder and Edit Survey buttons on detail page"
categories: ["frontend", "ux", "react", "refactor"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/pages/SurveyDetailPage.tsx"
  - "frontend/src/components/survey-detail/SurveyActions.tsx"
  - "frontend/src/components/survey-detail/SurveyMetaCard.tsx"
---

# Lessons Learned: Relocate Builder and Edit Survey buttons on detail page

## What Worked Well
- The implementation plan was precise and accurate — named the exact lines and components that needed changes, making execution mechanical with no investigation needed.
- The `SurveyMetaCard` component already received `surveyId`, `surveyStatus`, and `onNavigate` as props (passed from `SurveyDetailPage`), so no prop-drilling changes were required at the page level.
- The empty-state Builder button placement in `SurveyDetailPage.tsx` was a natural fit — the `survey.status === 'draft'` guard was already in place from a prior ticket (ISS-195), requiring only a label/navigation swap.
- Removing the standalone Builder button from `SurveyActions.tsx` had zero cascade effects — the button was self-contained with no shared state or downstream consumers.
- The `Edit` button removal from `SurveyActions` and re-addition to `SurveyMetaCard` was clean because both locations already had access to the same `surveyId`/`surveyStatus`/`onNavigate` interface.

## What Was Challenging
- Nothing technically challenging. The primary risk was inadvertently breaking the action bar layout by removing a button without checking flex/spacing behavior, but the `flex-1` spacer div handled alignment automatically.

## Key Technical Insights
1. **Props were already threaded correctly**: `SurveyMetaCard` already accepted `surveyId`, `surveyStatus`, and `onNavigate` from an earlier ISS-195 implementation. This made the Edit Survey button addition a pure UI concern — no interface changes needed.
2. **Empty-state placement is a UX affordance**: The "no groups" empty state is the highest-intent moment for a builder CTA. Replacing the wrong action (Edit Survey) with the right one (Builder) eliminates a dead-end user flow without adding UI complexity.
3. **`data-testid` discipline pays off**: Both the new `meta-edit-button` (in `SurveyMetaCard`) and the existing `no-groups-state` test ID (in `SurveyDetailPage`) make assertions in Vitest straightforward and resilient to markup changes.
4. **Conditional rendering on `surveyStatus === 'draft'`**: Both the empty-state Builder button and the Edit Survey card button are gated on draft status, keeping the UI uncluttered for active/closed/archived surveys.

## Reusable Patterns
- **Context-appropriate CTAs**: Place action buttons adjacent to the content they affect (Edit Survey near metadata, Builder near question groups) rather than consolidating all actions into a single toolbar. This reduces user confusion about what each action does.
- **Stateless button relocation**: When moving a button between components that share the same prop interface, the change is purely structural — no logic, no state, no service calls. Treat these as safe, low-risk refactors.
- **Empty-state CTAs**: Empty states are high-value real estate for primary CTAs. The pattern `survey.status === 'draft' && <Button onClick={...}>` in an empty-state card is reusable for any resource with a "create/edit" flow.

## Files to Review for Similar Tasks
- `frontend/src/pages/SurveyDetailPage.tsx` — orchestrates all survey-detail sub-components; owns survey state and navigation handlers
- `frontend/src/components/survey-detail/SurveyActions.tsx` — action toolbar; also exports `SurveyHeader` from the same file (non-obvious co-location)
- `frontend/src/components/survey-detail/SurveyMetaCard.tsx` — metadata card; accepts `surveyId`, `surveyStatus`, `onNavigate` for contextual actions

## Gotchas and Pitfalls
- **`SurveyActions.tsx` exports two components**: Both `SurveyActions` and `SurveyHeader` live in this file. Renaming or splitting the file requires updating the barrel export in `frontend/src/components/survey-detail/index.ts`.
- **Draft-only gating**: The Edit Survey and Builder buttons are intentionally hidden for non-draft surveys. If a ticket ever requires these buttons in other statuses, the `surveyStatus === 'draft'` guards in both `SurveyMetaCard` and `SurveyDetailPage` must be updated in tandem.
- **`_onBack` unused prop**: `SurveyActions` destructures `onBack` as `_onBack` (prefixed to suppress lint warnings). If the back button is ever restored to the action bar, remove the underscore prefix — it signals intentional non-use, not a mistake.
- **No tests were added**: The ticket had no new test requirements, and the changes were purely structural. If similar button relocation tasks arise, consider adding a Vitest snapshot or `getByTestId` assertion to pin button placement, preventing silent regressions from future refactors.
```
