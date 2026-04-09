"""Answer piping / string interpolation for survey text fields.

Replaces {variable} and {expression} placeholders in question titles,
descriptions, and answer option labels with the actual answer values from
the current expression context.

Substitution rules:
    - list / multi-select: items joined with ", " (comma-space)
    - int / float: rendered as raw number (no quotes)
    - None / missing variable: replaced with empty string ""
    - str / bool: converted to str
    - Escaped braces \\{ and \\} are passed through as literal { and }

Nested function calls such as {count({Q_multi})} are fully supported —
the content inside {} is evaluated through the existing lexer/parser/evaluator
pipeline before formatting.  To handle nested braces correctly, placeholder
detection uses a depth-counting scanner rather than a simple regex.

Usage::

    from app.services.expressions.piping import pipe, pipe_question, pipe_all

    ctx = build_expression_context(response, participant=participant)
    title = pipe("Hello {Q_name}!", ctx)

    piped = pipe_question(question, ctx)
    # piped["Q1_title"] == "Hello Alice!"
    # piped["Q1_description"] == "..."

    all_texts = pipe_all(survey_questions, ctx)
    # all_texts["Q1_title"], all_texts["Q1_OPT1_title"], ...
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from app.services.expressions.lexer import tokenize, LexerError
from app.services.expressions.parser import parse, ParserError
from app.services.expressions.evaluator import evaluate, EvaluationError

__all__ = [
    "pipe",
    "pipe_question",
    "pipe_all",
    "PipingError",
]

# Pattern for a simple variable name (bare identifier without braces).
# When piping content matches this, we must re-wrap it in {} for the lexer.
_SIMPLE_VAR_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_.]*$")


# ---------------------------------------------------------------------------
# Error type
# ---------------------------------------------------------------------------


class PipingError(ValueError):
    """Raised when a placeholder expression cannot be evaluated."""


# ---------------------------------------------------------------------------
# Value formatting
# ---------------------------------------------------------------------------


def _format_value(value: Any) -> str:
    """Convert a resolved expression value to its display string.

    Formatting rules:
        - None        → ""
        - list        → items joined with ", "
        - int / float → raw number string (str(value))
        - bool        → "True" / "False" (str coercion)
        - str         → as-is
        - other       → str(value)
    """
    if value is None:
        return ""
    if isinstance(value, list):
        return ", ".join(str(item) for item in value)
    return str(value)


# ---------------------------------------------------------------------------
# Placeholder scanner (handles nested braces)
# ---------------------------------------------------------------------------


def _scan_placeholders(text: str) -> List[Tuple[int, int, str]]:
    """Return a list of (start, end, inner_content) tuples for all unescaped placeholders.

    Handles nested braces correctly by tracking brace depth, so
    ``{count({Q_multi})}`` is treated as a single placeholder with inner
    content ``count({Q_multi})``.

    A brace that is preceded by a backslash (``\\{`` or ``\\}``) is treated
    as escaped and skipped — it will be converted to a literal brace after
    substitution.

    Args:
        text: The template string to scan.

    Returns:
        A list of (start, end, inner) tuples where *start* is the index of
        the opening ``{``, *end* is the index one past the closing ``}``, and
        *inner* is the text between the outer braces.
    """
    results: List[Tuple[int, int, str]] = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == "\\" and i + 1 < n and text[i + 1] in ("{", "}"):
            # Escaped brace — skip both characters.
            i += 2
            continue
        if ch == "{":
            # Start of a potential placeholder.
            depth = 1
            j = i + 1
            while j < n and depth > 0:
                if text[j] == "\\" and j + 1 < n and text[j + 1] in ("{", "}"):
                    j += 2
                    continue
                if text[j] == "{":
                    depth += 1
                elif text[j] == "}":
                    depth -= 1
                j += 1
            if depth == 0:
                # j is now one past the closing '}'.
                inner = text[i + 1 : j - 1]
                results.append((i, j, inner))
                i = j
                continue
        i += 1
    return results


# ---------------------------------------------------------------------------
# Core pipe function
# ---------------------------------------------------------------------------


def pipe(text: str, context: Dict[str, Any]) -> str:
    """Replace {…} placeholders in *text* with resolved values from *context*.

    Each placeholder is treated as a full expression string and evaluated
    through the lexer/parser/evaluator pipeline, enabling simple variable
    references like {Q1} as well as nested function calls like {count({Q1})}.

    Escaped braces (\\{ and \\}) are preserved as literal characters after all
    substitutions have been applied.

    Args:
        text:    The template string containing zero or more {…} placeholders.
        context: Flat expression context dict as produced by
                 build_expression_context().

    Returns:
        The text with all placeholders replaced by their formatted values.

    Raises:
        PipingError: If a placeholder expression contains a syntax or
                     runtime error.
    """
    if not text:
        return text

    placeholders = _scan_placeholders(text)
    if not placeholders:
        # No substitutions needed — only unescape and return.
        return text.replace("\\{", "{").replace("\\}", "}")

    parts: List[str] = []
    prev_end = 0

    for start, end, inner in placeholders:
        # Append the literal text before this placeholder (with unescaping).
        literal = text[prev_end:start]
        parts.append(literal.replace("\\{", "{").replace("\\}", "}"))

        # Build the expression to evaluate.
        # A bare variable name like "Q1" must be wrapped in {} for the lexer.
        # A compound expression like "count({Q_multi})" is used as-is.
        if _SIMPLE_VAR_RE.match(inner):
            expr = "{" + inner + "}"
        else:
            expr = inner

        try:
            tokens = tokenize(expr)
            ast = parse(tokens)
            value = evaluate(ast, context=context, timeout=None)
        except (LexerError, ParserError, EvaluationError) as exc:
            raise PipingError(
                f"Error evaluating piping expression {{{inner!r}}}: {exc}"
            ) from exc

        parts.append(_format_value(value))
        prev_end = end

    # Append any remaining text after the last placeholder.
    tail = text[prev_end:]
    parts.append(tail.replace("\\{", "{").replace("\\}", "}"))

    return "".join(parts)


# ---------------------------------------------------------------------------
# Question-level helper
# ---------------------------------------------------------------------------


def pipe_question(
    question: Any,
    context: Dict[str, Any],
) -> Dict[str, str]:
    """Apply piping to a question's title and description.

    Args:
        question: A Question ORM/mock object with ``code``, ``title``, and
                  ``description`` attributes.
        context:  Flat expression context dict.

    Returns:
        A dict with keys:
            ``{code}_title``       — piped title (empty string if None)
            ``{code}_description`` — piped description (empty string if None)
    """
    code = question.code
    title = question.title or ""
    description = question.description or ""
    return {
        f"{code}_title": pipe(title, context),
        f"{code}_description": pipe(description, context),
    }


# ---------------------------------------------------------------------------
# Survey-wide helper
# ---------------------------------------------------------------------------


def pipe_all(
    survey_questions: List[Any],
    context: Dict[str, Any],
) -> Dict[str, str]:
    """Apply piping to all questions and their answer options in a survey.

    Iterates *survey_questions* (top-level questions only; subquestions are
    skipped via parent_id check) and produces piped text for titles,
    descriptions, and each answer option label.

    Args:
        survey_questions: A flat list of Question objects. Questions with a
                          non-None ``parent_id`` are treated as subquestions
                          and skipped.
        context:          Flat expression context dict.

    Returns:
        A dict containing entries for every processed question and option:
            ``{q_code}_title``             — piped question title
            ``{q_code}_description``       — piped question description
            ``{q_code}_{opt_code}_title``  — piped answer option label
    """
    result: Dict[str, str] = {}

    for question in survey_questions:
        # Skip subquestions — they are displayed as part of their parent.
        if getattr(question, "parent_id", None) is not None:
            continue

        result.update(pipe_question(question, context))

        # Process answer options if available.
        options = getattr(question, "answer_options", None) or []
        for option in options:
            opt_code = option.code
            opt_label = option.title or ""
            result[f"{question.code}_{opt_code}_title"] = pipe(opt_label, context)

    return result
