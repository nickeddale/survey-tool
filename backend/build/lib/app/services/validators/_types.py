"""Shared types for the validators package.

Kept in a separate module to avoid circular imports between __init__.py
and the individual validator modules.
"""

from dataclasses import dataclass


@dataclass
class QuestionValidationError:
    """Lightweight field-level validation error returned by validators."""
    field: str
    message: str
