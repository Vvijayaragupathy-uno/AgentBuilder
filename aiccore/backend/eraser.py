from uuid import UUID
from datetime import datetime
from sqlalchemy import delete, select
from langflow.services.database.models import Flow, MessageTable, Variable, TransactionTable, ApiKey, File, Folder, Job, User as LFUser
from langflow.services.deps import session_scope
from lfx.log.logger import logger

async def capture_full_workspace_snapshot(session_id: UUID):
    """
    Captures the entire state of the workspace (all non-starter folders, all flows, and variables).
    Stored as a manifest in the aiccore events.
    """
    logger.info(f"📸 AICCORE: Capturing Full Workspace Snapshot for session {session_id}...")
    try:
        async with session_scope() as session:
            # 1. Fetch all folders (except Starters)
            folder_stmt = select(Folder).where(Folder.name != "Starter Projects")
            folders = (await session.execute(folder_stmt)).scalars().all()
            
            # 2. Fetch all flows
            flow_stmt = select(Flow)
            flows = (await session.execute(flow_stmt)).scalars().all()

            # 3. Fetch all variables
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
            
            with AICSession(aic_engine) as db:
                from .models import Event
                stmt = select(Event).where(Event.session_id == session_id).order_by(Event.sequence_number.desc())
                last_event = db.execute(stmt).scalars().first()
                seq = (last_event.sequence_number + 1) if last_event else 0
                
                snapshot_event = Event(
                    session_id=session_id,
                    sequence_number=seq,
                    event_type="workspace_snapshot",
                    payload=manifest
                )
                db.add(snapshot_event)
                db.commit()
                logger.info(f"✅ AICCORE: Workspace snapshot saved to profile ({len(flows)} flows, {len(folders)} folders, {len(variables)} vars).")

    except Exception as e:
        logger.error(f"❌ AICCORE: Failed to capture workspace: {e}")

async def purge_langflow_workspace():
    """
    Clears all user-custom content but surgically keeps system starter projects and structure.
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

async def restore_user_workspace(manifest: dict):
    """
    Rebuilds the entire workspace from a manifest (Folders, Flows, Variables).
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

                new_flow = Flow(
                    id=UUID(f["id"]),
                    name=f["name"],
                    description=f.get("description"),
                    data=f["data"],
                    folder_id=UUID(f["folder_id"]) if f.get("folder_id") else None,
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
        async with session_scope() as session:
            # 1. Fetch flows, sorted by updated_at
            from sqlalchemy import desc
            flow_stmt = select(Flow).where(Flow.is_component == False).order_by(desc(Flow.updated_at)).limit(1)
            main_flow = (await session.execute(flow_stmt)).scalar()
            
            if not main_flow:
                # Fallback to any flow if no non-component flows found
                flow_stmt = select(Flow).order_by(desc(Flow.updated_at)).limit(1)
                main_flow = (await session.execute(flow_stmt)).scalar()
            
            if not main_flow:
                raise Exception("No flows found in workspace to submit.")

            # 2. Save to AICCORE Submission table
            from .database import engine as aic_engine
            from .models import Submission, Session as AICSession, Event
            from sqlalchemy.orm import Session as AICSessionORM
            
            with AICSessionORM(aic_engine) as db:
                aic_session_obj = db.get(AICSession, session_id)
                if not aic_session_obj:
                    raise Exception("AICCORE Session not found.")
                
                new_submission = Submission(
                    session_id=session_id,
                    flow_snapshot=main_flow.data
                )
                db.add(new_submission)
                aic_session_obj.is_submitted = True
                
                # Log event
                stmt = select(Event).where(Event.session_id == session_id).order_by(Event.sequence_number.desc())
                last_event = db.execute(stmt).scalars().first()
                seq = (last_event.sequence_number + 1) if last_event else 0
                
                sub_event = Event(
                    session_id=session_id,
                    sequence_number=seq,
                    event_type="submitted",
                    payload={"submission_id": str(new_submission.id)}
                )
                db.add(sub_event)
                
                db.commit()
                return str(new_submission.id)
    except Exception as e:
        logger.error(f"❌ AICCORE: Failed to submit workspace: {e}")
        raise e
