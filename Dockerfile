# ─────────────────────────────────────────────────────────────────────────────
# python:3.11-slim + langflow-base (backend only, no bundled frontend)
#
# Why NOT langflow==1.8.0?  → Full package bundles the compiled JS frontend
#                             making the image 4GB+ (Railway limit is 4GB)
# Why langflow-base==0.8.0? → Backend only, provides langflow.main.setup_app,
#                             already includes lfx as a dependency, ~1.5GB image
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
# Run backend-only mode (no frontend to serve)
ENV AICCORE_BACKEND_ONLY=true

WORKDIR /app

# System deps for psycopg2 (libpq) and compiling native extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq-dev \
        build-essential \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Step 1: Install langflow-base (backend only — includes lfx as a dependency)
# This provides: langflow.main.setup_app
# This does NOT include: the compiled JS frontend (saves ~2.5GB)
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir "langflow-base==0.8.0"

# Step 2: Copy AICCORE application code + requirements
COPY aiccore /app/aiccore
COPY requirements.txt /app/requirements.txt

# Step 3: Install remaining app-specific dependencies
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 7860

# Use sh -c so Railway's $PORT env var gets expanded by the shell
CMD ["sh", "-c", "uvicorn aiccore.wrapper.main:app --host 0.0.0.0 --port ${PORT:-7860} --workers 4"]
