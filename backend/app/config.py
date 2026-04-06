from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_JWT_SECRET = "change-me-in-production"
_NON_PRODUCTION_ENVS = {"development", "test"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Database
    database_url: str = "postgresql+asyncpg://survey:survey@localhost:5432/survey"

    @field_validator("database_url", mode="before")
    @classmethod
    def ensure_asyncpg_scheme(cls, v: str) -> str:
        """Normalize plain postgresql:// to postgresql+asyncpg:// for async engine."""
        if isinstance(v, str) and v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    # JWT
    jwt_secret: str = _DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    jwt_expiry_mins: int = 60

    # Environment
    environment: str = "production"

    @model_validator(mode="after")
    def reject_default_jwt_secret_in_production(self) -> "Settings":
        if self.jwt_secret == _DEFAULT_JWT_SECRET and self.environment not in _NON_PRODUCTION_ENVS:
            raise ValueError(
                "JWT_SECRET is set to the insecure default 'change-me-in-production'. "
                "Set a strong secret via the JWT_SECRET environment variable before starting "
                "the application in production."
            )
        return self

    # CORS (comma-separated list of allowed origins)
    cors_origins: str = "http://localhost:3000"

    # Logging
    log_level: str = "INFO"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
