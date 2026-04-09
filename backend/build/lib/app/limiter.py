"""Shared slowapi Limiter instance used across the application."""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

RATE_LIMITS = {
    "auth_register": "5/minute",
    "auth_login": "10/minute",
    "auth_refresh": "10/minute",
    "response_submit": "30/minute",
    "default_mutating": "60/minute",
    "default_read": "120/minute",
}
