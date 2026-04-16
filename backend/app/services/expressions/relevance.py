"""Relevance evaluation service for conditional question/group display.

Determines which questions and groups are visible or hidden during survey
response collection by evaluating stored relevance expressions against the
current answer state.

Rules:
    - A null relevance expression means *always visible*.
    - A group whose relevance expression evaluates to False is hidden.
    - All questions belonging to a hidden group are hidden regardless of
      their own relevance expressions.
    - A question whose relevance expression evaluates to False is hidden.
    - Circular references across relevance expressions raise
      CircularRelevanceError.
    - Results are cached per (survey_id, frozenset of answer items) so
      repeated calls with identical answers skip re-evaluation.

Usage::

    from app.services.expressions.relevance import evaluate_relevance, RelevanceResult

    result = evaluate_relevance(survey, answers={"Q1": "Yes", "Q2": 5})
    # result.visible_question_ids — set of UUID
    # result.hidden_question_ids  — set of UUID
    # result.visible_group_ids    — set of UUID
    # result.hidden_group_ids     — set of UUID
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Set

from app.services.expressions.lexer import LexerError, tokenize
from app.services.expressions.parser import ParserError, parse
from app.services.expressions.evaluator import evaluate, EvaluationError
from app.services.expressions.ast_nodes import (
    ASTNode,
    BinaryOp,
    UnaryOp,
    Variable,
    FunctionCall,
    ArrayLiteral,
)

__all__ = [
    "evaluate_relevance",
    "RelevanceResult",
    "CircularRelevanceError",
    "RelevanceEvaluationError",
]

# Module-level evaluation cache.
# Key: (survey_id, frozenset of answer items)
# Value: RelevanceResult
_CACHE: Dict[tuple, "RelevanceResult"] = {}


def _make_hashable(v: Any) -> Any:
    """Recursively convert a value to a hashable form for use in cache keys.

    - dicts become frozensets of (key, _make_hashable(value)) pairs
    - lists become tuples of recursively converted items
    - all other values are returned unchanged
    """
    if isinstance(v, dict):
        return frozenset((k, _make_hashable(val)) for k, val in v.items())
    elif isinstance(v, list):
        return tuple(_make_hashable(item) for item in v)
    return v


# ---------------------------------------------------------------------------
# Error types
# ---------------------------------------------------------------------------


class CircularRelevanceError(ValueError):
    """Raised when circular references are detected across relevance expressions.

    Attributes:
        cycle: The list of variable names / codes forming the cycle.
    """

    def __init__(self, cycle: list[str]) -> None:
        self.cycle = cycle
        super().__init__(
            f"Circular reference detected in relevance expressions: "
            + " -> ".join(cycle)
        )


class RelevanceEvaluationError(ValueError):
    """Raised when a relevance expression cannot be evaluated at runtime."""


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------


@dataclass
class RelevanceResult:
    """The outcome of evaluating all relevance expressions for a survey.

    Attributes:
        visible_question_ids: UUIDs of questions that should be shown.
        hidden_question_ids:  UUIDs of questions that should be hidden.
        visible_group_ids:    UUIDs of groups that should be shown.
        hidden_group_ids:     UUIDs of groups that should be hidden.
    """

    visible_question_ids: Set[uuid.UUID] = field(default_factory=set)
    hidden_question_ids: Set[uuid.UUID] = field(default_factory=set)
    visible_group_ids: Set[uuid.UUID] = field(default_factory=set)
    hidden_group_ids: Set[uuid.UUID] = field(default_factory=set)


# ---------------------------------------------------------------------------
# AST variable extraction
# ---------------------------------------------------------------------------


def _extract_variables(node: ASTNode) -> list[str]:
    """Return all variable names referenced in an AST (depth-first, with duplicates)."""
    result: list[str] = []
    if isinstance(node, Variable):
        result.append(node.name)
    elif isinstance(node, BinaryOp):
        result.extend(_extract_variables(node.left))
        result.extend(_extract_variables(node.right))
    elif isinstance(node, UnaryOp):
        result.extend(_extract_variables(node.operand))
    elif isinstance(node, FunctionCall):
        for arg in node.args:
            result.extend(_extract_variables(arg))
    elif isinstance(node, ArrayLiteral):
        for elem in node.elements:
            result.extend(_extract_variables(elem))
    return result


def _parse_variables(expression: str) -> list[str]:
    """Parse an expression and return all variable names it references.

    Returns an empty list if the expression has a syntax error (the error is
    not fatal for cycle detection — it will be caught later during evaluation).
    """
    try:
        tokens = tokenize(expression)
        ast = parse(tokens)
        return _extract_variables(ast)
    except (LexerError, ParserError):
        return []


# ---------------------------------------------------------------------------
# Circular reference detection
# ---------------------------------------------------------------------------


def _detect_cycles(dependency_graph: Dict[str, list[str]]) -> Optional[list[str]]:
    """Detect cycles in a dependency graph using iterative DFS.

    Args:
        dependency_graph: Mapping of node_id -> list of node_ids it depends on.

    Returns:
        A list of node ids forming a cycle (first cycle found), or None if
        no cycle exists.
    """
    # States: 0 = unvisited, 1 = in progress, 2 = done
    state: Dict[str, int] = {node: 0 for node in dependency_graph}
    parent: Dict[str, Optional[str]] = {node: None for node in dependency_graph}

    for start in dependency_graph:
        if state[start] != 0:
            continue
        # Iterative DFS using an explicit stack of (node, iterator-over-neighbors)
        stack: list[tuple[str, Any]] = [(start, iter(dependency_graph.get(start, [])))]
        state[start] = 1

        while stack:
            node, neighbors = stack[-1]
            try:
                neighbor = next(neighbors)
                if neighbor not in state:
                    # Neighbor is not a tracked node (e.g. a question code that
                    # has no relevance expression of its own) — skip.
                    continue
                if state[neighbor] == 1:
                    # Found a back edge — reconstruct cycle path.
                    cycle = [neighbor]
                    cur = node
                    while cur != neighbor:
                        cycle.append(cur)
                        cur = parent[cur]  # type: ignore[index]
                    cycle.append(neighbor)
                    cycle.reverse()
                    return cycle
                if state[neighbor] == 0:
                    state[neighbor] = 1
                    parent[neighbor] = node
                    stack.append((neighbor, iter(dependency_graph.get(neighbor, []))))
            except StopIteration:
                state[node] = 2
                stack.pop()

    return None


# ---------------------------------------------------------------------------
# Expression evaluation helper
# ---------------------------------------------------------------------------


def _eval_relevance(expression: str, context: Dict[str, Any]) -> bool:
    """Evaluate a relevance expression against an answer context.

    Returns:
        True if the item is visible, False if it should be hidden.

    Raises:
        RelevanceEvaluationError: On syntax or runtime errors.
    """
    try:
        tokens = tokenize(expression)
        ast = parse(tokens)
        result = evaluate(ast, context=context, timeout=None)
        # Coerce to bool using the same logic as the evaluator.
        if result is None:
            return False
        if isinstance(result, bool):
            return result
        if isinstance(result, (int, float)):
            return result != 0
        if isinstance(result, str):
            return result != ""
        if isinstance(result, list):
            return len(result) > 0
        return bool(result)
    except LexerError as exc:
        raise RelevanceEvaluationError(
            f"Syntax error in relevance expression: {exc}"
        ) from exc
    except ParserError as exc:
        raise RelevanceEvaluationError(
            f"Parse error in relevance expression: {exc}"
        ) from exc
    except EvaluationError as exc:
        raise RelevanceEvaluationError(
            f"Evaluation error in relevance expression: {exc}"
        ) from exc


# ---------------------------------------------------------------------------
# Main public API
# ---------------------------------------------------------------------------


def evaluate_relevance(
    survey: Any,
    answers: Optional[Dict[str, Any]] = None,
) -> RelevanceResult:
    """Evaluate all relevance expressions for a survey against current answers.

    The survey's ``groups`` relationship and each group's ``questions``
    relationship must already be loaded (not lazy-raised).

    Args:
        survey:  A Survey ORM object with loaded ``groups`` -> ``questions``.
        answers: Flat answer context dict mapping question codes to their
                 current values (as produced by build_expression_context()).
                 Pass None or an empty dict to evaluate with no answers.

    Returns:
        A RelevanceResult with visible/hidden sets for both questions and groups.

    Raises:
        CircularRelevanceError: If circular references are found across
                                relevance expressions.
        RelevanceEvaluationError: If an expression has a syntax or runtime
                                  error.
    """
    if answers is None:
        answers = {}

    # ------------------------------------------------------------------
    # Cache lookup
    # ------------------------------------------------------------------
    cache_key = (survey.id, frozenset(
        (k, _make_hashable(v))
        for k, v in answers.items()
    ))
    if cache_key in _CACHE:
        return _CACHE[cache_key]

    # ------------------------------------------------------------------
    # Collect all groups and questions with their relevance expressions
    # ------------------------------------------------------------------
    # Map: question_code -> list[question_code] (variables it references)
    # We build this for cycle detection.
    groups = survey.groups  # already loaded

    # Build a code->expression map for groups and questions so we can
    # do cycle detection. We use a synthetic key "GROUP:<id>" for groups
    # since groups don't have codes.
    dep_graph: Dict[str, list[str]] = {}

    for group in groups:
        group_key = f"GROUP:{group.id}"
        if group.relevance:
            dep_graph[group_key] = _parse_variables(group.relevance)
        else:
            dep_graph[group_key] = []

        for question in group.questions:
            q_code = question.code
            if question.relevance:
                dep_graph[q_code] = _parse_variables(question.relevance)
            else:
                dep_graph[q_code] = []

    # ------------------------------------------------------------------
    # Circular reference detection
    # ------------------------------------------------------------------
    cycle = _detect_cycles(dep_graph)
    if cycle is not None:
        raise CircularRelevanceError(cycle)

    # ------------------------------------------------------------------
    # Evaluate relevance for each group and question
    # ------------------------------------------------------------------
    result = RelevanceResult()
    context = answers

    for group in groups:
        # Evaluate group relevance
        if group.relevance is None:
            group_visible = True
        else:
            group_visible = _eval_relevance(group.relevance, context)

        if group_visible:
            result.visible_group_ids.add(group.id)
        else:
            result.hidden_group_ids.add(group.id)

        for question in group.questions:
            if not group_visible:
                # Questions in hidden groups are always hidden.
                result.hidden_question_ids.add(question.id)
                continue

            # Evaluate question relevance
            if question.relevance is None:
                q_visible = True
            else:
                q_visible = _eval_relevance(question.relevance, context)

            if q_visible:
                result.visible_question_ids.add(question.id)
            else:
                result.hidden_question_ids.add(question.id)

    # ------------------------------------------------------------------
    # Cache and return
    # ------------------------------------------------------------------
    _CACHE[cache_key] = result
    return result


def clear_relevance_cache() -> None:
    """Clear the module-level evaluation cache.

    Useful for testing or when survey structure changes.
    """
    _CACHE.clear()
