"""Tests for Settings validation in app/config.py."""

import pytest
from pydantic import ValidationError

from app.config import Settings


def _make(**kwargs) -> Settings:
    """Instantiate Settings with explicit values, bypassing env files."""
    # _env_file=None prevents pydantic-settings from loading .env
    return Settings.model_validate(
        kwargs,
        context={"_env_file": None},
    )


class TestJwtSecretValidator:
    def test_default_secret_rejected_in_production(self):
        with pytest.raises(ValidationError) as exc_info:
            Settings(
                jwt_secret="change-me-in-production",
                environment="production",
                _env_file=None,
            )
        assert "insecure default" in str(exc_info.value).lower() or "change-me-in-production" in str(exc_info.value)

    def test_default_secret_accepted_in_test(self):
        s = Settings(
            jwt_secret="change-me-in-production",
            environment="test",
            _env_file=None,
        )
        assert s.jwt_secret == "change-me-in-production"

    def test_default_secret_accepted_in_development(self):
        s = Settings(
            jwt_secret="change-me-in-production",
            environment="development",
            _env_file=None,
        )
        assert s.jwt_secret == "change-me-in-production"

    def test_strong_secret_accepted_in_production(self):
        s = Settings(
            jwt_secret="super-secret-key-that-is-long-and-random",
            environment="production",
            _env_file=None,
        )
        assert s.jwt_secret == "super-secret-key-that-is-long-and-random"

    def test_error_message_is_clear(self):
        with pytest.raises(ValidationError) as exc_info:
            Settings(
                jwt_secret="change-me-in-production",
                environment="production",
                _env_file=None,
            )
        error_text = str(exc_info.value)
        assert "JWT_SECRET" in error_text or "jwt_secret" in error_text.lower()
