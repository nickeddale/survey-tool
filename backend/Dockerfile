# Stage 1: builder — installs build tools and compiles all dependencies
FROM python:3.12-slim AS builder

WORKDIR /app

# Install build-time system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy project definition and source for installation
COPY pyproject.toml ./
COPY . .

# Install production dependencies only (non-editable, no [dev])
RUN pip install --no-cache-dir .

# Stage 2: dev — extends builder with dev dependencies for local development and CI
FROM builder AS dev

# Install dev dependencies on top of prod deps
RUN pip install --no-cache-dir ".[dev]"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# Stage 3: prod — lean production image with no dev tools
FROM python:3.12-slim AS prod

WORKDIR /app

# Install only runtime system libraries (not build headers)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed site-packages from builder (prod deps only, no dev extras)
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages

# Copy gunicorn and uvicorn entry points from builder
COPY --from=builder /usr/local/bin/gunicorn /usr/local/bin/gunicorn
COPY --from=builder /usr/local/bin/uvicorn /usr/local/bin/uvicorn

# Copy application source
COPY . .

EXPOSE 8000

CMD ["gunicorn", "app.main:app", "--config", "gunicorn.conf.py"]
