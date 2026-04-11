"""Safe regex utilities for ReDoS protection.

Provides:
  - safe_regex_search: wraps `regex.search` with a hard timeout (default 100ms)
    so catastrophic backtracking cannot hang the server.
  - validate_regex_complexity: rejects patterns containing known-dangerous
    constructs (nested quantifiers, catastrophic alternation) at question
    creation time, before they ever reach the matching path.

The `regex` PyPI package (https://pypi.org/project/regex/) is a drop-in
replacement for the standard `re` module with an additional `timeout`
keyword argument.  On timeout it raises `TimeoutError`.
"""

import re
from typing import Any

import regex as _regex

from app.services.validators._types import QuestionValidationError


# ---------------------------------------------------------------------------
# Timeout-safe regex search
# ---------------------------------------------------------------------------

# Default timeout for user-supplied regex evaluation (seconds).
_DEFAULT_TIMEOUT = 0.1  # 100ms


def safe_regex_search(
    pattern: str,
    value: str,
    timeout: float = _DEFAULT_TIMEOUT,
) -> Any | None:
    """Run regex.search(pattern, value) with a hard timeout.

    Returns the match object (truthy) or None (no match).
    Raises TimeoutError if matching takes longer than *timeout* seconds.
    Raises re.error if the pattern is syntactically invalid (regex.error is
    mapped to re.error so callers only need to catch the stdlib exception).

    This function intentionally re-raises both exceptions so callers can
    decide how to surface them (e.g. as HTTP 422 UnprocessableError).
    """
    try:
        return _regex.search(pattern, value, timeout=timeout)
    except _regex.error as exc:
        # Normalise to stdlib re.error so callers only need one catch clause.
        raise re.error(str(exc)) from exc


# ---------------------------------------------------------------------------
# Complexity pre-screening
# ---------------------------------------------------------------------------

def validate_regex_complexity(pattern: str) -> list[QuestionValidationError]:
    """Reject regex patterns that are known to cause catastrophic backtracking.

    Checks performed:
    1. Pattern must compile without error (catches syntactically broken patterns).
    2. Nested quantifiers — patterns where a quantifier wraps a group that
       itself contains a quantifier, e.g. (a+)+, (a*)*,  (a+)*, (a|b+)+.
    3. Catastrophic alternation — patterns where alternation branches share
       a common prefix inside a repeated group, e.g. (a|a)+.

    Returns a list of QuestionValidationError (empty = pattern is acceptable).
    """
    errors: list[QuestionValidationError] = []

    # 1. Basic syntax check (using stdlib re so we don't need the timeout here)
    try:
        re.compile(pattern)
    except re.error as exc:
        errors.append(
            QuestionValidationError(
                field="validation.regex",
                message=f"validation.regex is not a valid regular expression: {exc}",
            )
        )
        return errors  # no point checking further

    # 2. Nested quantifier detection.
    # Heuristic: look for patterns like (\w+)+, (a+)*, ([a-z]+)+, etc.
    # We detect: a quantifier (+, *, {n,}) that directly follows ) where
    # the immediately-enclosed group also contains a quantifier.
    #
    # The check is intentionally conservative — it may produce false positives
    # for some complex but safe patterns, but that is acceptable for a security
    # control.  Safe patterns (e.g. (\w+)) are not flagged.
    nested_quantifier_pattern = re.compile(
        r"""
        \(              # opening paren of outer group
        [^()]*          # content (simplified — no nested parens)
        [+*]\??         # inner quantifier (+, *, +?, *?)
        [^()]*
        \)              # closing paren of outer group
        [+*{]           # outer quantifier starts immediately after )
        """,
        re.VERBOSE,
    )
    if nested_quantifier_pattern.search(pattern):
        errors.append(
            QuestionValidationError(
                field="validation.regex",
                message=(
                    "validation.regex contains nested quantifiers (e.g. (a+)+) "
                    "which can cause catastrophic backtracking and are not allowed"
                ),
            )
        )

    # 3. Catastrophic alternation: (x|x)+ style — identical alternatives inside
    # a quantified group.  Simple heuristic: repeated identical branch in an
    # alternation group that is then quantified.
    alternation_dupe_pattern = re.compile(
        r"""
        \(              # opening group
        ([^|()]+)       # capture first alternative
        \|              # pipe separator
        \1              # same alternative repeated
        [^()]*
        \)              # closing group
        [+*{]           # outer quantifier
        """,
        re.VERBOSE,
    )
    if alternation_dupe_pattern.search(pattern):
        errors.append(
            QuestionValidationError(
                field="validation.regex",
                message=(
                    "validation.regex contains catastrophic alternation (e.g. (a|a)+) "
                    "which can cause catastrophic backtracking and is not allowed"
                ),
            )
        )

    return errors
