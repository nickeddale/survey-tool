import hashlib
import secrets
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_key import ApiKey

API_KEY_PREFIX = "svt_"
API_KEY_HEX_LENGTH = 40  # 40 random hex chars after prefix


def generate_api_key() -> str:
    """Generate a new API key: svt_ + 40 random hex chars."""
    return API_KEY_PREFIX + secrets.token_hex(API_KEY_HEX_LENGTH // 2)


def hash_api_key(key: str) -> str:
    """SHA-256 hash of the API key for storage."""
    return hashlib.sha256(key.encode()).hexdigest()


async def create_api_key(
    session: AsyncSession,
    user_id: uuid.UUID,
    name: str,
    scopes: list[str] | None = None,
    expires_at: datetime | None = None,
) -> tuple[ApiKey, str]:
    """Create a new API key. Returns (record, full_key). Full key is only available here."""
    raw_key = generate_api_key()
    key_hash = hash_api_key(raw_key)
    key_prefix = raw_key[: len(API_KEY_PREFIX) + 4]  # "svt_" + first 4 hex chars

    record = ApiKey(
        user_id=user_id,
        name=name,
        key_hash=key_hash,
        key_prefix=key_prefix,
        scopes=scopes,
        expires_at=expires_at,
    )
    session.add(record)
    await session.flush()
    await session.refresh(record)
    return record, raw_key


async def list_api_keys_for_user(
    session: AsyncSession, user_id: uuid.UUID
) -> list[ApiKey]:
    """List all API keys belonging to a user."""
    result = await session.execute(
        select(ApiKey).where(ApiKey.user_id == user_id).order_by(ApiKey.created_at)
    )
    return list(result.scalars().all())


async def get_api_key_by_hash(
    session: AsyncSession, key_hash: str
) -> ApiKey | None:
    """Look up an API key record by its hash."""
    result = await session.execute(
        select(ApiKey).where(ApiKey.key_hash == key_hash)
    )
    return result.scalar_one_or_none()


async def revoke_api_key(
    session: AsyncSession, record: ApiKey
) -> None:
    """Mark an API key as inactive (revoked)."""
    record.is_active = False
    session.add(record)
    await session.flush()


async def update_last_used(
    session: AsyncSession, record: ApiKey
) -> None:
    """Update last_used_at to now."""
    record.last_used_at = datetime.now(timezone.utc)
    session.add(record)
    await session.flush()
