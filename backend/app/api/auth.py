import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.api_key import ApiKey
from app.models.user import User
from app.schemas.api_key import ApiKeyCreate, ApiKeyCreateResponse, ApiKeyResponse
from app.schemas.user import (
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
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

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    payload: UserCreate,
    session: AsyncSession = Depends(get_db),
) -> UserResponse:
    existing = await get_user_by_email(session, payload.email)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
        )

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        name=payload.name,
    )
    session.add(user)
    await session.flush()
    await session.refresh(user)

    return UserResponse.model_validate(user)


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    session: AsyncSession = Depends(get_db),
) -> TokenResponse:
    user = await get_user_by_email(session, payload.email)
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = generate_refresh_token()
    await create_refresh_token_record(session, user.id, refresh_token)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.jwt_expiry_mins * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    payload: RefreshRequest,
    session: AsyncSession = Depends(get_db),
) -> TokenResponse:
    token_hash = hash_refresh_token(payload.refresh_token)
    record = await get_refresh_token_by_hash(session, token_hash)

    if record is None or record.revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if record.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Revoke the old token (rotation)
    await revoke_refresh_token(session, record)

    # Issue new token pair
    access_token = create_access_token({"sub": str(record.user_id)})
    new_refresh_token = generate_refresh_token()
    await create_refresh_token_record(session, record.user_id, new_refresh_token)

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
        expires_in=settings.jwt_expiry_mins * 60,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    payload: LogoutRequest,
    session: AsyncSession = Depends(get_db),
) -> None:
    token_hash = hash_refresh_token(payload.refresh_token)
    record = await get_refresh_token_by_hash(session, token_hash)
    if record is not None and not record.revoked:
        await revoke_refresh_token(session, record)


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.patch("/me", response_model=UserResponse)
async def update_me(
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
)
async def create_key(
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


@router.get("/keys", response_model=list[ApiKeyResponse])
async def list_keys(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> list[ApiKeyResponse]:
    keys = await list_api_keys_for_user(session, current_user.id)
    return [ApiKeyResponse.model_validate(k) for k in keys]


@router.delete("/keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_key(
    key_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> None:
    try:
        parsed_id = uuid.UUID(key_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found",
        )

    result = await session.execute(
        select(ApiKey).where(
            ApiKey.id == parsed_id, ApiKey.user_id == current_user.id
        )
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found",
        )
    await revoke_api_key(session, record)
