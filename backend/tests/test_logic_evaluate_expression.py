"""Tests for POST /api/v1/surveys/{id}/logic/evaluate-expression."""

import pytest
from httpx import AsyncClient

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"

VALID_USER = {
    "email": "evaluser@example.com",
    "password": "securepassword123",
    "name": "Eval User",
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


async def create_survey(client: AsyncClient, headers: dict, title: str = "Eval Survey") -> str:
    resp = await client.post(SURVEYS_URL, json={"title": title}, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


def evaluate_url(survey_id: str) -> str:
    return f"{SURVEYS_URL}/{survey_id}/logic/evaluate-expression"


# --------------------------------------------------------------------------- #
# Authentication / authorization tests
# --------------------------------------------------------------------------- #


class TestEvaluateExpressionAuth:
    async def test_unauthenticated_returns_403(self, client: AsyncClient):
        resp = await client.post(
            evaluate_url("00000000-0000-0000-0000-000000000001"),
            json={"expression": "{Q1} == 'Yes'", "context": {"Q1": "Yes"}},
        )
        assert resp.status_code == 403

    async def test_nonexistent_survey_returns_404(self, client: AsyncClient):
        headers = await auth_headers(client)
        resp = await client.post(
            evaluate_url("00000000-0000-0000-0000-000000000099"),
            json={"expression": "{Q1} == 'Yes'", "context": {"Q1": "Yes"}},
            headers=headers,
        )
        assert resp.status_code == 404

    async def test_invalid_uuid_returns_404(self, client: AsyncClient):
        headers = await auth_headers(client)
        resp = await client.post(
            evaluate_url("not-a-uuid"),
            json={"expression": "{Q1} == 'Yes'", "context": {}},
            headers=headers,
        )
        assert resp.status_code == 404

    async def test_another_users_survey_returns_404(self, client: AsyncClient):
        # Create survey as user 1
        headers1 = await auth_headers(client, email="evaluser1@example.com")
        survey_id = await create_survey(client, headers1)

        # Try to access as user 2
        headers2 = await auth_headers(client, email="evaluser2@example.com")
        resp = await client.post(
            evaluate_url(survey_id),
            json={"expression": "1 == 1", "context": {}},
            headers=headers2,
        )
        assert resp.status_code == 404


# --------------------------------------------------------------------------- #
# Evaluation result tests
# --------------------------------------------------------------------------- #


class TestEvaluateExpressionResult:
    async def test_expression_evaluates_to_true_with_matching_context(self, client: AsyncClient):
        headers = await auth_headers(client)
        survey_id = await create_survey(client, headers)

        resp = await client.post(
            evaluate_url(survey_id),
            json={"expression": "{Q1} == 'Yes'", "context": {"Q1": "Yes"}},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["result"] is True
        assert data["errors"] == []

    async def test_expression_evaluates_to_false_with_non_matching_context(
        self, client: AsyncClient
    ):
        headers = await auth_headers(client)
        survey_id = await create_survey(client, headers)

        resp = await client.post(
            evaluate_url(survey_id),
            json={"expression": "{Q1} == 'Yes'", "context": {"Q1": "No"}},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["result"] is False
        assert data["errors"] == []

    async def test_numeric_comparison_true(self, client: AsyncClient):
        headers = await auth_headers(client)
        survey_id = await create_survey(client, headers)

        resp = await client.post(
            evaluate_url(survey_id),
            json={"expression": "{Q1} > 18", "context": {"Q1": "25"}},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["result"] is True

    async def test_numeric_comparison_false(self, client: AsyncClient):
        headers = await auth_headers(client)
        survey_id = await create_survey(client, headers)

        resp = await client.post(
            evaluate_url(survey_id),
            json={"expression": "{Q1} > 18", "context": {"Q1": "10"}},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["result"] is False

    async def test_and_expression_true_when_all_conditions_met(self, client: AsyncClient):
        headers = await auth_headers(client)
        survey_id = await create_survey(client, headers)

        resp = await client.post(
            evaluate_url(survey_id),
            json={
                "expression": "{Q1} == 'Yes' and {Q2} == 'No'",
                "context": {"Q1": "Yes", "Q2": "No"},
            },
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["result"] is True

    async def test_and_expression_false_when_one_condition_fails(self, client: AsyncClient):
        headers = await auth_headers(client)
        survey_id = await create_survey(client, headers)

        resp = await client.post(
            evaluate_url(survey_id),
            json={
                "expression": "{Q1} == 'Yes' and {Q2} == 'No'",
                "context": {"Q1": "Yes", "Q2": "Yes"},
            },
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["result"] is False

    async def test_missing_variable_in_context_returns_false(self, client: AsyncClient):
        """When a variable is absent from context, evaluator treats it as None/falsy."""
        headers = await auth_headers(client)
        survey_id = await create_survey(client, headers)

        resp = await client.post(
            evaluate_url(survey_id),
            json={"expression": "{Q1} == 'Yes'", "context": {}},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        # None == 'Yes' is False
        assert data["result"] is False
        assert data["errors"] == []

    async def test_expression_without_variables_literal_true(self, client: AsyncClient):
        headers = await auth_headers(client)
        survey_id = await create_survey(client, headers)

        resp = await client.post(
            evaluate_url(survey_id),
            json={"expression": "1 == 1", "context": {}},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["result"] is True

    async def test_expression_without_variables_literal_false(self, client: AsyncClient):
        headers = await auth_headers(client)
        survey_id = await create_survey(client, headers)

        resp = await client.post(
            evaluate_url(survey_id),
            json={"expression": "1 == 2", "context": {}},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["result"] is False


# --------------------------------------------------------------------------- #
# Error handling tests
# --------------------------------------------------------------------------- #


class TestEvaluateExpressionErrors:
    async def test_invalid_syntax_returns_null_result_with_errors(self, client: AsyncClient):
        headers = await auth_headers(client)
        survey_id = await create_survey(client, headers)

        resp = await client.post(
            evaluate_url(survey_id),
            json={"expression": "{Q1} === 'Yes'", "context": {"Q1": "Yes"}},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["result"] is None
        assert len(data["errors"]) > 0
        assert data["errors"][0]["code"] == "SYNTAX_ERROR"

    async def test_completely_invalid_expression_returns_null_result(self, client: AsyncClient):
        headers = await auth_headers(client)
        survey_id = await create_survey(client, headers)

        resp = await client.post(
            evaluate_url(survey_id),
            json={"expression": "!!!invalid!!!", "context": {}},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["result"] is None
        assert len(data["errors"]) > 0

    async def test_response_schema_has_required_fields(self, client: AsyncClient):
        headers = await auth_headers(client)
        survey_id = await create_survey(client, headers)

        resp = await client.post(
            evaluate_url(survey_id),
            json={"expression": "{Q1} == 'Yes'", "context": {"Q1": "Yes"}},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "result" in data
        assert "errors" in data
        assert isinstance(data["errors"], list)

    async def test_empty_context_uses_null_for_missing_variables(self, client: AsyncClient):
        """Variables not in context resolve to None; expression with None may still evaluate."""
        headers = await auth_headers(client)
        survey_id = await create_survey(client, headers)

        # not(None) is True since None is falsy
        resp = await client.post(
            evaluate_url(survey_id),
            json={"expression": "not {Q1}", "context": {}},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        # not(None) -> not False -> True
        assert data["result"] is True
        assert data["errors"] == []
