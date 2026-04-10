"""Pytest fixtures for the test suite."""

import os

# Set ENVIRONMENT=test before any app modules are imported so the Settings
# model_validator does not reject the default JWT secret during test runs.
os.environ.setdefault("ENVIRONMENT", "test")

# Disable Secure flag on cookies in tests — httpx test transport uses http://test
# (not HTTPS), so Secure cookies would be silently dropped and never forwarded.
os.environ.setdefault("COOKIE_SECURE", "false")

# Use the minimum bcrypt cost factor in tests to keep hashing fast.
# bcrypt at rounds=4 is ~100x faster than rounds=12, reducing per-test
# overhead for any test that calls register or login.
os.environ.setdefault("BCRYPT_ROUNDS", "4")

# Force the asyncpg scheme in DATABASE_URL before any app modules are imported.
# The container environment sets the psycopg2 scheme by default which fails with
# the async SQLAlchemy engine at module-import time (app/database.py validates).
_env_url = os.environ.get("DATABASE_URL", "")
if _env_url.startswith("postgresql://"):
    os.environ["DATABASE_URL"] = _env_url.replace(
        "postgresql://", "postgresql+asyncpg://", 1
    )
elif not _env_url:
    os.environ["DATABASE_URL"] = (
        "postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker"
    )

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
import app.database as app_database
from app.database import Base, get_db
from app.limiter import limiter
from app.main import app

TEST_DATABASE_URL = settings.database_url


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Reset the slowapi in-memory limiter state before each test to prevent pollution."""
    limiter.reset()
    yield
    limiter.reset()


@pytest_asyncio.fixture(scope="function")
async def engine():
    _engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with _engine.begin() as conn:
        await conn.exec_driver_sql(
            "DO $$ BEGIN"
            " IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'survey_status') THEN"
            " CREATE TYPE survey_status AS ENUM ('draft', 'active', 'closed', 'archived');"
            " END IF; END $$"
        )
        await conn.exec_driver_sql(
            "DO $$ BEGIN"
            " IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quota_action') THEN"
            " CREATE TYPE quota_action AS ENUM ('terminate', 'hide_question');"
            " END IF; END $$"
        )
        await conn.exec_driver_sql(
            "DO $$ BEGIN"
            " IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assessment_scope') THEN"
            " CREATE TYPE assessment_scope AS ENUM ('total', 'group');"
            " END IF; END $$"
        )
        await conn.exec_driver_sql(
            "DO $$ BEGIN"
            " IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'response_status') THEN"
            " CREATE TYPE response_status AS ENUM ('incomplete', 'complete', 'disqualified');"
            " END IF; END $$"
        )
        await conn.run_sync(Base.metadata.create_all)
    yield _engine
    # Dispose the app-level engine so its idle pooled connections are closed
    # before we attempt DDL (DROP TABLE requires exclusive locks, which are
    # blocked by open idle connections from app.database.engine).
    await app_database.engine.dispose()
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.exec_driver_sql("DROP TYPE IF EXISTS response_status")
        await conn.exec_driver_sql("DROP TYPE IF EXISTS assessment_scope")
        await conn.exec_driver_sql("DROP TYPE IF EXISTS quota_action")
        await conn.exec_driver_sql("DROP TYPE IF EXISTS survey_status")
    await _engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def session(engine):
    """Provide a session for direct DB assertions in tests."""
    async_session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    async with async_session_factory() as sess:
        yield sess


@pytest_asyncio.fixture(scope="function")
async def client(engine):
    """Provide an AsyncClient with the app's get_db overridden to use the test engine."""
    async_session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async def override_get_db():
        async with async_session_factory() as sess:
            try:
                yield sess
                await sess.commit()
            except Exception:
                await sess.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()
