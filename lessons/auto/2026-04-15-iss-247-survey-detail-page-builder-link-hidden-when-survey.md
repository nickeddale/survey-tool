---
date: "2026-04-15"
ticket_id: "ISS-247"
ticket_title: "Survey detail page: Builder link hidden when survey has question groups"
categories: ["testing", "ui", "bug-fix", "feature", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-15"
ticket_id: "ISS-247"
ticket_title: "Survey detail page: Builder link hidden when survey has question groups"
categories: ["bug-fix", "frontend", "conditional-rendering"]
outcome: "success"
complexity: "low"
files_modified: ["frontend/src/pages/SurveyDetailPage.tsx"]
---
```

# Lessons Learned: Survey detail page: Builder link hidden when survey has question groups

## What Worked Well
- The root cause was clearly identified in the ticket description, making implementation straightforward
- The fix required a single file change with minimal risk of side effects
- The draft status guard (`survey.status === 'draft'`) was preserved correctly, maintaining existing access control behavior

## What Was Challenging
- Nothing significantly challenging; the scope was tightly bounded and well-specified

## Key Technical Insights
1. UI elements that should be globally available on a page (like navigation/action buttons) must live outside of data-driven conditional branches — nesting them inside empty-state blocks is a common source of "disappearing button" bugs
2. Empty-state vs. populated-state branches often diverge during feature development; action buttons added only to the empty state are silently lost once data exists

## Reusable Patterns
- Place persistent action buttons (e.g., Edit, Builder, Settings) at the top of a section, above any conditional content rendering, not inside individual branches
- When reviewing conditional JSX blocks, check both the truthy and falsy branches to confirm all expected UI elements appear in each path
- Use a single status-based guard (`survey.status === 'draft'`) at the button level rather than relying on the surrounding conditional context to implicitly control visibility

## Files to Review for Similar Tasks
- `frontend/src/pages/SurveyDetailPage.tsx` — contains the survey detail layout and all conditional rendering for groups/questions
- Any other detail pages (`QuestionDetailPage`, etc.) that may follow the same pattern and could have similar issues

## Gotchas and Pitfalls
- The empty-state branch is visually obvious during development (no data), so buttons placed there appear to work — the bug only surfaces once real data populates the page
- JSX conditional blocks (`{condition ? <A/> : <B/>}` or `{condition && <A/>}`) can silently hide elements; always audit both branches when adding shared UI
- Removing the button from the empty-state branch without adding it above the conditional would leave users with no navigation path when the survey has no groups — order of operations in the fix matters
