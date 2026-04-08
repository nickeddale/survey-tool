---
date: "2026-04-08"
ticket_id: "ISS-165"
ticket_title: "Public response form shows 'Unsupported question type: single_choice'"
categories: ["testing", "api", "ui", "refactoring", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-08"
ticket_id: "ISS-165"
ticket_title: "Public response form shows 'Unsupported question type: single_choice'"
categories: ["frontend", "bug-fix", "testing", "question-types"]
outcome: "success"
complexity: "low"
files_modified: ["frontend/src/components/responses/__tests__/SurveyForm.test.tsx"]
---

# Lessons Learned: Public response form shows 'Unsupported question type: single_choice'

## What Worked Well
- The core fix had already been applied in ISS-159 (renaming the switch case from `radio` to `single_choice`), making this ticket primarily a regression test addition
- The dual assertion pattern (assert correct component IS rendered AND fallback 'unknown-question-type' is NOT rendered) provides robust coverage against partial or simultaneous rendering of both paths
- Scoping `data-testid` to the question id (e.g., `radio-input-${question.id}`) rather than a hardcoded index keeps tests resilient to question order changes

## What Was Challenging
- Cross-ticket dependency: the fix originated in ISS-159, requiring verification that it was fully merged before writing the test — without this check, the test could be written against a broken baseline
- Identifying the correct `data-testid` convention requires reading the component source before writing assertions; mismatches produce false negatives where tests pass even when the component is missing

## Key Technical Insights
1. A switch/map covering only legacy or frontend-internal type names (e.g., `radio`) will silently fall through to the unsupported fallback when the backend sends canonical type names (e.g., `single_choice`) — type name mismatches between frontend builder and backend API are a recurring source of this class of bug
2. Regression tests for question-type rendering must use dual assertions: presence of the correct renderer AND absence of the fallback — presence alone cannot detect scenarios where both render simultaneously
3. Fake timers left running between tests will silently cause all downstream MSW-based tests to time out; always call `vi.useRealTimers()` in `afterEach` when any test uses fake timers

## Reusable Patterns
- **Dual regression assertion**: `expect(screen.getByTestId('radio-input-q2')).toBeInTheDocument()` AND `expect(screen.queryByTestId('unknown-question-type')).not.toBeInTheDocument()`
- **Baseline-first testing**: run `npm run test:run` before adding new tests to confirm a clean baseline; isolate new failures to new code
- **Scoped data-testid**: `data-testid={`radio-input-${question.id}`}` in the component, referenced by the same pattern in tests
- **Timer hygiene**: `afterEach(() => vi.useRealTimers())` whenever fake timers are used anywhere in a test file
- **act() wrapping**: wrap all `userEvent.setup()` interactions in `act()` to avoid boundary warnings that contaminate subsequent renders

## Files to Review for Similar Tasks
- `frontend/src/components/responses/SurveyForm.tsx` — question type switch; verify every canonical backend type has a case
- `frontend/src/components/responses/__tests__/SurveyForm.test.tsx` — regression tests for each question type renderer
- `frontend/src/components/survey-builder/QuestionPreview.tsx` — builder-side preview renderer; may have a parallel switch that also needs updating
- `frontend/src/pages/SurveyResponsePage.tsx` — integration-level rendering path for public survey responses
- `frontend/src/pages/SurveyPreviewPage.tsx` — preview rendering path; check for same type-name gaps

## Gotchas and Pitfalls
- **Do not assume the fix is present**: even when a prior ticket (ISS-159) claims to have fixed the switch case, verify the branch contains the merged change before writing the test — the test will pass vacuously if the fix is absent and the assertion is incorrectly structured
- **Hardcoded index in data-testid** (e.g., `radio-input-q2`) is brittle if question order changes; prefer id-scoped testids
- **Single assertion is insufficient**: asserting only that the radio input renders does not catch a regression where the fallback also renders alongside it
- **MSW timeout contamination**: fake timers not restored in `afterEach` will cause unrelated MSW-based tests to time out with no obvious connection to the timer usage — always pair fake timer setup with `afterEach(() => vi.useRealTimers())`
- **Parallel switch statements**: fixing `SurveyForm.tsx` alone may leave an identical bug in `QuestionPreview.tsx` or other renderers — audit all question-type switch statements when fixing one
```
