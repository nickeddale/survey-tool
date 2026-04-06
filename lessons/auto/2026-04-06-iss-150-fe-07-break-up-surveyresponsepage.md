---
date: "2026-04-06"
ticket_id: "ISS-150"
ticket_title: "FE-07: Break up SurveyResponsePage"
categories: ["testing", "api", "ui", "refactoring", "bug-fix", "feature", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-150"
ticket_title: "FE-07: Break up SurveyResponsePage"
categories: ["frontend", "refactoring", "component-extraction"]
outcome: "success"
complexity: "medium"
files_modified:
  - frontend/src/pages/SurveyResponsePage.tsx
  - frontend/src/components/survey-response/types.ts
  - frontend/src/components/survey-response/responseHelpers.ts
  - frontend/src/components/survey-response/constants.ts
  - frontend/src/components/survey-response/ResponseSkeleton.tsx
  - frontend/src/components/survey-response/UnavailableScreen.tsx
  - frontend/src/components/survey-response/WelcomeScreen.tsx
  - frontend/src/components/survey-response/ThankYouScreen.tsx
  - frontend/src/components/survey-response/index.ts
---

# Lessons Learned: FE-07: Break up SurveyResponsePage

## What Worked Well
- Following the established survey-detail component directory pattern provided a clear blueprint — reading those files first eliminated guesswork about barrel export style, prop typing conventions, and file structure
- Separating concerns into distinct files (types.ts, constants.ts, responseHelpers.ts, screen components) made the dependency graph explicit and easy to verify
- Running `npx tsc --noEmit` after creating index.ts but before refactoring SurveyResponsePage.tsx caught broken re-exports early, before they could compound
- The existing test suite (926 lines, ~30+ tests) served as a reliable regression harness for a pure structural refactor — no new tests were needed

## What Was Challenging
- Tracking transitive dependencies for each extracted helper function (answersToInput, flattenQuestions, applyPipedText, buildVisibleSurvey) required careful inspection to ensure every import, type reference, and constant was included in responseHelpers.ts
- LANGUAGE_LABELS, typed as a plain object, does not produce a TypeScript error when its import is missing in a consuming component — the risk of a silent runtime failure required explicit verification in each component that referenced it
- Types shared between SurveyResponsePage.tsx and extracted sub-components needed to be identified before extraction began; placing them in types.ts from the start avoided duplication

## Key Technical Insights
1. For large-file component extractions, resolve the full dependency closure of every extracted function before moving it — missing transitive imports are the most common source of breakage and the hardest to spot after the fact.
2. A TypeScript compile check (`npx tsc --noEmit`) after creating the barrel index.ts is a high-value, low-cost gate: it surfaces broken re-exports and missing imports before the main page refactor introduces more moving parts.
3. Constants typed as plain objects (e.g., `Record<string, string>`) do not generate TS errors on missing imports at use sites — treat them as requiring manual import verification in every consuming file.
4. Shared types must be centralised in types.ts before any component file is written; retrofitting type locations after components exist risks circular imports and duplicate definitions.
5. Asserting line count explicitly (`wc -l frontend/src/pages/SurveyResponsePage.tsx`) as part of the test step is the only reliable way to confirm the AC ("under 250 lines") is met — test passage alone does not verify it.

## Reusable Patterns
- **Read before write**: Always read the existing comparable component directory (e.g., survey-detail/) in full before creating any new files — confirm barrel export style, named vs. default exports, and prop typing format.
- **Extraction order**: types.ts → constants.ts → responseHelpers.ts → screen components → index.ts → refactor main page. This order ensures each file's dependencies exist before it is written.
- **Early compile gate**: After index.ts is created, run `npx tsc --noEmit` before touching the main page file. Fix all errors before proceeding.
- **Line count assertion**: Add `wc -l <page-file>` as an explicit final step alongside test execution to confirm the line-count AC.
- **Shared type rule**: Any type referenced in both the main page and a sub-component belongs in types.ts. Never define the same interface in two files.

## Files to Review for Similar Tasks
- `frontend/src/components/survey-detail/` — reference implementation for barrel export pattern, types.ts structure, and component prop conventions
- `frontend/src/components/survey-response/index.ts` — example of named re-exports for both components and types
- `frontend/src/components/survey-response/responseHelpers.ts` — example of extracting pure helper functions with full dependency closure
- `frontend/src/pages/SurveyResponsePage.tsx` — post-refactor reference for what a trimmed page file retaining only state, effects, handlers, and conditional rendering looks like

## Gotchas and Pitfalls
- **Missing LANGUAGE_LABELS import**: This constant is typed as a plain object; TypeScript will not error if the import is absent. Manually verify every component that references it after extraction.
- **Barrel export order matters**: If index.ts re-exports types and a component in the same file, ensure types.ts is written before any component that imports from it — circular dependencies through the barrel are possible if ordering is wrong.
- **Test passage ≠ AC compliance**: The test suite does not check file length. Always run `wc -l` on the refactored page file explicitly.
- **Do not assume prior plan conventions are current**: The implementation plan may reference patterns from earlier tickets; always read the actual existing files to confirm conventions have not drifted before replicating them.
- **Helper function imports are not automatically carried over**: When moving a function to a new file, manually audit every symbol it references (types, other helpers, third-party imports) — do not assume the function is self-contained.
```
