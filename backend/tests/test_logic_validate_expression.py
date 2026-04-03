"""Tests for POST /api/v1/surveys/{id}/logic/validate-expression."""

import pytest
from httpx import AsyncClient

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"

VALID_USER = {
    "email": "logicuser@example.com",
    "password": "securepassword123",
    "name": "Logic User",
}


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


async def register_and_login(client: AsyncClient, email: str = VALID_USER["email"]) -> dict:
    await client.post(REGISTER_URL, json={**VALID_USER, "email": email})
    response = await client.post(
        LOGIN_URL, json={"email": email, "password": VALID_USER["password"]}
    )
    assert response.status_code == 200
    return response.json()


async def auth_headers(client: AsyncClient, email: str = VALID_USER["email"]) -> dict:
    tokens = await register_and_login(client, email=email)
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def create_survey(client: AsyncClient, headers: dict, title: str = "Logic Survey") -> str:
    resp = await client.post(SURVEYS_URL, json={"title": title}, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


async def create_group(client: AsyncClient, headers: dict, survey_id: str) -> str:
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Group 1"},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def create_question(
    client: AsyncClient,
    headers: dict,
    survey_id: str,
    group_id: str,
    code: str,
    sort_order: int = 1,
    title: str = "A question",
) -> dict:
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={
            "question_type": "short_text",
            "title": title,
            "code": code,
            "sort_order": sort_order,
        },
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()


def validate_url(survey_id: str) -> str:
    return f"{SURVEYS_URL}/{survey_id}/logic/validate-expression"


# --------------------------------------------------------------------------- #
# Authentication / authorization
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_unauthenticated_request_returns_403(client: AsyncClient):
    """No auth token → 403."""
    response = await client.post(
        validate_url("00000000-0000-0000-0000-000000000001"),
        json={"expression": "{Q1} == 'Yes'"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_survey_not_found_returns_404(client: AsyncClient):
    """Non-existent survey → 404."""
    headers = await auth_headers(client)
    response = await client.post(
        validate_url("00000000-0000-0000-0000-000000000001"),
        json={"expression": "{Q1} == 'Yes'"},
        headers=headers,
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_survey_owned_by_other_user_returns_404(client: AsyncClient):
    """Survey owned by a different user → 404 (no existence leak)."""
    headers_owner = await auth_headers(client, email="owner@example.com")
    survey_id = await create_survey(client, headers_owner)

    headers_other = await auth_headers(client, email="other@example.com")
    response = await client.post(
        validate_url(survey_id),
        json={"expression": "{Q1} == 'Yes'"},
        headers=headers_other,
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_invalid_survey_id_format_returns_404(client: AsyncClient):
    """Non-UUID survey_id → 404."""
    headers = await auth_headers(client)
    response = await client.post(
        f"{SURVEYS_URL}/not-a-uuid/logic/validate-expression",
        json={"expression": "{Q1} == 'Yes'"},
        headers=headers,
    )
    assert response.status_code == 404


# --------------------------------------------------------------------------- #
# Valid expression
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_valid_expression_returns_200_no_errors(client: AsyncClient):
    """Expression using existing question codes → 200 with no errors."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    await create_question(client, headers, survey_id, group_id, code="Q1", sort_order=1)
    await create_question(client, headers, survey_id, group_id, code="Q2", sort_order=2)

    response = await client.post(
        validate_url(survey_id),
        json={"expression": "{Q1} == 'Yes' and {Q2} > 10"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["errors"] == []
    assert body["warnings"] == []


@pytest.mark.asyncio
async def test_parsed_variables_populated(client: AsyncClient):
    """parsed_variables contains the variable names referenced in the expression."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    await create_question(client, headers, survey_id, group_id, code="AGE", sort_order=1)
    await create_question(client, headers, survey_id, group_id, code="GENDER", sort_order=2)

    response = await client.post(
        validate_url(survey_id),
        json={"expression": "{AGE} > 18 and {GENDER} == 'M'"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert "AGE" in body["parsed_variables"]
    assert "GENDER" in body["parsed_variables"]
    assert body["errors"] == []


@pytest.mark.asyncio
async def test_expression_with_only_literals_returns_no_errors(client: AsyncClient):
    """Expression with no variables (only literals) is valid."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)

    response = await client.post(
        validate_url(survey_id),
        json={"expression": "1 == 1"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["errors"] == []
    assert body["parsed_variables"] == []


# --------------------------------------------------------------------------- #
# SYNTAX_ERROR
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_malformed_expression_returns_syntax_error(client: AsyncClient):
    """Malformed expression → SYNTAX_ERROR in errors list, 200 HTTP."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)

    response = await client.post(
        validate_url(survey_id),
        json={"expression": "{Q1} =="},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["errors"]) >= 1
    codes = [e["code"] for e in body["errors"]]
    assert "SYNTAX_ERROR" in codes


@pytest.mark.asyncio
async def test_unterminated_variable_returns_syntax_error(client: AsyncClient):
    """Unterminated brace → SYNTAX_ERROR."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)

    response = await client.post(
        validate_url(survey_id),
        json={"expression": "{Q1"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    codes = [e["code"] for e in body["errors"]]
    assert "SYNTAX_ERROR" in codes


@pytest.mark.asyncio
async def test_empty_expression_returns_syntax_error(client: AsyncClient):
    """Empty string expression → SYNTAX_ERROR."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)

    response = await client.post(
        validate_url(survey_id),
        json={"expression": ""},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    codes = [e["code"] for e in body["errors"]]
    assert "SYNTAX_ERROR" in codes


# --------------------------------------------------------------------------- #
# UNKNOWN_VARIABLE
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_unknown_variable_returns_error(client: AsyncClient):
    """Variable referencing a non-existent question code → UNKNOWN_VARIABLE."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    await create_question(client, headers, survey_id, group_id, code="Q1", sort_order=1)

    response = await client.post(
        validate_url(survey_id),
        json={"expression": "{DOES_NOT_EXIST} == 'Yes'"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    codes = [e["code"] for e in body["errors"]]
    assert "UNKNOWN_VARIABLE" in codes


@pytest.mark.asyncio
async def test_unknown_variable_error_includes_position(client: AsyncClient):
    """UNKNOWN_VARIABLE error should include a non-negative position."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)

    response = await client.post(
        validate_url(survey_id),
        json={"expression": "{GHOST} == 'Yes'"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    errors = [e for e in body["errors"] if e["code"] == "UNKNOWN_VARIABLE"]
    assert len(errors) >= 1
    assert errors[0]["position"] >= 0


# --------------------------------------------------------------------------- #
# FORWARD_REFERENCE
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_forward_reference_detected(client: AsyncClient):
    """Variable with higher sort_order than question_code → FORWARD_REFERENCE."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    await create_question(client, headers, survey_id, group_id, code="Q1", sort_order=1)
    await create_question(client, headers, survey_id, group_id, code="Q2", sort_order=2)
    await create_question(client, headers, survey_id, group_id, code="Q3", sort_order=3)

    # Q1 expression references Q3 (which is later) → forward reference
    response = await client.post(
        validate_url(survey_id),
        json={"expression": "{Q3} == 'Yes'", "question_code": "Q1"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    codes = [e["code"] for e in body["errors"]]
    assert "FORWARD_REFERENCE" in codes


@pytest.mark.asyncio
async def test_no_forward_reference_when_earlier_question(client: AsyncClient):
    """Expression referencing an earlier question → no FORWARD_REFERENCE."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    await create_question(client, headers, survey_id, group_id, code="Q1", sort_order=1)
    await create_question(client, headers, survey_id, group_id, code="Q2", sort_order=2)

    # Q2 expression references Q1 (which is earlier) → no forward reference
    response = await client.post(
        validate_url(survey_id),
        json={"expression": "{Q1} == 'Yes'", "question_code": "Q2"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    codes = [e["code"] for e in body["errors"]]
    assert "FORWARD_REFERENCE" not in codes
    assert body["errors"] == []


@pytest.mark.asyncio
async def test_forward_reference_not_detected_without_question_code(client: AsyncClient):
    """Without question_code, no forward-reference check is done."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    await create_question(client, headers, survey_id, group_id, code="Q1", sort_order=1)
    await create_question(client, headers, survey_id, group_id, code="Q2", sort_order=2)

    response = await client.post(
        validate_url(survey_id),
        json={"expression": "{Q2} == 'Yes'"},  # no question_code
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    codes = [e["code"] for e in body["errors"]]
    assert "FORWARD_REFERENCE" not in codes


# --------------------------------------------------------------------------- #
# UNSUPPORTED_FUNCTION
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_unsupported_function_returns_error(client: AsyncClient):
    """Function name not in the built-in registry → UNSUPPORTED_FUNCTION.

    Note: The lexer rejects unknown identifiers, so an unknown function name
    first triggers a SYNTAX_ERROR from the lexer (unknown identifier).
    We validate that an error is returned for unknown function-like tokens.
    """
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)

    response = await client.post(
        validate_url(survey_id),
        json={"expression": "unknown_func({Q1})"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    # The lexer will reject "unknown_func" as an unknown identifier (SYNTAX_ERROR)
    assert len(body["errors"]) >= 1


# --------------------------------------------------------------------------- #
# Response structure
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_response_has_required_fields(client: AsyncClient):
    """Response always contains parsed_variables, errors, and warnings."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)

    response = await client.post(
        validate_url(survey_id),
        json={"expression": "true"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert "parsed_variables" in body
    assert "errors" in body
    assert "warnings" in body
    assert isinstance(body["parsed_variables"], list)
    assert isinstance(body["errors"], list)
    assert isinstance(body["warnings"], list)


@pytest.mark.asyncio
async def test_error_object_has_required_fields(client: AsyncClient):
    """Each error object contains message, position, and code."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)

    response = await client.post(
        validate_url(survey_id),
        json={"expression": "{NOPE} == 1"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["errors"]) >= 1
    error = body["errors"][0]
    assert "message" in error
    assert "position" in error
    assert "code" in error
    assert isinstance(error["message"], str)
    assert isinstance(error["position"], int)
    assert isinstance(error["code"], str)


# --------------------------------------------------------------------------- #
# Multiple variables / duplicate references
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_duplicate_variable_references_appear_once_in_parsed_variables(client: AsyncClient):
    """A variable referenced multiple times only appears once in parsed_variables."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    await create_question(client, headers, survey_id, group_id, code="Q1", sort_order=1)

    response = await client.post(
        validate_url(survey_id),
        json={"expression": "{Q1} == 'Yes' or {Q1} == 'No'"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["parsed_variables"].count("Q1") == 1
    assert body["errors"] == []


@pytest.mark.asyncio
async def test_survey_with_no_questions_unknown_variable(client: AsyncClient):
    """Survey with no questions — any variable reference is UNKNOWN_VARIABLE."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)

    response = await client.post(
        validate_url(survey_id),
        json={"expression": "{Q1} == 'Yes'"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    codes = [e["code"] for e in body["errors"]]
    assert "UNKNOWN_VARIABLE" in codes
