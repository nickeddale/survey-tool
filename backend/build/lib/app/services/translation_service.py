"""Translation service for multi-language support.

Provides functions to:
- apply_translation: overlay translated fields on an entity dict for a given language
- get_supported_languages: enumerate languages present in a survey's translations
- merge_translations: update or insert translation entries for a given language
- update_survey_translations: fetch survey, merge translations, persist, return updated model
- update_group_translations: fetch group, merge translations, persist, return updated model
- update_question_translations: fetch question, merge translations, persist, return updated model
- update_answer_option_translations: fetch option, merge translations, persist, return updated model
"""
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.utils.errors import NotFoundError


# ---------------------------------------------------------------------------
# Translatable fields per entity type
# ---------------------------------------------------------------------------

SURVEY_TRANSLATABLE_FIELDS = frozenset(["title", "description", "welcome_message", "end_message"])
GROUP_TRANSLATABLE_FIELDS = frozenset(["title", "description"])
QUESTION_TRANSLATABLE_FIELDS = frozenset(["title", "description"])
OPTION_TRANSLATABLE_FIELDS = frozenset(["title"])


def apply_translation(
    entity_dict: dict[str, Any],
    lang: str,
    fallback_lang: str,
    translatable_fields: frozenset[str],
) -> dict[str, Any]:
    """Overlay translated fields on an entity dict for the requested language.

    Looks up ``entity_dict["translations"][lang]`` for each translatable field.
    If the field is present in the requested language, it replaces the default value.
    If the requested language is not found or a field is missing, falls back to:
      1. fallback_lang translations (if different from lang)
      2. original default field value

    Args:
        entity_dict: A dict representation of the entity (e.g. from model_dump()).
        lang: The requested language code (e.g. "fr").
        fallback_lang: The survey's default_language used as fallback (e.g. "en").
        translatable_fields: Set of field names that can be translated.

    Returns:
        A new dict with translated fields overlaid. Does not mutate the input.
    """
    translations: dict[str, Any] = entity_dict.get("translations") or {}
    lang_translations: dict[str, str] = translations.get(lang, {})
    fallback_translations: dict[str, str] = {}
    if lang != fallback_lang:
        fallback_translations = translations.get(fallback_lang, {})

    result = dict(entity_dict)
    for field in translatable_fields:
        if field not in result:
            continue
        translated_value = lang_translations.get(field)
        if translated_value is not None:
            result[field] = translated_value
        elif fallback_translations:
            fallback_value = fallback_translations.get(field)
            if fallback_value is not None:
                result[field] = fallback_value
        # else: keep original value

    return result


def get_supported_languages(survey_dict: dict[str, Any]) -> list[str]:
    """Return list of language codes present in survey translations.

    Gathers languages from the survey itself and all nested groups, questions,
    and answer options. Returns a deduplicated sorted list.

    Args:
        survey_dict: A dict representation of the full survey (with groups, questions, options).

    Returns:
        Sorted list of unique language codes found in any translations JSONB field.
    """
    langs: set[str] = set()

    def collect(entity: dict[str, Any]) -> None:
        translations = entity.get("translations") or {}
        langs.update(translations.keys())

    collect(survey_dict)
    for group in survey_dict.get("groups", []):
        collect(group)
        for question in group.get("questions", []):
            collect(question)
            for option in question.get("answer_options", []):
                collect(option)
            for subquestion in question.get("subquestions", []):
                collect(subquestion)
                for option in subquestion.get("answer_options", []):
                    collect(option)

    return sorted(langs)


def merge_translations(
    existing_translations: dict[str, Any],
    lang: str,
    field_values: dict[str, str],
) -> dict[str, Any]:
    """Merge new field translations into the existing translations dict.

    Creates or updates the language entry with the provided field values.
    Only non-None values are written; None values remove a field from the translation.

    Args:
        existing_translations: The current translations JSONB dict.
        lang: Language code to update (e.g. "fr").
        field_values: Dict of field_name -> translated_string (or None to remove).

    Returns:
        A new translations dict with the updated language entry.
    """
    result = dict(existing_translations)
    lang_entry = dict(result.get(lang, {}))

    for field, value in field_values.items():
        if value is None:
            lang_entry.pop(field, None)
        else:
            lang_entry[field] = value

    if lang_entry:
        result[lang] = lang_entry
    else:
        result.pop(lang, None)

    return result


def apply_survey_translations(
    survey_dict: dict[str, Any],
    lang: str,
) -> dict[str, Any]:
    """Apply translations to a full survey dict (including all nested entities).

    Uses the survey's ``default_language`` as the fallback.

    Args:
        survey_dict: Full survey dict with groups → questions → answer_options.
        lang: Target language code.

    Returns:
        New dict with all translatable fields overlaid with translated values.
    """
    fallback_lang = survey_dict.get("default_language", "en")

    # Apply to survey level
    result = apply_translation(survey_dict, lang, fallback_lang, SURVEY_TRANSLATABLE_FIELDS)

    # Apply to groups
    translated_groups = []
    for group in result.get("groups", []):
        translated_group = apply_translation(group, lang, fallback_lang, GROUP_TRANSLATABLE_FIELDS)

        # Apply to questions
        translated_questions = []
        for question in translated_group.get("questions", []):
            translated_question = apply_translation(
                question, lang, fallback_lang, QUESTION_TRANSLATABLE_FIELDS
            )

            # Apply to answer options
            translated_options = [
                apply_translation(opt, lang, fallback_lang, OPTION_TRANSLATABLE_FIELDS)
                for opt in translated_question.get("answer_options", [])
            ]
            translated_question = dict(translated_question)
            translated_question["answer_options"] = translated_options

            # Apply to subquestions
            translated_subquestions = []
            for subq in translated_question.get("subquestions", []):
                translated_subq = apply_translation(
                    subq, lang, fallback_lang, QUESTION_TRANSLATABLE_FIELDS
                )
                translated_subq_opts = [
                    apply_translation(opt, lang, fallback_lang, OPTION_TRANSLATABLE_FIELDS)
                    for opt in translated_subq.get("answer_options", [])
                ]
                translated_subq = dict(translated_subq)
                translated_subq["answer_options"] = translated_subq_opts
                translated_subquestions.append(translated_subq)

            translated_question["subquestions"] = translated_subquestions
            translated_questions.append(translated_question)

        translated_group = dict(translated_group)
        translated_group["questions"] = translated_questions
        translated_groups.append(translated_group)

    result = dict(result)
    result["groups"] = translated_groups
    return result


# ---------------------------------------------------------------------------
# Orchestration service functions
# ---------------------------------------------------------------------------


async def update_survey_translations(
    session: AsyncSession,
    survey_id: uuid.UUID,
    user_id: uuid.UUID,
    lang: str,
    field_values: dict[str, Any],
) -> Any:
    """Fetch survey, merge translations for lang, persist, and return updated survey.

    Args:
        session: Active async database session.
        survey_id: UUID of the survey to update.
        user_id: UUID of the authenticated user (ownership check).
        lang: Language code to update (e.g. "fr").
        field_values: Dict of field_name -> translated_string (or None to remove).

    Returns:
        Updated Survey ORM model.

    Raises:
        NotFoundError: If survey does not exist or is not owned by user.
    """
    from app.services.survey_service import get_survey_by_id, update_survey

    survey = await get_survey_by_id(session, survey_id, user_id)
    if survey is None:
        raise NotFoundError("Survey not found")

    new_translations = merge_translations(survey.translations or {}, lang, field_values)
    return await update_survey(session, survey, translations=new_translations)


async def update_group_translations(
    session: AsyncSession,
    survey_id: uuid.UUID,
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    lang: str,
    field_values: dict[str, Any],
) -> Any:
    """Fetch group, merge translations for lang, persist, and return updated group.

    Args:
        session: Active async database session.
        survey_id: UUID of the parent survey (ownership check).
        group_id: UUID of the question group to update.
        user_id: UUID of the authenticated user (ownership check).
        lang: Language code to update (e.g. "fr").
        field_values: Dict of field_name -> translated_string (or None to remove).

    Returns:
        Updated QuestionGroup ORM model.

    Raises:
        NotFoundError: If group does not exist or is not owned by user.
    """
    from app.services.question_group_service import get_group_by_id, update_group

    group = await get_group_by_id(session, survey_id=survey_id, group_id=group_id, user_id=user_id)
    if group is None:
        raise NotFoundError("Group not found")

    new_translations = merge_translations(group.translations or {}, lang, field_values)
    return await update_group(session, group, translations=new_translations)


async def update_question_translations(
    session: AsyncSession,
    survey_id: uuid.UUID,
    group_id: uuid.UUID,
    question_id: uuid.UUID,
    user_id: uuid.UUID,
    lang: str,
    field_values: dict[str, Any],
) -> Any:
    """Fetch question, merge translations for lang, persist, and return updated question.

    Args:
        session: Active async database session.
        survey_id: UUID of the parent survey (ownership check).
        group_id: UUID of the parent group.
        question_id: UUID of the question to update.
        user_id: UUID of the authenticated user (ownership check).
        lang: Language code to update (e.g. "fr").
        field_values: Dict of field_name -> translated_string (or None to remove).

    Returns:
        Updated Question ORM model.

    Raises:
        NotFoundError: If question does not exist or is not owned by user.
    """
    from app.services.question_service import get_question_by_id, update_question

    question = await get_question_by_id(
        session,
        survey_id=survey_id,
        group_id=group_id,
        question_id=question_id,
        user_id=user_id,
    )
    if question is None:
        raise NotFoundError("Question not found")

    new_translations = merge_translations(question.translations or {}, lang, field_values)
    return await update_question(session, question, translations=new_translations)


async def update_answer_option_translations(
    session: AsyncSession,
    survey_id: uuid.UUID,
    question_id: uuid.UUID,
    option_id: uuid.UUID,
    user_id: uuid.UUID,
    lang: str,
    field_values: dict[str, Any],
) -> Any:
    """Fetch answer option, merge translations for lang, persist, and return updated option.

    Args:
        session: Active async database session.
        survey_id: UUID of the parent survey (ownership check).
        question_id: UUID of the parent question.
        option_id: UUID of the answer option to update.
        user_id: UUID of the authenticated user (ownership check).
        lang: Language code to update (e.g. "fr").
        field_values: Dict of field_name -> translated_string (or None to remove).

    Returns:
        Updated AnswerOption ORM model.

    Raises:
        NotFoundError: If option does not exist or is not owned by user.
    """
    from app.services.answer_option_service import get_answer_option_by_id, update_answer_option

    option = await get_answer_option_by_id(
        session,
        survey_id=survey_id,
        question_id=question_id,
        option_id=option_id,
        user_id=user_id,
    )
    if option is None:
        raise NotFoundError("Answer option not found")

    new_translations = merge_translations(option.translations or {}, lang, field_values)
    return await update_answer_option(session, option, translations=new_translations)
