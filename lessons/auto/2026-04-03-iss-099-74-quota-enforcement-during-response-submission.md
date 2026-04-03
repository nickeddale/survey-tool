---
date: "2026-04-03"
ticket_id: "ISS-099"
ticket_title: "7.4: Quota Enforcement During Response Submission"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-099"
ticket_title: "7.4: Quota Enforcement During Response Submission"
categories: ["quota-enforcement", "atomic-operations", "race-conditions", "webhooks", "async-sqlalchemy"]
outcome: "success"
complexity: "high"
files_modified: ["app/services/quota_service.py", "app/services/response_service.py", "tests/test_quota_service.py", "tests/test_responses.py"]
---

# Lessons Learned: 7.4: Quota Enforcement During Response Submission

## What Worked Well
- The atomic SQL UPDATE pattern (`UPDATE quotas SET current_count = current_count + 1 WHERE id = :id AND current_count < limit RETURNING current_count`) cleanly handles race conditions without application-level locking
- Using `result.rowcount == 0` as the quota-full signal is unambiguous and avoids any need for pre-check/post-check logic
- Separating condition evaluation (`evaluate_quota_conditions()`), atomic increment (`atomic_increment_quota()`), and orchestration (`evaluate_and_enforce_quotas()`) into discrete functions kept the logic testable in isolation
- Emitting `quota.reached` only after confirming `rowcount == 1` and `new_count == limit` prevented spurious webhook events under concurrent load

## What Was Challenging
- Coordinating quota enforcement within `complete_response()` at the right point — after answer loading and relevance computation but before final commit — required careful reading of existing transaction boundaries
- `hide_question` action required integrating with the relevance filtering pipeline rather than a simple disqualification, adding coordination complexity
- Async SQLAlchemy fixture scoping remained a footgun: session-scoped fixtures cause event loop mismatch errors with asyncpg; all fixtures must be `scope='function'`
- The `DATABASE_URL` default uses the psycopg2 scheme (`postgresql://`), which silently fails for async engines — every test run requires explicit override to `postgresql+asyncpg://`

## Key Technical Insights
1. **Atomic increment is the authoritative race condition guard**: Never rely on a SELECT + conditional UPDATE sequence. The single `UPDATE ... WHERE current_count < limit` is atomic at the DB level and eliminates TOCTOU races entirely.
2. **Event ordering matters**: The `quota.reached` event must be emitted only after the rowcount check confirms the increment succeeded and the new count equals the limit. Emitting on attempt rather than confirmed success would fire false events under contention.
3. **`rowcount == 0` is dual-purpose**: It signals both "quota was already full before this attempt" and "another concurrent request filled the quota between our read and write." Both cases should be treated identically — disqualify or skip depending on action type.
4. **Missing answers must return `False`, not raise**: `evaluate_quota_conditions()` must treat absent answer keys as non-matching rather than erroring, since partially completed responses are valid input.
5. **Type coercion in condition evaluation is a boundary case**: Numeric comparisons against string answer values (e.g., `'5' > 3`) require explicit coercion; never rely on implicit Python comparison behavior across types.

## Reusable Patterns
- **Atomic quota increment**:
  ```sql
  UPDATE quotas SET current_count = current_count + 1
  WHERE id = :id AND current_count < limit
  RETURNING current_count
  ```
  Check `result.rowcount == 0` for quota-full; `rowcount == 1` for success.
- **Function-scoped async fixtures**: All `@pytest_asyncio.fixture` decorators in async test files must use `scope='function'` to avoid event loop mismatch with asyncpg.
- **DATABASE_URL override for all async test runs**:
  ```
  DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker' pytest
  ```
- **Import smoke-test before test runs**:
  ```
  python -c 'from app.models.quota import Quota; from app.services.quota_service import evaluate_and_enforce_quotas'
  ```
- **Event emission guard**: `if rowcount == 1 and new_count == limit: emit('quota.reached', ...)`

## Files to Review for Similar Tasks
- `app/services/quota_service.py` — canonical example of atomic increment + event emission pattern
- `app/services/response_service.py` — shows how to integrate a disqualification service into a multi-step completion transaction
- `tests/test_quota_service.py` — operator coverage tests and concurrent increment simulation patterns
- `tests/test_responses.py` — end-to-end response completion with quota enforcement fixture setup

## Gotchas and Pitfalls
- **Do not use session-scoped async SQLAlchemy fixtures** — they break asyncpg under pytest-asyncio with event loop mismatch errors that are difficult to diagnose.
- **DATABASE_URL default scheme is psycopg2** — async engines will fail silently or with cryptic errors if not overridden to `postgresql+asyncpg://`.
- **Alembic autogenerate drops server_default and onupdate** — if any quota model migrations are required, manually author and inspect the migration script rather than relying on autogenerate.
- **Do not emit quota.reached before rowcount confirmation** — emit only on confirmed success at the limit boundary, not on every matching attempt.
- **passlib + bcrypt >= 4.x is broken** — if any credential operations are touched in related services, use `bcrypt.hashpw/checkpw/gensalt` directly.
- **hide_question quotas require relevance pipeline integration** — they cannot simply remove questions from the response payload; they must feed into the same filtering mechanism used by relevance evaluation to avoid inconsistent question visibility.
- **Missing answer keys must not raise in condition evaluation** — return `False` explicitly for absent answers to handle partial responses gracefully.
```
