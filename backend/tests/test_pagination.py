"""Tests for the pagination utility."""

import pytest

from app.utils.pagination import PaginationParams, paginate


class TestPaginate:
    def test_basic_paginate(self):
        params = PaginationParams.__new__(PaginationParams)
        params.page = 1
        params.per_page = 10
        items = list(range(10))
        result = paginate(items, total=100, params=params)
        assert result == {"items": items, "total": 100, "page": 1, "per_page": 10}

    def test_paginate_returns_correct_structure(self):
        params = PaginationParams.__new__(PaginationParams)
        params.page = 2
        params.per_page = 5
        items = [1, 2, 3, 4, 5]
        result = paginate(items, total=25, params=params)
        assert result["page"] == 2
        assert result["per_page"] == 5
        assert result["total"] == 25
        assert result["items"] == items

    def test_offset_calculation(self):
        params = PaginationParams.__new__(PaginationParams)
        params.page = 3
        params.per_page = 10
        assert params.offset == 20

    def test_offset_page_one(self):
        params = PaginationParams.__new__(PaginationParams)
        params.page = 1
        params.per_page = 20
        assert params.offset == 0


@pytest.mark.asyncio
async def test_per_page_capped_at_100(client):
    """per_page > 100 should return 400 VALIDATION_ERROR via FastAPI Query validation."""
    # Register user then log in to get a token
    reg_resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "pagtest@example.com", "password": "Password123!", "name": "Pag Test"},
    )
    assert reg_resp.status_code == 201

    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "pagtest@example.com", "password": "Password123!"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]

    resp = await client.get(
        "/api/v1/surveys?per_page=101",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body["detail"]["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_per_page_at_100_allowed(client):
    """per_page == 100 should be accepted."""
    reg_resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "pagtest2@example.com", "password": "Password123!", "name": "Pag Test 2"},
    )
    assert reg_resp.status_code == 201

    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "pagtest2@example.com", "password": "Password123!"},
    )
    token = login_resp.json()["access_token"]

    resp = await client.get(
        "/api/v1/surveys?per_page=100",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["per_page"] == 100


@pytest.mark.asyncio
async def test_pagination_response_structure(client):
    """List endpoint returns {items, total, page, per_page}."""
    reg_resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "pagtest3@example.com", "password": "Password123!", "name": "Pag Test 3"},
    )
    assert reg_resp.status_code == 201

    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "pagtest3@example.com", "password": "Password123!"},
    )
    token = login_resp.json()["access_token"]

    resp = await client.get(
        "/api/v1/surveys?page=1&per_page=20",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body
    assert "total" in body
    assert "page" in body
    assert "per_page" in body
    assert body["page"] == 1
    assert body["per_page"] == 20
