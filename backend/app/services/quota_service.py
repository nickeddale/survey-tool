"""Service layer for quota evaluation and enforcement during response submission.

Implements:
    - evaluate_quota_conditions(): checks if a response's answers match all conditions
      on a quota (supports operators: eq, neq, gt, lt, gte, lte, in, contains).
    - atomic_increment_quota(): atomically increments current_count with race-condition
      prevention via UPDATE ... WHERE current_count < limit RETURNING current_count.
    - get_active_quotas_for_survey(): loads all active quotas for a given survey.
    - evaluate_and_enforce_quotas(): orchestrates the above; called from complete_response().
      Handles terminate action (raises ForbiddenError / disqualifies response) and
      hide_question action (returns set of hidden question IDs). Fires quota.reached
      event when limit is newly reached.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.quota import Quota
from app.models.response import Response
from app.services.webhook_service import dispatch_webhook_event
from app.utils.errors import ForbiddenError


# ---------------------------------------------------------------------------
# Condition evaluation
# ---------------------------------------------------------------------------


def _coerce_numeric(value: Any) -> float | None:
    """Attempt to coerce value to float for numeric comparisons.

    Returns None if coercion fails (non-numeric).
    """
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value) if "." in value else float(int(value))
        except (ValueError, TypeError):
            return None
    return None


def _apply_operator(answer_value: Any, operator: str, condition_value: Any) -> bool:
    """Apply a single operator comparison between the answer value and condition value.

    Supports:
        eq, neq: equality / inequality (type-coerced numeric)
        gt, lt, gte, lte: numeric ordering (coerced)
        in: answer_value is a member of condition_value (list) or condition_value
            is a superstring of answer_value (str)
        contains: answer_value (list or str) contains condition_value

    Missing answers (None) always return False for all operators except neq.
    """
    if operator == "eq":
        if answer_value is None:
            return False
        # Numeric coercion
        a_num = _coerce_numeric(answer_value)
        c_num = _coerce_numeric(condition_value)
        if a_num is not None and c_num is not None:
            return a_num == c_num
        return str(answer_value) == str(condition_value)

    if operator == "neq":
        if answer_value is None:
            return True  # missing != anything
        a_num = _coerce_numeric(answer_value)
        c_num = _coerce_numeric(condition_value)
        if a_num is not None and c_num is not None:
            return a_num != c_num
        return str(answer_value) != str(condition_value)

    if operator in ("gt", "lt", "gte", "lte"):
        if answer_value is None:
            return False
        a_num = _coerce_numeric(answer_value)
        c_num = _coerce_numeric(condition_value)
        if a_num is None or c_num is None:
            return False
        if operator == "gt":
            return a_num > c_num
        if operator == "lt":
            return a_num < c_num
        if operator == "gte":
            return a_num >= c_num
        if operator == "lte":
            return a_num <= c_num

    if operator == "in":
        if answer_value is None:
            return False
        if isinstance(condition_value, list):
            return answer_value in condition_value
        if isinstance(condition_value, str):
            return str(answer_value) in condition_value
        return False

    if operator == "contains":
        if answer_value is None:
            return False
        if isinstance(answer_value, list):
            return condition_value in answer_value
        if isinstance(answer_value, str):
            return str(condition_value) in answer_value
        return False

    # Unknown operator — treat as no-match
    return False


def evaluate_quota_conditions(
    quota: Quota,
    answer_lookup: dict[uuid.UUID, Any],
) -> bool:
    """Return True if ALL conditions on the quota match the response's answers.

    Args:
        quota: The Quota ORM object with a ``conditions`` list.
        answer_lookup: Mapping of question_id (UUID) -> answer value for this response.

    Returns:
        True if every condition is satisfied, False otherwise (including when
        conditions is empty/None — treat as always-match only if explicitly expected;
        here we return False for safety when conditions list is empty or None).
    """
    conditions = quota.conditions
    if not conditions:
        # A quota with no conditions should never match (defensive; schema validates non-empty)
        return False

    for condition in conditions:
        # conditions are stored as dicts (JSON) after model serialization
        if isinstance(condition, dict):
            question_id_raw = condition.get("question_id")
            operator = condition.get("operator", "eq")
            condition_value = condition.get("value")
        else:
            # Pydantic model (QuotaCondition) from in-memory construction
            question_id_raw = getattr(condition, "question_id", None)
            operator = getattr(condition, "operator", "eq")
            condition_value = getattr(condition, "value", None)

        # Resolve question_id to UUID
        if isinstance(question_id_raw, uuid.UUID):
            question_id = question_id_raw
        else:
            try:
                question_id = uuid.UUID(str(question_id_raw))
            except (ValueError, AttributeError):
                return False

        answer_value = answer_lookup.get(question_id)

        if not _apply_operator(answer_value, operator, condition_value):
            return False

    return True


# ---------------------------------------------------------------------------
# Atomic increment
# ---------------------------------------------------------------------------


async def atomic_increment_quota(
    session: AsyncSession,
    quota_id: uuid.UUID,
) -> tuple[bool, int | None]:
    """Atomically increment quota.current_count if below limit.

    Executes:
        UPDATE quotas
        SET current_count = current_count + 1
        WHERE id = :id AND current_count < limit
        RETURNING current_count

    Args:
        session: The async database session.
        quota_id: The UUID of the quota to increment.

    Returns:
        A tuple (incremented, new_count) where:
        - incremented=True, new_count=<updated value> on success
        - incremented=False, new_count=None when quota was already full
          (race condition: another request filled the last slot)
    """
    stmt = text(
        """
        UPDATE quotas
        SET current_count = current_count + 1
        WHERE id = :id AND current_count < "limit"
        RETURNING current_count
        """
    )
    result = await session.execute(stmt, {"id": quota_id})
    row = result.fetchone()
    if row is None:
        # No row updated — quota was already at (or beyond) its limit
        return False, None
    return True, row[0]


# ---------------------------------------------------------------------------
# Query active quotas
# ---------------------------------------------------------------------------


async def get_active_quotas_for_survey(
    session: AsyncSession,
    survey_id: uuid.UUID,
) -> list[Quota]:
    """Return all active quotas for a survey, ordered by created_at ascending.

    Args:
        session: The async database session.
        survey_id: The UUID of the survey.

    Returns:
        List of Quota ORM objects with is_active=True, ordered deterministically.
    """
    result = await session.execute(
        select(Quota)
        .where(
            Quota.survey_id == survey_id,
            Quota.is_active == True,  # noqa: E712
        )
        .order_by(Quota.created_at.asc())
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# Quota.reached event emission (webhook stub)
# ---------------------------------------------------------------------------


async def _emit_quota_reached(
    session: AsyncSession,
    quota: Quota,
    response_id: uuid.UUID,
    new_count: int,
) -> None:
    """Emit a quota.reached webhook event.

    Dispatches a fire-and-forget webhook with quota details. The session
    parameter is accepted for signature compatibility but not passed to the
    dispatcher (which opens its own session to avoid lifetime issues).

    Args:
        session: The current async database session (not forwarded to dispatcher).
        quota: The Quota ORM object whose limit was just reached.
        response_id: The UUID of the response that triggered the limit.
        new_count: The new current_count value after increment.
    """
    dispatch_webhook_event(
        event="quota.reached",
        survey_id=quota.survey_id,
        data={
            "quota_id": str(quota.id),
            "quota_name": quota.name,
            "survey_id": str(quota.survey_id),
            "response_id": str(response_id),
            "current_count": new_count,
            "limit": quota.limit,
        },
    )


# ---------------------------------------------------------------------------
# Main enforcement entry point
# ---------------------------------------------------------------------------


class QuotaEnforcementResult:
    """Result of evaluate_and_enforce_quotas().

    Attributes:
        disqualified: True if a terminate quota was matched and the response
                      should be disqualified.
        hidden_question_ids: Set of question UUIDs that should be hidden due to
                             matched hide_question quotas.
    """

    def __init__(
        self,
        disqualified: bool = False,
        hidden_question_ids: set[uuid.UUID] | None = None,
    ) -> None:
        self.disqualified = disqualified
        self.hidden_question_ids: set[uuid.UUID] = hidden_question_ids or set()


async def evaluate_and_enforce_quotas(
    session: AsyncSession,
    survey_id: uuid.UUID,
    response_id: uuid.UUID,
    answer_lookup: dict[uuid.UUID, Any],
) -> QuotaEnforcementResult:
    """Evaluate all active quotas for a survey and enforce matched ones.

    For each active quota:
        1. Evaluate all conditions against answer_lookup.
        2. If matched, attempt atomic_increment_quota().
        3. If increment succeeds and new_count == limit, emit quota.reached event.
        4. If increment fails (quota already full), treat as quota-full:
           - terminate action: mark response disqualified and raise ForbiddenError.
           - hide_question action: collect hidden question IDs (quota full means hide).
        5. If increment succeeds:
           - terminate action: no disqualification (quota not yet full).
           - hide_question action: collect hidden question IDs (matched and counted).

    Note on terminate action:
        A terminate quota disqualifies the response when the quota FILLS ON THIS
        submission (new_count == limit) OR when it was already full (rowcount == 0).
        This means the response that fills the quota is disqualified (the limit has
        been reached by this or a prior submission), which is the standard survey
        quota behaviour.

    Args:
        session: The async database session (used for increment and event emission).
        survey_id: The UUID of the survey.
        response_id: The UUID of the response being completed.
        answer_lookup: Mapping of question_id -> value for all response answers.

    Returns:
        QuotaEnforcementResult with disqualified flag and hidden_question_ids set.

    Raises:
        ForbiddenError: When a matched terminate quota is full (disqualification).
    """
    quotas = await get_active_quotas_for_survey(session, survey_id)

    result = QuotaEnforcementResult()

    for quota in quotas:
        # Step 1: condition matching
        if not evaluate_quota_conditions(quota, answer_lookup):
            continue

        # Step 2: atomic increment
        incremented, new_count = await atomic_increment_quota(session, quota.id)

        # Step 3: emit quota.reached if limit newly reached
        if incremented and new_count == quota.limit:
            await _emit_quota_reached(session, quota, response_id, new_count)

        # Step 4+5: enforce based on action
        if quota.action == "terminate":
            # Disqualify when: quota was already full OR just reached the limit
            if not incremented or new_count == quota.limit:
                # Mark the response as disqualified in the DB before raising
                await session.execute(
                    update(Response)
                    .where(Response.id == response_id)
                    .values(status="disqualified")
                )
                result.disqualified = True
                raise ForbiddenError(
                    f"Response disqualified: quota '{quota.name}' has been reached"
                )

        elif quota.action == "hide_question":
            # Collect question IDs to hide: from all conditions on this quota
            # (questions referenced in conditions are hidden when quota is matched/full)
            conditions = quota.conditions or []
            for condition in conditions:
                if isinstance(condition, dict):
                    qid_raw = condition.get("question_id")
                else:
                    qid_raw = getattr(condition, "question_id", None)
                if qid_raw is not None:
                    try:
                        result.hidden_question_ids.add(uuid.UUID(str(qid_raw)))
                    except (ValueError, AttributeError):
                        pass

    return result
