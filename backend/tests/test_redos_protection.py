"""Tests for ReDoS protection (ISS-219).

Unit tests:
  - validate_regex_complexity rejects nested quantifiers
  - validate_regex_complexity rejects catastrophic alternation
  - validate_regex_complexity rejects syntactically invalid patterns
  - validate_regex_complexity accepts safe patterns
  - safe_regex_search raises TimeoutError for catastrophic patterns with long input
  - safe_regex_search works correctly for safe patterns (match / no-match)

Integration tests (require DB):
  - POST question with a catastrophic regex validation rule is rejected at save time (422)
  - POST question with a safe regex validation rule is accepted (201)
  - Response submission with a timeout-triggering input returns 422 quickly (not a hang)

Expression engine tests:
  - regex_match() raises EvaluationError on timeout
  - regex_match() works correctly for safe patterns
"""

import time
from unittest.mock import MagicMock

import pytest
from httpx import AsyncClient

from app.services.validators.regex_utils import safe_regex_search, validate_regex_complexity
from app.services.validators.text_validators import _apply_text_validation_rules
from app.utils.errors import UnprocessableError
from app.services.expressions.functions import regex_match


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _always_timeout(*args, **kwargs):
    """Stub for safe_regex_search that always raises TimeoutError."""
    raise TimeoutError("regex timed out (stubbed for testing)")


def make_question(
    question_type: str = "short_text",
    is_required: bool = False,
    settings: dict | None = None,
    validation: dict | None = None,
):
    q = MagicMock()
    q.question_type = question_type
    q.is_required = is_required
    q.settings = settings
    q.validation = validation
    q.answer_options = []
    q.subquestions = []
    return q


# ---------------------------------------------------------------------------
# validate_regex_complexity — unit tests (no DB needed)
# ---------------------------------------------------------------------------


def test_validate_regex_complexity_rejects_nested_plus_quantifier():
    """(a+)+ pattern must be rejected."""
    errs = validate_regex_complexity("(a+)+$")
    assert errs, "Expected complexity error for (a+)+$"
    assert any("nested quantifier" in e.message.lower() for e in errs)


def test_validate_regex_complexity_rejects_nested_star_quantifier():
    """(a*)* pattern must be rejected."""
    errs = validate_regex_complexity("(a*)*")
    assert errs, "Expected complexity error for (a*)*"
    assert any("nested quantifier" in e.message.lower() for e in errs)


def test_validate_regex_complexity_rejects_nested_plus_star():
    """(a+)* pattern must be rejected."""
    errs = validate_regex_complexity("(a+)*")
    assert errs, "Expected complexity error for (a+)*"
    assert any("nested quantifier" in e.message.lower() for e in errs)


def test_validate_regex_complexity_rejects_nested_word_chars():
    """(\\w+)+ pattern must be rejected."""
    errs = validate_regex_complexity(r"(\w+)+")
    assert errs, r"Expected complexity error for (\w+)+"
    assert any("nested quantifier" in e.message.lower() for e in errs)


def test_validate_regex_complexity_rejects_catastrophic_alternation():
    """(a|a)+ pattern must be rejected."""
    errs = validate_regex_complexity("(a|a)+")
    assert errs, "Expected complexity error for (a|a)+"
    assert any("alternation" in e.message.lower() for e in errs)


def test_validate_regex_complexity_rejects_invalid_syntax():
    """Syntactically broken regex must be rejected."""
    errs = validate_regex_complexity("[unclosed")
    assert errs, "Expected error for invalid regex syntax"
    assert any("not a valid regular expression" in e.message.lower() for e in errs)


def test_validate_regex_complexity_accepts_simple_pattern():
    """`\\d+` is safe."""
    errs = validate_regex_complexity(r"\d+")
    assert errs == [], f"Unexpected errors for safe pattern: {errs}"


def test_validate_regex_complexity_accepts_email_like_pattern():
    """A typical email-like pattern must be accepted."""
    errs = validate_regex_complexity(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")
    assert errs == [], f"Unexpected errors for email pattern: {errs}"


def test_validate_regex_complexity_accepts_simple_alternation():
    """Non-quantified alternation is safe."""
    errs = validate_regex_complexity(r"^(cat|dog|bird)$")
    assert errs == [], f"Unexpected errors for non-quantified alternation: {errs}"


def test_validate_regex_complexity_accepts_anchored_repeating_class():
    """^[a-z]+$ has no nested quantifier."""
    errs = validate_regex_complexity(r"^[a-z]+$")
    assert errs == [], f"Unexpected errors for ^[a-z]+$: {errs}"


# ---------------------------------------------------------------------------
# safe_regex_search — unit tests
# ---------------------------------------------------------------------------


def test_safe_regex_search_matches_correctly():
    """safe_regex_search returns a truthy match when the pattern matches."""
    result = safe_regex_search(r"\d{3}", "abc123def")
    assert result is not None


def test_safe_regex_search_returns_none_on_no_match():
    """safe_regex_search returns None when the pattern does not match."""
    result = safe_regex_search(r"^\d+$", "abc")
    assert result is None


def test_safe_regex_search_raises_timeout_for_catastrophic_pattern():
    """safe_regex_search raises TimeoutError for catastrophic backtracking."""
    # Use a very short timeout and a long input to reliably trigger the timeout.
    with pytest.raises(TimeoutError):
        safe_regex_search("(a+)+$", "a" * 30 + "!", timeout=0.0001)


def test_safe_regex_search_does_not_hang_with_default_timeout():
    """safe_regex_search completes in <= 1s even for a catastrophic pattern."""
    start = time.monotonic()
    try:
        safe_regex_search("(a+)+$", "a" * 30 + "!", timeout=0.1)
    except TimeoutError:
        pass
    elapsed = time.monotonic() - start
    assert elapsed < 1.0, f"safe_regex_search took {elapsed:.2f}s — too slow"


# ---------------------------------------------------------------------------
# _apply_text_validation_rules — unit tests (timeout path)
# ---------------------------------------------------------------------------


def test_apply_text_validation_rules_raises_422_on_timeout(monkeypatch):
    """_apply_text_validation_rules raises UnprocessableError on regex timeout."""
    import app.services.validators.text_validators as tv

    # Patch safe_regex_search in the text_validators module to always raise TimeoutError
    monkeypatch.setattr(tv, "safe_regex_search", _always_timeout)
    validation = {"regex": "(a+)+$"}
    with pytest.raises(UnprocessableError, match="timed out"):
        _apply_text_validation_rules("a" * 30 + "!", validation)


def test_apply_text_validation_rules_passes_for_safe_pattern():
    """_apply_text_validation_rules passes for a matching safe pattern."""
    validation = {"regex": r"^\d+$"}
    _apply_text_validation_rules("12345", validation)  # must not raise


def test_apply_text_validation_rules_raises_422_for_non_matching_safe_pattern():
    """_apply_text_validation_rules raises UnprocessableError for non-match."""
    validation = {"regex": r"^\d+$"}
    with pytest.raises(UnprocessableError, match="does not match"):
        _apply_text_validation_rules("hello", validation)


# ---------------------------------------------------------------------------
# expressions/functions.py regex_match — unit tests (timeout path)
# ---------------------------------------------------------------------------

# We need EvaluationError to be registered; import evaluator to trigger registration.
import app.services.expressions.evaluator as _evaluator_module  # noqa: E402 F401


def test_regex_match_returns_true_for_match():
    """regex_match() returns True when the string matches the pattern."""
    assert regex_match("hello world", r"\w+") is True


def test_regex_match_returns_false_for_no_match():
    """regex_match() returns False when the string does not match."""
    assert regex_match("hello", r"^\d+$") is False


def test_regex_match_raises_evaluation_error_on_timeout(monkeypatch):
    """regex_match() raises EvaluationError when the regex times out."""
    from app.services.expressions.evaluator import EvaluationError
    import app.services.expressions.functions as fn_module

    # Patch safe_regex_search in the functions module to always raise TimeoutError.
    monkeypatch.setattr(fn_module, "_safe_regex_search", _always_timeout)

    with pytest.raises(EvaluationError, match="timed out"):
        regex_match("a" * 30 + "!", "(a+)+$")


# ---------------------------------------------------------------------------
# Integration tests (require DB + HTTP client)
# ---------------------------------------------------------------------------


async def _register_and_login(client: AsyncClient) -> str:
    """Register a new user and return an access token."""
    import uuid
    email = f"redos_{uuid.uuid4().hex[:8]}@example.com"
    await client.post("/api/v1/auth/register", json={
        "email": email,
        "password": "password123",
        "name": "ReDoS Tester",
    })
    resp = await client.post("/api/v1/auth/login", json={
        "email": email,
        "password": "password123",
    })
    assert resp.status_code == 200
    return resp.json()["access_token"]


async def _create_survey(client: AsyncClient, token: str) -> int:
    """Create a draft survey and return its ID."""
    resp = await client.post(
        "/api/v1/surveys",
        json={"title": "ReDoS Test Survey"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_group(client: AsyncClient, token: str, survey_id: int) -> int:
    """Create a question group and return its ID."""
    resp = await client.post(
        f"/api/v1/surveys/{survey_id}/groups",
        json={"title": "Group 1", "order": 1},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_create_question_with_catastrophic_regex_returns_422(client: AsyncClient):
    """POST a question with a catastrophic regex validation rule → 422."""
    token = await _register_and_login(client)
    survey_id = await _create_survey(client, token)
    group_id = await _create_group(client, token, survey_id)

    resp = await client.post(
        f"/api/v1/surveys/{survey_id}/groups/{group_id}/questions",
        json={
            "question_type": "short_text",
            "title": "Text question",
            "order": 1,
            "validation": {"regex": "(a+)+$"},
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"
    body = resp.json()
    # The error message should mention nested quantifiers
    detail_str = str(body).lower()
    assert "nested quantifier" in detail_str or "catastrophic" in detail_str or "backtracking" in detail_str


@pytest.mark.asyncio
async def test_create_question_with_safe_regex_returns_201(client: AsyncClient):
    """POST a question with a safe regex validation rule → 201."""
    token = await _register_and_login(client)
    survey_id = await _create_survey(client, token)
    group_id = await _create_group(client, token, survey_id)

    resp = await client.post(
        f"/api/v1/surveys/{survey_id}/groups/{group_id}/questions",
        json={
            "question_type": "short_text",
            "title": "Text question",
            "order": 1,
            "validation": {"regex": r"^\d{3}-\d{4}$"},
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"


@pytest.mark.asyncio
async def test_response_submission_completes_fast_even_without_pre_screen(client: AsyncClient):
    """Verify that the timeout path in _apply_text_validation_rules is exercised quickly.

    This test directly exercises the text validator with a catastrophic pattern
    already stored in the question object (bypassing the creation-time check),
    to verify the runtime timeout fires within the allowed window.
    """
    start = time.monotonic()
    q = make_question(
        question_type="short_text",
        is_required=False,
        validation={"regex": "(a+)+$"},
    )
    try:
        _apply_text_validation_rules("a" * 30 + "!", q.validation)
    except UnprocessableError as e:
        # Expected: either "timed out" or "does not match"
        assert "timed out" in str(e).lower() or "does not match" in str(e).lower()
    elapsed = time.monotonic() - start
    assert elapsed < 1.0, f"Validation took {elapsed:.2f}s — timeout not working"
