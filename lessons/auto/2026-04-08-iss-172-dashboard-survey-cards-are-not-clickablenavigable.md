---
date: "2026-04-08"
ticket_id: "ISS-172"
ticket_title: "Dashboard survey cards are not clickable/navigable"
categories: ["testing", "api", "ui", "feature", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-08"
ticket_id: "ISS-172"
ticket_title: "Dashboard survey cards are not clickable/navigable"
categories: ["frontend", "navigation", "react", "accessibility", "testing"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/pages/DashboardPage.tsx"
  - "frontend/src/pages/__tests__/DashboardPage.test.tsx"
---

# Lessons Learned: Dashboard survey cards are not clickable/navigable

## What Worked Well
- The `SurveyCard` component was already isolated as a sub-component, making it easy to add an `onClick` prop without touching unrelated logic
- Using `role="button"` + `tabIndex={0}` + `onKeyDown` on the Card element provided full accessibility (keyboard + mouse) in a single pass
- The `renderDashboard()` test helper with `MemoryRouter` + `LocationDisplay` route already existed for the "Create New Survey" navigation test, so the same pattern was directly reusable for the card navigation test
- `useNavigate` was already imported in `DashboardPage` for the existing "Create New Survey" button, so no new imports were needed

## What Was Challenging
- Nothing materially challenging; the fix was localized and the pattern was already established elsewhere in the codebase (SurveysPage)

## Key Technical Insights
1. **Prop-drilling onClick is preferable to embedding navigation in sub-components**: Passing `onClick` from `DashboardPage` into `SurveyCard` keeps the card component stateless and reusable; it doesn't need to know about routing at all
2. **`role="button"` alone isn't enough for keyboard accessibility**: Pairing it with `tabIndex={0}` and an `onKeyDown` handler (checking `e.key === 'Enter'`) ensures screen readers and keyboard-only users can activate the card
3. **`aria-label` enables precise test targeting**: Adding `aria-label={`Open survey: ${survey.title}`}` lets tests use `getByRole('button', { name: /open survey: .../i })` — more robust than querying by text content inside the card
4. **`transition-colors` class on hover requires no JS**: Pure Tailwind `hover:bg-accent transition-colors` handles the visual affordance that a card is clickable — no extra state needed

## Reusable Patterns
- **Clickable card pattern**: `<Card className="cursor-pointer hover:bg-accent transition-colors" onClick={handler} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handler()} aria-label="...">`  — apply this whenever a shadcn `Card` needs to be fully interactive
- **Navigation test pattern**: Use a `<Route path="/target/:id" element={<LocationDisplay />} />` sibling route in `MemoryRouter` to assert navigation without rendering the actual destination page
- **onClick prop-drilling for navigation**: Keep navigation logic in the page component (via `useNavigate`), pass `onClick` down to presentational sub-components

## Files to Review for Similar Tasks
- `frontend/src/pages/DashboardPage.tsx` — reference for clickable card + accessibility pattern
- `frontend/src/pages/__tests__/DashboardPage.test.tsx` — reference for `LocationDisplay` navigation assertion pattern
- `frontend/src/pages/SurveysPage.tsx` — original pattern this fix mirrors

## Gotchas and Pitfalls
- **Don't wrap the card in `<Link>`**: Using a React Router `<Link>` wrapper around a `<Card>` creates nested interactive elements and breaks accessibility; the `onClick` + `role="button"` approach is correct for non-anchor navigable cards
- **`aria-label` must be unique per card**: Since it includes the survey title, it's naturally unique; generic labels like `aria-label="survey card"` would cause `getByRole` to fail with multiple matches
- **`tabIndex={0}` is required**: Without it, the element is not reachable by Tab key even with `role="button"` set
```
