"""
Scheduled mission transitions: auto-finalize when build window ends, then auto-activate
the next due challenge. Called from :mod:`mission_automation_loop` (background tick).
"""
from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from .challenge_time import challenge_would_be_in_build_window_if_activated
from .demo_ceremony import maybe_auto_finalize_challenge
from .models import Challenge

_AUTO_ACTIVATE_LOCK = threading.Lock()


def maybe_auto_activate_due_challenges(db_session: Session) -> Optional[dict]:
    """
    If **no** challenge is currently active, activate the earliest scheduled candidate
    whose **build window still includes now** (not finalized, ``start_time`` set).
    Skips missions that have not started yet or are already past ``start + duration``.
    Returns MISSION_LIVE payload dict or None.
    """
    now_utc = datetime.now(timezone.utc)
    bind = db_session.bind
    dialect = getattr(bind, "dialect", None) if bind is not None else None
    if dialect is not None and dialect.name == "postgresql":
        db_session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": 91_030_221})
    with _AUTO_ACTIVATE_LOCK:
        active_n = (
            db_session.execute(
                select(func.count(Challenge.id)).where(Challenge.is_active == True)
            ).scalar()
            or 0
        )
        if active_n > 0:
            return None

        stmt = (
            select(Challenge)
            .where(
                Challenge.is_active == False,
                Challenge.is_finalized == False,
                Challenge.start_time.isnot(None),
            )
            .order_by(Challenge.start_time.asc())
        )
        candidates = db_session.execute(stmt).scalars().all()
        for c in candidates:
            if not challenge_would_be_in_build_window_if_activated(c, now_utc):
                continue
            c.is_active = True
            c.is_registration_open = False
            db_session.commit()
            return {
                "challenge_id": str(c.id),
                "title": c.title,
                "start_time": c.start_time.isoformat() if c.start_time else None,
            }
    return None


def run_mission_automation(db_session: Session) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Run auto-finalize then auto-activate in order. Returns
    ``(mission_end_payload | None, mission_live_payload | None)`` for broadcasts.
    """
    end = maybe_auto_finalize_challenge(db_session)
    live = maybe_auto_activate_due_challenges(db_session)
    return end, live
