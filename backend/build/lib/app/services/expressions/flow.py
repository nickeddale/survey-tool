"""Skip logic and navigation flow for survey question ordering.

Builds on the relevance evaluation system (5.6) to implement forward/backward
navigation through a survey, skipping questions and groups that are hidden
by their relevance expressions.

The ordered survey flow is a flat list of (QuestionGroup, Question) pairs
sorted by group.sort_order then question.sort_order, excluding subquestions
(questions with a parent_id).

Navigation modes:
    - Per-question: step through individual visible questions one at a time.
    - one_page_per_group: step through visible groups, presenting all visible
      questions in a group together on one page.

Usage::

    from app.services.expressions.flow import (
        NavigationPosition,
        get_next_question,
        get_previous_question,
        get_first_visible_question,
        get_next_group,
        get_previous_group,
        get_first_visible_group,
    )

    answers = {"Q1": "Yes"}
    pos = NavigationPosition(group_id=group.id, question_id=question.id)

    next_pos = get_next_question(survey, pos, answers)
    # Returns NavigationPosition for the next visible question, or None if
    # there are no more visible questions (end of survey).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from app.services.expressions.relevance import evaluate_relevance, RelevanceResult

__all__ = [
    "NavigationPosition",
    "build_ordered_pairs",
    "get_visible_flow",
    "get_next_question",
    "get_previous_question",
    "get_first_visible_question",
    "get_next_group",
    "get_previous_group",
    "get_first_visible_group",
]


# ---------------------------------------------------------------------------
# NavigationPosition dataclass
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class NavigationPosition:
    """Identifies a specific question within a survey's navigation flow.

    Attributes:
        group_id:    UUID of the QuestionGroup containing the question.
        question_id: UUID of the Question being navigated to.
    """

    group_id: uuid.UUID
    question_id: uuid.UUID


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

# Type alias for a flat ordered pair.
_Pair = Tuple[Any, Any]  # (QuestionGroup, Question)


def build_ordered_pairs(survey: Any) -> List[_Pair]:
    """Build a flat ordered list of (QuestionGroup, Question) pairs.

    Groups are ordered by group.sort_order. Within each group, questions are
    ordered by question.sort_order. Only top-level questions are included
    (questions with parent_id is None).

    Args:
        survey: A Survey ORM object with loaded ``groups`` -> ``questions``.

    Returns:
        A list of (group, question) tuples in display order.
    """
    pairs: List[_Pair] = []
    sorted_groups = sorted(survey.groups, key=lambda g: g.sort_order)
    for group in sorted_groups:
        sorted_questions = sorted(
            (q for q in group.questions if q.parent_id is None),
            key=lambda q: q.sort_order,
        )
        for question in sorted_questions:
            pairs.append((group, question))
    return pairs


def get_visible_flow(
    survey: Any,
    answers: Optional[Dict[str, Any]] = None,
) -> List[_Pair]:
    """Return the ordered pairs filtered to only visible (group, question) pairs.

    A pair is visible when both its group and its question are in the
    RelevanceResult visible sets.

    Args:
        survey:  A Survey ORM object.
        answers: Current answer context dict.

    Returns:
        A list of (group, question) tuples that are currently visible.
    """
    if answers is None:
        answers = {}

    result: RelevanceResult = evaluate_relevance(survey, answers=answers)
    all_pairs = build_ordered_pairs(survey)

    return [
        (group, question)
        for group, question in all_pairs
        if group.id in result.visible_group_ids
        and question.id in result.visible_question_ids
    ]


# ---------------------------------------------------------------------------
# Per-question navigation
# ---------------------------------------------------------------------------


def get_first_visible_question(
    survey: Any,
    answers: Optional[Dict[str, Any]] = None,
) -> Optional[NavigationPosition]:
    """Return the NavigationPosition of the first visible question.

    Args:
        survey:  A Survey ORM object.
        answers: Current answer context dict.

    Returns:
        NavigationPosition for the first visible question, or None if all
        questions are hidden (empty survey or all relevance expressions false).
    """
    visible = get_visible_flow(survey, answers)
    if not visible:
        return None
    group, question = visible[0]
    return NavigationPosition(group_id=group.id, question_id=question.id)


def get_next_question(
    survey: Any,
    current: NavigationPosition,
    answers: Optional[Dict[str, Any]] = None,
) -> Optional[NavigationPosition]:
    """Return the NavigationPosition of the next visible question.

    Skips questions and groups hidden by relevance expressions. If the current
    position is the last visible question (or is not in the visible flow),
    returns None to signal the end of the survey.

    Args:
        survey:  A Survey ORM object.
        current: The current NavigationPosition.
        answers: Current answer context dict.

    Returns:
        NavigationPosition for the next visible question, or None if at the end.
    """
    visible = get_visible_flow(survey, answers)
    if not visible:
        return None

    # Find the index of the current position in the visible flow.
    current_index: Optional[int] = None
    for i, (group, question) in enumerate(visible):
        if group.id == current.group_id and question.id == current.question_id:
            current_index = i
            break

    # If current position is not visible or is the last visible question,
    # return None (end of survey).
    if current_index is None or current_index >= len(visible) - 1:
        return None

    group, question = visible[current_index + 1]
    return NavigationPosition(group_id=group.id, question_id=question.id)


def get_previous_question(
    survey: Any,
    current: NavigationPosition,
    answers: Optional[Dict[str, Any]] = None,
) -> Optional[NavigationPosition]:
    """Return the NavigationPosition of the previous visible question.

    Skips questions and groups hidden by relevance expressions. Returns None
    if at the first visible question or if all questions are hidden.

    Args:
        survey:  A Survey ORM object.
        current: The current NavigationPosition.
        answers: Current answer context dict.

    Returns:
        NavigationPosition for the previous visible question, or None if at
        the beginning.
    """
    visible = get_visible_flow(survey, answers)
    if not visible:
        return None

    # Find the index of the current position in the visible flow.
    current_index: Optional[int] = None
    for i, (group, question) in enumerate(visible):
        if group.id == current.group_id and question.id == current.question_id:
            current_index = i
            break

    # If current position is not visible or is the first visible question,
    # return None.
    if current_index is None or current_index == 0:
        return None

    group, question = visible[current_index - 1]
    return NavigationPosition(group_id=group.id, question_id=question.id)


# ---------------------------------------------------------------------------
# Per-group navigation (one_page_per_group mode)
# ---------------------------------------------------------------------------


def _get_visible_groups(
    survey: Any,
    answers: Optional[Dict[str, Any]] = None,
) -> List[Any]:
    """Return the list of visible groups that have at least one visible question.

    A group is included when it has at least one visible question (so that
    navigating to a group always shows something).

    Args:
        survey:  A Survey ORM object.
        answers: Current answer context dict.

    Returns:
        A list of QuestionGroup objects that are visible and non-empty.
    """
    if answers is None:
        answers = {}

    visible_pairs = get_visible_flow(survey, answers)
    seen_group_ids: set = set()
    ordered_groups = []
    for group, _question in visible_pairs:
        if group.id not in seen_group_ids:
            seen_group_ids.add(group.id)
            ordered_groups.append(group)
    return ordered_groups


def get_first_visible_group(
    survey: Any,
    answers: Optional[Dict[str, Any]] = None,
) -> Optional[uuid.UUID]:
    """Return the id of the first visible group that has visible questions.

    Args:
        survey:  A Survey ORM object.
        answers: Current answer context dict.

    Returns:
        The UUID of the first visible group, or None if none exist.
    """
    groups = _get_visible_groups(survey, answers)
    if not groups:
        return None
    return groups[0].id


def get_next_group(
    survey: Any,
    current_group_id: uuid.UUID,
    answers: Optional[Dict[str, Any]] = None,
) -> Optional[uuid.UUID]:
    """Return the id of the next visible group (one_page_per_group mode).

    Skips groups that are hidden or have no visible questions. Returns None
    if at the last visible group or if all groups are hidden.

    Args:
        survey:           A Survey ORM object.
        current_group_id: The UUID of the current group.
        answers:          Current answer context dict.

    Returns:
        UUID of the next visible group, or None if at the end.
    """
    groups = _get_visible_groups(survey, answers)
    if not groups:
        return None

    current_index: Optional[int] = None
    for i, group in enumerate(groups):
        if group.id == current_group_id:
            current_index = i
            break

    if current_index is None or current_index >= len(groups) - 1:
        return None

    return groups[current_index + 1].id


def get_previous_group(
    survey: Any,
    current_group_id: uuid.UUID,
    answers: Optional[Dict[str, Any]] = None,
) -> Optional[uuid.UUID]:
    """Return the id of the previous visible group (one_page_per_group mode).

    Skips groups that are hidden or have no visible questions. Returns None
    if at the first visible group.

    Args:
        survey:           A Survey ORM object.
        current_group_id: The UUID of the current group.
        answers:          Current answer context dict.

    Returns:
        UUID of the previous visible group, or None if at the beginning.
    """
    groups = _get_visible_groups(survey, answers)
    if not groups:
        return None

    current_index: Optional[int] = None
    for i, group in enumerate(groups):
        if group.id == current_group_id:
            current_index = i
            break

    if current_index is None or current_index == 0:
        return None

    return groups[current_index - 1].id
