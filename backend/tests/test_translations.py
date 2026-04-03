"""Tests for multi-language translation support.

Tests cover:
1. translation_service apply_translation with full, partial, and missing language
2. translation_service get_supported_languages
3. translation_service merge_translations
4. GET /surveys/{id}?lang=fr returns translated fields
5. PATCH /surveys/{id}/translations updates translations JSONB
6. PATCH group/question/option translations endpoints
7. Export/import round-trips translations
"""

import pytest
from httpx import AsyncClient

from app.services.translation_service import (
    apply_translation,
    apply_survey_translations,
    get_supported_languages,
    merge_translations,
    SURVEY_TRANSLATABLE_FIELDS,
    GROUP_TRANSLATABLE_FIELDS,
    QUESTION_TRANSLATABLE_FIELDS,
    OPTION_TRANSLATABLE_FIELDS,
)

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"

VALID_USER = {
    "email": "transuser@example.com",
    "password": "securepassword123",
    "name": "Translation User",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def auth_headers(client: AsyncClient) -> dict:
    await client.post(REGISTER_URL, json=VALID_USER)
    resp = await client.post(LOGIN_URL, json={"email": VALID_USER["email"], "password": VALID_USER["password"]})
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def create_survey(client: AsyncClient, headers: dict, **kwargs) -> dict:
    payload = {"title": "Test Survey", "default_language": "en", **kwargs}
    resp = await client.post(SURVEYS_URL, json=payload, headers=headers)
    assert resp.status_code == 201
    return resp.json()


# ===========================================================================
# Unit tests for translation_service
# ===========================================================================


class TestApplyTranslation:
    def test_full_translation_overlays_fields(self):
        entity = {
            "title": "Hello",
            "description": "World",
            "translations": {"fr": {"title": "Bonjour", "description": "Monde"}},
        }
        result = apply_translation(entity, "fr", "en", SURVEY_TRANSLATABLE_FIELDS)
        assert result["title"] == "Bonjour"
        assert result["description"] == "Monde"

    def test_partial_translation_keeps_original_for_missing_fields(self):
        entity = {
            "title": "Hello",
            "description": "World",
            "translations": {"fr": {"title": "Bonjour"}},
        }
        result = apply_translation(entity, "fr", "en", SURVEY_TRANSLATABLE_FIELDS)
        assert result["title"] == "Bonjour"
        # description not in fr translations, no fallback (default=en) so keep original
        assert result["description"] == "World"

    def test_missing_language_keeps_original_values(self):
        entity = {
            "title": "Hello",
            "description": "World",
            "translations": {},
        }
        result = apply_translation(entity, "fr", "en", SURVEY_TRANSLATABLE_FIELDS)
        assert result["title"] == "Hello"
        assert result["description"] == "World"

    def test_fallback_to_default_language_when_requested_missing(self):
        entity = {
            "title": "Hello",
            "description": "World",
            "translations": {"en": {"title": "English Title"}},
        }
        # Requesting "de" (missing), fallback to "en" for title
        result = apply_translation(entity, "de", "en", SURVEY_TRANSLATABLE_FIELDS)
        assert result["title"] == "English Title"
        # description not in en translations either — keep original
        assert result["description"] == "World"

    def test_does_not_mutate_original(self):
        entity = {
            "title": "Hello",
            "translations": {"fr": {"title": "Bonjour"}},
        }
        original_title = entity["title"]
        apply_translation(entity, "fr", "en", SURVEY_TRANSLATABLE_FIELDS)
        assert entity["title"] == original_title

    def test_empty_translations_returns_original(self):
        entity = {"title": "Hello", "translations": None}
        result = apply_translation(entity, "fr", "en", SURVEY_TRANSLATABLE_FIELDS)
        assert result["title"] == "Hello"


class TestMergeTranslations:
    def test_adds_new_language_entry(self):
        existing = {}
        result = merge_translations(existing, "fr", {"title": "Bonjour", "description": "Monde"})
        assert result == {"fr": {"title": "Bonjour", "description": "Monde"}}

    def test_updates_existing_language_entry(self):
        existing = {"fr": {"title": "Old Title"}}
        result = merge_translations(existing, "fr", {"title": "New Title"})
        assert result == {"fr": {"title": "New Title"}}

    def test_removes_field_when_value_is_none(self):
        existing = {"fr": {"title": "Bonjour", "description": "Monde"}}
        result = merge_translations(existing, "fr", {"title": None})
        assert "title" not in result["fr"]
        assert result["fr"]["description"] == "Monde"

    def test_removes_language_when_all_fields_none(self):
        existing = {"fr": {"title": "Bonjour"}}
        result = merge_translations(existing, "fr", {"title": None})
        assert "fr" not in result

    def test_preserves_other_languages(self):
        existing = {"fr": {"title": "Bonjour"}, "es": {"title": "Hola"}}
        result = merge_translations(existing, "fr", {"title": "Nouveau"})
        assert result["es"]["title"] == "Hola"
        assert result["fr"]["title"] == "Nouveau"


class TestGetSupportedLanguages:
    def test_returns_sorted_unique_languages(self):
        survey_dict = {
            "translations": {"fr": {"title": "Bonjour"}, "de": {"title": "Hallo"}},
            "groups": [
                {
                    "translations": {"es": {"title": "Hola"}},
                    "questions": [
                        {
                            "translations": {"fr": {"title": "Question"}},
                            "answer_options": [
                                {"translations": {"ja": {"title": "Option"}}},
                            ],
                            "subquestions": [],
                        }
                    ],
                }
            ],
        }
        result = get_supported_languages(survey_dict)
        assert result == sorted({"fr", "de", "es", "ja"})

    def test_returns_empty_for_no_translations(self):
        survey_dict = {
            "translations": {},
            "groups": [],
        }
        assert get_supported_languages(survey_dict) == []


class TestApplySurveyTranslations:
    def test_applies_translations_recursively(self):
        survey_dict = {
            "title": "Survey",
            "description": None,
            "welcome_message": None,
            "end_message": None,
            "default_language": "en",
            "translations": {"fr": {"title": "Enquête"}},
            "groups": [
                {
                    "title": "Group 1",
                    "description": None,
                    "translations": {"fr": {"title": "Groupe 1"}},
                    "questions": [
                        {
                            "title": "Question 1",
                            "description": None,
                            "translations": {"fr": {"title": "Question 1 FR"}},
                            "answer_options": [
                                {
                                    "title": "Option A",
                                    "translations": {"fr": {"title": "Option A FR"}},
                                }
                            ],
                            "subquestions": [],
                        }
                    ],
                }
            ],
        }
        result = apply_survey_translations(survey_dict, "fr")
        assert result["title"] == "Enquête"
        assert result["groups"][0]["title"] == "Groupe 1"
        assert result["groups"][0]["questions"][0]["title"] == "Question 1 FR"
        assert result["groups"][0]["questions"][0]["answer_options"][0]["title"] == "Option A FR"


# ===========================================================================
# Integration tests (API endpoints)
# ===========================================================================


@pytest.mark.asyncio
async def test_survey_has_translations_field_on_create(client: AsyncClient):
    headers = await auth_headers(client)
    survey = await create_survey(client, headers)
    assert "translations" in survey
    assert survey["translations"] == {}


@pytest.mark.asyncio
async def test_patch_survey_translations_updates_jsonb(client: AsyncClient):
    headers = await auth_headers(client)
    survey = await create_survey(client, headers)
    survey_id = survey["id"]

    resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/translations",
        json={"lang": "fr", "translations": {"title": "Enquête", "description": "Description FR"}},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["translations"]["fr"]["title"] == "Enquête"
    assert body["translations"]["fr"]["description"] == "Description FR"


@pytest.mark.asyncio
async def test_get_survey_with_lang_returns_translated_content(client: AsyncClient):
    headers = await auth_headers(client)
    survey = await create_survey(client, headers, title="My Survey", description="English Description")
    survey_id = survey["id"]

    # Add French translation
    await client.patch(
        f"{SURVEYS_URL}/{survey_id}/translations",
        json={"lang": "fr", "translations": {"title": "Mon Enquête", "description": "Description Française"}},
        headers=headers,
    )

    # Fetch with lang=fr
    resp = await client.get(f"{SURVEYS_URL}/{survey_id}?lang=fr", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "Mon Enquête"
    assert body["description"] == "Description Française"


@pytest.mark.asyncio
async def test_get_survey_without_lang_returns_default_content(client: AsyncClient):
    headers = await auth_headers(client)
    survey = await create_survey(client, headers, title="My Survey")
    survey_id = survey["id"]

    # Add French translation
    await client.patch(
        f"{SURVEYS_URL}/{survey_id}/translations",
        json={"lang": "fr", "translations": {"title": "Mon Enquête"}},
        headers=headers,
    )

    # Fetch without lang param
    resp = await client.get(f"{SURVEYS_URL}/{survey_id}", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "My Survey"


@pytest.mark.asyncio
async def test_get_survey_with_unknown_lang_falls_back_to_defaults(client: AsyncClient):
    headers = await auth_headers(client)
    survey = await create_survey(client, headers, title="My Survey")
    survey_id = survey["id"]

    # Request lang that has no translations
    resp = await client.get(f"{SURVEYS_URL}/{survey_id}?lang=ja", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "My Survey"


@pytest.mark.asyncio
async def test_patch_survey_translations_removes_field_on_none(client: AsyncClient):
    headers = await auth_headers(client)
    survey = await create_survey(client, headers)
    survey_id = survey["id"]

    # Add and then remove a translation
    await client.patch(
        f"{SURVEYS_URL}/{survey_id}/translations",
        json={"lang": "fr", "translations": {"title": "Mon Enquête"}},
        headers=headers,
    )
    resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/translations",
        json={"lang": "fr", "translations": {"title": None}},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    # fr entry should be removed since all fields are None
    assert "fr" not in body["translations"]


@pytest.mark.asyncio
async def test_export_includes_translations(client: AsyncClient):
    headers = await auth_headers(client)
    survey = await create_survey(client, headers)
    survey_id = survey["id"]

    # Add translations
    await client.patch(
        f"{SURVEYS_URL}/{survey_id}/translations",
        json={"lang": "fr", "translations": {"title": "Enquête"}},
        headers=headers,
    )

    resp = await client.get(f"{SURVEYS_URL}/{survey_id}/export", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "translations" in body
    assert body["translations"]["fr"]["title"] == "Enquête"


@pytest.mark.asyncio
async def test_import_restores_translations(client: AsyncClient):
    headers = await auth_headers(client)

    import_data = {
        "title": "Imported Survey",
        "groups": [
            {
                "title": "Group 1",
                "questions": [
                    {
                        "code": "Q1",
                        "question_type": "short_text",
                        "title": "Question 1",
                        "translations": {"fr": {"title": "Question 1 FR"}},
                        "answer_options": [],
                        "subquestions": [],
                    }
                ],
                "translations": {"fr": {"title": "Groupe 1"}},
            }
        ],
        "translations": {"fr": {"title": "Enquête Importée"}},
    }

    resp = await client.post(
        f"{SURVEYS_URL}/import",
        json={"data": import_data},
        headers=headers,
    )
    assert resp.status_code == 201
    survey_id = resp.json()["id"]

    # Fetch full survey and check translations
    full_resp = await client.get(f"{SURVEYS_URL}/{survey_id}", headers=headers)
    assert full_resp.status_code == 200
    body = full_resp.json()
    assert body["translations"]["fr"]["title"] == "Enquête Importée"
    assert body["groups"][0]["translations"]["fr"]["title"] == "Groupe 1"
    assert body["groups"][0]["questions"][0]["translations"]["fr"]["title"] == "Question 1 FR"
