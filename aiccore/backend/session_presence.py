import os
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from .models import Session as AICSession, Station


def _presence_timeout_seconds() -> int:
    raw = os.getenv("AICCORE_SESSION_STALE_SECONDS", "90")
    try:
        value = int(raw)
        return max(30, min(value, 3600))
    except ValueError:
        return 90


SESSION_STALE_SECONDS = _presence_timeout_seconds()


def _to_utc(dt: Optional[datetime]) -> datetime:
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _session_last_seen(session_obj: AICSession) -> datetime:
    return _to_utc(session_obj.last_seen_at or session_obj.start_time)


def touch_session_presence(
    db_session: DBSession,
    session_id: UUID,
    *,
    now: Optional[datetime] = None,
) -> bool:
    now_utc = _to_utc(now)
    session_obj = db_session.get(AICSession, session_id)
    if not session_obj:
        return False

    session_obj.last_seen_at = now_utc
    if session_obj.station_id:
        station = db_session.get(Station, session_obj.station_id)
        if station:
            station.last_heartbeat = now_utc
            if station.current_session_id in (None, session_obj.id):
                station.current_session_id = session_obj.id
            if station.status in ("available", "offline"):
                station.status = "occupied"
    return True


def expire_stale_sessions(
    db_session: DBSession,
    *,
    now: Optional[datetime] = None,
) -> list[UUID]:
    now_utc = _to_utc(now)
    expired_ids: list[UUID] = []
    stmt = select(AICSession).where(
        AICSession.is_active == True,
        AICSession.is_submitted == False,
    )
    sessions = db_session.execute(stmt).scalars().all()
    for session_obj in sessions:
        age_seconds = (now_utc - _session_last_seen(session_obj)).total_seconds()
        if age_seconds <= SESSION_STALE_SECONDS:
            continue
        session_obj.is_active = False
        session_obj.end_time = now_utc
        expired_ids.append(session_obj.id)

        if session_obj.station_id:
            station = db_session.get(Station, session_obj.station_id)
            if station and station.current_session_id == session_obj.id:
                station.current_session_id = None
                if station.status == "occupied":
                    station.status = "available"
    return expired_ids
