"""Gunicorn configuration for production deployment.

This file is loaded by gunicorn before the FastAPI application initialises, so
app.config.settings is not yet available. NUM_WORKERS is therefore read directly
from the environment here — this is an intentional exception to the project
convention of using the pydantic-settings Settings singleton for all config.
"""

import os
from multiprocessing import cpu_count

# ---------------------------------------------------------------------------
# Worker count
# ---------------------------------------------------------------------------
# The traditional 2*cores+1 formula targets sync workers that block on I/O.
# For async uvicorn workers handling I/O-bound work, a more conservative
# default avoids memory pressure while still saturating available cores.
# Operators can override at runtime via the NUM_WORKERS environment variable.
_default_workers = min(4, 2 * cpu_count() + 1)
workers = int(os.environ.get("NUM_WORKERS", _default_workers))

# ---------------------------------------------------------------------------
# Worker class
# ---------------------------------------------------------------------------
worker_class = "uvicorn.workers.UvicornWorker"

# ---------------------------------------------------------------------------
# Bind
# ---------------------------------------------------------------------------
bind = "0.0.0.0:8000"

# ---------------------------------------------------------------------------
# Timeouts
# ---------------------------------------------------------------------------
# Worker timeout in seconds. A worker that does not respond within this window
# is killed and replaced. The default (30 s) is usually too short for cold
# database queries during startup; 120 s gives headroom without hiding hangs.
timeout = 120

# Keep-alive connections reduce TCP overhead for clients that issue many
# sequential requests (e.g. the frontend SPA).
keepalive = 5

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
accesslog = "-"   # stdout
errorlog = "-"    # stderr
loglevel = os.environ.get("LOG_LEVEL", "info").lower()
