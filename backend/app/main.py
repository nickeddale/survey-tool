import logging
import time
import traceback

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.answer_options import router as answer_options_router
from app.api.auth import router as auth_router
from app.api.logic import router as logic_router
from app.api.question_groups import router as question_groups_router
from app.api.questions import router as questions_router
from app.api.questions import subquestions_router
from app.api.responses import router as responses_router
from app.api.surveys import router as surveys_router
from app.config import settings
from app.utils.errors import (
    AppError,
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


app = FastAPI(
    title="Survey Tool API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS must be added before logging middleware so it is the outermost layer
# (Starlette applies middleware in reverse registration order).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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


app.add_middleware(RequestLoggingMiddleware)


# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------

def _make_error_response(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"detail": {"code": code, "message": message}},
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


@app.get("/health")
async def health_check():
    return {"status": "ok"}
