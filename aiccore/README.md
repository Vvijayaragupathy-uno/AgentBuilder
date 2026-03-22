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

**Backend CORS (builder / Langflow service):** The wrapper allows localhost plus **every `RAILWAY_SERVICE_*_URL`** Railway injects for linked services (dashboard, builder, etc.), normalized to `https://…` origins. Add **`AICCORE_ALLOWED_ORIGINS`** (comma-separated hostnames or full URLs) for **custom domains** or hosts not exposed as service-reference variables. Without a matching `Origin`, the browser blocks API calls and the embedded builder breaks.

**Railway variables:** Remove **`PYTHONPATH=.`** from the builder service if you set it manually — it overrides the image and can break `import aiccore`. The Docker **`CMD`** forces `PYTHONPATH=/app` at runtime; leaving `PYTHONPATH=.` in the dashboard still overrides Docker `ENV` on some platforms, so delete it on the **AgentBuilder** service. Root **`Dockerfile`** is a multi-stage build that copies the Langflow Vite bundle to **`/app/langflow-frontend`** so `AICCORE_LANGFLOW_FRONTEND_DIR=/app/langflow-frontend` matches the image (avoids missing chunks / “import failed” in the Langflow SPA).

### Railway: one PostgreSQL database, two schemas (recommended)

AICCORE uses schema **`aiccore`**; Langflow’s Alembic migrations target **`public`**. Add **one** Postgres plugin, link it to the wrapper service so **`DATABASE_URL`** is set. Both stacks use the **same** connection string; isolation is by schema, not by server.

1. **New** → **Database** → **PostgreSQL** (one instance).
2. Link it to **AgentBuilder**; Railway injects **`DATABASE_URL`**.
3. **Optional:** set **`LANGFLOW_DATABASE_URL`** and **`AICCORE_DATABASE_URL`** to references of that same **`DATABASE_URL`**. If **`LANGFLOW_DATABASE_URL`** is unset, the wrapper copies **`DATABASE_URL`** at startup.
4. AICCORE reads **`AICCORE_DATABASE_URL`**, then **`DATABASE_URL`**, then SQLite locally.

**Safety:** AICCORE **does not** drop `public` unless **`AICCORE_NUCLEAR_RESET_PUBLIC=true`**. That flag also drops schema **`aiccore`** (participants, sessions, challenges). Leave it **unset/false** in production after a one-time cleanup — otherwise **every deploy wipes** Langflow and arena data.

**Two separate Postgres services** are still supported if you want instance-level isolation — use different URLs for **`LANGFLOW_DATABASE_URL`** and **`AICCORE_DATABASE_URL`**.

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

### Builder: Langflow shows “Couldn’t establish a connection”

That message comes from the **embedded Langflow UI** when its HTTP or WebSocket calls to the API fail (network error, wrong host, CORS/mixed content, or backend down). Checklist:

1. **Wrapper is running** — `uvicorn aiccore.wrapper.main:app` reachable at the URL you configured.
2. **`NEXT_PUBLIC_AICCORE_API_URL`** points at that **same** public URL (HTTPS in production; no stray `:7860` on Railway unless you really expose that port).
3. **Iframe origin matches API origin** — either set **`NEXT_PUBLIC_LANGFLOW_URL`** to the same value as the API URL, or use **`NEXT_PUBLIC_AICCORE_PROXY_PREFIX=/aiccore-api`** with **`AICCORE_UPSTREAM_URL`** (or `NEXT_PUBLIC_AICCORE_API_URL`) so both `getApiBase()` and `getLangflowUrl()` use the dashboard host + rewrite.
4. **HTTPS parent + HTTP iframe** — avoid embedding `http://…` Langflow inside an `https://` dashboard; the browser may block or behave inconsistently. Use HTTPS for both or same-origin proxy.
5. In DevTools **Network**, confirm requests from the iframe (e.g. `/api/v1/…`) return **200**, not failed/CORS.

### SQLite dev DB

If an old `aiccore.db` still has `participant.unlock_code` **NOT NULL**, startup runs a **one-time table rebuild** so NULL is allowed after OTP consume. New databases get the correct schema from `create_all`.

### Server clock

`GET /api/v1/aiccore/system/status` includes **`server_time`** (UTC ISO), **`active_challenge_id`**, **`mission_build_window_open`**, and **`mission_build_ends_at`** (UTC ISO end instant = mission `start_time` + `duration_minutes` when both are set). The **builder** and **TV live** countdown use that end instant when it matches the displayed mission so both stay aligned with the server. Only one challenge may be **`is_active`** at a time: activating one in the admin toggle deactivates the others; any duplicate actives are also trimmed when **`system/status`** runs.

### Session-bound `POST /api/v1/aiccore/session/{session_id}/submit`

That route requires a valid signed **`aiccore_session_token`** cookie (set on unlock) **or** the **`X-AICCORE-Session-Token`** header, and the path **`session_id`** must match. The browser builder sends headers plus cookies. **Custom clients** must send the token header for that session UUID; otherwise they get **403**.

**Langflow iframe:** The builder loads Langflow with **`?session_id=<uuid>`** on the iframe URL so middleware can attach the seat even when the iframe request does not carry cookies. Prefer **`NEXT_PUBLIC_AICCORE_PROXY_PREFIX`** (same-origin proxy) when possible so cookies and API calls stay aligned.

### After you change code

| What you changed | What to do |
|------------------|------------|
| **`aiccore/wrapper/main.py`**, **`aiccore/backend/*.py`**, etc. | **Restart the uvicorn process** (stop/start `python -m uvicorn …`, or redeploy the backend container). Hot reload only applies if you run uvicorn with `--reload`. |
| **Dashboard** (`museum-arena-dashboard` TS/TSX) | **`npm run dev`**: saves usually hot-reload. **Production build**: run `npm run build` / redeploy; users may need a **hard refresh** if assets are cached. |

Until the Python server restarts, it is still running the **old** in-memory code and routes.

### Unlock + challenge

- Optional: **`/builder?challenge_id=<uuid>`** — sent on unlock so the session binds to that challenge (must already be registered).  
- **`?mode=auto`** on the TV (or remove `mode`) restores automatic attract/live/results. Forced demo modes still use `?mode=live` etc.; use **“Auto TV mode”** on screen to clear.

### TV demo queue vs mission timer

- **Per-presenter slot** (how long one person’s flow is on the big screen): **`AICCORE_DEMO_SEGMENT_SECONDS`** env on the Python server (default **90 seconds**, clamped 15–3600 in code). When it expires, the backend advances to the next queue entry or back to mosaic (`cursor` −1). There is **no builder “I’m done”** button — early handoff is **facilitator-only** via dashboard **Advance presenter on TV** (`POST /api/v1/aiccore/demo/next`, requires admin cookie).
- **Mission / build window** (shared challenge countdown): **independent** — it can still run while demos play. The TV live header shows **demo slot** time prominently during full-screen demo, with the mission clock as secondary text. **End the whole run:** deactivate the challenge in admin, **`POST /api/v1/aiccore/system/finalize`** (locks arena + ends active missions), or wait for mission time + submissions per your rules.
- **Mosaic during demo:** Hidden while **`presenting`** (full-screen iframe). If you still see the grid, you are in **queue / between** segments (`gate_open` but no current presenter), not in active full-screen playback.

### Concurrent Langflow (one Langflow DB, many seats)

Each AICCORE unlock creates a dedicated Langflow **folder** (`Arena <sessionprefix>`) stored on `aiccore.session.langflow_workspace_folder_id`. **Purge is scoped** to that folder tree (so seat A does not wipe seat B). **New flows** default into that folder. **Middleware** filters `GET /api/v1/flows` and `GET /api/v1/projects` so the browser only lists flows/projects under that seat’s folder plus the normal **Starter Project** / **Starter Projects** trees (templates).

**TV mosaic:** The backend prefers each session’s own **`flow_saved`** events for the mosaic snapshot. If there is no `flow_saved` yet, it may fall back to a **workspace_snapshot** (shared DB); starter-template folders are skipped when picking a fallback flow so the grid is less likely to show a generic template instead of a builder canvas.

**Separate Langflow instances per seat** are still optional for hard isolation at the DB file level; this folder + middleware model is the default single-service deployment.

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
