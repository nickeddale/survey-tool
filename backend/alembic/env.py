import asyncio
from logging.config import fileConfig

from alembic import context

from app.config import settings
from app.database import Base, engine

# Alembic Config object — provides access to .ini file values
config = context.config

# Set up Python logging from the alembic.ini [loggers] section
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Override the sqlalchemy.url with the value from app.config so that
# alembic always uses the same URL as the application, regardless of
# what is written in alembic.ini.
config.set_main_option("sqlalchemy.url", settings.database_url)

# Import all models here so that Base.metadata is populated for autogenerate.
# Add new model imports below as they are created in future tasks.
from app.models.user import User  # noqa: F401
from app.models.refresh_token import RefreshToken  # noqa: F401
from app.models.api_key import ApiKey  # noqa: F401
from app.models.survey import Survey  # noqa: F401
from app.models.question_group import QuestionGroup  # noqa: F401
from app.models.question import Question  # noqa: F401
from app.models.answer_option import AnswerOption  # noqa: F401
from app.models.participant import Participant  # noqa: F401
from app.models.response import Response  # noqa: F401
from app.models.response_answer import ResponseAnswer  # noqa: F401
from app.models.quota import Quota  # noqa: F401
from app.models.assessment import Assessment  # noqa: F401

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    In offline mode Alembic emits SQL to stdout rather than executing
    against a live database.  The async engine is not needed here.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations against the live database using the async engine."""
    async with engine.begin() as conn:
        await conn.run_sync(do_run_migrations)

    await engine.dispose()


def run_migrations_online() -> None:
    """Entry point for online (live database) migration mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
