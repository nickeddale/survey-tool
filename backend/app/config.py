from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiry_mins: int = 60

    # CORS (comma-separated list of allowed origins)
    cors_origins: str = "http://localhost:3000"

    # Logging
    log_level: str = "INFO"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
