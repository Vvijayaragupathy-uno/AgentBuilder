"""
Single source of truth for mission clock semantics: start time, optional scheduled end
(start + duration), and open-ended missions. Used by system/status, leaderboard, TV tv_mode,
and demo_ceremony so builder / TV / leaderboard do not disagree on “build still running.”
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from .models import Challenge

MissionBuildWindowPhase = Literal[
    "no_active_mission",
    "inactive",
    "finalized",
    "before_start",
    "open",
    "after_end",
]


def challenge_start_time_utc(c: Challenge) -> Optional[datetime]:
    """Challenge.start_time normalized to UTC for comparisons, or None."""
    if c.start_time is None:
        return None
    st = c.start_time
    if st.tzinfo is None:
        return st.replace(tzinfo=timezone.utc)
    return st.astimezone(timezone.utc)


def _to_utc_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def challenge_in_scheduled_build_window(c: Challenge, now: datetime) -> bool:
    """
    True while the mission is in its **build window** for UX and status:

    - Challenge must be active and not finalized.
    - If ``start_time`` is set: ``now`` must be >= start (UTC).
    - If ``duration_minutes`` > 0: ``now`` must be < start + duration.
    - If there is no ``start_time`` (per-seat / open-ended style): True while active.

    After the scheduled end instant, returns False even if the row is still ``is_active``
    until an admin finalizes or toggles — matching TV ``between_rounds`` and builder countdown.
    """
    if not c.is_active or bool(c.is_finalized):
        return False
    if c.start_time is None:
        return True
    st_utc = _to_utc_aware(c.start_time)
    now_utc = _to_utc_aware(now) if now.tzinfo is None else now.astimezone(timezone.utc)
    if now_utc < st_utc:
        return False
    dur_m = int(c.duration_minutes or 0)
    if dur_m > 0:
        if now_utc >= st_utc + timedelta(minutes=dur_m):
            return False
    return True


def mission_build_window_phase(c: Optional[Challenge], now: datetime) -> MissionBuildWindowPhase:
    """
    UI-facing phase for scheduled vs per-seat missions. Aligns with ``challenge_in_scheduled_build_window``
    but distinguishes **before_start** vs **after_end** when the build window is closed.
    """
    if c is None:
        return "no_active_mission"
    if not c.is_active:
        return "inactive"
    if bool(c.is_finalized):
        return "finalized"
    if c.start_time is None:
        return "open"
    st_utc = _to_utc_aware(c.start_time)
    now_utc = _to_utc_aware(now) if now.tzinfo is None else now.astimezone(timezone.utc)
    if now_utc < st_utc:
        return "before_start"
    dur_m = int(c.duration_minutes or 0)
    if dur_m > 0 and now_utc >= st_utc + timedelta(minutes=dur_m):
        return "after_end"
    return "open"
