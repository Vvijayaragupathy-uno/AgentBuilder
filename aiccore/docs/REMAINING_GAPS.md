# AICCORE audit — goals vs remaining work

## Goals covered in code (recent work)

| Area | Status |
|------|--------|
| User register / unlock / OTP / per-laptop `station_id` | Done |
| Arena lock in DB, finalize, challenge defaults, submit guards | Done |
| Review approve + score API, TV results poll, mosaic no 9-cap | Done |
| Server clock skew (`server_time` + `skewedNow`) on builder + TV | Done |
| TV forced mode escape + `mode=auto` | Done |
| Unlock optional `challenge_id` + `/builder?challenge_id=` | Done |
| Concurrent builders: skip global Langflow purge, merge restore | Done |
| Same-origin proxy option (`/aiccore-api` + env vars) | Done |
| WebSocket prune on send failure | Done |
| Event `sequence_number` lock shared: **middleware + eraser + `POST /submit`** (`event_lock.py`) | Done |
| Full lifecycle checklist | See **`docs/E2E_LIFECYCLE_AUDIT.md`** |

## Optional / product (not required for basic museum run)

| Item | Notes |
|------|--------|
| **Review UI for score** | **Done** — number input + Save calls `PATCH .../submissions/{id}/score`. |
| **True Langflow isolation** | One DB per seat = **ops** (multiple deployments). See `STATION_ISOLATION.md`. |
| **Multi-user Langflow** | Per-participant LF users + scoped purge = **large** auth/product project. |
| **Leaderboard without active session** | **Done** — latest `Submission` per user sets `SUBMITTED`, score, winner, mission, station. |
| **Cloud sync dedupe by station** | `sync.py` drops duplicate `station_id` in payload — intentional for that hub; not the TV mosaic. |

## Config / ops checklist

- [ ] `NEXT_PUBLIC_AICCORE_API_URL` or **proxy**: `AICCORE_UPSTREAM_URL` + `NEXT_PUBLIC_AICCORE_PROXY_PREFIX=/aiccore-api`
- [ ] `NEXT_PUBLIC_LANGFLOW_URL` if UI is not on same host as API (local Vite → set explicitly)
- [ ] WebSocket via Next rewrite: verify on your host (some setups need direct API URL for `wss:`)
- [ ] Postgres prod: migrations run on startup; SQLite auto-rebuilds `participant` if `unlock_code` was NOT NULL (see `database.py`)

## Code quality

- `next.config.mjs` uses `ignoreBuildErrors: false` — run `npm run build` before deploy.

## SQLite old DB (`unlock_code` NOT NULL)

- On startup, if `participant.unlock_code` is still **NOT NULL**, AICCORE **rebuilds** the SQLite `participant` table so `unlock_code` can be **NULL** (consumed OTP). Log: `migrating participant.unlock_code to nullable`.

## Lint / grep

- No `TODO`/`FIXME` in `aiccore/` `.py`/`.tsx` from last scan; run `npm run build` locally to catch TS issues if `ignoreBuildErrors` is on.
