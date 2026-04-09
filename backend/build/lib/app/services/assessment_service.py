"""Scoring engine for survey assessments.

Computes a total score for a response by summing the assessment_value of all
selected answer options. Supports three scopes:

    total    - sum over all questions in the survey
    group    - sum only questions belonging to a specific question group
    question - sum only the specified question

Returns the computed score and all Assessment rules whose [min_score, max_score]
range contains the computed score. Multiple rules may match (overlapping ranges).
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.answer_option import AnswerOption
from app.models.assessment import Assessment
from app.models.question import Question
from app.models.response_answer import ResponseAnswer
from app.schemas.assessment import AssessmentResponse, AssessmentScoreResponse


async def compute_score(
    session: AsyncSession,
    survey_id: uuid.UUID,
    response_id: uuid.UUID,
) -> AssessmentScoreResponse:
    """Compute the assessment score for a response.

    Steps:
        1. Load all ResponseAnswer rows for the response (answer_type='answer' only).
        2. For each answer whose value is a list of option codes, load the matching
           AnswerOption rows and sum their assessment_value fields.
        3. Load all Assessment rules for the survey.
        4. For scope=total: use all questions' answer values.
           For scope=group: use only answers for questions in the specified group.
           For scope=question: use only answers for the specified question.
        5. Return score and all matching rules (min_score <= score <= max_score).

    Args:
        session: The async database session.
        survey_id: The UUID of the survey.
        response_id: The UUID of the response.

    Returns:
        AssessmentScoreResponse with score and list of matching Assessment rules.
    """
    # Step 1: Load response answers (only primary answer type)
    ra_result = await session.execute(
        select(ResponseAnswer)
        .where(
            ResponseAnswer.response_id == response_id,
            ResponseAnswer.answer_type == "answer",
        )
        .order_by(ResponseAnswer.question_id)
    )
    response_answers: list[ResponseAnswer] = list(ra_result.scalars().all())

    if not response_answers:
        # No answers — score is 0
        all_assessments = await _load_assessments(session, survey_id)
        matching = _filter_matching(all_assessments, Decimal("0"))
        return AssessmentScoreResponse(
            score=Decimal("0"),
            matching_assessments=[AssessmentResponse.model_validate(a) for a in matching],
        )

    # Step 2: Build a lookup of question_id -> list of selected option codes
    # Answer values for choice questions are stored as lists of option codes (strings)
    # or a single string. We need to resolve these to AnswerOption.assessment_value.
    question_ids = [ra.question_id for ra in response_answers]

    # Load questions with their group_id so we can filter by group for scoped assessments
    q_result = await session.execute(
        select(Question).where(Question.id.in_(question_ids))
    )
    questions: list[Question] = list(q_result.scalars().all())
    question_group_map: dict[uuid.UUID, uuid.UUID] = {
        q.id: q.group_id for q in questions
    }

    # Build answer lookup: question_id -> list of selected option codes
    answer_code_map: dict[uuid.UUID, list[str]] = {}
    for ra in response_answers:
        val = ra.value
        if val is None:
            continue
        if isinstance(val, list):
            # Multi-select: list of codes
            codes = [str(c) for c in val if c is not None]
        elif isinstance(val, str):
            # Single select stored as string
            codes = [val]
        elif isinstance(val, dict):
            # Some question types store code-keyed dicts; skip for scoring
            continue
        else:
            # Numeric or boolean values — no option codes to look up
            continue
        if codes:
            answer_code_map[ra.question_id] = codes

    # Step 2b: Load all AnswerOption rows for the relevant questions that have codes
    total_score = Decimal("0")
    group_score_map: dict[uuid.UUID, Decimal] = {}  # group_id -> score
    question_score_map: dict[uuid.UUID, Decimal] = {}  # question_id -> score

    if answer_code_map:
        ao_result = await session.execute(
            select(AnswerOption).where(
                AnswerOption.question_id.in_(list(answer_code_map.keys())),
                AnswerOption.code.in_(
                    [code for codes in answer_code_map.values() for code in codes]
                ),
            )
        )
        answer_options: list[AnswerOption] = list(ao_result.scalars().all())

        # Sum assessment_value for selected options
        for ao in answer_options:
            selected_codes = answer_code_map.get(ao.question_id, [])
            if ao.code in selected_codes:
                av = Decimal(str(ao.assessment_value))
                total_score += av
                group_id = question_group_map.get(ao.question_id)
                if group_id is not None:
                    group_score_map[group_id] = group_score_map.get(group_id, Decimal("0")) + av
                question_score_map[ao.question_id] = (
                    question_score_map.get(ao.question_id, Decimal("0")) + av
                )

    # Step 3: Load all Assessment rules for this survey
    all_assessments = await _load_assessments(session, survey_id)

    # Step 4+5: Filter matching assessments based on scope
    matching_assessments = []
    for assessment in all_assessments:
        if assessment.scope == "total":
            score_for_rule = total_score
        elif assessment.scope == "group":
            if assessment.group_id is None:
                continue
            score_for_rule = group_score_map.get(assessment.group_id, Decimal("0"))
        elif assessment.scope == "question":
            if assessment.question_id is None:
                continue
            score_for_rule = question_score_map.get(assessment.question_id, Decimal("0"))
        else:
            continue

        min_s = Decimal(str(assessment.min_score))
        max_s = Decimal(str(assessment.max_score))
        if min_s <= score_for_rule <= max_s:
            matching_assessments.append(assessment)

    return AssessmentScoreResponse(
        score=total_score,
        matching_assessments=[AssessmentResponse.model_validate(a) for a in matching_assessments],
    )


async def _load_assessments(
    session: AsyncSession,
    survey_id: uuid.UUID,
) -> list[Assessment]:
    """Load all Assessment rules for a survey ordered by created_at."""
    result = await session.execute(
        select(Assessment)
        .where(Assessment.survey_id == survey_id)
        .order_by(Assessment.created_at.asc())
    )
    return list(result.scalars().all())


def _filter_matching(
    assessments: list[Assessment],
    score: Decimal,
) -> list[Assessment]:
    """Return all assessments whose range contains the given score."""
    matching = []
    for a in assessments:
        min_s = Decimal(str(a.min_score))
        max_s = Decimal(str(a.max_score))
        if min_s <= score <= max_s:
            matching.append(a)
    return matching
