from collections.abc import AsyncGenerator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# Validate that the database URL uses the asyncpg scheme
if not settings.database_url.startswith("postgresql+asyncpg://"):
    raise ValueError(
        "DATABASE_URL must use the 'postgresql+asyncpg://' scheme. "
        f"Got: {settings.database_url!r}"
    )

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=20,
    max_overflow=10,
    pool_timeout=30,
    isolation_level="READ COMMITTED",
)


@event.listens_for(engine.sync_engine, "checkout")
def _set_idle_in_transaction_timeout(dbapi_conn, conn_record, conn_proxy):
    """Set idle_in_transaction_session_timeout on every connection checkout.

    This ensures any connection that sits idle-in-transaction for more than
    30 seconds is automatically terminated by PostgreSQL, preventing pool
    exhaustion from leaked transactions.
    """
    cursor = dbapi_conn.cursor()
    cursor.execute("SET idle_in_transaction_session_timeout = '30000'")
    cursor.close()


async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
