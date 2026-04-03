"""Tests for the skip logic / navigation flow service (ISS-077).

Covers:
- build_ordered_pairs: correct ordering by sort_order, subquestions excluded
- get_visible_flow: only visible question/group pairs returned
- get_first_visible_question: returns first visible or None when all hidden
- get_next_question: forward navigation, skips hidden questions/groups
- get_previous_question: backward navigation, skips hidden items
- Edge case: all questions hidden -> navigation returns None
- Edge case: first question hidden -> first visible is correctly returned
- Edge case: last question hidden -> next from second-to-last returns None
- Edge case: single visible question -> next/previous both None
- one_page_per_group: get_first_visible_group, get_next_group, get_previous_group
- Groups with all questions hidden are excluded from group navigation
- Package-level import smoke test
"""

import uuid
from typing import Any, List, Optional
from unittest.mock import MagicMock, patch

import pytest

from app.services.expressions.flow import (
    NavigationPosition,
    build_ordered_pairs,
    get_visible_flow,
    get_next_question,
    get_previous_question,
    get_first_visible_question,
    get_next_group,
    get_previous_group,
    get_first_visible_group,
)
from app.services.expressions import (
    NavigationPosition as pkg_NavigationPosition,
    build_ordered_pairs as pkg_build_ordered_pairs,
    get_visible_flow as pkg_get_visible_flow,
    get_next_question as pkg_get_next_question,
    get_previous_question as pkg_get_previous_question,
    get_first_visible_question as pkg_get_first_visible_question,
    get_next_group as pkg_get_next_group,
    get_previous_group as pkg_get_previous_group,
    get_first_visible_group as pkg_get_first_visible_group,
)
from app.services.expressions.relevance import RelevanceResult


# ---------------------------------------------------------------------------
# Stub helpers
# ---------------------------------------------------------------------------


def _make_question(
    sort_order: int = 1,
    qid: Optional[uuid.UUID] = None,
    parent_id: Optional[uuid.UUID] = None,
) -> MagicMock:
    """Create a mock Question with the given sort_order."""
    q = MagicMock()
    q.id = qid if qid is not None else uuid.uuid4()
    q.sort_order = sort_order
    q.parent_id = parent_id
    return q


def _make_group(
    questions: List[Any],
    sort_order: int = 1,
    gid: Optional[uuid.UUID] = None,
) -> MagicMock:
    """Create a mock QuestionGroup with the given questions and sort_order."""
    g = MagicMock()
    g.id = gid if gid is not None else uuid.uuid4()
    g.sort_order = sort_order
    g.questions = questions
    return g


def _make_survey(groups: List[Any], sid: Optional[uuid.UUID] = None) -> MagicMock:
    """Create a mock Survey with the given groups."""
    s = MagicMock()
    s.id = sid if sid is not None else uuid.uuid4()
    s.groups = groups
    return s


def _make_relevance_result(
    visible_question_ids: Optional[set] = None,
    hidden_question_ids: Optional[set] = None,
    visible_group_ids: Optional[set] = None,
    hidden_group_ids: Optional[set] = None,
) -> RelevanceResult:
    """Create a RelevanceResult with explicit visibility sets."""
    return RelevanceResult(
        visible_question_ids=visible_question_ids or set(),
        hidden_question_ids=hidden_question_ids or set(),
        visible_group_ids=visible_group_ids or set(),
        hidden_group_ids=hidden_group_ids or set(),
    )


# ---------------------------------------------------------------------------
# Package import smoke test
# ---------------------------------------------------------------------------


def test_package_imports():
    """All flow symbols must be importable from app.services.expressions."""
    assert pkg_NavigationPosition is NavigationPosition
    assert callable(pkg_build_ordered_pairs)
    assert callable(pkg_get_visible_flow)
    assert callable(pkg_get_next_question)
    assert callable(pkg_get_previous_question)
    assert callable(pkg_get_first_visible_question)
    assert callable(pkg_get_next_group)
    assert callable(pkg_get_previous_group)
    assert callable(pkg_get_first_visible_group)


# ---------------------------------------------------------------------------
# NavigationPosition
# ---------------------------------------------------------------------------


def test_navigation_position_is_frozen():
    """NavigationPosition should be immutable (frozen dataclass)."""
    gid = uuid.uuid4()
    qid = uuid.uuid4()
    pos = NavigationPosition(group_id=gid, question_id=qid)
    assert pos.group_id == gid
    assert pos.question_id == qid

    with pytest.raises((AttributeError, TypeError)):
        pos.group_id = uuid.uuid4()  # type: ignore[misc]


def test_navigation_position_equality():
    """Two NavigationPositions with same ids are equal."""
    gid = uuid.uuid4()
    qid = uuid.uuid4()
    pos1 = NavigationPosition(group_id=gid, question_id=qid)
    pos2 = NavigationPosition(group_id=gid, question_id=qid)
    assert pos1 == pos2


# ---------------------------------------------------------------------------
# build_ordered_pairs
# ---------------------------------------------------------------------------


def test_build_ordered_pairs_single_group():
    """Two questions in one group are ordered by sort_order."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=2)
    g = _make_group([q2, q1], sort_order=1)  # intentionally unordered
    survey = _make_survey([g])

    pairs = build_ordered_pairs(survey)

    assert len(pairs) == 2
    assert pairs[0] == (g, q1)
    assert pairs[1] == (g, q2)


def test_build_ordered_pairs_multiple_groups():
    """Groups are ordered by sort_order, questions within groups by sort_order."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=1)
    q3 = _make_question(sort_order=2)
    g1 = _make_group([q1], sort_order=2)
    g2 = _make_group([q3, q2], sort_order=1)  # questions intentionally unordered
    survey = _make_survey([g1, g2])  # groups intentionally unordered

    pairs = build_ordered_pairs(survey)

    # g2 (sort_order=1) comes before g1 (sort_order=2)
    assert len(pairs) == 3
    assert pairs[0][0] == g2  # g2 first
    assert pairs[0][1] == q2  # q2 (sort_order=1) before q3 (sort_order=2)
    assert pairs[1][0] == g2
    assert pairs[1][1] == q3
    assert pairs[2][0] == g1
    assert pairs[2][1] == q1


def test_build_ordered_pairs_excludes_subquestions():
    """Subquestions (parent_id is not None) are excluded from the flat list."""
    parent_id = uuid.uuid4()
    q_top = _make_question(sort_order=1, parent_id=None)
    q_sub = _make_question(sort_order=2, parent_id=parent_id)
    g = _make_group([q_top, q_sub], sort_order=1)
    survey = _make_survey([g])

    pairs = build_ordered_pairs(survey)

    assert len(pairs) == 1
    assert pairs[0][1] == q_top


def test_build_ordered_pairs_empty_survey():
    """An empty survey returns an empty list."""
    survey = _make_survey([])
    assert build_ordered_pairs(survey) == []


def test_build_ordered_pairs_group_with_no_questions():
    """A group with no questions contributes no pairs."""
    g = _make_group([], sort_order=1)
    survey = _make_survey([g])
    assert build_ordered_pairs(survey) == []


# ---------------------------------------------------------------------------
# get_visible_flow
# ---------------------------------------------------------------------------


def test_get_visible_flow_all_visible():
    """All questions visible returns the same ordered list."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=2)
    g = _make_group([q1, q2], sort_order=1)
    survey = _make_survey([g])

    result = _make_relevance_result(
        visible_group_ids={g.id},
        visible_question_ids={q1.id, q2.id},
    )

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        pairs = get_visible_flow(survey, answers={})

    assert len(pairs) == 2
    assert pairs[0] == (g, q1)
    assert pairs[1] == (g, q2)


def test_get_visible_flow_hidden_question_excluded():
    """A hidden question is excluded from the visible flow."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=2)
    g = _make_group([q1, q2], sort_order=1)
    survey = _make_survey([g])

    result = _make_relevance_result(
        visible_group_ids={g.id},
        visible_question_ids={q1.id},
        hidden_question_ids={q2.id},
    )

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        pairs = get_visible_flow(survey, answers={})

    assert len(pairs) == 1
    assert pairs[0] == (g, q1)


def test_get_visible_flow_hidden_group_excludes_all_questions():
    """When a group is hidden, all its questions are excluded from the flow."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=2)
    g = _make_group([q1, q2], sort_order=1)
    survey = _make_survey([g])

    result = _make_relevance_result(
        hidden_group_ids={g.id},
        hidden_question_ids={q1.id, q2.id},
    )

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        pairs = get_visible_flow(survey, answers={})

    assert pairs == []


def test_get_visible_flow_all_hidden_returns_empty():
    """All questions hidden returns an empty list."""
    q1 = _make_question(sort_order=1)
    g = _make_group([q1], sort_order=1)
    survey = _make_survey([g])

    result = _make_relevance_result(
        hidden_group_ids={g.id},
        hidden_question_ids={q1.id},
    )

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        pairs = get_visible_flow(survey, answers={})

    assert pairs == []


# ---------------------------------------------------------------------------
# get_first_visible_question
# ---------------------------------------------------------------------------


def test_get_first_visible_question_returns_first():
    """Returns position of the first visible question."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=2)
    g = _make_group([q1, q2], sort_order=1)
    survey = _make_survey([g])

    result = _make_relevance_result(
        visible_group_ids={g.id},
        visible_question_ids={q1.id, q2.id},
    )

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        pos = get_first_visible_question(survey, answers={})

    assert pos == NavigationPosition(group_id=g.id, question_id=q1.id)


def test_get_first_visible_question_skips_hidden_first():
    """When the first question is hidden, returns the first visible one."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=2)
    g = _make_group([q1, q2], sort_order=1)
    survey = _make_survey([g])

    result = _make_relevance_result(
        visible_group_ids={g.id},
        visible_question_ids={q2.id},
        hidden_question_ids={q1.id},
    )

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        pos = get_first_visible_question(survey, answers={})

    assert pos == NavigationPosition(group_id=g.id, question_id=q2.id)


def test_get_first_visible_question_all_hidden_returns_none():
    """When all questions are hidden, returns None."""
    q1 = _make_question(sort_order=1)
    g = _make_group([q1], sort_order=1)
    survey = _make_survey([g])

    result = _make_relevance_result(
        hidden_group_ids={g.id},
        hidden_question_ids={q1.id},
    )

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        pos = get_first_visible_question(survey, answers={})

    assert pos is None


def test_get_first_visible_question_empty_survey_returns_none():
    """Empty survey returns None."""
    survey = _make_survey([])

    result = _make_relevance_result()

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        pos = get_first_visible_question(survey, answers={})

    assert pos is None


# ---------------------------------------------------------------------------
# get_next_question
# ---------------------------------------------------------------------------


def test_get_next_question_advances_forward():
    """get_next_question returns the next visible question."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=2)
    q3 = _make_question(sort_order=3)
    g = _make_group([q1, q2, q3], sort_order=1)
    survey = _make_survey([g])

    result = _make_relevance_result(
        visible_group_ids={g.id},
        visible_question_ids={q1.id, q2.id, q3.id},
    )

    current = NavigationPosition(group_id=g.id, question_id=q1.id)

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        next_pos = get_next_question(survey, current, answers={})

    assert next_pos == NavigationPosition(group_id=g.id, question_id=q2.id)


def test_get_next_question_skips_hidden_question():
    """get_next_question skips a hidden question and returns the next visible one."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=2)  # hidden
    q3 = _make_question(sort_order=3)
    g = _make_group([q1, q2, q3], sort_order=1)
    survey = _make_survey([g])

    result = _make_relevance_result(
        visible_group_ids={g.id},
        visible_question_ids={q1.id, q3.id},
        hidden_question_ids={q2.id},
    )

    current = NavigationPosition(group_id=g.id, question_id=q1.id)

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        next_pos = get_next_question(survey, current, answers={})

    assert next_pos == NavigationPosition(group_id=g.id, question_id=q3.id)


def test_get_next_question_skips_hidden_group():
    """get_next_question skips an entire hidden group."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=1)  # in hidden group
    q3 = _make_question(sort_order=1)
    g1 = _make_group([q1], sort_order=1)
    g2 = _make_group([q2], sort_order=2)  # hidden group
    g3 = _make_group([q3], sort_order=3)
    survey = _make_survey([g1, g2, g3])

    result = _make_relevance_result(
        visible_group_ids={g1.id, g3.id},
        hidden_group_ids={g2.id},
        visible_question_ids={q1.id, q3.id},
        hidden_question_ids={q2.id},
    )

    current = NavigationPosition(group_id=g1.id, question_id=q1.id)

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        next_pos = get_next_question(survey, current, answers={})

    assert next_pos == NavigationPosition(group_id=g3.id, question_id=q3.id)


def test_get_next_question_at_last_returns_none():
    """get_next_question from the last visible question returns None (end of survey)."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=2)
    g = _make_group([q1, q2], sort_order=1)
    survey = _make_survey([g])

    result = _make_relevance_result(
        visible_group_ids={g.id},
        visible_question_ids={q1.id, q2.id},
    )

    current = NavigationPosition(group_id=g.id, question_id=q2.id)

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        next_pos = get_next_question(survey, current, answers={})

    assert next_pos is None


def test_get_next_question_all_hidden_returns_none():
    """get_next_question when all questions are hidden returns None."""
    q1 = _make_question(sort_order=1)
    g = _make_group([q1], sort_order=1)
    survey = _make_survey([g])

    result = _make_relevance_result(
        hidden_group_ids={g.id},
        hidden_question_ids={q1.id},
    )

    current = NavigationPosition(group_id=g.id, question_id=q1.id)

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        next_pos = get_next_question(survey, current, answers={})

    assert next_pos is None


def test_get_next_question_current_not_in_visible_flow_returns_none():
    """When current position is not in the visible flow, returns None."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=2)  # current is this hidden one
    g = _make_group([q1, q2], sort_order=1)
    survey = _make_survey([g])

    result = _make_relevance_result(
        visible_group_ids={g.id},
        visible_question_ids={q1.id},
        hidden_question_ids={q2.id},
    )

    # Current is a hidden question - not in visible flow
    current = NavigationPosition(group_id=g.id, question_id=q2.id)

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        next_pos = get_next_question(survey, current, answers={})

    assert next_pos is None


def test_get_next_question_single_visible_returns_none():
    """A single visible question has no next position."""
    q1 = _make_question(sort_order=1)
    g = _make_group([q1], sort_order=1)
    survey = _make_survey([g])

    result = _make_relevance_result(
        visible_group_ids={g.id},
        visible_question_ids={q1.id},
    )

    current = NavigationPosition(group_id=g.id, question_id=q1.id)

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        next_pos = get_next_question(survey, current, answers={})

    assert next_pos is None


def test_get_next_question_crosses_groups():
    """get_next_question correctly moves to the next group."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=1)
    g1 = _make_group([q1], sort_order=1)
    g2 = _make_group([q2], sort_order=2)
    survey = _make_survey([g1, g2])

    result = _make_relevance_result(
        visible_group_ids={g1.id, g2.id},
        visible_question_ids={q1.id, q2.id},
    )

    current = NavigationPosition(group_id=g1.id, question_id=q1.id)

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        next_pos = get_next_question(survey, current, answers={})

    assert next_pos == NavigationPosition(group_id=g2.id, question_id=q2.id)


# ---------------------------------------------------------------------------
# get_previous_question
# ---------------------------------------------------------------------------


def test_get_previous_question_goes_backward():
    """get_previous_question returns the previous visible question."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=2)
    q3 = _make_question(sort_order=3)
    g = _make_group([q1, q2, q3], sort_order=1)
    survey = _make_survey([g])

    result = _make_relevance_result(
        visible_group_ids={g.id},
        visible_question_ids={q1.id, q2.id, q3.id},
    )

    current = NavigationPosition(group_id=g.id, question_id=q3.id)

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        prev_pos = get_previous_question(survey, current, answers={})

    assert prev_pos == NavigationPosition(group_id=g.id, question_id=q2.id)


def test_get_previous_question_skips_hidden_question():
    """get_previous_question skips a hidden question and returns the prev visible."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=2)  # hidden
    q3 = _make_question(sort_order=3)
    g = _make_group([q1, q2, q3], sort_order=1)
    survey = _make_survey([g])

    result = _make_relevance_result(
        visible_group_ids={g.id},
        visible_question_ids={q1.id, q3.id},
        hidden_question_ids={q2.id},
    )

    current = NavigationPosition(group_id=g.id, question_id=q3.id)

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        prev_pos = get_previous_question(survey, current, answers={})

    assert prev_pos == NavigationPosition(group_id=g.id, question_id=q1.id)


def test_get_previous_question_at_first_returns_none():
    """get_previous_question from the first visible question returns None."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=2)
    g = _make_group([q1, q2], sort_order=1)
    survey = _make_survey([g])

    result = _make_relevance_result(
        visible_group_ids={g.id},
        visible_question_ids={q1.id, q2.id},
    )

    current = NavigationPosition(group_id=g.id, question_id=q1.id)

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        prev_pos = get_previous_question(survey, current, answers={})

    assert prev_pos is None


def test_get_previous_question_all_hidden_returns_none():
    """get_previous_question when all questions are hidden returns None."""
    q1 = _make_question(sort_order=1)
    g = _make_group([q1], sort_order=1)
    survey = _make_survey([g])

    result = _make_relevance_result(
        hidden_group_ids={g.id},
        hidden_question_ids={q1.id},
    )

    current = NavigationPosition(group_id=g.id, question_id=q1.id)

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        prev_pos = get_previous_question(survey, current, answers={})

    assert prev_pos is None


def test_get_previous_question_current_not_in_visible_flow_returns_none():
    """When current position is not in the visible flow, returns None."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=2)  # hidden
    g = _make_group([q1, q2], sort_order=1)
    survey = _make_survey([g])

    result = _make_relevance_result(
        visible_group_ids={g.id},
        visible_question_ids={q1.id},
        hidden_question_ids={q2.id},
    )

    current = NavigationPosition(group_id=g.id, question_id=q2.id)

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        prev_pos = get_previous_question(survey, current, answers={})

    assert prev_pos is None


def test_get_previous_question_crosses_groups():
    """get_previous_question correctly moves back to the previous group."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=1)
    g1 = _make_group([q1], sort_order=1)
    g2 = _make_group([q2], sort_order=2)
    survey = _make_survey([g1, g2])

    result = _make_relevance_result(
        visible_group_ids={g1.id, g2.id},
        visible_question_ids={q1.id, q2.id},
    )

    current = NavigationPosition(group_id=g2.id, question_id=q2.id)

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        prev_pos = get_previous_question(survey, current, answers={})

    assert prev_pos == NavigationPosition(group_id=g1.id, question_id=q1.id)


def test_get_previous_question_single_visible_returns_none():
    """A single visible question has no previous position."""
    q1 = _make_question(sort_order=1)
    g = _make_group([q1], sort_order=1)
    survey = _make_survey([g])

    result = _make_relevance_result(
        visible_group_ids={g.id},
        visible_question_ids={q1.id},
    )

    current = NavigationPosition(group_id=g.id, question_id=q1.id)

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        prev_pos = get_previous_question(survey, current, answers={})

    assert prev_pos is None


# ---------------------------------------------------------------------------
# get_first_visible_group
# ---------------------------------------------------------------------------


def test_get_first_visible_group_returns_first():
    """Returns the first visible group that has visible questions."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=1)
    g1 = _make_group([q1], sort_order=1)
    g2 = _make_group([q2], sort_order=2)
    survey = _make_survey([g1, g2])

    result = _make_relevance_result(
        visible_group_ids={g1.id, g2.id},
        visible_question_ids={q1.id, q2.id},
    )

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        first_gid = get_first_visible_group(survey, answers={})

    assert first_gid == g1.id


def test_get_first_visible_group_skips_hidden_first_group():
    """When first group is hidden, returns the first visible group with questions."""
    q1 = _make_question(sort_order=1)  # in hidden group
    q2 = _make_question(sort_order=1)
    g1 = _make_group([q1], sort_order=1)  # hidden
    g2 = _make_group([q2], sort_order=2)
    survey = _make_survey([g1, g2])

    result = _make_relevance_result(
        visible_group_ids={g2.id},
        hidden_group_ids={g1.id},
        visible_question_ids={q2.id},
        hidden_question_ids={q1.id},
    )

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        first_gid = get_first_visible_group(survey, answers={})

    assert first_gid == g2.id


def test_get_first_visible_group_all_hidden_returns_none():
    """When all groups are hidden, returns None."""
    q1 = _make_question(sort_order=1)
    g1 = _make_group([q1], sort_order=1)
    survey = _make_survey([g1])

    result = _make_relevance_result(
        hidden_group_ids={g1.id},
        hidden_question_ids={q1.id},
    )

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        first_gid = get_first_visible_group(survey, answers={})

    assert first_gid is None


def test_get_first_visible_group_empty_survey_returns_none():
    """Empty survey returns None."""
    survey = _make_survey([])

    result = _make_relevance_result()

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        first_gid = get_first_visible_group(survey, answers={})

    assert first_gid is None


# ---------------------------------------------------------------------------
# get_next_group
# ---------------------------------------------------------------------------


def test_get_next_group_advances_forward():
    """get_next_group returns the next visible group."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=1)
    q3 = _make_question(sort_order=1)
    g1 = _make_group([q1], sort_order=1)
    g2 = _make_group([q2], sort_order=2)
    g3 = _make_group([q3], sort_order=3)
    survey = _make_survey([g1, g2, g3])

    result = _make_relevance_result(
        visible_group_ids={g1.id, g2.id, g3.id},
        visible_question_ids={q1.id, q2.id, q3.id},
    )

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        next_gid = get_next_group(survey, g1.id, answers={})

    assert next_gid == g2.id


def test_get_next_group_skips_hidden_group():
    """get_next_group skips a group that is hidden or has all questions hidden."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=1)  # in hidden group
    q3 = _make_question(sort_order=1)
    g1 = _make_group([q1], sort_order=1)
    g2 = _make_group([q2], sort_order=2)  # hidden
    g3 = _make_group([q3], sort_order=3)
    survey = _make_survey([g1, g2, g3])

    result = _make_relevance_result(
        visible_group_ids={g1.id, g3.id},
        hidden_group_ids={g2.id},
        visible_question_ids={q1.id, q3.id},
        hidden_question_ids={q2.id},
    )

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        next_gid = get_next_group(survey, g1.id, answers={})

    assert next_gid == g3.id


def test_get_next_group_skips_group_with_all_questions_hidden():
    """get_next_group skips a visible group where all questions are hidden."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=1)  # hidden even though group is visible
    q3 = _make_question(sort_order=1)
    g1 = _make_group([q1], sort_order=1)
    g2 = _make_group([q2], sort_order=2)
    g3 = _make_group([q3], sort_order=3)
    survey = _make_survey([g1, g2, g3])

    # g2 is "visible" at group level but its only question is hidden
    result = _make_relevance_result(
        visible_group_ids={g1.id, g2.id, g3.id},
        visible_question_ids={q1.id, q3.id},
        hidden_question_ids={q2.id},
    )

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        next_gid = get_next_group(survey, g1.id, answers={})

    # g2 has no visible questions, so it should be skipped
    assert next_gid == g3.id


def test_get_next_group_at_last_returns_none():
    """get_next_group from the last visible group returns None."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=1)
    g1 = _make_group([q1], sort_order=1)
    g2 = _make_group([q2], sort_order=2)
    survey = _make_survey([g1, g2])

    result = _make_relevance_result(
        visible_group_ids={g1.id, g2.id},
        visible_question_ids={q1.id, q2.id},
    )

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        next_gid = get_next_group(survey, g2.id, answers={})

    assert next_gid is None


def test_get_next_group_all_hidden_returns_none():
    """get_next_group when all groups are hidden returns None."""
    q1 = _make_question(sort_order=1)
    g1 = _make_group([q1], sort_order=1)
    survey = _make_survey([g1])

    result = _make_relevance_result(
        hidden_group_ids={g1.id},
        hidden_question_ids={q1.id},
    )

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        next_gid = get_next_group(survey, g1.id, answers={})

    assert next_gid is None


def test_get_next_group_current_not_in_visible_groups_returns_none():
    """When current group is not in visible groups, returns None."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=1)  # in hidden group
    g1 = _make_group([q1], sort_order=1)
    g2 = _make_group([q2], sort_order=2)  # hidden
    survey = _make_survey([g1, g2])

    result = _make_relevance_result(
        visible_group_ids={g1.id},
        hidden_group_ids={g2.id},
        visible_question_ids={q1.id},
        hidden_question_ids={q2.id},
    )

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        next_gid = get_next_group(survey, g2.id, answers={})

    assert next_gid is None


# ---------------------------------------------------------------------------
# get_previous_group
# ---------------------------------------------------------------------------


def test_get_previous_group_goes_backward():
    """get_previous_group returns the previous visible group."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=1)
    q3 = _make_question(sort_order=1)
    g1 = _make_group([q1], sort_order=1)
    g2 = _make_group([q2], sort_order=2)
    g3 = _make_group([q3], sort_order=3)
    survey = _make_survey([g1, g2, g3])

    result = _make_relevance_result(
        visible_group_ids={g1.id, g2.id, g3.id},
        visible_question_ids={q1.id, q2.id, q3.id},
    )

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        prev_gid = get_previous_group(survey, g3.id, answers={})

    assert prev_gid == g2.id


def test_get_previous_group_skips_hidden_group():
    """get_previous_group skips a hidden group."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=1)  # in hidden group
    q3 = _make_question(sort_order=1)
    g1 = _make_group([q1], sort_order=1)
    g2 = _make_group([q2], sort_order=2)  # hidden
    g3 = _make_group([q3], sort_order=3)
    survey = _make_survey([g1, g2, g3])

    result = _make_relevance_result(
        visible_group_ids={g1.id, g3.id},
        hidden_group_ids={g2.id},
        visible_question_ids={q1.id, q3.id},
        hidden_question_ids={q2.id},
    )

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        prev_gid = get_previous_group(survey, g3.id, answers={})

    assert prev_gid == g1.id


def test_get_previous_group_at_first_returns_none():
    """get_previous_group from the first visible group returns None."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=1)
    g1 = _make_group([q1], sort_order=1)
    g2 = _make_group([q2], sort_order=2)
    survey = _make_survey([g1, g2])

    result = _make_relevance_result(
        visible_group_ids={g1.id, g2.id},
        visible_question_ids={q1.id, q2.id},
    )

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        prev_gid = get_previous_group(survey, g1.id, answers={})

    assert prev_gid is None


def test_get_previous_group_all_hidden_returns_none():
    """get_previous_group when all groups are hidden returns None."""
    q1 = _make_question(sort_order=1)
    g1 = _make_group([q1], sort_order=1)
    survey = _make_survey([g1])

    result = _make_relevance_result(
        hidden_group_ids={g1.id},
        hidden_question_ids={q1.id},
    )

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        prev_gid = get_previous_group(survey, g1.id, answers={})

    assert prev_gid is None


def test_get_previous_group_current_not_in_visible_groups_returns_none():
    """When current group is not in visible groups, returns None."""
    q1 = _make_question(sort_order=1)
    q2 = _make_question(sort_order=1)  # in hidden group
    g1 = _make_group([q1], sort_order=1)
    g2 = _make_group([q2], sort_order=2)  # hidden
    survey = _make_survey([g1, g2])

    result = _make_relevance_result(
        visible_group_ids={g1.id},
        hidden_group_ids={g2.id},
        visible_question_ids={q1.id},
        hidden_question_ids={q2.id},
    )

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ):
        prev_gid = get_previous_group(survey, g2.id, answers={})

    assert prev_gid is None


# ---------------------------------------------------------------------------
# None answers handling
# ---------------------------------------------------------------------------


def test_none_answers_treated_as_empty():
    """Passing None for answers works the same as passing an empty dict."""
    q1 = _make_question(sort_order=1)
    g = _make_group([q1], sort_order=1)
    survey = _make_survey([g])

    result = _make_relevance_result(
        visible_group_ids={g.id},
        visible_question_ids={q1.id},
    )

    with patch(
        "app.services.expressions.flow.evaluate_relevance", return_value=result
    ) as mock_eval:
        pos = get_first_visible_question(survey, answers=None)
        # evaluate_relevance should have been called with empty dict
        mock_eval.assert_called_once_with(survey, answers={})

    assert pos == NavigationPosition(group_id=g.id, question_id=q1.id)
