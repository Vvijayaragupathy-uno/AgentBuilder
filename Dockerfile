# Multi-stage: Langflow Vite build → Python image with AICCORE + bundled SPA.
# Langflow **Python** backend is installed from this repo (src/lfx + src/backend/base),
# not from PyPI — so edits to vendored Langflow/lfx code ship in the image.
# Matches Railway “one service” (Langflow UI + API + AICCORE). Backend-only deploys
# can set AICCORE_BACKEND_ONLY=true (SPA files stay in image but are not mounted).
#
# Railway: do not set PYTHONPATH=. on the service — it overrides this image and can
# break `import aiccore`. CMD below forces PYTHONPATH=/app at runtime.
# ─────────────────────────────────────────────────────────────────────────────
# Chainguard Node dev (Wolfi): Docker Scout/DX flags many highs on docker.io/library/node:*-alpine; this tag stays lean in the same scanner.
FROM cgr.dev/chainguard/node:22.22.1-dev AS langflow_frontend_build

USER root

WORKDIR /frontend

COPY langflow/src/frontend/package.json /frontend/package.json
COPY langflow/src/frontend/package-lock.json /frontend/package-lock.json
COPY langflow/src/frontend/tsconfig.json /frontend/tsconfig.json
COPY langflow/src/frontend/vite.config.mts /frontend/vite.config.mts
COPY langflow/src/frontend/index.html /frontend/index.html
COPY langflow/src/frontend/tailwind.config.mjs /frontend/tailwind.config.mjs
COPY langflow/src/frontend/postcss.config.js /frontend/postcss.config.js
RUN npm ci

COPY langflow/src/frontend/src /frontend/src
COPY langflow/src/frontend/public /frontend/public
# Same-origin API (baseURL "" in customization); no BACKEND_URL needed for Railway single host
RUN npm run build
# 3.12.x bookworm: Docker DX flags a high CVE on python:3.11-slim* in this environment; 3.12.13-slim-bookworm does not.
FROM python:3.12.13-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
ENV AICCORE_BACKEND_ONLY=false
ENV AICCORE_LANGFLOW_FRONTEND_DIR=/app/langflow-frontend
ENV LANGFLOW_AUTO_LOGIN=true
ENV LANGFLOW_SKIP_AUTH_AUTO_LOGIN=true

WORKDIR /app

RUN apt-get update && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
        libpq-dev \
        build-essential \
        curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir --upgrade pip

# Vendored Langflow backend (matches your monorepo; overrides any PyPI langflow-base)
COPY langflow/src/lfx /app/_vendor/lfx
COPY langflow/src/backend/base /app/_vendor/langflow-base
RUN pip install --no-cache-dir /app/_vendor/lfx && \
    pip install --no-cache-dir /app/_vendor/langflow-base

COPY aiccore /app/aiccore
COPY requirements.txt /app/requirements.txt
COPY --from=langflow_frontend_build /frontend/build /app/langflow-frontend

RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 7860

# Force PYTHONPATH so Railway dashboard vars like PYTHONPATH=. cannot break imports
CMD ["sh", "-c", "PYTHONPATH=/app python -m uvicorn aiccore.wrapper.main:app --host 0.0.0.0 --port ${PORT:-7860} --workers 1"]
