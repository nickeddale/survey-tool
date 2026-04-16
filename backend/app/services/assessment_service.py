"""Scoring engine for survey assessments.

Computes a total score for a response by summing the assessment_value of all
selected answer options. Supports four scopes:

    total       - sum over all questions in the survey
    group       - sum only questions belonging to a specific question group
    question    - sum only the specified question
    subquestion - sum only the specified subquestion row (matrix types)

Returns the computed score and all Assessment rules whose [min_score, max_score]
range contains the computed score. Multiple rules may match (overlapping ranges).
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.answer_option import AnswerOption
from app.models.assessment import Assessment
from app.models.question import Question
from app.models.response_answer import ResponseAnswer
from app.schemas.assessment import AssessmentResponse, AssessmentScoreResponse


def _extract_matrix_single_codes(
    val: dict,
    question_id: uuid.UUID,
    subquestion_id_map: dict[uuid.UUID, dict[str, uuid.UUID]],
) -> list[tuple[str, uuid.UUID | None]]:
    """Extract (option_code, subquestion_id) tuples from a matrix_single answer.

    matrix_single answer format: {"SQ001": "A1", "SQ002": "A2"}
    Each key is a subquestion code, each value is the selected option code.
    """
    sq_code_map = subquestion_id_map.get(question_id, {})
    result: list[tuple[str, uuid.UUID | None]] = []
    for sq_code, option_code in val.items():
        if option_code is None:
            continue
        sq_id = sq_code_map.get(sq_code)
        result.append((str(option_code), sq_id))
    return result


def _extract_matrix_multiple_codes(
    val: dict,
    question_id: uuid.UUID,
    subquestion_id_map: dict[uuid.UUID, dict[str, uuid.UUID]],
) -> list[tuple[str, uuid.UUID | None]]:
    """Extract (option_code, subquestion_id) tuples from a matrix_multiple answer.

    matrix_multiple answer format: {"SQ001": ["A1", "A2"], "SQ002": ["A3"]}
    Each key is a subquestion code, each value is a list of selected option codes.
    """
    sq_code_map = subquestion_id_map.get(question_id, {})
    result: list[tuple[str, uuid.UUID | None]] = []
    for sq_code, option_codes in val.items():
        if not option_codes:
            continue
        sq_id = sq_code_map.get(sq_code)
        if isinstance(option_codes, list):
            for option_code in option_codes:
                if option_code is not None:
                    result.append((str(option_code), sq_id))
        else:
            result.append((str(option_codes), sq_id))
    return result


async def compute_score(
    session: AsyncSession,
    survey_id: uuid.UUID,
    response_id: uuid.UUID,
) -> AssessmentScoreResponse:
    """Compute the assessment score for a response.

    Steps:
        1. Load all ResponseAnswer rows for the response (answer_type='answer' only).
        2. For each answer whose value is a list/string of option codes, load the matching
           AnswerOption rows and sum their assessment_value fields.
           For matrix_single/matrix_multiple answers (dict values), unpack per-row codes
           and track per-subquestion scores.
        3. Load all Assessment rules for the survey.
        4. For scope=total: use all questions' answer values.
           For scope=group: use only answers for questions in the specified group.
           For scope=question: use only answers for the specified question.
           For scope=subquestion: use only the score for the specified subquestion.
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
    question_type_map: dict[uuid.UUID, str] = {
        q.id: q.question_type for q in questions
    }

    # Find matrix question IDs that need subquestion lookup
    matrix_types = {"matrix_single", "matrix_multiple"}
    matrix_qids = [q.id for q in questions if q.question_type in matrix_types]

    # Load subquestions for matrix questions and build subquestion_id_map
    # subquestion_id_map: parent_uuid -> {sq_code: sq_uuid}
    subquestion_id_map: dict[uuid.UUID, dict[str, uuid.UUID]] = {}
    if matrix_qids:
        sq_result = await session.execute(
            select(Question).where(Question.parent_id.in_(matrix_qids))
        )
        subquestions: list[Question] = list(sq_result.scalars().all())
        for sq in subquestions:
            if sq.parent_id not in subquestion_id_map:
                subquestion_id_map[sq.parent_id] = {}
            subquestion_id_map[sq.parent_id][sq.code] = sq.id

    # Build answer lookup: question_id -> list of (option_code, subquestion_id_or_none)
    # For non-matrix types, subquestion_id is None
    answer_code_entries: dict[uuid.UUID, list[tuple[str, uuid.UUID | None]]] = {}
    for ra in response_answers:
        val = ra.value
        if val is None:
            continue
        q_type = question_type_map.get(ra.question_id, "")
        if isinstance(val, list):
            # Multi-select: list of codes (no subquestion)
            entries = [(str(c), None) for c in val if c is not None]
        elif isinstance(val, str):
            # Single select stored as string (no subquestion)
            entries = [(val, None)]
        elif isinstance(val, dict):
            if q_type == "matrix_single":
                entries = _extract_matrix_single_codes(val, ra.question_id, subquestion_id_map)
            elif q_type == "matrix_multiple":
                entries = _extract_matrix_multiple_codes(val, ra.question_id, subquestion_id_map)
            else:
                # Other dict-valued question types — skip for scoring
                continue
        else:
            # Numeric or boolean values — no option codes to look up
            continue
        if entries:
            answer_code_entries[ra.question_id] = entries

    # Step 2b: Load all AnswerOption rows for the relevant questions that have codes
    total_score = Decimal("0")
    group_score_map: dict[uuid.UUID, Decimal] = {}  # group_id -> score
    question_score_map: dict[uuid.UUID, Decimal] = {}  # question_id -> score
    subquestion_score_map: dict[uuid.UUID, Decimal] = {}  # subquestion_id -> score

    if answer_code_entries:
        # Collect all unique codes across all questions
        all_codes = [
            code
            for entries in answer_code_entries.values()
            for code, _ in entries
        ]
        ao_result = await session.execute(
            select(AnswerOption).where(
                AnswerOption.question_id.in_(list(answer_code_entries.keys())),
                AnswerOption.code.in_(all_codes),
            )
        )
        answer_options: list[AnswerOption] = list(ao_result.scalars().all())

        # Build a lookup for quick access: (question_id, code) -> AnswerOption
        ao_lookup: dict[tuple[uuid.UUID, str], AnswerOption] = {}
        for ao in answer_options:
            ao_lookup[(ao.question_id, ao.code)] = ao

        # Sum assessment_value for selected options
        for question_id, entries in answer_code_entries.items():
            group_id = question_group_map.get(question_id)
            for option_code, sq_id in entries:
                ao = ao_lookup.get((question_id, option_code))
                if ao is None:
                    continue
                av = Decimal(str(ao.assessment_value))
                total_score += av
                if group_id is not None:
                    group_score_map[group_id] = group_score_map.get(group_id, Decimal("0")) + av
                question_score_map[question_id] = (
                    question_score_map.get(question_id, Decimal("0")) + av
                )
                if sq_id is not None:
                    subquestion_score_map[sq_id] = (
                        subquestion_score_map.get(sq_id, Decimal("0")) + av
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
        elif assessment.scope == "subquestion":
            if assessment.subquestion_id is None:
                continue
            score_for_rule = subquestion_score_map.get(assessment.subquestion_id, Decimal("0"))
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
