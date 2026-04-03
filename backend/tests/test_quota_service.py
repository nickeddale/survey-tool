"""Unit and integration tests for app/services/quota_service.py.

Unit tests cover:
    - evaluate_quota_conditions(): all operators, edge cases, missing answers
Integration tests cover:
    - atomic_increment_quota(): success, quota-full (race condition)
    - evaluate_and_enforce_quotas(): terminate disqualifies, hide_question filters,
      quota.reached event fires at limit, no-op when quota not matched
"""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio

from app.services.quota_service import (
    QuotaEnforcementResult,
    _apply_operator,
    atomic_increment_quota,
    evaluate_and_enforce_quotas,
    evaluate_quota_conditions,
    get_active_quotas_for_survey,
)
from app.utils.errors import ForbiddenError


# ---------------------------------------------------------------------------
# Helpers — build mock Quota objects
# ---------------------------------------------------------------------------


def make_quota(
    *,
    quota_id: uuid.UUID | None = None,
    survey_id: uuid.UUID | None = None,
    name: str = "Test Quota",
    limit: int = 10,
    action: str = "terminate",
    conditions: list | None = None,
    current_count: int = 0,
    is_active: bool = True,
) -> MagicMock:
    """Build a mock Quota ORM object."""
    q = MagicMock()
    q.id = quota_id or uuid.uuid4()
    q.survey_id = survey_id or uuid.uuid4()
    q.name = name
    q.limit = limit
    q.action = action
    q.conditions = conditions if conditions is not None else []
    q.current_count = current_count
    q.is_active = is_active
    return q


def make_condition(
    question_id: uuid.UUID,
    operator: str,
    value: object,
) -> dict:
    """Build a condition dict (as stored in the DB after JSON serialisation)."""
    return {
        "question_id": str(question_id),
        "operator": operator,
        "value": value,
    }


# ===========================================================================
# Unit tests — _apply_operator
# ===========================================================================


class TestApplyOperator:
    """Direct tests for the _apply_operator helper."""

    # eq
    def test_eq_matching_string(self):
        assert _apply_operator("hello", "eq", "hello") is True

    def test_eq_non_matching_string(self):
        assert _apply_operator("hello", "eq", "world") is False

    def test_eq_numeric_coercion(self):
        assert _apply_operator("5", "eq", 5) is True
        assert _apply_operator(5, "eq", "5") is True
        assert _apply_operator(5.0, "eq", 5) is True

    def test_eq_none_returns_false(self):
        assert _apply_operator(None, "eq", "anything") is False

    # neq
    def test_neq_different_values(self):
        assert _apply_operator("a", "neq", "b") is True

    def test_neq_same_values(self):
        assert _apply_operator("a", "neq", "a") is False

    def test_neq_none_returns_true(self):
        assert _apply_operator(None, "neq", "anything") is True

    def test_neq_numeric_coercion(self):
        assert _apply_operator("5", "neq", 6) is True
        assert _apply_operator("5", "neq", 5) is False

    # gt
    def test_gt_greater(self):
        assert _apply_operator(10, "gt", 5) is True

    def test_gt_equal(self):
        assert _apply_operator(5, "gt", 5) is False

    def test_gt_less(self):
        assert _apply_operator(3, "gt", 5) is False

    def test_gt_none_returns_false(self):
        assert _apply_operator(None, "gt", 5) is False

    def test_gt_non_numeric_returns_false(self):
        assert _apply_operator("abc", "gt", 5) is False

    def test_gt_string_coercion(self):
        assert _apply_operator("10", "gt", 5) is True

    # lt
    def test_lt_less(self):
        assert _apply_operator(3, "lt", 5) is True

    def test_lt_equal(self):
        assert _apply_operator(5, "lt", 5) is False

    def test_lt_greater(self):
        assert _apply_operator(10, "lt", 5) is False

    def test_lt_none_returns_false(self):
        assert _apply_operator(None, "lt", 5) is False

    # gte
    def test_gte_greater(self):
        assert _apply_operator(10, "gte", 5) is True

    def test_gte_equal(self):
        assert _apply_operator(5, "gte", 5) is True

    def test_gte_less(self):
        assert _apply_operator(3, "gte", 5) is False

    # lte
    def test_lte_less(self):
        assert _apply_operator(3, "lte", 5) is True

    def test_lte_equal(self):
        assert _apply_operator(5, "lte", 5) is True

    def test_lte_greater(self):
        assert _apply_operator(10, "lte", 5) is False

    # in
    def test_in_list_member(self):
        assert _apply_operator("a", "in", ["a", "b", "c"]) is True

    def test_in_list_non_member(self):
        assert _apply_operator("d", "in", ["a", "b", "c"]) is False

    def test_in_string_substring(self):
        assert _apply_operator("ello", "in", "hello world") is True

    def test_in_string_not_substring(self):
        assert _apply_operator("xyz", "in", "hello world") is False

    def test_in_none_returns_false(self):
        assert _apply_operator(None, "in", ["a", "b"]) is False

    # contains
    def test_contains_list_has_element(self):
        assert _apply_operator(["a", "b", "c"], "contains", "b") is True

    def test_contains_list_missing_element(self):
        assert _apply_operator(["a", "b"], "contains", "c") is False

    def test_contains_string_has_substring(self):
        assert _apply_operator("hello world", "contains", "world") is True

    def test_contains_string_missing_substring(self):
        assert _apply_operator("hello world", "contains", "xyz") is False

    def test_contains_none_returns_false(self):
        assert _apply_operator(None, "contains", "x") is False

    # unknown operator
    def test_unknown_operator_returns_false(self):
        assert _apply_operator("a", "regex", "a") is False


# ===========================================================================
# Unit tests — evaluate_quota_conditions
# ===========================================================================


class TestEvaluateQuotaConditions:
    """Tests for evaluate_quota_conditions()."""

    def test_empty_conditions_returns_false(self):
        """Empty or None conditions never match (safety guard)."""
        q_id = uuid.uuid4()
        quota = make_quota(conditions=[])
        assert evaluate_quota_conditions(quota, {q_id: "yes"}) is False

    def test_none_conditions_returns_false(self):
        quota = make_quota(conditions=None)
        assert evaluate_quota_conditions(quota, {}) is False

    def test_single_condition_match(self):
        q_id = uuid.uuid4()
        quota = make_quota(conditions=[make_condition(q_id, "eq", "male")])
        assert evaluate_quota_conditions(quota, {q_id: "male"}) is True

    def test_single_condition_no_match(self):
        q_id = uuid.uuid4()
        quota = make_quota(conditions=[make_condition(q_id, "eq", "male")])
        assert evaluate_quota_conditions(quota, {q_id: "female"}) is False

    def test_missing_answer_returns_false(self):
        """When the answer for a condition question is absent, the quota does not match."""
        q_id = uuid.uuid4()
        quota = make_quota(conditions=[make_condition(q_id, "eq", "yes")])
        # answer_lookup does not contain q_id
        assert evaluate_quota_conditions(quota, {}) is False

    def test_missing_answer_explicit_none_returns_false(self):
        """When the answer value is explicitly None, the quota does not match (except neq)."""
        q_id = uuid.uuid4()
        quota = make_quota(conditions=[make_condition(q_id, "eq", "yes")])
        assert evaluate_quota_conditions(quota, {q_id: None}) is False

    def test_multiple_conditions_all_must_match(self):
        q1 = uuid.uuid4()
        q2 = uuid.uuid4()
        quota = make_quota(conditions=[
            make_condition(q1, "eq", "male"),
            make_condition(q2, "gte", 18),
        ])
        assert evaluate_quota_conditions(quota, {q1: "male", q2: 25}) is True

    def test_multiple_conditions_one_fails(self):
        q1 = uuid.uuid4()
        q2 = uuid.uuid4()
        quota = make_quota(conditions=[
            make_condition(q1, "eq", "male"),
            make_condition(q2, "gte", 18),
        ])
        assert evaluate_quota_conditions(quota, {q1: "male", q2: 15}) is False

    def test_neq_with_missing_answer_returns_true(self):
        """neq with missing answer: None != value → True."""
        q_id = uuid.uuid4()
        quota = make_quota(conditions=[make_condition(q_id, "neq", "disqualify")])
        assert evaluate_quota_conditions(quota, {}) is True

    def test_numeric_type_coercion_string_to_int(self):
        q_id = uuid.uuid4()
        quota = make_quota(conditions=[make_condition(q_id, "eq", 5)])
        assert evaluate_quota_conditions(quota, {q_id: "5"}) is True

    def test_numeric_type_coercion_int_to_string(self):
        q_id = uuid.uuid4()
        quota = make_quota(conditions=[make_condition(q_id, "gt", "3")])
        assert evaluate_quota_conditions(quota, {q_id: 5}) is True

    def test_in_operator_list_condition(self):
        q_id = uuid.uuid4()
        quota = make_quota(conditions=[make_condition(q_id, "in", ["a", "b", "c"])])
        assert evaluate_quota_conditions(quota, {q_id: "b"}) is True
        assert evaluate_quota_conditions(quota, {q_id: "d"}) is False

    def test_contains_operator_list_answer(self):
        q_id = uuid.uuid4()
        quota = make_quota(conditions=[make_condition(q_id, "contains", "opt_a")])
        assert evaluate_quota_conditions(quota, {q_id: ["opt_a", "opt_b"]}) is True
        assert evaluate_quota_conditions(quota, {q_id: ["opt_c"]}) is False


# ===========================================================================
# Integration tests — atomic_increment_quota
# ===========================================================================


@pytest.mark.asyncio
async def test_atomic_increment_success(client, session):
    """atomic_increment_quota increments and returns the new count when below limit.

    Uses the test HTTP client to create a real survey + quota via the API,
    then calls atomic_increment_quota directly via the test session.
    """
    from httpx import AsyncClient

    # Create a user and log in
    reg_resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "inc_test@example.com", "password": "testpass123", "name": "Inc Test"},
    )
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "inc_test@example.com", "password": "testpass123"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create survey
    survey_resp = await client.post("/api/v1/surveys", json={"title": "Inc Test Survey"}, headers=headers)
    assert survey_resp.status_code == 201
    survey_id = survey_resp.json()["id"]

    # Add group and question
    group_resp = await client.post(
        f"/api/v1/surveys/{survey_id}/groups", json={"title": "G"}, headers=headers
    )
    group_id = group_resp.json()["id"]
    q_resp = await client.post(
        f"/api/v1/surveys/{survey_id}/groups/{group_id}/questions",
        json={"title": "Q", "question_type": "short_text", "code": "Q1"},
        headers=headers,
    )
    question_id = q_resp.json()["id"]

    # Create a quota with limit=5
    quota_resp = await client.post(
        f"/api/v1/surveys/{survey_id}/quotas",
        json={
            "name": "Inc Quota",
            "limit": 5,
            "action": "terminate",
            "conditions": [{"question_id": question_id, "operator": "eq", "value": "x"}],
            "is_active": True,
        },
        headers=headers,
    )
    assert quota_resp.status_code == 201
    quota_id = uuid.UUID(quota_resp.json()["id"])

    # Now test atomic_increment_quota directly via the test session
    # Increment 5 times (fill to limit)
    for expected in range(1, 6):
        incremented, new_count = await atomic_increment_quota(session, quota_id)
        await session.flush()
        assert incremented is True
        assert new_count == expected

    # Quota is now full — next attempt should fail (rowcount == 0)
    inc_full, cnt_full = await atomic_increment_quota(session, quota_id)
    await session.flush()
    assert inc_full is False
    assert cnt_full is None


# ===========================================================================
# Integration tests — evaluate_and_enforce_quotas via HTTP (end-to-end)
# ===========================================================================
# These are in test_responses.py to leverage the full HTTP stack.
# The tests below validate the quota service logic via direct mock injection.


class TestEvaluateAndEnforceQuotasMocked:
    """Mocked integration tests for evaluate_and_enforce_quotas().

    Uses AsyncMock session to isolate from DB.
    """

    def _make_session(self, quotas: list, increment_returns: list[tuple[bool, int | None]]):
        """Build a mock AsyncSession that:
          - returns `quotas` from get_active_quotas_for_survey query
          - cycles through `increment_returns` for each atomic_increment call
        """
        session = AsyncMock()
        # Patch execute so atomic_increment works via text() — use module-level patch instead.
        return session

    @pytest.mark.asyncio
    async def test_no_quotas_returns_empty_result(self):
        """When there are no active quotas, result is not disqualified and no hidden ids."""
        from unittest.mock import patch, AsyncMock as AM

        survey_id = uuid.uuid4()
        response_id = uuid.uuid4()

        with patch(
            "app.services.quota_service.get_active_quotas_for_survey",
            new=AM(return_value=[]),
        ):
            session = AsyncMock()
            result = await evaluate_and_enforce_quotas(session, survey_id, response_id, {})
            assert result.disqualified is False
            assert result.hidden_question_ids == set()

    @pytest.mark.asyncio
    async def test_quota_not_matched_no_action(self):
        """When conditions do not match, no increment or enforcement occurs."""
        from unittest.mock import patch, AsyncMock as AM

        q_id = uuid.uuid4()
        survey_id = uuid.uuid4()
        response_id = uuid.uuid4()
        quota = make_quota(
            survey_id=survey_id,
            action="terminate",
            conditions=[make_condition(q_id, "eq", "male")],
        )

        with patch(
            "app.services.quota_service.get_active_quotas_for_survey",
            new=AM(return_value=[quota]),
        ), patch(
            "app.services.quota_service.atomic_increment_quota",
            new=AM(return_value=(True, 1)),
        ) as mock_inc:
            session = AsyncMock()
            # Answer does not match condition
            result = await evaluate_and_enforce_quotas(
                session, survey_id, response_id, {q_id: "female"}
            )
            mock_inc.assert_not_called()
            assert result.disqualified is False

    @pytest.mark.asyncio
    async def test_terminate_quota_not_full_does_not_disqualify(self):
        """A matched terminate quota that is not yet full does NOT disqualify."""
        from unittest.mock import patch, AsyncMock as AM

        q_id = uuid.uuid4()
        survey_id = uuid.uuid4()
        response_id = uuid.uuid4()
        quota = make_quota(
            survey_id=survey_id,
            limit=10,
            action="terminate",
            conditions=[make_condition(q_id, "eq", "yes")],
        )

        with patch(
            "app.services.quota_service.get_active_quotas_for_survey",
            new=AM(return_value=[quota]),
        ), patch(
            "app.services.quota_service.atomic_increment_quota",
            new=AM(return_value=(True, 5)),  # new_count=5, limit=10
        ):
            session = AsyncMock()
            result = await evaluate_and_enforce_quotas(
                session, survey_id, response_id, {q_id: "yes"}
            )
            assert result.disqualified is False

    @pytest.mark.asyncio
    async def test_terminate_quota_filled_raises_forbidden_error(self):
        """A matched terminate quota that just filled raises ForbiddenError."""
        from unittest.mock import patch, AsyncMock as AM

        q_id = uuid.uuid4()
        survey_id = uuid.uuid4()
        response_id = uuid.uuid4()
        quota = make_quota(
            survey_id=survey_id,
            limit=5,
            action="terminate",
            conditions=[make_condition(q_id, "eq", "yes")],
        )

        with patch(
            "app.services.quota_service.get_active_quotas_for_survey",
            new=AM(return_value=[quota]),
        ), patch(
            "app.services.quota_service.atomic_increment_quota",
            new=AM(return_value=(True, 5)),  # new_count == limit → disqualify
        ):
            session = AsyncMock()
            with pytest.raises(ForbiddenError):
                await evaluate_and_enforce_quotas(
                    session, survey_id, response_id, {q_id: "yes"}
                )

    @pytest.mark.asyncio
    async def test_terminate_quota_already_full_raises_forbidden_error(self):
        """A matched terminate quota that was already full (rowcount=0) raises ForbiddenError."""
        from unittest.mock import patch, AsyncMock as AM

        q_id = uuid.uuid4()
        survey_id = uuid.uuid4()
        response_id = uuid.uuid4()
        quota = make_quota(
            survey_id=survey_id,
            limit=5,
            action="terminate",
            conditions=[make_condition(q_id, "eq", "yes")],
        )

        with patch(
            "app.services.quota_service.get_active_quotas_for_survey",
            new=AM(return_value=[quota]),
        ), patch(
            "app.services.quota_service.atomic_increment_quota",
            new=AM(return_value=(False, None)),  # quota was already full
        ):
            session = AsyncMock()
            with pytest.raises(ForbiddenError):
                await evaluate_and_enforce_quotas(
                    session, survey_id, response_id, {q_id: "yes"}
                )

    @pytest.mark.asyncio
    async def test_hide_question_quota_matched_returns_hidden_ids(self):
        """A matched hide_question quota returns condition question IDs in hidden_question_ids."""
        from unittest.mock import patch, AsyncMock as AM

        q_id = uuid.uuid4()
        survey_id = uuid.uuid4()
        response_id = uuid.uuid4()
        quota = make_quota(
            survey_id=survey_id,
            limit=10,
            action="hide_question",
            conditions=[make_condition(q_id, "eq", "hide_me")],
        )

        with patch(
            "app.services.quota_service.get_active_quotas_for_survey",
            new=AM(return_value=[quota]),
        ), patch(
            "app.services.quota_service.atomic_increment_quota",
            new=AM(return_value=(True, 3)),
        ):
            session = AsyncMock()
            result = await evaluate_and_enforce_quotas(
                session, survey_id, response_id, {q_id: "hide_me"}
            )
            assert result.disqualified is False
            assert q_id in result.hidden_question_ids

    @pytest.mark.asyncio
    async def test_hide_question_quota_not_matched_returns_no_hidden_ids(self):
        """An unmatched hide_question quota does not add to hidden_question_ids."""
        from unittest.mock import patch, AsyncMock as AM

        q_id = uuid.uuid4()
        survey_id = uuid.uuid4()
        response_id = uuid.uuid4()
        quota = make_quota(
            survey_id=survey_id,
            limit=10,
            action="hide_question",
            conditions=[make_condition(q_id, "eq", "hide_me")],
        )

        with patch(
            "app.services.quota_service.get_active_quotas_for_survey",
            new=AM(return_value=[quota]),
        ), patch(
            "app.services.quota_service.atomic_increment_quota",
            new=AM(return_value=(True, 1)),
        ) as mock_inc:
            session = AsyncMock()
            result = await evaluate_and_enforce_quotas(
                session, survey_id, response_id, {q_id: "show_me"}
            )
            mock_inc.assert_not_called()
            assert result.hidden_question_ids == set()

    @pytest.mark.asyncio
    async def test_quota_reached_event_emitted_when_new_count_equals_limit(self):
        """_emit_quota_reached is called when new_count == limit."""
        from unittest.mock import patch, AsyncMock as AM, call

        q_id = uuid.uuid4()
        survey_id = uuid.uuid4()
        response_id = uuid.uuid4()
        quota = make_quota(
            survey_id=survey_id,
            limit=5,
            action="hide_question",  # Use hide_question so we don't raise
            conditions=[make_condition(q_id, "eq", "trigger")],
        )

        emit_mock = AM()

        with patch(
            "app.services.quota_service.get_active_quotas_for_survey",
            new=AM(return_value=[quota]),
        ), patch(
            "app.services.quota_service.atomic_increment_quota",
            new=AM(return_value=(True, 5)),  # new_count == limit
        ), patch(
            "app.services.quota_service._emit_quota_reached",
            new=emit_mock,
        ):
            session = AsyncMock()
            await evaluate_and_enforce_quotas(
                session, survey_id, response_id, {q_id: "trigger"}
            )
            emit_mock.assert_called_once()

    @pytest.mark.asyncio
    async def test_quota_reached_event_not_emitted_when_not_at_limit(self):
        """_emit_quota_reached is NOT called when new_count < limit."""
        from unittest.mock import patch, AsyncMock as AM

        q_id = uuid.uuid4()
        survey_id = uuid.uuid4()
        response_id = uuid.uuid4()
        quota = make_quota(
            survey_id=survey_id,
            limit=10,
            action="hide_question",
            conditions=[make_condition(q_id, "eq", "go")],
        )

        emit_mock = AM()

        with patch(
            "app.services.quota_service.get_active_quotas_for_survey",
            new=AM(return_value=[quota]),
        ), patch(
            "app.services.quota_service.atomic_increment_quota",
            new=AM(return_value=(True, 5)),  # new_count (5) < limit (10)
        ), patch(
            "app.services.quota_service._emit_quota_reached",
            new=emit_mock,
        ):
            session = AsyncMock()
            await evaluate_and_enforce_quotas(
                session, survey_id, response_id, {q_id: "go"}
            )
            emit_mock.assert_not_called()
