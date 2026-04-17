---
date: "2026-04-17"
ticket_id: "ISS-278"
ticket_title: "rebrand the project to \"Survey Tool\" instead of using the term \"Devtracker\""
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-17"
ticket_id: "ISS-278"
ticket_title: "rebrand the project to \"Survey Tool\" instead of using the term \"Devtracker\""
categories: ["refactoring", "branding", "frontend", "backend"]
outcome: "success"
complexity: "low"
files_modified: ["backend/tests/conftest.py", "backend/tests/test_webhook_service.py", "frontend/src/pages/__tests__/SurveyBuilderPage.test.tsx", "frontend/src/pages/__tests__/AssessmentsPage.test.tsx", "frontend/src/pages/__tests__/ParticipantProfilesPage.test.tsx", "frontend/src/pages/__tests__/SurveyDetailPage.test.tsx", "frontend/src/pages/__tests__/WebhooksPage.test.tsx", "frontend/src/pages/__tests__/SurveyFormPage.test.tsx", "frontend/src/pages/__tests__/ParticipantsPage.test.tsx", "frontend/src/pages/__tests__/EmailInvitationsPage.test.tsx", "frontend/src/pages/__tests__/QuotasPage.test.tsx", "frontend/src/pages/__tests__/DashboardPage.test.tsx", "frontend/src/pages/__tests__/SurveysPage.test.tsx", "frontend/src/pages/__tests__/SurveyPreviewPage.test.tsx", "frontend/src/hooks/__tests__/useValidation.test.ts", "frontend/src/hooks/__tests__/useFlowResolution.test.ts", "frontend/src/components/survey-builder/__tests__/BuilderToolbar.test.tsx", "frontend/src/components/survey-builder/__tests__/GroupPanel.test.tsx", "frontend/src/components/survey-builder/__tests__/PropertyEditor.test.tsx", "frontend/src/components/survey-builder/__tests__/QuestionEditor.test.tsx", "CLAUDE.md"]
---

# Lessons Learned: rebrand the project to "Survey Tool" instead of using the term "Devtracker"

## What Worked Well
- The implementation plan correctly identified all affected files up front, making the rename purely mechanical with no surprises.
- Separating historical lesson files (lessons/auto/) from active source files was a sound call — those records document past work and should not be retroactively altered.
- Treating CLAUDE.md as an affected file ensured project documentation stayed consistent with the renamed defaults.

## What Was Challenging
- The localStorage key `devtracker_refresh_token` was spread across 18 frontend test files, which required careful bulk-replacement to avoid diverging from the production source (`tokenService.ts`). Tests mock production behavior, so both layers must be updated atomically — updating only the tests would have caused silent runtime failures in the running app even while tests passed.
- Distinguishing "safe to leave" references (historical lesson documents) from "must update" references (active source, config, documentation) required explicit scoping in the plan to avoid confusion.

## Key Technical Insights
1. **Test/production key synchronization**: When a localStorage key (or any string constant) appears in both production source and test mocks, changing one without the other is a latent bug. Always grep production source files first, update them, then do the bulk test-file rename in one atomic pass.
2. **Fallback DB name is low-risk but not zero-risk**: The `conftest.py` fallback DB name only matters when `DATABASE_URL` is not set. Renaming it is safe in CI (env var is always set) but keeps local bare-pytest runs consistent with the new branding.
3. **Bulk string replacement scope must be explicitly bounded**: For a rename touching 20+ files, define an explicit exclusion list (e.g., lesson docs, git history) before running any automated replacement to prevent unintended edits.

## Reusable Patterns
- Before mass-replacing a string across test files, run `grep -r 'old_string' src/ --include='*.ts' --include='*.tsx' -l` on production (non-test) source to find all files that must be updated in the same commit.
- After completing a bulk rename, run a final `grep -r 'old_string' . --exclude-dir='.git' --exclude-dir='lessons'` to confirm zero remaining references before committing.
- Document fallback/default values in CLAUDE.md so future rebrands include the docs file in scope automatically.

## Files to Review for Similar Tasks
- `frontend/src/services/tokenService.ts` — defines the production localStorage key; always the source of truth for any key rename.
- `backend/tests/conftest.py` — holds the fallback DATABASE_URL; update whenever the DB name or project identifier changes.
- `backend/tests/test_webhook_service.py` — secondary location for the fallback DB name pattern; easy to miss if only checking conftest.
- `CLAUDE.md` — project-level documentation that references environment defaults and must stay in sync with code.

## Gotchas and Pitfalls
- **Test mocks silently diverge from production**: If `tokenService.ts` uses `devtracker_refresh_token` but tests use `survey_tool_refresh_token`, every test that sets the token will pass in isolation while the real app silently reads from the wrong key. There is no compiler error — only a runtime regression.
- **Lesson/history files**: Auto-generated lesson documents record what happened at the time they were written. Rewriting them to use the new brand name would falsify the historical record. Exclude them from rename scripts explicitly.
- **CI vs. local fallback**: The fallback DB hostname in conftest is only exercised locally without a `DATABASE_URL` env var. It won't break CI, but leaving the old name creates confusion for new developers running tests locally for the first time.
```
