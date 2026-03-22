from __future__ import annotations

import asyncio
import logging
import os
from uuid import UUID, uuid4
from typing import Optional, Set, Dict, Any
from datetime import datetime
from sqlalchemy import delete, desc, or_, select

try:
    from lfx.log.logger import logger
except Exception:  # pragma: no cover - test envs may not have lfx installed
    logger = logging.getLogger(__name__)

# Serialize workspace submit per session — the HTTP handler's pre-check is not atomic with this coroutine.
_workspace_submit_locks: dict[str, asyncio.Lock] = {}
_workspace_submit_locks_guard = asyncio.Lock()


def _import_langflow_workspace_models():
    from langflow.services.database.models import (
        Flow,
        Folder,
        MessageTable,
        TransactionTable,
        User as LFUser,
        Variable,
    )
    from langflow.services.deps import session_scope

    return Flow, Folder, MessageTable, TransactionTable, Variable, LFUser, session_scope


def _submission_lookup_requires_folder_scope(root_folder_id: Optional[UUID]) -> bool:
    """Shared Langflow DBs must stay seat-scoped whenever a seat folder is available."""
    return root_folder_id is not None


async def _acquire_workspace_submit_lock(session_id: UUID) -> asyncio.Lock:
    key = str(session_id)
    async with _workspace_submit_locks_guard:
        lock = _workspace_submit_locks.get(key)
        if lock is None:
            lock = asyncio.Lock()
            _workspace_submit_locks[key] = lock
        return lock


async def collect_folder_descendants(lf_session, root_folder_id: UUID) -> Set[UUID]:
    """All folder IDs at or under root (BFS)."""
    _, Folder, _, _, _, _, _ = _import_langflow_workspace_models()
    out: Set[UUID] = {root_folder_id}
    frontier = [root_folder_id]
    while frontier:
        q = select(Folder).where(Folder.parent_id.in_(frontier))
        rows = (await lf_session.execute(q)).scalars().all()
        frontier = []
        for f in rows:
            if f.id not in out:
                out.add(f.id)
                frontier.append(f.id)
    return out


def _parse_uuid(raw: Any) -> Optional[UUID]:
    if raw in (None, ""):
        return None
    if isinstance(raw, UUID):
        return raw
    try:
        return UUID(str(raw))
    except (TypeError, ValueError):
        return None


def _prepare_manifest_for_restore(
    manifest: dict,
    default_flow_folder_id: Optional[UUID] = None,
) -> dict[str, list[dict[str, Any]]]:
    """
    Re-home captured workspace state into the current seat folder using fresh IDs.

    Reusing the previous session's folder and flow IDs can revive orphaned trees outside the
    current seat scope. That leaves the builder empty, breaks submit, and lets stale data linger.
    """
    raw_folders = list(manifest.get("folders") or [])
    raw_flows = list(manifest.get("flows") or [])
    raw_variables = list(manifest.get("variables") or [])

    known_folder_ids = {
        fid for folder in raw_folders if (fid := _parse_uuid(folder.get("id"))) is not None
    }
    top_level_folder_ids = {
        fid
        for folder in raw_folders
        if (fid := _parse_uuid(folder.get("id"))) is not None
        and ((_parse_uuid(folder.get("parent_id")) is None) or (_parse_uuid(folder.get("parent_id")) not in known_folder_ids))
    }

    folder_id_map: Dict[UUID, UUID] = {}
    if default_flow_folder_id is not None:
        for fid in top_level_folder_ids:
            folder_id_map[fid] = default_flow_folder_id

    prepared_folders: list[dict[str, Any]] = []
    pending: list[tuple[UUID, dict[str, Any], Optional[UUID]]] = []
    for folder in raw_folders:
        old_id = _parse_uuid(folder.get("id"))
        if old_id is None:
            continue
        old_parent_id = _parse_uuid(folder.get("parent_id"))
        if default_flow_folder_id is not None and old_id in top_level_folder_ids:
            continue
        pending.append((old_id, folder, old_parent_id))

    while pending:
        next_pending: list[tuple[UUID, dict[str, Any], Optional[UUID]]] = []
        progressed = False
        for old_id, folder, old_parent_id in pending:
            if old_parent_id is not None and old_parent_id in known_folder_ids and old_parent_id not in folder_id_map:
                next_pending.append((old_id, folder, old_parent_id))
                continue

            new_id = uuid4()
            folder_id_map[old_id] = new_id
            prepared_folders.append(
                {
                    "id": new_id,
                    "name": folder.get("name"),
                    "description": folder.get("description"),
                    "parent_id": folder_id_map.get(old_parent_id) if old_parent_id is not None else None,
                }
            )
            progressed = True

        if not progressed:
            for old_id, folder, old_parent_id in next_pending:
                new_id = uuid4()
                folder_id_map[old_id] = new_id
                prepared_folders.append(
                    {
                        "id": new_id,
                        "name": folder.get("name"),
                        "description": folder.get("description"),
                        "parent_id": folder_id_map.get(old_parent_id, default_flow_folder_id),
                    }
                )
            break

        pending = next_pending

    prepared_flows: list[dict[str, Any]] = []
    for flow in raw_flows:
        old_folder_id = _parse_uuid(flow.get("folder_id"))
        prepared_flows.append(
            {
                "id": uuid4(),
                "name": flow.get("name"),
                "description": flow.get("description"),
                "data": flow.get("data"),
                "folder_id": folder_id_map.get(old_folder_id, default_flow_folder_id),
                "is_component": flow.get("is_component", False),
            }
        )

    prepared_variables: list[dict[str, Any]] = []
    for variable in raw_variables:
        prepared_variables.append(
            {
                "id": uuid4(),
                "name": variable.get("name"),
                "value": variable.get("value"),
                "type": variable.get("type"),
                "default_fields": variable.get("default_fields"),
            }
        )

    return {
        "folders": prepared_folders,
        "flows": prepared_flows,
        "variables": prepared_variables,
    }


async def ensure_langflow_workspace_folder(session_id: UUID) -> Optional[UUID]:
    """
    One Langflow folder per AICCORE session so concurrent seats can share one Langflow DB
    without seeing each other's flows (see middleware response filtering).
    """
    from sqlalchemy.orm import Session as AICSessionORM
    from .database import engine as aic_engine
    from .models import Session as AICSession

    with AICSessionORM(aic_engine) as db:
        aic_sess = db.get(AICSession, session_id)
        if not aic_sess:
            return None
        stored_fid = aic_sess.langflow_workspace_folder_id

    _, Folder, _, _, _, LFUser, session_scope = _import_langflow_workspace_models()

    async with session_scope() as lf:
        user_obj = (await lf.execute(select(LFUser).limit(1))).scalar()
        if not user_obj:
            logger.error("AICCORE: No Langflow user — cannot create arena folder")
            return None
        uid = user_obj.id
        new_folder = None
        if stored_fid:
            new_folder = (
                await lf.execute(select(Folder).where(Folder.id == stored_fid).limit(1))
            ).scalars().first()
            if new_folder is None:
                logger.warning(
                    f"AICCORE: Stored arena folder {stored_fid} missing for session {session_id}; recreating."
                )
        # CRITICAL: Use a random, non-predictable name for the arena folder.
        # Predicted names like 'Arena-{session_id}' allowed different participants on the 
        # same station to see old flows if the cleanup was incomplete.
        folder_name = f"ArenaSlot-{uuid4().hex[:12]}"
        
        if new_folder is None:
            # We do NOT search by name anymore to ensure absolute isolation.
            new_folder = Folder(
                id=uuid4(),
                name=folder_name,
                description="AICCORE seat workspace",
                parent_id=None,
                user_id=uid,
            )
            lf.add(new_folder)
            await lf.commit()
            await lf.refresh(new_folder)
        if new_folder is None:
            return None
        if stored_fid and new_folder.id != stored_fid:
            logger.info(
                f"AICCORE: Session {session_id} rebound from stale folder {stored_fid} to {new_folder.id}."
            )

        fid = new_folder.id

    with AICSessionORM(aic_engine) as db:
        aic_sess = db.get(AICSession, session_id)
        if aic_sess and aic_sess.langflow_workspace_folder_id != fid:
            aic_sess.langflow_workspace_folder_id = fid
            db.commit()
    return fid


async def purge_langflow_workspace_scoped(root_folder_id: UUID) -> None:
    """Delete only this seat's content under ``root_folder_id`` and preserve other seats."""
    logger.info(f"🧹 AICCORE: Scoped purge for Langflow folder {root_folder_id}...")
    try:
        Flow, Folder, _, _, _, _, session_scope = _import_langflow_workspace_models()
        async with session_scope() as lf:
            scope = await collect_folder_descendants(lf, root_folder_id)
            await lf.execute(delete(Flow).where(Flow.folder_id.in_(scope)))

            remaining = set(scope)
            remaining.discard(root_folder_id)
            while remaining:
                deleted_any = False
                for fid in list(remaining):
                    sub = (
                        await lf.execute(select(Folder).where(Folder.parent_id == fid))
                    ).scalars().first()
                    if sub:
                        continue
                    await lf.execute(delete(Folder).where(Folder.id == fid))
                    remaining.discard(fid)
                    deleted_any = True
                if not deleted_any:
                    break
            await lf.commit()

            logger.info(f"✨ AICCORE: Scoped purge done ({len(scope)} folder slots cleared).")
    except Exception as e:
        logger.error(f"❌ AICCORE: Scoped purge failed: {e}")


async def capture_full_workspace_snapshot(session_id: UUID):
    """
    Captures workspace state for persistence. When the session has langflow_workspace_folder_id,
    only that folder subtree is captured (concurrent seats).

    Without a seat folder we **do not** SELECT * from Langflow — that would merge every seat's
    flows into one session's snapshot in a shared DB.
    """
    logger.info(f"📸 AICCORE: Capturing Full Workspace Snapshot for session {session_id}...")
    try:
        from sqlalchemy.orm import Session as AICSessionORM
        from .database import engine as aic_engine
        from .models import Session as AICSession

        root_id: Optional[UUID] = None
        aic_sess = None
        with AICSessionORM(aic_engine) as db:
            aic_sess = db.get(AICSession, session_id)
        if aic_sess:
            try:
                root_id = await ensure_langflow_workspace_folder(session_id)
            except Exception:
                root_id = aic_sess.langflow_workspace_folder_id

        Flow, Folder, _, _, _, _, session_scope = _import_langflow_workspace_models()

        async with session_scope() as session:
            # BROAD SEARCH: If we have a seat folder, only snapshot that. 
            # If not (admin/practice), snapshot everything except starters.
            if root_id:
                scope = await collect_folder_descendants(session, root_id)
                folder_stmt = select(Folder).where(Folder.id.in_(scope))
                flow_stmt = select(Flow).where(Flow.folder_id.in_(scope))
            else:
                folder_stmt = select(Folder).where(Folder.name.like("ArenaSlot-%"))
                flow_stmt = select(Flow).where(or_(Flow.folder_id.is_(None), Flow.folder_id.in_(
                    select(Folder.id).where(Folder.name.like("ArenaSlot-%"))
                )))
            
            folders = (await session.execute(folder_stmt)).scalars().all()
            flows = (await session.execute(flow_stmt)).scalars().all()
            variables = []
            
            # 4. Build Manifest
            manifest = {
                "folders": [
                    {
                        "id": str(f.id), 
                        "name": f.name, 
                        "description": f.description, 
                        "parent_id": str(f.parent_id) if f.parent_id else None
                    } for f in folders
                ],
                "flows": [
                    {
                        "id": str(f.id),
                        "name": f.name,
                        "description": f.description,
                        "data": f.data,
                        "folder_id": str(f.folder_id) if f.folder_id else None,
                        "is_component": f.is_component
                    } for f in flows
                ],
                "variables": [
                    {
                        "id": str(v.id),
                        "name": v.name,
                        "value": v.value,
                        "type": v.type,
                        "default_fields": v.default_fields
                    } for v in variables
                ]
            }
            
            # 5. Save to AICCORE Database
            from .database import engine as aic_engine
            from .models import Event
            from sqlalchemy.orm import Session as AICSession
            
            from .event_lock import event_sequence_write_lock, ensure_pg_advisory_xact_lock

            with event_sequence_write_lock(session_id):
                with AICSession(aic_engine) as db:
                    from .models import Event
                    ensure_pg_advisory_xact_lock(db, session_id)
                    stmt = select(Event).where(Event.session_id == session_id).order_by(Event.sequence_number.desc())
                    last_event = db.execute(stmt).scalars().first()
                    seq = (last_event.sequence_number + 1) if last_event else 0

                    snapshot_event = Event(
                        session_id=session_id,
                        sequence_number=seq,
                        event_type="workspace_snapshot",
                        payload=manifest,
                    )
                    db.add(snapshot_event)
                    db.commit()
                logger.info(f"✅ AICCORE: Workspace snapshot saved to profile ({len(flows)} flows, {len(folders)} folders, {len(variables)} vars).")

    except Exception as e:
        logger.error(f"❌ AICCORE: Failed to capture workspace: {e}")


async def purge_langflow_workspace():
    """
    Clears Langflow DB content (flows/folders/vars) for this **entire** Langflow instance,
    keeping only protected starter folders — **not** scoped per AICCORE participant.

    Callers should skip this when multiple AICCORE sessions are active and share one Langflow
    DB (see wrapper unlock). When skipped, use restore-only merge so concurrent laptops are not
    wiped; flows may coexist in one workspace until you use dedicated Langflow instances per seat.
    """
    logger.info("🧹 AICCORE: Purging Langflow workspace for new session...")
    try:
        Flow, Folder, MessageTable, TransactionTable, Variable, _, session_scope = _import_langflow_workspace_models()
        async with session_scope() as session:
            # 1. Identify Starter Projects folder to spare its items
            starter_folder_stmt = select(Folder).where(Folder.name == "Starter Projects").limit(1)
            starter_folder = (await session.execute(starter_folder_stmt)).scalar()
            starter_id = starter_folder.id if starter_folder else None

            # 2. Delete flows not in the starter folder. When starter_id is None, SQLAlchemy would
            # compile ``folder_id != None`` to ``IS NOT NULL`` (not "delete everything").
            if starter_id is None:
                await session.execute(delete(Flow))
            else:
                await session.execute(
                    delete(Flow).where(
                        or_(Flow.folder_id.is_(None), Flow.folder_id != starter_id)
                    )
                )
            
            # 3. Delete user message history and transactions
            await session.execute(delete(MessageTable))
            await session.execute(delete(TransactionTable))
            
            # 4. Delete user Variables (except system-critical ones if any, usually none for builders)
            await session.execute(delete(Variable))

            # 5. Delete custom folders (Keep "Starter Projects", "Starter Project", and "My Collection" if they exist)
            protected_folders = ["Starter Projects", "Starter Project", "My Collection"]
            await session.execute(delete(Folder).where(Folder.name.notin_(protected_folders)))
            
            await session.commit()
            logger.info("✨ AICCORE: Langflow workspace surgically cleared of personal content.")
    except Exception as e:
        logger.error(f"❌ AICCORE: Failed to purge workspace: {e}")


async def restore_user_workspace(manifest: dict, default_flow_folder_id: Optional[UUID] = None):
    """
    Rebuilds the entire workspace from a manifest (Folders, Flows, Variables).
    When default_flow_folder_id is set (arena seat folder), flows with no folder_id go there.
    """
    logger.info("🔄 AICCORE: Re-manifesting builder workspace...")
    try:
        Flow, Folder, _, _, Variable, LFUser, session_scope = _import_langflow_workspace_models()
        async with session_scope() as session:
            # 1. Identify Default User for Ownership
            user_stmt = select(LFUser).limit(1)
            user_obj = (await session.execute(user_stmt)).scalar()
            user_id = user_obj.id if user_obj else None

            prepared = _prepare_manifest_for_restore(manifest, default_flow_folder_id=default_flow_folder_id)
            
            # 2. Re-create Folders
            for f in prepared["folders"]:
                new_folder = Folder(
                    id=f["id"],
                    name=f["name"],
                    description=f.get("description"),
                    parent_id=f.get("parent_id"),
                    user_id=user_id
                )
                session.add(new_folder)
            
            await session.flush()
            
            # 3. Re-create Flows
            for f in prepared["flows"]:
                new_flow = Flow(
                    id=f["id"],
                    name=f["name"],
                    description=f.get("description"),
                    data=f["data"],
                    folder_id=f.get("folder_id"),
                    is_component=f.get("is_component", False),
                    user_id=user_id
                )
                session.add(new_flow)

            # 4. Re-create Variables
            for v in prepared["variables"]:
                new_var = Variable(
                    id=v["id"],
                    name=v["name"],
                    value=v["value"],
                    type=v.get("type"),
                    default_fields=v.get("default_fields"),
                    user_id=user_id
                )
                session.add(new_var)
            
            await session.commit()
            logger.info(
                f"✅ AICCORE: Workspace Manifested with {len(prepared['folders'])} folders, "
                f"{len(prepared['flows'])} flows, and {len(prepared['variables'])} vars."
            )
    except Exception as e:
        logger.error(f"❌ AICCORE: Failed to restore workspace: {e}")


async def submit_workspace_as_flow(session_id: UUID):
    """
    Captures the most recent flow from the workspace and saves it as a Submission.
    If multiple flows exist, it tries to find the most recently updated non-component flow.

    Langflow rows are only queried under this seat's arena folder (never a global Flow pick).
    Flows edited under "Starter Project" often keep that folder_id — the UI lists them
    (middleware widens GET) but DB submit would miss them. In that case we fall back to
    the same flow_saved / workspace_snapshot canvas the mosaic uses.
    """
    lock = await _acquire_workspace_submit_lock(session_id)
    async with lock:
        return await _submit_workspace_as_flow_impl(session_id)


async def _submit_workspace_as_flow_impl(session_id: UUID) -> str:
    logger.info(f"📤 AICCORE: Submitting workspace for session {session_id}...")
    try:
        from sqlalchemy.orm import Session as AICSessionORM
        from .database import engine as aic_engine
        from .models import Session as AICSession, Submission

        with AICSessionORM(aic_engine) as db:
            early = db.get(AICSession, session_id)
            if not early:
                raise Exception("AICCORE Session not found.")
            if early.is_submitted:
                existing_early = (
                    db.execute(
                        select(Submission)
                        .where(Submission.session_id == session_id)
                        .order_by(Submission.submitted_at.desc())
                        .limit(1)
                    )
                    .scalars()
                    .first()
                )
                if existing_early:
                    return str(existing_early.id)

        root_id: Optional[UUID] = None
        aic_sess = None
        with AICSessionORM(aic_engine) as db:
            aic_sess = db.get(AICSession, session_id)
        if aic_sess:
            try:
                root_id = await ensure_langflow_workspace_folder(session_id)
            except Exception:
                root_id = aic_sess.langflow_workspace_folder_id

        main_flow = None
        Flow, _, _, _, _, _, session_scope = _import_langflow_workspace_models()

        async with session_scope() as session:
            if _submission_lookup_requires_folder_scope(root_id):
                scope = await collect_folder_descendants(session, root_id)
                flow_stmt = (
                    select(Flow)
                    .where(Flow.is_component == False, Flow.folder_id.in_(scope))
                    .order_by(desc(Flow.updated_at))
                    .limit(1)
                )
                main_flow = (await session.execute(flow_stmt)).scalar()

                if not main_flow:
                    flow_stmt = (
                        select(Flow)
                        .where(Flow.folder_id.in_(scope))
                        .order_by(desc(Flow.updated_at))
                        .limit(1)
                    )
                    main_flow = (await session.execute(flow_stmt)).scalar()
            # No global Flow fallback here: in a shared Langflow DB that can pick another
            # participant's graph. If the seat folder is empty, submit the latest
            # session-scoped event snapshot instead.

        flow_snapshot: Optional[dict] = None
        if main_flow:
            flow_snapshot = main_flow.data if isinstance(main_flow.data, dict) else {}
            if flow_snapshot is None:
                flow_snapshot = {}
        else:
            from .demo_ceremony import get_mosaic_snapshot_for_session

            with AICSessionORM(aic_engine) as db:
                snap = get_mosaic_snapshot_for_session(db, session_id)
            if isinstance(snap, dict) and snap:
                flow_snapshot = snap

        if main_flow is None and flow_snapshot is None:
            raise Exception("No flows found in workspace to submit.")

        # 2. Save to AICCORE Submission table (flow_snapshot from Langflow row or mosaic fallback)
        from .models import Event
        from .event_lock import event_sequence_write_lock, ensure_pg_advisory_xact_lock

        with event_sequence_write_lock(session_id):
            with AICSessionORM(aic_engine) as db:
                ensure_pg_advisory_xact_lock(db, session_id)
                aic_session_obj = db.get(AICSession, session_id)
                if not aic_session_obj:
                    raise Exception("AICCORE Session not found.")
                if aic_session_obj.is_submitted:
                    existing_row = (
                        db.execute(
                            select(Submission)
                            .where(Submission.session_id == session_id)
                            .order_by(Submission.submitted_at.desc())
                            .limit(1)
                        )
                        .scalars()
                        .first()
                    )
                    if existing_row:
                        return str(existing_row.id)
                    raise Exception("AICCORE Session marked submitted but no submission row found.")

                new_submission = Submission(
                    session_id=session_id,
                    flow_snapshot=flow_snapshot
                )
                db.add(new_submission)
                aic_session_obj.is_submitted = True
                db.flush()  # ensure new_submission.id before Event payload

                stmt = select(Event).where(Event.session_id == session_id).order_by(Event.sequence_number.desc())
                last_event = db.execute(stmt).scalars().first()
                seq = (last_event.sequence_number + 1) if last_event else 0

                sub_event = Event(
                    session_id=session_id,
                    sequence_number=seq,
                    event_type="submitted",
                    payload={
                        "submission_id": str(new_submission.id),
                        "nickname": aic_session_obj.nickname,
                        "snapshot": flow_snapshot,
                    }
                )
                db.add(sub_event)
                db.commit()
                submit_id = str(new_submission.id)
                submit_nick = aic_session_obj.nickname
                submit_station = aic_session_obj.station_id

        from .broadcast import broadcast_manager

        # Await (not fire-and-forget) so mosaic/TV reliably receive before HTTP returns
        await broadcast_manager.broadcast(
            {
                "session_id": str(session_id),
                "event_type": "submitted",
                "payload": {
                    "submission_id": submit_id,
                    "nickname": submit_nick,
                    "station_id": submit_station,
                    "snapshot": flow_snapshot,
                },
            }
        )
        await broadcast_manager.broadcast(
            {
                "type": "SUBMISSION_UPDATE",
                "data": {"session_id": str(session_id)},
            }
        )

        return submit_id
    except Exception as e:
        logger.error(f"❌ AICCORE: Failed to submit workspace: {e}")
        raise


def _snapshot_debounce_seconds() -> float:
    raw = os.getenv("AICCORE_SNAPSHOT_DEBOUNCE_SEC", "1.2")
    try:
        v = float(raw)
        return max(0.2, min(v, 30.0))
    except ValueError:
        return 1.2


_snapshot_debounce_sec = _snapshot_debounce_seconds()
_pending_snapshots: Dict[str, asyncio.Task] = {}


def schedule_workspace_snapshot(session_id: UUID) -> None:
    """
    Coalesce rapid Langflow saves (many users typing) into one snapshot per seat after quiet period.
    Must run from an asyncio loop (e.g. middleware after request).
    """
    key = str(session_id)
    prev = _pending_snapshots.get(key)
    if prev is not None and not prev.done():
        prev.cancel()

    async def _debounced() -> None:
        me = asyncio.current_task()
        try:
            await asyncio.sleep(_snapshot_debounce_sec)
            await capture_full_workspace_snapshot(session_id)
        except asyncio.CancelledError:
            return
        finally:
            if me is not None and _pending_snapshots.get(key) is me:
                _pending_snapshots.pop(key, None)

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    task = loop.create_task(_debounced())
    _pending_snapshots[key] = task
