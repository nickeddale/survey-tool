---
date: "2026-04-16"
ticket_id: "ISS-270"
ticket_title: "Builder: TranslationEditor not rendered when translation mode toggled"
categories: ["testing", "api", "ui", "bug-fix", "feature", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-16"
ticket_id: "ISS-270"
ticket_title: "Builder: TranslationEditor not rendered when translation mode toggled"
categories: ["frontend", "react", "survey-builder", "ui-integration"]
outcome: "success"
complexity: "low"
files_modified: ["frontend/src/pages/SurveyBuilderPage.tsx"]
---
```

# Lessons Learned: Builder: TranslationEditor not rendered when translation mode toggled

## What Worked Well
- The component, store state, and toggle button were all fully implemented before this ticket — the fix was purely a rendering integration, nothing architectural needed to change
- The `buildTranslationTarget` helper function was a clean way to encapsulate the logic for deriving a `TranslationTarget` from the currently selected item, keeping the JSX readable
- The conditional swap pattern (`isTranslationMode && surveyData ? <TranslationEditor> : <PropertyEditor>`) is simple and idiomatic React — no new abstractions needed
- The `surveyData` local state (already held in `useState` for the fetched `SurveyFullResponse`) provided all the data needed to satisfy `TranslationEditor` props without any additional fetches

## What Was Challenging
- `TranslationTarget` is a discriminated union type requiring different shapes depending on scope (`survey`, `group`, or `question`), so the helper function needed to handle all three branches correctly to satisfy TypeScript
- The `availableLanguages` prop passed to `TranslationEditor` is hardcoded to `[]` — the survey model's language list was not directly surfaced by `builderStore`, so this was a known gap left for a follow-up

## Key Technical Insights
1. When a component exists and a store tracks the relevant state, the most common missing piece in feature gaps like this is simply the conditional render in the parent page — check the page component first before suspecting the store or child components
2. `TranslationTarget` must be derived from `SurveyFullResponse` (not just the builder store's `BuilderGroup[]`) because the survey-level target requires the full survey object — keeping `surveyData` in local page state alongside the store is the right pattern
3. The right panel slot is the correct location for `TranslationEditor` — it replaces `PropertyEditor` entirely rather than stacking alongside it, which avoids layout overflow issues in the three-panel design

## Reusable Patterns
- **Discriminated union target builder**: The `buildTranslationTarget(survey, groups, selectedItem)` helper pattern — walk the group/question tree to find the selected item and construct a typed target — can be reused anywhere a scoped translation or property context needs to be derived from selection state
- **Panel swap on mode toggle**: `{modeActive && data ? <ModePanel .../> : <DefaultPanel .../>}` is a clean way to implement mutually exclusive right-panel states without introducing routing or additional layout complexity

## Files to Review for Similar Tasks
- `frontend/src/pages/SurveyBuilderPage.tsx` — three-panel layout, how modes gate right-panel content
- `frontend/src/components/survey-builder/TranslationEditor.tsx` — `TranslationTarget` discriminated union definition and required props
- `frontend/src/store/builderStore.ts` — `isTranslationMode`, `selectedItem`, `groups`, `defaultLanguage` state

## Gotchas and Pitfalls
- `TranslationEditor` requires `surveyData` (`SurveyFullResponse`) to be non-null; guard the conditional render with both `isTranslationMode && surveyData` to avoid rendering before the fetch completes
- `availableLanguages` is passed as `[]` because the store does not yet expose the survey's configured language list — this silently limits translation functionality until the store is extended; do not assume an empty array is correct behavior
- Selecting a question that no longer exists in `groups` (e.g., after a delete race) will cause `buildTranslationTarget` to fall through to the `survey`-level target — this is safe but could confuse users if they expect the question target; consider adding a `useEffect` to clear `selectedItem` on question deletion
