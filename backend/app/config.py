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

    @model_validator(mode="after")
    def default_cookie_secure_off_in_non_production(self) -> "Settings":
        """Set cookie_secure=False in development/test unless explicitly overridden.

        Browsers silently reject Secure cookies over plain HTTP (localhost:3000),
        so the default of True would break token refresh in local development.
        An explicit COOKIE_SECURE env var always takes precedence.
        """
        if self.environment in _NON_PRODUCTION_ENVS and "cookie_secure" not in self.model_fields_set:
            self.cookie_secure = False
        return self

    # CORS (comma-separated list of allowed origins)
    cors_origins: str = "http://localhost:3000"

    # Refresh token cookie settings
    refresh_token_cookie_name: str = "refresh_token"
    cookie_secure: bool = True
    cookie_samesite: str = "strict"

    # bcrypt password hashing cost factor.
    # Default 12 is appropriate for production. Use 4 in test environments to
    # keep the test suite fast (bcrypt at rounds=4 is ~100x faster than rounds=12).
    bcrypt_rounds: int = 12

    # Worker processes
    # Number of gunicorn worker processes. Defaults to min(4, 2*cores+1) via
    # gunicorn.conf.py. This setting is exported here so application code can
    # read it if needed, but the authoritative value at startup is consumed by
    # gunicorn.conf.py (which reads NUM_WORKERS from os.environ directly,
    # before the FastAPI app is initialised — intentional exception to the
    # pydantic-settings convention).
    num_workers: int = 4

    # Logging
    log_level: str = "INFO"

    # SMTP / Email
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "Survey Tool"
    smtp_use_tls: bool = True
    smtp_enabled: bool = False

    # Frontend
    frontend_url: str = "http://localhost:3000"

    # Backend (used for email tracking pixel and click-through URLs)
    backend_url: str = "http://localhost:8000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
