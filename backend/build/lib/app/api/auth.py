import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.limiter import RATE_LIMITS, limiter
from app.dependencies import get_current_user
from app.models.api_key import ApiKey
from app.models.user import User
from app.schemas.api_key import ApiKeyCreate, ApiKeyCreateResponse, ApiKeyResponse
from app.schemas.user import (
    LoginRequest,
    TokenResponse,
    UserCreate,
    UserResponse,
    UserUpdateRequest,
)
from app.services.api_key_service import (
    create_api_key,
    list_api_keys_for_user,
    revoke_api_key,
)
from app.services.auth_service import (
    create_access_token,
    create_refresh_token_record,
    generate_refresh_token,
    get_refresh_token_by_hash,
    get_user_by_email,
    hash_password,
    hash_refresh_token,
    revoke_refresh_token,
    verify_password,
)
from app.services import audit_service
from app.utils.errors import ConflictError, NotFoundError, UnauthorizedError

router = APIRouter(prefix="/auth", tags=["auth"])

_COOKIE_MAX_AGE = 60 * 60 * 24 * 30  # 30 days in seconds


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    """Set the httpOnly refresh token cookie with security attributes."""
    response.set_cookie(
        key=settings.refresh_token_cookie_name,
        value=refresh_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=_COOKIE_MAX_AGE,
        path="/",
    )


def _clear_refresh_cookie(response: Response) -> None:
    """Clear the refresh token cookie using identical attributes."""
    response.delete_cookie(
        key=settings.refresh_token_cookie_name,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/",
    )


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
    description="Create a new user account with email and password. Email must be unique.",
)
@limiter.limit(RATE_LIMITS["auth_register"])
async def register(
    request: Request,
    payload: UserCreate,
    session: AsyncSession = Depends(get_db),
) -> UserResponse:
    existing = await get_user_by_email(session, payload.email)
    if existing is not None:
        raise ConflictError("A user with this email already exists")

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        name=payload.name,
    )
    session.add(user)
    try:
        await session.flush()
    except IntegrityError:
        raise ConflictError("A user with this email already exists")
    await session.refresh(user)

    return UserResponse.model_validate(user)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Log in and receive access token",
    description="Authenticate with email and password. Returns a JWT access token. The refresh token is set as an httpOnly cookie.",
)
@limiter.limit(RATE_LIMITS["auth_login"])
async def login(
    request: Request,
    response: Response,
    payload: LoginRequest,
    session: AsyncSession = Depends(get_db),
) -> TokenResponse:
    ip_address = (
        request.headers.get("X-Forwarded-For", request.client.host)
        if request.client
        else request.headers.get("X-Forwarded-For")
    )

    user = await get_user_by_email(session, payload.email)
    if user is None or not verify_password(payload.password, user.password_hash):
        audit_service.log_auth_event(
            event_type="login_failure",
            email=payload.email,
            success=False,
            ip_address=ip_address,
            user_id=user.id if user is not None else None,
            detail="Invalid email or password",
        )
        raise UnauthorizedError("Invalid email or password")
    if not user.is_active:
        audit_service.log_auth_event(
            event_type="login_failure",
            email=payload.email,
            success=False,
            ip_address=ip_address,
            user_id=user.id,
            detail="User account is inactive",
        )
        raise UnauthorizedError("User account is inactive")

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = generate_refresh_token()
    await create_refresh_token_record(session, user.id, refresh_token)

    _set_refresh_cookie(response, refresh_token)

    audit_service.log_auth_event(
        event_type="login_success",
        email=user.email,
        success=True,
        ip_address=ip_address,
        user_id=user.id,
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.jwt_expiry_mins * 60,
    )


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh access token using the refresh token cookie",
    description="Exchange a valid refresh token cookie for a new access token. The old refresh token is revoked (rotation) and a new cookie is set.",
)
@limiter.limit(RATE_LIMITS["auth_refresh"])
async def refresh(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_db),
) -> TokenResponse:
    cookie_token = request.cookies.get(settings.refresh_token_cookie_name)
    if not cookie_token:
        raise UnauthorizedError("No refresh token provided")

    token_hash = hash_refresh_token(cookie_token)
    record = await get_refresh_token_by_hash(session, token_hash)

    if record is None or record.revoked:
        raise UnauthorizedError("Invalid or revoked refresh token")

    if record.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise UnauthorizedError("Refresh token has expired")

    # Revoke the old token and issue new pair atomically
    await revoke_refresh_token(session, record)

    access_token = create_access_token({"sub": str(record.user_id)})
    new_refresh_token = generate_refresh_token()
    await create_refresh_token_record(session, record.user_id, new_refresh_token)

    _set_refresh_cookie(response, new_refresh_token)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.jwt_expiry_mins * 60,
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke the refresh token cookie",
    description="Revoke the refresh token from the cookie. Subsequent refresh attempts will be rejected. The cookie is cleared.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def logout(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_db),
) -> None:
    cookie_token = request.cookies.get(settings.refresh_token_cookie_name)
    if cookie_token:
        token_hash = hash_refresh_token(cookie_token)
        record = await get_refresh_token_by_hash(session, token_hash)
        if record is not None and not record.revoked:
            await revoke_refresh_token(session, record)

    _clear_refresh_cookie(response)


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current authenticated user",
    description="Return the profile of the currently authenticated user.",
)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.patch(
    "/me",
    response_model=UserResponse,
    summary="Update current user profile",
    description="Update the display name or password of the currently authenticated user.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def update_me(
    request: Request,
    payload: UserUpdateRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> UserResponse:
    if payload.name is not None:
        current_user.name = payload.name
    if payload.password is not None:
        current_user.password_hash = hash_password(payload.password)

    session.add(current_user)
    await session.flush()
    await session.refresh(current_user)

    return UserResponse.model_validate(current_user)


@router.post(
    "/keys",
    response_model=ApiKeyCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an API key",
    description="Create a new API key for programmatic access. The raw key value is only returned once at creation time.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def create_key(
    request: Request,
    payload: ApiKeyCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ApiKeyCreateResponse:
    record, raw_key = await create_api_key(
        session,
        user_id=current_user.id,
        name=payload.name,
        scopes=payload.scopes,
        expires_at=payload.expires_at,
    )
    return ApiKeyCreateResponse(
        id=record.id,
        name=record.name,
        key=raw_key,
        key_prefix=record.key_prefix,
        scopes=record.scopes,
        is_active=record.is_active,
        expires_at=record.expires_at,
        created_at=record.created_at,
    )


@router.get(
    "/keys",
    response_model=list[ApiKeyResponse],
    summary="List API keys for current user",
    description="Return all API keys belonging to the currently authenticated user. Raw key values are never returned.",
)
async def list_keys(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> list[ApiKeyResponse]:
    keys = await list_api_keys_for_user(session, current_user.id)
    return [ApiKeyResponse.model_validate(k) for k in keys]


@router.delete(
    "/keys/{key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke an API key",
    description="Permanently revoke an API key by ID. The key will no longer be accepted for authentication.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def delete_key(
    request: Request,
    key_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> None:
    try:
        parsed_id = uuid.UUID(key_id)
    except ValueError:
        raise NotFoundError("API key not found")

    result = await session.execute(
        select(ApiKey).where(
            ApiKey.id == parsed_id, ApiKey.user_id == current_user.id
        )
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise NotFoundError("API key not found")
    await revoke_api_key(session, record)
