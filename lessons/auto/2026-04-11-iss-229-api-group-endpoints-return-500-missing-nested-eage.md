---
date: "2026-04-11"
ticket_id: "ISS-229"
ticket_title: "[API] Group endpoints return 500 — missing nested eager loading"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "documentation", "config"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-11"
ticket_id: "ISS-229"
ticket_title: "[API] Group endpoints return 500 — missing nested eager loading"
categories: ["sqlalchemy", "eager-loading", "bug-fix", "api", "pydantic-serialization"]
outcome: "success"
complexity: "low"
files_modified:
  - "backend/app/services/question_group_service.py"
  - "backend/tests/test_question_groups.py"
---

# Lessons Learned: [API] Group endpoints return 500 — missing nested eager loading

## What Worked Well
- The root cause was immediately identifiable from the error: `lazy='raise'` on SQLAlchemy relationships produces a clear exception rather than silently triggering N+1 queries, making the missing eager load obvious.
- The fix was mechanical and low-risk — chaining `.selectinload()` calls at all affected query sites with no logic changes required.
- The implementation plan correctly identified all 5 query locations upfront, allowing the fix to be applied consistently across every service method in one pass.

## What Was Challenging
- Ensuring all 5 query locations were updated rather than just the one surfaced by the reproduction steps — it's easy to fix the symptom (one endpoint) and miss the same pattern in related endpoints.
- Writing regression tests that set up the full relationship tree (group → question → subquestions + answer_options) requires understanding multiple fixture layers and creation order.

## Key Technical Insights
1. SQLAlchemy `lazy='raise'` is a defensive setting that prevents accidental lazy loading but will crash Pydantic serialization if any relationship is accessed without being eagerly loaded — always audit all relationships touched during serialization, not just the top-level one.
2. When a model has nested relationships (Group → Questions → Subquestions/AnswerOptions), `selectinload(Parent.children)` alone is insufficient; each level must be chained: `selectinload(Parent.children).selectinload(Child.grandchildren)`.
3. A single endpoint reproducing a 500 is a strong signal that all endpoints sharing the same service query pattern are affected — fix all sites simultaneously.
4. The correct SQLAlchemy pattern for two sibling relationships on the same parent is two separate chained options, not one: `.options(selectinload(QuestionGroup.questions).selectinload(Question.subquestions), selectinload(QuestionGroup.questions).selectinload(Question.answer_options))`.

## Reusable Patterns
- **Full nested eager load pattern for question groups:**
  ```python
  .options(
      selectinload(QuestionGroup.questions).selectinload(Question.subquestions),
      selectinload(QuestionGroup.questions).selectinload(Question.answer_options),
  )
  ```
- **Regression test structure:** create survey → create group → add question with subquestions and answer_options → call endpoint → assert 200 and presence of nested data in response body.
- When auditing a service file for missing eager loads, search for every `.options(selectinload(...))` call and verify the full relationship depth required by the response schema.

## Files to Review for Similar Tasks
- `backend/app/services/question_group_service.py` — canonical example of the corrected multi-level eager load pattern across create, get, list, update, and reorder methods.
- `backend/app/models/` — check `lazy='raise'` annotations to identify all relationships that must be eagerly loaded before serialization.
- `backend/tests/test_question_groups.py` — regression tests demonstrating how to seed nested group/question/subquestion/answer_option data for endpoint testing.

## Gotchas and Pitfalls
- Fixing only the endpoint that surfaced the 500 leaves identical bugs dormant in sibling endpoints — always grep the service file for every occurrence of the incomplete load pattern.
- `selectinload` on sibling relationships must be expressed as separate `.options()` entries or chained separately; attempting to chain two sibling loads off one `selectinload` call will not work as expected.
- If a reload query exists at the end of a mutation method (e.g., after `update_group()` or `reorder_groups()`), it must also receive the full eager load options — the initial fetch being correct does not help if the post-mutation reload omits them.
- Tests that only check HTTP status codes without asserting nested field presence will not catch this class of bug; always assert that `subquestions` and `answer_options` arrays are present and non-empty in the response body.
```
