# End-to-end lifecycle audit (AICCORE)

Last reviewed: consolidated checklist after recent work. Use this when doing a full regression pass.

## Flows that are consistent in code

| Flow | Notes |
|------|--------|
| Register → OTP → unlock | OTP cleared; optional `challenge_id` + `station_id`; prior session on same station ended. |
| Arena lock | `ArenaState` DB row; blocks unlock when locked. |
| Langflow purge / restore | Single active session → purge + restore user manifest; multiple → merge only (shared DB). |
| Events `sequence_number` | **Middleware**, **eraser** (snapshot/submit), and **`POST /api/v1/aiccore/submit`** use **`get_event_seq_lock(session_id)`**. |
| Submit | Double-submit guarded on session submit path; workspace submit uses eraser lock internally. |
| Leaderboard | REGISTERED / CHECKED_IN / PARTICIPATING / SUBMITTED aligned with `challenge_is_live_build_window` + auto-activate. |
| Auto go-live | Due `start_time` when no mission active; `MISSION_LIVE` + `LEADERBOARD_UPDATE`. |
| Builder timer | Mission clock from `/system/status` + skew; per-seat fallback if no `start_time`; auto-submit at 0; refetch on `MISSION_LIVE` + 10s poll. |
| Admin-only tabs | Registry / Review / Stations / Settings gated by cookie. |
| Mission `start_time` | Dashboard sends UTC ISO from `datetime-local` (no naive-UTC bug). |

## Known product / architecture limits (not “bugs”)

1. **One Langflow DB per server** — All seats share flows unless you run N Langflow instances (`STATION_ISOLATION.md`).
2. **Builder timer vs session challenge** — `/system/status` exposes the **globally active** challenge (first `is_active`). The builder’s **session** may be bound to a **different** `challenge_id` if ops run multiple missions oddly; then countdown and leaderboard row can disagree. **Mitigation:** one active mission per event; use `?challenge_id=` on unlock.
3. **Auto-submit** — Fires in the **browser**; closing the tab before 0 prevents that client from submitting.
4. **Multi-worker** — `threading.Lock` is per process; rare duplicate `MISSION_LIVE` or race on auto-activate across workers is possible; use one worker or DB advisory locks if you need strict single-flight.

## Optional improvements (not required for a clean museum run)

- Expose **session-scoped** timer API (`challenge_id` from session) so builder always matches leaderboard mission.
- **Server-side** submit-at-deadline job (cron) as backup when tabs close.
- **Postgres advisory lock** for `maybe_auto_activate_due_challenges` across workers.

## Quick manual E2E script

1. Fresh DB or reset; create challenge with `start_time` in 2 min; leave inactive → register user → unlock → leaderboard **At station**; after time + poll status/leaderboard → auto **active** + **Building** (or toggle manually).
2. Two laptops unlock → Langflow shows merged flows; both tiles on mosaic.
3. Submit from one station → review approve/score → export CSV.
4. Finalize → builder locked / ceremony broadcast.
5. Admin Registry / Review without login → redirected to public tab.
