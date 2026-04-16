---
date: "2026-04-16"
ticket_id: "ISS-259"
ticket_title: "Matrix response submission fails 422: validator runs against subquestions instead of parent"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-16"
ticket_id: "ISS-259"
ticket_title: "Matrix response submission fails 422: validator runs against subquestions instead of parent"
categories: ["validation", "matrix-questions", "bug-fix", "backend"]
outcome: "success"
complexity: "low"
files_modified:
  - "backend/app/services/response_submit_service.py"
  - "backend/app/services/response_crud_service.py"
  - "backend/tests/test_responses.py"
---

# Lessons Learned: Matrix response submission fails 422: validator runs against subquestions instead of parent

## What Worked Well
- Network evidence in the bug report made root cause immediately obvious: the first PATCH (save) succeeded while the second PATCH (complete) failed, isolating the bug to the completion validation path
- The fix was minimal and surgical — two `continue` guards in two places, no structural changes required
- The parent_id field on Question already encoded the subquestion relationship; no new data model changes were needed

## What Was Challenging
- The bug only manifested at submission time (status: complete), not during answer saving, making it easy to miss in manual testing if testers didn't go all the way to completion
- Two separate code paths both had the same flaw: `_complete_response_core()` building virtual answer dicts and `_validate_answers()` in the CRUD service — both needed the same fix independently

## Key Technical Insights
1. Matrix questions store their answer on the parent question only; subquestions (parent_id != None) have no standalone answer and must never be validated independently
2. When iterating `group.questions` for validation or virtual-answer construction, subquestions are included by default — always filter them out before applying question-type validators
3. The completion flow runs a second, separate validation pass distinct from the save-time validation, so a bug in the completion path can be invisible during normal answer saving

## Reusable Patterns
- Guard pattern for skipping subquestions in any validation loop: `if question.parent_id is not None: continue`
- When a validator fails on child entities that should never be validated independently, look for loops that iterate all questions without filtering by hierarchy level
- Two-phase PATCH workflows (save answers, then mark complete) require validating both code paths independently — a bug in one phase may not surface in the other

## Files to Review for Similar Tasks
- `backend/app/services/response_submit_service.py` — `_complete_response_core()`: builds virtual answer entries for unanswered visible questions; must skip subquestions
- `backend/app/services/response_crud_service.py` — `_validate_answers()`: validates each answer against its question type; must skip subquestions fetched by question_id
- `backend/app/services/validators/matrix_validators.py` — defines what a valid matrix answer looks like; subquestions passed here will always fail
- `backend/tests/test_responses.py` — integration tests for the full submit/complete lifecycle

## Gotchas and Pitfalls
- `group.questions` returns all questions in a group including subquestions — never assume it returns only top-level questions
- A subquestion passed to a matrix validator will always fail because it has no dict-of-subquestion-codes answer; the error message ("value must be a dict mapping subquestion codes to option codes") is misleading when the real issue is that a subquestion was passed at all
- Testing only the save (PATCH answers) path gives false confidence — always test the full completion flow end-to-end when working on matrix questions
- Both validation sites must be fixed together; fixing only one leaves the other as a latent bug waiting to surface under slightly different call paths
```
