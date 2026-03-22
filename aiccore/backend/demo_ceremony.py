"""
Demo queue + TV playback: after submit, builders opt in; mosaic hides submitted tiles;
when build phase ends (finalize, mission off, or all active builders submitted), gate opens
and TV cycles full-screen Langflow (session_id URL) + snapshot fallback.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import select, func, delete
from sqlalchemy.orm import Session

from .models import (
    ArenaState,
    DemoQueueEntry,
    Session as AICSession,
    Challenge,
    Submission,
    Event,
)
from .session_rules import can_join_demo_queue

def _demo_segment_seconds() -> int:
    raw = os.getenv("AICCORE_DEMO_SEGMENT_SECONDS", "90")
    try:
        n = int(raw)
        return max(15, min(n, 3600))
    except ValueError:
        return 90


DEMO_SEGMENT_SECONDS = _demo_segment_seconds()


def get_or_create_arena_row(db: Session) -> ArenaState:
    row = db.get(ArenaState, 1)
    if row is None:
        row = ArenaState(id=1, arena_locked=False)
        db.add(row)
        db.flush()
    return row


def is_arena_locked_db(db: Session) -> bool:
    return bool(get_or_create_arena_row(db).arena_locked)


def _to_utc_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def ordered_queue_rows(db: Session) -> List[DemoQueueEntry]:
    return list(
        db.execute(
            select(DemoQueueEntry).order_by(DemoQueueEntry.created_at.asc())
        ).scalars().all()
    )


def reset_demo_state(db: Session) -> None:
    row = get_or_create_arena_row(db)
    row.demo_gate_open = False
    row.demo_cursor = -1
    row.demo_segment_ends_at = None
    db.execute(delete(DemoQueueEntry))
    db.commit()


def _start_demo_playback_from_gate(db: Session) -> None:
    row = get_or_create_arena_row(db)
    q = ordered_queue_rows(db)
    if not q:
        row.demo_cursor = -1
        row.demo_segment_ends_at = None
    else:
        row.demo_cursor = 0
        row.demo_segment_ends_at = datetime.now(timezone.utc) + timedelta(
            seconds=DEMO_SEGMENT_SECONDS
        )


def force_open_demo_gate(db: Session) -> bool:
    """Open gate and start timed playback if queue non-empty. Returns True if newly opened."""
    row = get_or_create_arena_row(db)
    if row.demo_gate_open:
        return False
    row.demo_gate_open = True
    _start_demo_playback_from_gate(db)
    db.commit()
    return True


def ensure_demo_playback_if_gate_open_idle(db: Session) -> bool:
    """Gate already open but cursor unset (queue was empty) — start first segment when someone joins."""
    row = get_or_create_arena_row(db)
    if not row.demo_gate_open or row.demo_cursor >= 0:
        return False
    q = ordered_queue_rows(db)
    if not q:
        return False
    row.demo_cursor = 0
    row.demo_segment_ends_at = datetime.now(timezone.utc) + timedelta(
        seconds=DEMO_SEGMENT_SECONDS
    )
    db.commit()
    return True


def maybe_auto_finalize_challenge(db: Session) -> Optional[dict]:
    """
    Automatic end-of-mission build phase:
    If a challenge is active, not finalized, 
    and (start_time + duration) < now UTC,
    mark as is_finalized=True and open the demo gate.
    """
    now_utc = datetime.now(timezone.utc)
    ch = db.execute(
        select(Challenge)
        .where(Challenge.is_active == True, Challenge.is_finalized == False)
        .order_by(Challenge.created_at.asc())
    ).scalars().first()
    
    if not ch or not ch.start_time:
        return None

    st_utc = _to_utc_aware(ch.start_time)
    expires_at = st_utc + timedelta(minutes=int(ch.duration_minutes or 0))
    if now_utc >= expires_at:
        ch.is_finalized = True
        # Open the demo gate automatically!
        force_open_demo_gate(db)
        db.commit()
        return {"challenge_id": str(ch.id), "status": "finalized"}
    return None


def try_open_demo_gate(db: Session) -> bool:
    """Open when arena finalized OR no remaining builders still working on the active challenge.

    Counts only sessions bound to the active challenge. Also opens when everyone has left
    (active_cnt==0) but the demo queue is non-empty — e.g. builders submitted, joined the queue,
    then hit Start Over (deactivate).
    """
    row = get_or_create_arena_row(db)
    if row.demo_gate_open:
        return False
    if is_arena_locked_db(db):
        return force_open_demo_gate(db)
    ch = db.execute(
        select(Challenge)
        .where(Challenge.is_active == True)
        .order_by(Challenge.created_at.asc())
    ).scalars().first()
    if not ch:
        return False
    pending = (
        db.execute(
            select(func.count(AICSession.id)).where(
                AICSession.challenge_id == ch.id,
                AICSession.is_active == True,
                AICSession.is_submitted == False,
            )
        ).scalar()
        or 0
    )
    active_cnt = (
        db.execute(
            select(func.count(AICSession.id)).where(
                AICSession.challenge_id == ch.id,
                AICSession.is_active == True,
            )
        ).scalar()
        or 0
    )
    queue_n = len(ordered_queue_rows(db))
    if pending != 0:
        return False
    # Everyone on the *active* challenge has submitted (pending==0). Do not require zero
    # unsubmitted sessions globally — a stray test seat or old session without challenge_id
    # was blocking the whole museum demo phase.
    if active_cnt > 0:
        return force_open_demo_gate(db)
    if queue_n > 0:
        return force_open_demo_gate(db)
    return False


def advance_demo_if_expired(db: Session) -> None:
    row = get_or_create_arena_row(db)
    if not row.demo_gate_open or row.demo_cursor < 0:
        return
    if not row.demo_segment_ends_at:
        return
    end_at = _to_utc_aware(row.demo_segment_ends_at)
    if datetime.now(timezone.utc) < end_at:
        return
    q = ordered_queue_rows(db)
    if not q:
        row.demo_cursor = -1
        row.demo_segment_ends_at = None
        db.commit()
        return
    if row.demo_cursor + 1 >= len(q):
        row.demo_cursor = -1
        row.demo_segment_ends_at = None
        row.demo_gate_open = False  # Auto-close gate when queue ends
    else:
        row.demo_cursor += 1
        row.demo_segment_ends_at = datetime.now(timezone.utc) + timedelta(
            seconds=DEMO_SEGMENT_SECONDS
        )
    db.commit()


def admin_advance_demo(db: Session) -> dict:
    """Skip to next presenter or end sequence."""
    row = get_or_create_arena_row(db)
    if not row.demo_gate_open or row.demo_cursor < 0:
        return {"status": "idle", "cursor": row.demo_cursor}
    q = ordered_queue_rows(db)
    if not q:
        row.demo_cursor = -1
        row.demo_segment_ends_at = None
        db.commit()
        return {"status": "idle", "cursor": -1}
    if row.demo_cursor + 1 >= len(q):
        row.demo_cursor = -1
        row.demo_segment_ends_at = None
        row.demo_gate_open = False  # Auto-close gate when queue ends
    else:
        row.demo_cursor += 1
        row.demo_segment_ends_at = datetime.now(timezone.utc) + timedelta(
            seconds=DEMO_SEGMENT_SECONDS
        )
    db.commit()
    return {"status": "advanced", "cursor": row.demo_cursor}


def _starter_template_folder_ids(manifest: Dict[str, Any]) -> set[str]:
    """Folder IDs for Langflow built-in templates — not the builder's own canvas."""
    names = frozenset({"Starter Projects", "Starter Project"})
    out: set[str] = set()
    for folder in manifest.get("folders") or []:
        if (folder.get("name") or "").strip() in names:
            fid = folder.get("id")
            if fid is not None:
                out.add(str(fid))
    return out


def _snapshot_canvas_nonempty(snap: Any) -> bool:
    if not isinstance(snap, dict):
        return False
    nodes = snap.get("nodes") or []
    edges = snap.get("edges") or []
    return len(nodes) > 0 or len(edges) > 0


def get_mosaic_snapshot_for_session(db: Session, session_id: UUID) -> Dict[str, Any]:
    """Mosaic HTTP poll: prefer latest flow_saved when it actually has canvas data.

    If flow_saved exists but Langflow sent a partial PATCH (empty nodes/edges), fall back
    to workspace_snapshot so live tiles and submit still see the real graph.
    """
    flow_stmt = (
        select(Event)
        .where(Event.session_id == session_id, Event.event_type == "flow_saved")
        .order_by(Event.sequence_number.desc())
        .limit(1)
    )
    latest_flow = db.execute(flow_stmt).scalars().first()
    if latest_flow and latest_flow.payload is not None:
        snap = latest_flow.payload.get("snapshot")
        if isinstance(snap, dict) and _snapshot_canvas_nonempty(snap):
            return snap

    ws_stmt = (
        select(Event)
        .where(Event.session_id == session_id, Event.event_type == "workspace_snapshot")
        .order_by(Event.sequence_number.desc())
        .limit(1)
    )
    ws_ev = db.execute(ws_stmt).scalars().first()
    if ws_ev and ws_ev.payload:
        flows = ws_ev.payload.get("flows") or []
        starter_ids = _starter_template_folder_ids(ws_ev.payload)
        best_data: Optional[Dict[str, Any]] = None
        best_n = 0
        for f in flows:
            if f.get("is_component"):
                continue
            fid = f.get("folder_id")
            if fid is not None and str(fid) in starter_ids:
                continue
            data = f.get("data")
            if not isinstance(data, dict):
                continue
            n = len(data.get("nodes") or [])
            if n > best_n:
                best_n = n
                best_data = data
        if best_data:
            return {
                "nodes": best_data.get("nodes") or [],
                "edges": best_data.get("edges") or [],
            }

    return {}


def _latest_snapshot_for_session(db: Session, session_id: UUID) -> Dict[str, Any]:
    sub = (
        db.execute(
            select(Submission)
            .where(Submission.session_id == session_id)
            .order_by(Submission.submitted_at.desc())
            .limit(1)
        )
        .scalars()
        .first()
    )
    if sub and sub.flow_snapshot:
        return sub.flow_snapshot if isinstance(sub.flow_snapshot, dict) else {}
    return get_mosaic_snapshot_for_session(db, session_id)


def snapshot_to_preview(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    """Match mosaic-display mapping for FlowPreviewCard."""
    nodes_raw = snapshot.get("nodes") or []
    edges_raw = snapshot.get("edges") or []
    nodes = []
    for n in nodes_raw:
        component_name = (
            (n.get("data") or {}).get("node") or {}
        ).get("display_name", "") or ""
        component_name = str(component_name).lower()
        x = n.get("position", {}).get("x", n.get("x", 0))
        y = n.get("position", {}).get("y", n.get("y", 0))
        t = "process"
        if "input" in component_name or "chat" in component_name:
            t = "input"
        elif "llm" in component_name or "openai" in component_name:
            t = "llm"
        elif "output" in component_name:
            t = "output"
        nodes.append(
            {
                "id": n.get("id"),
                "label": (
                    (n.get("data") or {}).get("node") or {}
                ).get("display_name")
                or n.get("label")
                or "Component",
                "type": t,
                "x": x,
                "y": y,
            }
        )
    edges = []
    for e in edges_raw:
        edges.append(
            {
                "from": e.get("source") or e.get("from"),
                "to": e.get("target") or e.get("to"),
            }
        )
    return {"nodes": nodes, "edges": edges}


def join_demo_queue(db: Session, session_id: UUID) -> dict:
    sess = db.get(AICSession, session_id)
    if not sess:
        raise ValueError("session_not_found")
    if not can_join_demo_queue(is_active=sess.is_active, is_submitted=sess.is_submitted):
        if not sess.is_active:
            raise ValueError("session_inactive")
        raise ValueError("must_submit_first")
    existing = (
        db.execute(
            select(DemoQueueEntry).where(DemoQueueEntry.session_id == session_id)
        )
        .scalars()
        .first()
    )
    if existing:
        q = ordered_queue_rows(db)
        pos = next((i for i, r in enumerate(q) if r.session_id == session_id), 0)
        return {"status": "already_queued", "position": pos + 1, "total": len(q)}
    db.add(DemoQueueEntry(session_id=session_id))
    db.commit()
    q = ordered_queue_rows(db)
    pos = next((i for i, r in enumerate(q) if r.session_id == session_id), len(q) - 1)
    return {"status": "joined", "position": pos + 1, "total": len(q)}


def remove_session_from_demo_queue(db: Session, session_id: UUID) -> None:
    """When a builder hits Start Over: drop queue slot and fix playback cursor if needed."""
    row = get_or_create_arena_row(db)
    q_before = ordered_queue_rows(db)
    removed_idx = next((i for i, r in enumerate(q_before) if r.session_id == session_id), None)
    if removed_idx is None:
        return
    db.execute(delete(DemoQueueEntry).where(DemoQueueEntry.session_id == session_id))
    db.flush()
    q_after = ordered_queue_rows(db)
    if not row.demo_gate_open or row.demo_cursor < 0:
        db.commit()
        return
    cur = row.demo_cursor
    if removed_idx < cur:
        row.demo_cursor = cur - 1
    elif removed_idx == cur:
        if not q_after:
            row.demo_cursor = -1
            row.demo_segment_ends_at = None
        else:
            # Same slot may now be the next person; clamp if we removed the tail.
            row.demo_cursor = min(cur, len(q_after) - 1)
            row.demo_segment_ends_at = datetime.now(timezone.utc) + timedelta(
                seconds=DEMO_SEGMENT_SECONDS
            )
    if q_after and row.demo_cursor >= len(q_after):
        row.demo_cursor = len(q_after) - 1
        row.demo_segment_ends_at = datetime.now(timezone.utc) + timedelta(
            seconds=DEMO_SEGMENT_SECONDS
        )
    if not q_after:
        row.demo_cursor = -1
        row.demo_segment_ends_at = None
    db.commit()


def _repair_demo_cursor_if_needed(db: Session) -> None:
    """If queue shrank or was cleared, clamp cursor so status/API stay consistent."""
    row = get_or_create_arena_row(db)
    q = ordered_queue_rows(db)
    if not q:
        if row.demo_cursor >= 0 or row.demo_segment_ends_at is not None:
            row.demo_cursor = -1
            row.demo_segment_ends_at = None
            db.commit()
        return
    if row.demo_cursor >= len(q):
        row.demo_cursor = len(q) - 1
        row.demo_segment_ends_at = datetime.now(timezone.utc) + timedelta(
            seconds=DEMO_SEGMENT_SECONDS
        )
        db.commit()


def get_demo_status(db: Session) -> Dict[str, Any]:
    maybe_auto_finalize_challenge(db)
    advance_demo_if_expired(db)
    _repair_demo_cursor_if_needed(db)
    row = get_or_create_arena_row(db)
    q = ordered_queue_rows(db)
    queue_out = []
    for r in q:
        s = db.get(AICSession, r.session_id)
        if s:
            queue_out.append(
                {
                    "session_id": str(r.session_id),
                    "nickname": s.nickname,
                    "station_id": s.station_id,
                }
            )
    presenting = None
    if (
        row.demo_gate_open
        and row.demo_cursor >= 0
        and row.demo_cursor < len(q)
    ):
        entry = q[row.demo_cursor]
        s = db.get(AICSession, entry.session_id)
        if s:
            snap = _latest_snapshot_for_session(db, entry.session_id)
            presenting = {
                "session_id": str(entry.session_id),
                "nickname": s.nickname,
                "station_id": s.station_id,
                "flow_preview": snapshot_to_preview(snap),
                "segment_ends_at": row.demo_segment_ends_at.isoformat()
                if row.demo_segment_ends_at
                else None,
            }
    return {
        "gate_open": row.demo_gate_open,
        "queue": queue_out,
        "cursor": row.demo_cursor,
        "queue_length": len(q),
        "presenting": presenting,
        "segment_seconds": DEMO_SEGMENT_SECONDS,
    }
