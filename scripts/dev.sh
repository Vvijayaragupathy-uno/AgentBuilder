#!/usr/bin/env bash
# dev.sh — Start the full AICCORE development environment
# Usage (from project root):
#   ./scripts/dev.sh          — full mode (Langflow UI + AICCORE API)
#   ./scripts/dev.sh --api    — API only (faster, no Langflow UI)

set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="$ROOT/langflow/.venv/Scripts/python.exe"
FRONTEND_BUILD="$ROOT/langflow/src/frontend/build"

export PYTHONUTF8=1
export LANGFLOW_SKIP_AUTOGENERATE_CHECK=1
export AICCORE_ADMIN_PASS=aiccore2026

# ── Mode ──────────────────────────────────────────────────────────────────────
if [[ "$1" == "--api" ]]; then
  echo "Starting in API-only mode (no Langflow UI)..."
  AICCORE_BACKEND_ONLY=true "$VENV" -m uvicorn aiccore.wrapper.main:app \
    --host 0.0.0.0 --port 7860
else
  if [[ ! -d "$FRONTEND_BUILD" ]]; then
    echo "Langflow frontend not built yet. Run:"
    echo "  cd langflow/src/frontend && npm install && npm run build"
    echo ""
    echo "Or start in API-only mode with: ./scripts/dev.sh --api"
    exit 1
  fi
  echo "Starting in full mode (Langflow UI + AICCORE API)..."
  AICCORE_LANGFLOW_FRONTEND_DIR="$FRONTEND_BUILD" \
    "$VENV" -m uvicorn aiccore.wrapper.main:app \
    --host 0.0.0.0 --port 7860
fi
