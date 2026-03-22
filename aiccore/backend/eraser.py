import asyncio
import os
from uuid import UUID, uuid4
from typing import Optional, Set, Dict
from datetime import datetime
from sqlalchemy import delete, select
from langflow.services.database.models import Flow, MessageTable, Variable, TransactionTable, ApiKey, File, Folder, Job, User as LFUser
from langflow.services.deps import session_scope
from lfx.log.logger import logger


async def collect_folder_descendants(lf_session, root_folder_id: UUID) -> Set[UUID]:
    """All folder IDs at or under root (BFS)."""
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
        if aic_sess.langflow_workspace_folder_id:
            return aic_sess.langflow_workspace_folder_id

    async with session_scope() as lf:
        user_obj = (await lf.execute(select(LFUser).limit(1))).scalar()
        if not user_obj:
            logger.error("AICCORE: No Langflow user — cannot create arena folder")
            return None
        uid = user_obj.id
        folder_name = f"Arena {str(session_id).replace('-', '')[:8]}"
        existing = (
            await lf.execute(select(Folder).where(Folder.user_id == uid, Folder.name == folder_name))
        ).scalars().first()
        if existing:
            new_folder = existing
        else:
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
        fid = new_folder.id

    with AICSessionORM(aic_engine) as db:
        aic_sess = db.get(AICSession, session_id)
        if aic_sess:
            aic_sess.langflow_workspace_folder_id = fid
            db.commit()
    return fid


async def purge_langflow_workspace_scoped(root_folder_id: UUID) -> None:
    """Delete only flows and folders under root_folder_id (plus descendants)."""
    logger.info(f"🧹 AICCORE: Scoped purge for Langflow folder {root_folder_id}...")
    try:
        async with session_scope() as lf:
            scope = await collect_folder_descendants(lf, root_folder_id)
            await lf.execute(delete(Flow).where(Flow.folder_id.in_(scope)))

            remaining = set(scope)
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
    """
    logger.info(f"📸 AICCORE: Capturing Full Workspace Snapshot for session {session_id}...")
    try:
        from sqlalchemy.orm import Session as AICSessionORM
        from .database import engine as aic_engine
        from .models import Session as AICSession

        async with session_scope() as session:
            root_id: Optional[UUID] = None
            with AICSessionORM(aic_engine) as db:
                aic_sess = db.get(AICSession, session_id)
                if aic_sess and aic_sess.langflow_workspace_folder_id:
                    root_id = aic_sess.langflow_workspace_folder_id

            if root_id:
                scope = await collect_folder_descendants(session, root_id)
                folder_stmt = select(Folder).where(Folder.id.in_(scope))
                flow_stmt = select(Flow).where(Flow.folder_id.in_(scope))
                folders = (await session.execute(folder_stmt)).scalars().all()
                flows = (await session.execute(flow_stmt)).scalars().all()
                variables = []
            else:
                folder_stmt = select(Folder).where(Folder.name != "Starter Projects")
                folders = (await session.execute(folder_stmt)).scalars().all()
                flow_stmt = select(Flow)
                flows = (await session.execute(flow_stmt)).scalars().all()
                var_stmt = select(Variable)
                variables = (await session.execute(var_stmt)).scalars().all()
            
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
        async with session_scope() as session:
            # 1. Identify Starter Projects folder to spare its items
            starter_folder_stmt = select(Folder).where(Folder.name == "Starter Projects").limit(1)
            starter_folder = (await session.execute(starter_folder_stmt)).scalar()
            starter_id = starter_folder.id if starter_folder else None

            # 2. Delete Flows that are NOT in Starters
            # If starter_id is None, it will delete all flows which is a safe fallback
            await session.execute(delete(Flow).where(Flow.folder_id != starter_id))
            
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
        async with session_scope() as session:
            # 1. Identify Default User for Ownership
            user_stmt = select(LFUser).limit(1)
            user_obj = (await session.execute(user_stmt)).scalar()
            user_id = user_obj.id if user_obj else None
            
            # 2. Re-create Folders
            # We use original IDs. SQLite will handle them fine if they don't collide.
            # Collisions are unlikely as we just purged.
            for f in manifest.get("folders", []):
                # Double check to not re-add protected folders if they were spared from purge
                existing_check = select(Folder).where(Folder.id == UUID(f["id"])).limit(1)
                if (await session.execute(existing_check)).scalar():
                    continue

                new_folder = Folder(
                    id=UUID(f["id"]),
                    name=f["name"],
                    description=f.get("description"),
                    parent_id=UUID(f["parent_id"]) if f.get("parent_id") else None,
                    user_id=user_id
                )
                session.add(new_folder)
            
            await session.flush()
            
            # 3. Re-create Flows
            for f in manifest.get("flows", []):
                # Skip if flow already exists (though purge should have cleared it)
                existing_check = select(Flow).where(Flow.id == UUID(f["id"])).limit(1)
                if (await session.execute(existing_check)).scalar():
                    continue

                raw_fid = f.get("folder_id")
                flow_folder_id = UUID(raw_fid) if raw_fid else default_flow_folder_id
                new_flow = Flow(
                    id=UUID(f["id"]),
                    name=f["name"],
                    description=f.get("description"),
                    data=f["data"],
                    folder_id=flow_folder_id,
                    is_component=f.get("is_component", False),
                    user_id=user_id
                )
                session.add(new_flow)

            # 4. Re-create Variables
            for v in manifest.get("variables", []):
                new_var = Variable(
                    id=UUID(v["id"]),
                    name=v["name"],
                    value=v["value"],
                    type=v.get("type"),
                    default_fields=v.get("default_fields"),
                    user_id=user_id
                )
                session.add(new_var)
            
            await session.commit()
            logger.info(f"✅ AICCORE: Workspace Manifested with {len(manifest.get('folders', []))} folders, {len(manifest.get('flows', []))} flows, and {len(manifest.get('variables', []))} vars.")
    except Exception as e:
        logger.error(f"❌ AICCORE: Failed to restore workspace: {e}")

async def submit_workspace_as_flow(session_id: UUID):
    """
    Captures the most recent flow from the workspace and saves it as a Submission.
    If multiple flows exist, it tries to find the most recently updated non-component flow.
    """
    logger.info(f"📤 AICCORE: Submitting workspace for session {session_id}...")
    try:
        from sqlalchemy.orm import Session as AICSessionORM
        from .database import engine as aic_engine
        from .models import Session as AICSession

        root_id: Optional[UUID] = None
        with AICSessionORM(aic_engine) as db:
            aic_sess = db.get(AICSession, session_id)
            if aic_sess and aic_sess.langflow_workspace_folder_id:
                root_id = aic_sess.langflow_workspace_folder_id

        async with session_scope() as session:
            from sqlalchemy import desc
            if root_id:
                scope = await collect_folder_descendants(session, root_id)
                flow_stmt = (
                    select(Flow)
                    .where(Flow.is_component == False, Flow.folder_id.in_(scope))
                    .order_by(desc(Flow.updated_at))
                    .limit(1)
                )
            else:
                flow_stmt = select(Flow).where(Flow.is_component == False).order_by(desc(Flow.updated_at)).limit(1)
            main_flow = (await session.execute(flow_stmt)).scalar()

            if not main_flow:
                if root_id:
                    flow_stmt = (
                        select(Flow)
                        .where(Flow.folder_id.in_(scope))
                        .order_by(desc(Flow.updated_at))
                        .limit(1)
                    )
                else:
                    flow_stmt = select(Flow).order_by(desc(Flow.updated_at)).limit(1)
                main_flow = (await session.execute(flow_stmt)).scalar()
            
            if not main_flow:
                raise Exception("No flows found in workspace to submit.")

            # 2. Save to AICCORE Submission table
            from .models import Submission, Event
            from .event_lock import event_sequence_write_lock, ensure_pg_advisory_xact_lock

            with event_sequence_write_lock(session_id):
                with AICSessionORM(aic_engine) as db:
                    ensure_pg_advisory_xact_lock(db, session_id)
                    aic_session_obj = db.get(AICSession, session_id)
                    if not aic_session_obj:
                        raise Exception("AICCORE Session not found.")

                    flow_snapshot = main_flow.data or {}

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
        raise e
