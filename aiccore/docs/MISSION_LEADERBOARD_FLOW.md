# Mission start, leaderboard status, and Langflow

## Leaderboard statuses (API + UI)

| Status | Meaning |
|--------|--------|
| **REGISTERED** | Has an AICCORE profile but no active builder session (has not unlocked a station). |
| **CHECKED_IN** (“At station”) | Unlocked Langflow (`active` session) but **not** in the live build window: challenge `is_active` is false **or** scheduled `start_time` is still in the future **or** the session has **no `challenge_id`** (not bound to a mission). Warm-up / lobby — not “Building”. |
| **PARTICIPATING** (“Building”) | Live build window: session has a **challenge**, and that challenge is **active** and (**no** `start_time` **or** `now ≥ start_time`). |
| **SUBMITTED** | Session submitted (or last submission shown if no active session). |

This matches the builder header: **“Not started yet”** until `start_time` (when using mission clock), then the shared countdown.

## When does the mission “start”?

1. **Admin toggle** — Catalog control sets `is_active`. Sends **`MISSION_LIVE`** over WebSocket.
2. **Auto go-live (scheduled)** — On **`GET /system/status`** and **`GET /leaderboard`**, if **no** challenge is currently active, the server activates the **earliest due** mission: `is_finalized == false`, `start_time` set, `start_time ≤ now` (UTC). Same **`MISSION_LIVE`** broadcast. Uses a **process lock** to limit double-activation under load (best-effort across workers).
3. **Manual-only missions** — If a mission has **no** `start_time`, it **never** auto-activates; admin must toggle **`is_active`**.

After activation, leaderboard uses `challenge_is_live_build_window` (active + time) for PARTICIPATING vs CHECKED_IN.

## Notifying builders

- **`MISSION_LIVE`** — Admin toggle **or** auto go-live. Builder shows a banner and refetches `/system/status` (also polls every 10s).
- **Mic / TV** — Still recommended in the room.

## Langflow tab: close or refresh?

- **No automatic close** when the mission goes live. Same Langflow session; **no** purge on toggle or auto-activate.
- **Purge / restore** on **station unlock** (`eraser.py` / concurrent-session rules).

## Edge cases

| Situation | Behavior |
|-----------|----------|
| `start_time` passed, **`is_active` false**, **no other** active mission | **Auto-activate** next due challenge (earliest `start_time` among due). |
| **Any** challenge already **`is_active`** | Auto go-live **does nothing** — end one mission before another auto-starts, or toggle manually. |
| **`is_finalized`** | Never auto-activated. |
| Session **without `challenge_id`** | **CHECKED_IN** (not Building). |
| Mission **active**, **`start_time` future** | CHECKED_IN until clock passes. |
| **Multi-worker** | Rare duplicate **`MISSION_LIVE`** if two workers activate simultaneously; DB ends with one active mission. |

## Code

- `challenge_start_time_utc`, `challenge_is_live_build_window`, `maybe_auto_activate_due_challenges` — `aiccore/wrapper/main.py`
