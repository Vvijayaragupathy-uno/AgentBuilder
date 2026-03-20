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

## Railway / production URLs (`getApiBase()`)

The dashboard calls AICCORE REST + WebSocket via **`getApiBase()`** in `museum-arena-dashboard/lib/utils.ts`:

1. **`NEXT_PUBLIC_AICCORE_API_URL`** (recommended on Railway)  
   Set this to the **public HTTPS URL of the Langflow wrapper** service (the same app you run with `uvicorn … --port 7860` locally).  
   Example: `https://your-aiccore-api.up.railway.app`  
   **No `:7860` in production** — Railway terminates TLS on 443; the platform maps that to your container port.

2. **If that variable is not set** and the user is **not** on `localhost`, the code falls back to  
   `https://<current-dashboard-hostname>`  
   That only works if the **Next.js dashboard and the Python API share the same hostname** (single service / reverse proxy).  
   If the dashboard and API are **two Railway services** with **different** public URLs, you **must** set `NEXT_PUBLIC_AICCORE_API_URL` or API calls and WebSockets will hit the wrong host.

3. **Builder iframe (`getLangflowUrl()`)**  
   Set **`NEXT_PUBLIC_LANGFLOW_URL`** to the same wrapper URL as above when the embedded builder should load that host (often identical to `NEXT_PUBLIC_AICCORE_API_URL`).

**Summary:** Railway is “fixed” when you define **`NEXT_PUBLIC_AICCORE_API_URL`** (and usually **`NEXT_PUBLIC_LANGFLOW_URL`**) to your deployed backend. The `:7860` example is **local dev only**, not Railway’s public URL.

### Same-origin proxy (fixes cross-origin cookies for embedded Langflow)

When the **Next.js dashboard** and **Langflow+AICCORE** are on **different** public URLs, the browser may not send `aiccore_session_id` to the API. Use a **rewrite** so the browser only talks to the dashboard host:

1. **Server env** (not exposed to browser): `AICCORE_UPSTREAM_URL=https://your-backend.up.railway.app`  
   (Or rely on `NEXT_PUBLIC_AICCORE_API_URL` for the same value — `next.config.mjs` uses either for rewrites.)

2. **Client env** (build-time): `NEXT_PUBLIC_AICCORE_PROXY_PREFIX=/aiccore-api`

Then `getApiBase()` and `getLangflowUrl()` become `https://your-dashboard.up.railway.app/aiccore-api`, and Next rewrites that to the real backend. **No mixed-origin** → cookies and session work reliably.

**WebSockets** use the same prefix, e.g. `wss://your-dashboard/aiccore-api/api/v1/aiccore/ws`. If your host does not proxy WS upgrades, use the backend URL directly (no `NEXT_PUBLIC_AICCORE_PROXY_PREFIX`) for that deployment.

### SQLite dev DB

If an old `aiccore.db` still has `participant.unlock_code` **NOT NULL**, startup runs a **one-time table rebuild** so NULL is allowed after OTP consume. New databases get the correct schema from `create_all`.

### Server clock

`GET /api/v1/aiccore/system/status` includes **`server_time`** (UTC ISO). The TV and builder apply a skew so countdowns match the server even if the device clock is wrong.

### Unlock + challenge

- Optional: **`/builder?challenge_id=<uuid>`** — sent on unlock so the session binds to that challenge (must already be registered).  
- **`?mode=auto`** on the TV (or remove `mode`) restores automatic attract/live/results. Forced demo modes still use `?mode=live` etc.; use **“Auto TV mode”** on screen to clear.

### Concurrent Langflow

If **more than one** active AICCORE session exists, **global Langflow purge is skipped**; only **restore/merge** runs so other laptops are not wiped. For a totally clean workspace per seat, run **separate Langflow instances** (or accept shared flow list until submit).

**This is not “automatic separate DB per station” in one deployment** — that’s an ops choice (multiple services/DBs). See **`docs/STATION_ISOLATION.md`**.

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
