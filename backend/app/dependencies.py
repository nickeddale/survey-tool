import uuid
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.services.auth_service import decode_access_token, get_user_by_id
from app.services.api_key_service import (
    get_api_key_by_hash,
    hash_api_key,
    update_last_used,
)

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Check for X-API-Key header first
    api_key_header = request.headers.get("X-API-Key")
    if api_key_header is not None:
        key_hash = hash_api_key(api_key_header)
        record = await get_api_key_by_hash(session, key_hash)
        if record is None or not record.is_active:
            raise credentials_exception
        if record.expires_at is not None:
            expires = record.expires_at
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if expires < datetime.now(timezone.utc):
                raise credentials_exception
        await update_last_used(session, record)
        user = await get_user_by_id(session, record.user_id)
        if user is None or not user.is_active:
            raise credentials_exception
        return user

    # Fall back to JWT Bearer token
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authenticated",
        )

    try:
        payload = decode_access_token(credentials.credentials)
        user_id_str: str | None = payload.get("sub")
        if user_id_str is None:
            raise credentials_exception
        user_id = uuid.UUID(user_id_str)
    except (JWTError, ValueError):
        raise credentials_exception

    user = await get_user_by_id(session, user_id)
    if user is None or not user.is_active:
        raise credentials_exception

    return user
