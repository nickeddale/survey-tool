"""Custom exception classes that produce standardized {detail: {code, message}} responses."""

from typing import Any


class AppError(Exception):
    status_code: int = 500
    code: str = "INTERNAL_ERROR"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message

    def to_response(self) -> dict[str, Any]:
        return {"detail": {"code": self.code, "message": self.message}}


class ValidationError(AppError):
    status_code = 400
    code = "VALIDATION_ERROR"


class UnauthorizedError(AppError):
    status_code = 401
    code = "UNAUTHORIZED"


class ForbiddenError(AppError):
    status_code = 403
    code = "FORBIDDEN"


class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"


class ConflictError(AppError):
    status_code = 409
    code = "CONFLICT"


class UnprocessableError(AppError):
    status_code = 422
    code = "UNPROCESSABLE"


class RateLimitedError(AppError):
    status_code = 429
    code = "RATE_LIMITED"


class AnswerValidationError(AppError):
    """Raised when one or more submitted answers fail server-side validation.

    Produces HTTP 422 with the shape:
        {detail: {code: VALIDATION_ERROR, message, errors: [{question_code, field, message}]}}
    """

    status_code = 422
    code = "VALIDATION_ERROR"

    def __init__(self, message: str, errors: list[dict[str, Any]]) -> None:
        super().__init__(message)
        self.errors = errors

    def to_response(self) -> dict[str, Any]:
        return {
            "detail": {
                "code": self.code,
                "message": self.message,
                "errors": self.errors,
            }
        }
