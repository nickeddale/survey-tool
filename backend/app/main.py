import logging
import time
import traceback

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.answer_options import router as answer_options_router
from app.api.assessments import router as assessments_router
from app.api.auth import router as auth_router
from app.api.webhooks import router as webhooks_router
from app.api.logic import router as logic_router
from app.api.participants import router as participants_router
from app.api.question_groups import router as question_groups_router
from app.api.questions import router as questions_router
from app.api.questions import subquestions_router
from app.api.quotas import router as quotas_router
from app.api.responses import router as responses_router
from app.api.surveys import router as surveys_router
from app.config import settings
from app.limiter import limiter
from app.utils.errors import (
    AppError,
    AnswerValidationError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    RateLimitedError,
    UnauthorizedError,
    UnprocessableError,
    ValidationError,
)

logger = logging.getLogger("app")
logging.basicConfig(level=settings.log_level.upper())

# Configure the audit logger explicitly so it is not silenced by handler setup.
# Audit entries are emitted as JSON strings via logger.info(json.dumps({...})).
_audit_logger = logging.getLogger("audit")
_audit_logger.setLevel(logging.INFO)
if not _audit_logger.handlers:
    _audit_handler = logging.StreamHandler()
    _audit_handler.setLevel(logging.INFO)
    _audit_logger.addHandler(_audit_handler)
_audit_logger.propagate = True

# Map HTTP status codes to standard error codes
_STATUS_CODE_MAP: dict[int, str] = {
    400: "VALIDATION_ERROR",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "UNPROCESSABLE",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
}


_OPENAPI_TAGS = [
    {
        "name": "auth",
        "description": (
            "User registration, login, token refresh/logout, and API key management. "
            "JWT bearer tokens are issued on login and must be included in the "
            "Authorization header for protected endpoints."
        ),
    },
    {
        "name": "surveys",
        "description": (
            "Create and manage surveys. Supports full lifecycle operations: draft → active → "
            "closed → archived. Includes clone, export/import, translation management, "
            "and version history."
        ),
    },
    {
        "name": "question_groups",
        "description": (
            "Manage question groups (pages/sections) within a survey. Groups can have "
            "relevance expressions to show or hide entire sections based on prior answers."
        ),
    },
    {
        "name": "questions",
        "description": (
            "Manage questions within a question group. Supports multiple question types "
            "(text, numeric, choice, rating, matrix, etc.), relevance expressions, "
            "validation rules, and subquestions for matrix-type questions."
        ),
    },
    {
        "name": "answer_options",
        "description": (
            "Manage answer options (choices) for choice-type and matrix questions. "
            "Supports ordering, assessment scoring values, and per-option translations."
        ),
    },
    {
        "name": "responses",
        "description": (
            "Submit and manage survey responses. Public endpoints allow anonymous respondents "
            "to start, save, and complete responses. Authenticated endpoints provide "
            "listing, filtering, export (CSV/JSON), and detailed answer inspection."
        ),
    },
    {
        "name": "participants",
        "description": (
            "Manage pre-registered survey participants. When a survey has participants, "
            "a valid participant token is required to submit a response. Supports "
            "batch creation, filtering by validity, and token-based access control."
        ),
    },
    {
        "name": "quotas",
        "description": (
            "Define response quotas based on answer conditions. When a quota limit is "
            "reached, incoming responses matching the conditions can be terminated or "
            "have specific questions hidden."
        ),
    },
    {
        "name": "assessments",
        "description": (
            "Define scoring rules (assessment bands) for a survey. Each rule maps a "
            "score range to a feedback message. The score endpoint computes the total "
            "from answer option values and returns all matching assessment rules."
        ),
    },
    {
        "name": "webhooks",
        "description": (
            "Register HTTP endpoints to receive real-time event notifications. "
            "Supported events include response.started, response.completed, "
            "survey.activated, survey.closed, and quota.reached. "
            "Each webhook is signed with an HMAC-SHA256 secret."
        ),
    },
    {
        "name": "logic",
        "description": (
            "Validate relevance/condition expressions and resolve survey navigation flow. "
            "The validate-expression endpoint checks syntax and variable references. "
            "The resolve-flow endpoint computes visible/hidden questions and next question "
            "for a given answer state."
        ),
    },
]

app = FastAPI(
    title="Survey Tool API",
    version="0.1.0",
    description=(
        "A headless survey platform API for building, distributing, and analysing surveys. "
        "Supports branching logic, multi-language translations, quota management, "
        "webhook notifications, and assessment scoring."
    ),
    openapi_tags=_OPENAPI_TAGS,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.state.limiter = limiter

# CORS must be added before logging middleware so it is the outermost layer
# (Starlette applies middleware in reverse registration order).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key", "Accept"],
)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        elapsed = time.perf_counter() - start
        logger.info(
            "%s %s %d %.3fs",
            request.method,
            request.url.path,
            response.status_code,
            elapsed,
        )
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
        )
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers.pop("server", None)
        return response


app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(SlowAPIMiddleware)
# SecurityHeadersMiddleware registered last so it is the outermost wrapper,
# ensuring security headers are added to ALL responses including CORS and error responses.
app.add_middleware(SecurityHeadersMiddleware)


# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------

def _make_error_response(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"detail": {"code": code, "message": message}},
    )


@app.exception_handler(AnswerValidationError)
async def answer_validation_error_handler(
    request: Request, exc: AnswerValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.to_response(),
    )


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return _make_error_response(exc.status_code, exc.code, exc.message)


# Register individual subclass handlers so FastAPI picks them up before the
# generic AppError handler (FastAPI walks the MRO).
@app.exception_handler(ValidationError)
async def validation_error_handler(request: Request, exc: ValidationError) -> JSONResponse:
    return _make_error_response(exc.status_code, exc.code, exc.message)


@app.exception_handler(UnauthorizedError)
async def unauthorized_error_handler(request: Request, exc: UnauthorizedError) -> JSONResponse:
    return _make_error_response(exc.status_code, exc.code, exc.message)


@app.exception_handler(ForbiddenError)
async def forbidden_error_handler(request: Request, exc: ForbiddenError) -> JSONResponse:
    return _make_error_response(exc.status_code, exc.code, exc.message)


@app.exception_handler(NotFoundError)
async def not_found_error_handler(request: Request, exc: NotFoundError) -> JSONResponse:
    return _make_error_response(exc.status_code, exc.code, exc.message)


@app.exception_handler(ConflictError)
async def conflict_error_handler(request: Request, exc: ConflictError) -> JSONResponse:
    return _make_error_response(exc.status_code, exc.code, exc.message)


@app.exception_handler(UnprocessableError)
async def unprocessable_error_handler(request: Request, exc: UnprocessableError) -> JSONResponse:
    return _make_error_response(exc.status_code, exc.code, exc.message)


@app.exception_handler(RateLimitedError)
async def rate_limited_error_handler(request: Request, exc: RateLimitedError) -> JSONResponse:
    return _make_error_response(exc.status_code, exc.code, exc.message)


@app.exception_handler(RateLimitExceeded)
async def slowapi_rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return _make_error_response(
        status.HTTP_429_TOO_MANY_REQUESTS,
        "RATE_LIMITED",
        "Too many requests. Please slow down.",
    )


@app.exception_handler(RequestValidationError)
async def request_validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """FastAPI validation errors (Pydantic) → 400 VALIDATION_ERROR."""
    return _make_error_response(
        status.HTTP_400_BAD_REQUEST,
        "VALIDATION_ERROR",
        "Request validation failed",
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    """Reformat all HTTPExceptions (including raw ones from routers) to standard format."""
    code = _STATUS_CODE_MAP.get(exc.status_code, "INTERNAL_ERROR")
    message = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    headers = getattr(exc, "headers", None)
    response = _make_error_response(exc.status_code, code, message)
    if headers:
        for key, value in headers.items():
            response.headers[key] = value
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all for unhandled exceptions — log full traceback, return 500 without details."""
    logger.error(
        "Unhandled exception on %s %s\n%s",
        request.method,
        request.url.path,
        traceback.format_exc(),
    )
    return _make_error_response(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "INTERNAL_ERROR",
        "An unexpected error occurred",
    )


app.include_router(auth_router, prefix="/api/v1")
app.include_router(logic_router, prefix="/api/v1")
app.include_router(surveys_router, prefix="/api/v1")
app.include_router(question_groups_router, prefix="/api/v1")
app.include_router(questions_router, prefix="/api/v1")
app.include_router(subquestions_router, prefix="/api/v1")
app.include_router(answer_options_router, prefix="/api/v1")
app.include_router(responses_router, prefix="/api/v1")
app.include_router(participants_router, prefix="/api/v1")
app.include_router(quotas_router, prefix="/api/v1")
app.include_router(assessments_router, prefix="/api/v1")
app.include_router(webhooks_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    return {"status": "ok"}
