---
date: "2026-04-06"
ticket_id: "ISS-144"
ticket_title: "FE-01: Break up SurveyBuilderPage"
categories: ["testing", "api", "ui", "refactoring", "bug-fix", "feature", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-144"
ticket_title: "FE-01: Break up SurveyBuilderPage"
categories: ["frontend", "refactoring", "component-extraction", "react", "dnd-kit"]
outcome: "success"
complexity: "medium"
files_modified:
  - frontend/src/pages/SurveyBuilderPage.tsx
  - frontend/src/components/survey-builder/BuilderSkeleton.tsx
  - frontend/src/components/survey-builder/QuestionPalette.tsx
  - frontend/src/components/survey-builder/GroupDragPreview.tsx
  - frontend/src/components/survey-builder/SortableGroupPanel.tsx
  - frontend/src/components/survey-builder/SurveyCanvas.tsx
  - frontend/src/components/survey-builder/PropertyEditor.tsx
  - frontend/src/components/survey-builder/NavigationBlocker.tsx
---

# Lessons Learned: FE-01: Break up SurveyBuilderPage

## What Worked Well
- Reading the full source file before beginning extraction prevented surprises about closure dependencies and cross-component state sharing
- Following the existing named-export pattern from GroupPanel.tsx and QuestionEditor.tsx ensured consistency without debate over conventions
- Keeping all @dnd-kit context providers (DndContext, SortableContext, DragOverlay) inside SurveyCanvas and not splitting them across files preserved drag-and-drop behavior without any runtime errors
- The extraction order (smallest/simplest components first, SurveyCanvas last) made each step low-risk and easy to verify incrementally
- Existing 40+ integration tests in SurveyBuilderPage.test.tsx served as a full regression harness with no test modifications required

## What Was Challenging
- SurveyCanvas at ~290 lines was the most complex extraction due to multiple @dnd-kit providers, store hook usage, and inline reorder logic — identifying every hook and callback that needed to become an explicit prop took careful reading
- Inline sub-components defined in the page file had implicit closure access to page-level hooks (useParams, useStore selectors); every such dependency had to be identified and converted to an explicit typed prop
- Distinguishing which state belonged to the page vs. which belonged purely to the extracted component required judgment — passing too little as props causes runtime errors, passing too much creates an unwieldy interface

## Key Technical Insights
1. `useSortable` from @dnd-kit/sortable silently breaks when rendered outside a `SortableContext` — there is no thrown error, only invisible drag behavior. Always verify the provider tree before and after extraction.
2. Inline sub-components defined inside a page file can close over any variable in the enclosing scope via JavaScript closure. When extracted to a separate module, every closed-over value must become an explicit prop — the TypeScript compiler will catch missing props but will not warn about implicit closure dependencies in the original file.
3. A partial extraction of DnD context (leaving some providers in the page, some in SurveyCanvas) splits drag state across two component trees and produces incorrect behavior with no obvious error message. Keep all DnD providers in a single owner component.
4. MSW is configured with `onUnhandledRequest: 'error'` in this project — any net-new API fetch introduced in an extracted component (e.g., via a new `useEffect`) that has no corresponding handler will fail tests loudly. Extraction-only refactors should introduce zero new fetches.
5. Named exports are the project convention for all survey-builder components. Default exports break tree-shaking consistency and diverge from sibling component patterns.

## Reusable Patterns
- **Extraction order**: extract leaf/display components first (BuilderSkeleton, QuestionPalette), then mid-level components (GroupDragPreview, SortableGroupPanel, PropertyEditor, NavigationBlocker), and the largest context-owning component (SurveyCanvas) last
- **Explicit props over closure**: always enumerate every piece of state and every callback a sub-component touches, then declare them as typed props in the extracted file's interface
- **DnD provider ownership**: the component that owns `DndContext`, `SortableContext`, and `DragOverlay` must remain a single file; children (e.g., SortableGroupPanel) must be rendered as descendants without re-declaring context
- **Run vitest after each individual extraction** (not just at the end) to isolate regressions to the most recently changed file rather than debugging all 7 at once
- **Check for circular imports** after each extraction: extracted components must not import anything from SurveyBuilderPage.tsx

## Files to Review for Similar Tasks
- `frontend/src/components/survey-builder/SurveyCanvas.tsx` — canonical example of how to own and pass DnD context after extraction
- `frontend/src/components/survey-builder/GroupPanel.tsx` — reference for named-export and JSDoc conventions in this directory
- `frontend/src/components/survey-builder/SortableGroupPanel.tsx` — example of a useSortable consumer that must always render inside SortableContext
- `frontend/src/pages/__tests__/SurveyBuilderPage.test.tsx` — demonstrates how MSW handlers are set up; verify no new handlers are needed when extracting

## Gotchas and Pitfalls
- **useSortable outside SortableContext fails silently** — always confirm provider ancestry after any DnD component moves between files
- **Closure-to-prop conversion is easy to miss** — grep the original inline component body for every identifier not declared within it; each one is a closure dependency that must become a prop
- **Do not split DnD context providers across files** — even a seemingly clean split where SortableContext stays in the page while SurveyCanvas handles DndContext will produce subtly broken drag behavior
- **No new API calls in extracted components** — MSW `onUnhandledRequest: 'error'` will fail tests immediately; refactoring should be behavior-neutral at the network boundary
- **Default exports break sibling conventions** — always use named exports in `frontend/src/components/survey-builder/` to match GroupPanel.tsx, QuestionEditor.tsx, and BuilderToolbar.tsx
```
