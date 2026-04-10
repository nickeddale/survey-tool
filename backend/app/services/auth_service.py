import asyncio
import hashlib
import secrets
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.refresh_token import RefreshToken
from app.models.user import User

REFRESH_TOKEN_EXPIRE_DAYS = 30

# Dedicated thread pool for bcrypt operations. Bounded to avoid spawning an
# unbounded number of threads under high auth load (each bcrypt call holds a
# thread for ~200-400ms of CPU time). max_workers caps concurrent bcrypt
# operations; excess requests queue rather than spawning unlimited threads.
_bcrypt_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="bcrypt")


async def hash_password(plain_password: str) -> str:
    """Hash a password using bcrypt, offloaded to a dedicated thread pool to
    avoid blocking the async event loop (bcrypt is CPU-bound). Uses configurable
    rounds from settings so tests can lower the cost factor for speed."""
    rounds = settings.bcrypt_rounds
    return await asyncio.to_thread(
        lambda: bcrypt.hashpw(
            plain_password.encode(), bcrypt.gensalt(rounds=rounds)
        ).decode()
    )


async def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a bcrypt password hash, offloaded to a dedicated thread pool to
    avoid blocking the async event loop (bcrypt is CPU-bound)."""
    return await asyncio.to_thread(
        lambda: bcrypt.checkpw(plain_password.encode(), hashed_password.encode())
    )


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    result = await session.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    result = await session.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.jwt_expiry_mins)
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    """Decode and validate the JWT access token. Raises JWTError on failure."""
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


def generate_refresh_token() -> str:
    """Generate a cryptographically secure random refresh token string."""
    return secrets.token_urlsafe(64)


def hash_refresh_token(token: str) -> str:
    """SHA-256 hash of the refresh token for storage."""
    return hashlib.sha256(token.encode()).hexdigest()


async def create_refresh_token_record(
    session: AsyncSession,
    user_id: uuid.UUID,
    token: str,
) -> RefreshToken:
    token_hash = hash_refresh_token(token)
    expires_at = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    record = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    session.add(record)
    await session.flush()
    return record


async def get_refresh_token_by_hash(
    session: AsyncSession, token_hash: str
) -> RefreshToken | None:
    result = await session.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    return result.scalar_one_or_none()


async def revoke_refresh_token(session: AsyncSession, record: RefreshToken) -> None:
    record.revoked = True
    session.add(record)
    await session.flush()
