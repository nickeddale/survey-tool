---
date: "2026-04-09"
ticket_id: "ISS-199"
ticket_title: "Number question type still sends 'numeric' from GroupPanel and BuilderToolbar"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-09"
ticket_id: "ISS-199"
ticket_title: "Number question type still sends 'numeric' from GroupPanel and BuilderToolbar"
categories: ["bug-fix", "frontend", "api-contract"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/components/survey-builder/GroupPanel.tsx"
  - "frontend/src/components/survey-builder/BuilderToolbar.tsx"
---

# Lessons Learned: Number question type still sends 'numeric' from GroupPanel and BuilderToolbar

## What Worked Well
- Root cause was clearly identified from the previous ticket (ISS-197) — the same string mismatch existed in multiple places
- The fix was surgical and low-risk: two one-line string changes with no logic impact
- Existing frontend tests provided a quick regression check without needing new test coverage

## What Was Challenging
- The original ISS-197 fix was incomplete — only one of three code paths was corrected, leaving two others broken
- There was no shared constant or enum for question types, making it easy to miss duplicate hardcoded strings

## Key Technical Insights
1. When fixing a hardcoded string mismatch in one location, always grep the entire codebase for all other occurrences of the incorrect value before closing the ticket
2. Database CHECK constraints are strict — `"numeric"` and `"number"` are entirely different strings to Postgres, and the 400/409 error surface is the first symptom, not the root cause
3. The same UI action (adding a Number question) had three distinct code paths: QuestionPalette, GroupPanel group header dropdown, and BuilderToolbar — each independently hardcoded the type string

## Reusable Patterns
- Before marking a string-value bug as fixed, run: `grep -r '"numeric"' frontend/src/` to catch all remaining instances
- Introduce a shared constants file or TypeScript enum for question type strings (e.g., `QUESTION_TYPES.NUMBER = 'number'`) to prevent divergence across components
- When a fix touches "one of several similar components," treat it as a signal to audit all sibling components for the same issue

## Files to Review for Similar Tasks
- `frontend/src/components/survey-builder/GroupPanel.tsx` — group-level question type dropdown
- `frontend/src/components/survey-builder/BuilderToolbar.tsx` — toolbar-level question type picker
- `frontend/src/components/survey-builder/QuestionPalette.tsx` — palette-level question type list (fixed in ISS-197)
- Any future component that renders a "add question" affordance should be checked against the canonical type list

## Gotchas and Pitfalls
- Fixing a bug in one component does not guarantee the same bug is absent in sibling components that share the same responsibility — always audit all related components
- API errors like 400/409 on question creation may be misleadingly generic; the actual cause is a constraint violation on the `question_type` column, not a schema or auth issue
- The absence of a shared type constant means future question type additions or renames will require manually hunting down every hardcoded string across the frontend
```
