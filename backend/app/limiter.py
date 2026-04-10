"""Shared slowapi Limiter instance used across the application.

IMPORTANT — per-process rate limiting:
slowapi uses in-memory storage by default. When the application runs under
gunicorn with N worker processes, each process maintains its own independent
counter. This means a single IP address can effectively make N × rate_limit
requests before any worker blocks it.

For development and low-traffic deployments this trade-off is acceptable.
For strict global rate limiting in production, replace the default in-memory
backend with a Redis backend:

    from slowapi import Limiter
    from slowapi.util import get_remote_address
    limiter = Limiter(key_func=get_remote_address, storage_uri="redis://localhost:6379")
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

RATE_LIMITS = {
    "auth_register": "3/minute",
    "auth_login": "5/minute",
    "auth_refresh": "10/minute",
    "response_submit": "30/minute",
    "default_mutating": "60/minute",
    "default_read": "120/minute",
}
