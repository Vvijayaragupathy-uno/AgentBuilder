# AICCORE Museum Agent Arena

This project is a gamified AI agent-building experience designed for museum environments. It wraps Langflow to provide real-time telemetry, session management, and a competitive arena dashboard.

## Project Structure
- `aiccore/wrapper/`: Python wrapper for Langflow (Backend & Interactions).
- `aiccore/backend/`: AICCORE-specific logic, models, and database (`aiccore.db`).
- `aiccore/dashboard/`: Next.js-based spectator and admin dashboard.

---

## Getting Started

### 1. Start the AICCORE Wrapper (Backend + Langflow UI)

The wrapper manages the AI builder stations and captures student telemetry.

**Commands:**
```bash
# Navigate to the project root
export PYTHONPATH=$PYTHONPATH:$(pwd)/langflow/src/backend/base

# To start with full Langflow UI enabled (Recommended for stations)
./langflow/.venv/bin/python3 -m uvicorn aiccore.wrapper.main:app --host 0.0.0.0 --port 7860

# To start in backend-only mode (Fast/Headless for testing)
AICCORE_BACKEND_ONLY=true ./langflow/.venv/bin/python3 -m uvicorn aiccore.wrapper.main:app --host 0.0.0.0 --port 7860
```

### 2. Start the Museum Dashboard (Leaderboard & Admin)

The dashboard displays the live arena and allows staff to review and pick winners.

**Commands:**
```bash
cd aiccore/dashboard/museum-arena-dashboard
npm install  # (First time only)
npm run dev
```
Accessible at: `http://localhost:3000`

---

## Configuration & Competition Flow

### Student Stations
1. Use the Langflow UI at `http://<ip>:7860`.
2. Ensure you have started a valid AICCORE session via the API or a frontend wrapper (Phase 1/2 feature).

### Competition Features
- **Live Leaderboard**: Displays stations, building progress, and scores.
- **Admin Review**: Found in the dashboard; allows curators to "Publish Winner" for a round.
- **Telemetry**: All node movements and flow runs are logged to `aiccore.db` for later replay/analysis.

---

## Technical Details
- **Engine**: Langflow v1.x (Upstream compatible).
- **Database**: SQLite (`aiccore.db`) – Independent schema for session data.
- **CORS**: Enabled by default to support local LAN dashboard connections.
