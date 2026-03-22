import gzip
import json
import asyncio
from datetime import datetime, timezone
from uuid import UUID

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response, JSONResponse

from .database import engine
from .models import Event
from .broadcast import broadcast_manager
from .event_lock import event_sequence_write_lock, ensure_pg_advisory_xact_lock


async def _read_starlette_response_body(response: Response) -> bytes:
    """Drain response bytes; StreamingResponse has body_iterator, not async body()."""
    it = getattr(response, "body_iterator", None)
    if it is not None:
        parts: list[bytes] = []
        async for chunk in it:
            parts.append(chunk)
        return b"".join(parts)
    body_fn = getattr(response, "body", None)
    if callable(body_fn):
        return await body_fn()
    raw = getattr(response, "body", None)
    if isinstance(raw, (bytes, memoryview, bytearray)):
        return bytes(raw)
    return b""


def _passthrough_raw_response(body_bytes: bytes, response: Response) -> Response:
    """Rebuild response after the upstream body was consumed (do not return ``response``)."""
    return Response(
        content=body_bytes,
        status_code=response.status_code,
        headers=dict(response.headers),
    )


class AICCoreEventMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # We only care about API calls to Langflow's flow and run endpoints
        path = request.url.path
        method = request.method
        
        # Extract Session ID from header, cookie, or query param
        session_id_str = request.headers.get("X-AICCORE-Session-ID")
        
        if not session_id_str:
            session_id_str = request.cookies.get("aiccore_session_id")
            
        if not session_id_str:
            session_id_str = request.query_params.get("session_id")

        if not session_id_str:
            # Robust fallback for IFrames: Check Referer query params
            referer = request.headers.get("referer")
            if referer and "session_id=" in referer:
                try:
                    import urllib.parse
                    parsed = urllib.parse.urlparse(referer)
                    qs = urllib.parse.parse_qs(parsed.query)
                    session_id_str = qs.get("session_id", [None])[0]
                except:
                    pass
            
        if not session_id_str:
            return await call_next(request)
        
        try:
            session_id = UUID(session_id_str)
        except (ValueError, TypeError):
            return await call_next(request)

        # Proactively update station heartbeat on every valid interaction
        self._update_station_heartbeat(session_id)

        # Hide other seats' flows/folders in the Langflow UI when this session has an arena folder.
        if method == "GET" and path.rstrip("/") in ("/api/v1/flows", "/api/v1/projects"):
            return await self._filter_langflow_list_response(request, call_next, session_id)

        # Capture Workspace Changes (Flows, Folders, and Variables)
        # We intercept Creations (POST), Updates (PATCH), and Deletions (DELETE)
        # to ensure the persistent profile always has a perfect snapshot.
        is_workspace_change = False
        workspace_paths = ["/api/v1/flows", "/api/v1/folders", "/api/v1/variables"]
        
        if any(p in path for p in workspace_paths):
            if method in ["POST", "PATCH", "DELETE"]:
                # If it is a flow save/update, we want the granular nodes/edges for live display
                if "/api/v1/flows" in path and method in ["POST", "PATCH"]:
                    return await self._handle_flow_save(request, call_next, session_id)
                
                is_workspace_change = True

        if is_workspace_change:
            return await self._handle_workspace_change(request, call_next, session_id)
            
        # Capture granular "build" and "run" events for live sharing
        if method == "POST":
            # Flow Run / Build
            if "/api/v1/build/" in path and "/flow" in path:
                return await self._handle_granular_event(request, call_next, session_id, "flow_run")
            
            # Vertex Build (Single node)
            if "/api/v1/build/" in path and "/vertices/" in path:
                return await self._handle_granular_event(request, call_next, session_id, "vertex_run")

        return await call_next(request)

    async def _handle_workspace_change(self, request: Request, call_next, session_id: UUID):
        # Allow the operation to complete first so the DB is updated
        # We need to read the body safely if it's a POST/PATCH
        if request.method in ["POST", "PATCH"]:
            body_bytes = await request.body()
            async def receive():
                return {"type": "http.request", "body": body_bytes}
            new_request = Request(request.scope, receive=receive)
            response = await call_next(new_request)
        else:
            response = await call_next(request)

        # Trigger a background snapshot of the entire workspace
        # This is more robust than capturing individual changes
        if response.status_code < 300: # Only if operation succeeded
            try:
                from .eraser import schedule_workspace_snapshot
                schedule_workspace_snapshot(session_id)
            except Exception as e:
                print(f"❌ Failed to trigger workspace snapshot: {e}")

        return response

    async def _handle_flow_save(self, request: Request, call_next, session_id: UUID):
        # We must read the body without consuming it for the next handler
        body_bytes = await request.body()
        
        # Create a new request with the body bytes so the next handler can read it
        async def receive():
            return {"type": "http.request", "body": body_bytes}
            
        new_request = Request(request.scope, receive=receive)
        req_path = request.url.path

        try:
            body = json.loads(body_bytes)
            flow_data = body.get("data", {})
        except Exception:
            body = {}
            flow_data = {}

        # Put new flows into this seat's arena folder (concurrent builders share one Langflow DB).
        if request.method == "POST" and "/api/v1/flows" in req_path and isinstance(body, dict) and not body.get("folder_id"):
            try:
                with Session(engine) as db_session:
                    from .models import Session as AICSession
                    s = db_session.get(AICSession, session_id)
                    if s and s.langflow_workspace_folder_id:
                        body["folder_id"] = str(s.langflow_workspace_folder_id)
                        body_bytes = json.dumps(body).encode("utf-8")
            except Exception:
                pass

        # Get user details for broadcast
        nickname = "Builder"
        station_id = "0"
        with Session(engine) as db_session:
            from .models import Session as AICSession
            s = db_session.get(AICSession, session_id)
            if s:
                nickname = s.nickname
                station_id = str(s.station_id)

        response = await call_next(new_request)

        if response.status_code >= 300:
            return response

        # Log and Broadcast with snapshot (only after Langflow accepted the save)
        payload = {
            "nickname": nickname,
            "station_id": station_id,
            "snapshot": {
                "nodes": flow_data.get("nodes", []),
                "edges": flow_data.get("edges", [])
            }
        }

        self._log_event(session_id, "flow_saved", payload)

        try:
            from .eraser import schedule_workspace_snapshot
            schedule_workspace_snapshot(session_id)
        except Exception:
            pass

        # ---------------------------------------------------------
        # AUTO-ACHIEVEMENT ENGINE (V1)
        # ---------------------------------------------------------
        try:
            nodes = flow_data.get("nodes", [])
            node_types = [n.get("type") for n in nodes if n.get("type")]

            # 1. Database Master (Detect any DB/Vector DB nodes)
            db_keywords = ["PostgreSQL", "Supabase", "Memory", "VectorStore", "SQL"]
            has_db = any(any(kw in nt for kw in db_keywords) for nt in node_types)

            # 2. Logic Architect (More than 10 nodes)
            is_complex = len(nodes) > 10

            with Session(engine) as db_session:
                from .models import Participant, Achievement, Session as AICSession
                stmt = (
                    select(Participant)
                    .join(AICSession, AICSession.user_id == Participant.id)
                    .where(AICSession.id == session_id)
                )
                user = db_session.execute(stmt).scalars().first()

                if user:
                    if has_db:
                        self._auto_award(db_session, user, "Database Explorer", "Successfully integrated a memory or database node.")
                    if is_complex:
                        self._auto_award(db_session, user, "Logic Architect", "Built a workflow with more than 10 active nodes.")
        except Exception as e:
            print(f"⚠️ Auto-Achievement Error: {e}")

        return response

    def _auto_award(self, db_session, user, badge_name, badge_desc):
        # Professional standard: Prevent duplicate awards and auto-create missing badges
        from .models import Achievement
        
        # Check if user already has it
        if any(h.get("name") == badge_name for h in (user.honors or {}).values()):
            return
            
        # Ensure the Achievement exists in the registry
        stmt = select(Achievement).where(Achievement.name == badge_name)
        ach = db_session.execute(stmt).scalars().first()
        if not ach:
            ach = Achievement(name=badge_name, description=badge_desc)
            db_session.add(ach)
            db_session.flush()
            
        # Award it
        curr_honors = dict(user.honors or {})
        curr_honors[str(ach.id)] = {
            "name": ach.name,
            "awarded_at": datetime.now(timezone.utc).isoformat(),
            "type": "AUTO"
        }
        user.honors = curr_honors
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(user, "honors")
        db_session.commit()
        
        # Trigger real-time broadcast
        try:
            import asyncio
            from .broadcast import broadcast_manager
            loop = asyncio.get_running_loop()
            loop.create_task(broadcast_manager.broadcast({
                "type": "HONOR_AWARDED",
                "data": {"user_id": str(user.id), "achievement": badge_name, "is_auto": True}
            }))
        except RuntimeError:
            pass  # No running loop
        except Exception:
            pass

    async def _handle_granular_event(self, request: Request, call_next, session_id: UUID, category: str):
        path = request.url.path
        metadata = {"path": path}
        
        # Extract vertex_id if present in path
        if category == "vertex_run":
            parts = path.split("/")
            if len(parts) >= 7: # /api/v1/build/{id}/vertices/{vertex_id}
                metadata["vertex_id"] = parts[6]

        self._log_event(session_id, f"{category}_started", metadata)
        start_time = datetime.now(timezone.utc)
        response = await call_next(request)
        duration = (datetime.now(timezone.utc) - start_time).total_seconds()
        
        metadata["status"] = "success" if response.status_code < 400 else "error"
        metadata["status_code"] = response.status_code
        metadata["duration"] = duration
        
        self._log_event(session_id, f"{category}_completed", metadata)
        return response

    async def _filter_langflow_list_response(self, request: Request, call_next, session_id: UUID):
        """When AICCORE has a per-seat arena folder, hide other seats' flows/projects in Langflow."""
        response = await call_next(request)
        if response.status_code != 200:
            return response

        from sqlalchemy.orm import Session as AICSessionORM
        from .database import engine as aic_engine
        from .models import Session as AICSession
        from langflow.services.database.models import Folder
        from langflow.services.deps import session_scope
        from langflow.services.database.models.folder.constants import DEFAULT_FOLDER_NAME
        from langflow.initial_setup.constants import STARTER_FOLDER_NAME
        from .eraser import collect_folder_descendants

        with AICSessionORM(aic_engine) as db:
            aic_sess = db.get(AICSession, session_id)
            root_id = aic_sess.langflow_workspace_folder_id if aic_sess else None
        if not root_id:
            return response

        body_bytes = await _read_starlette_response_body(response)
        enc = (response.headers.get("content-encoding") or "").lower()
        raw = body_bytes
        if enc == "gzip":
            try:
                raw = gzip.decompress(body_bytes)
            except Exception:
                return _passthrough_raw_response(body_bytes, response)

        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            return _passthrough_raw_response(body_bytes, response)

        try:
            async with session_scope() as lf:
                allowed = await collect_folder_descendants(lf, root_id)
                for name in (DEFAULT_FOLDER_NAME, STARTER_FOLDER_NAME):
                    row = (await lf.execute(select(Folder).where(Folder.name == name))).scalars().first()
                    if row:
                        allowed.add(row.id)
        except Exception:
            # Body was already drained — must not return the original streaming response.
            return _passthrough_raw_response(body_bytes, response)

        allowed_str = {str(x) for x in allowed}
        path = request.url.path.rstrip("/")

        def _filter_flow_items(items: list) -> list:
            return [
                p
                for p in items
                if p.get("folder_id") is not None and str(p.get("folder_id")) in allowed_str
            ]

        def _filter_project_items(items: list) -> list:
            return [
                p
                for p in items
                if str(p.get("id")) in allowed_str or p.get("name") == DEFAULT_FOLDER_NAME
            ]

        if path.endswith("/flows"):
            if isinstance(payload, list):
                payload = _filter_flow_items(payload)
            elif isinstance(payload, dict) and isinstance(payload.get("items"), list):
                payload = dict(payload)
                payload["items"] = _filter_flow_items(payload["items"])
        elif path.endswith("/projects"):
            if isinstance(payload, list):
                payload = _filter_project_items(payload)
            elif isinstance(payload, dict) and isinstance(payload.get("items"), list):
                payload = dict(payload)
                payload["items"] = _filter_project_items(payload["items"])

        if enc == "gzip":
            json_data = json.dumps(jsonable_encoder(payload)).encode("utf-8")
            compressed = gzip.compress(json_data, compresslevel=6)
            return Response(
                content=compressed,
                status_code=response.status_code,
                media_type="application/json",
                headers={
                    "Content-Encoding": "gzip",
                    "Vary": "Accept-Encoding",
                    "Content-Length": str(len(compressed)),
                },
            )
        return JSONResponse(content=payload, status_code=response.status_code)

    def _update_station_heartbeat(self, session_id: UUID):
        """Updates the station's last heartbeat and ensures status is consistent."""
        try:
            with Session(engine) as db_session:
                from .models import Session as AICSession, Station
                # Find the session and its station
                stmt = select(AICSession).where(AICSession.id == session_id)
                session_obj = db_session.execute(stmt).scalars().first()
                if session_obj and session_obj.station_id:
                    # Update station telemetry
                    station = db_session.get(Station, session_obj.station_id)
                    if station:
                        station.last_heartbeat = datetime.now(timezone.utc)
                        # If station was offline/available, it's definitely occupied now
                        if station.status in ["available", "offline"]:
                            station.status = "occupied"
                        db_session.commit()
        except Exception as e:
            print(f"⚠️ Heartbeat Update Error: {e}")

    def _log_event(self, session_id: UUID, event_type: str, payload: dict):
        with event_sequence_write_lock(session_id):
            with Session(engine) as db_session:
                ensure_pg_advisory_xact_lock(db_session, session_id)
                stmt = select(Event).where(Event.session_id == session_id).order_by(Event.sequence_number.desc())
                last_event = db_session.execute(stmt).scalars().first()
                seq = (last_event.sequence_number + 1) if last_event else 0

                event = Event(
                    session_id=session_id,
                    sequence_number=seq,
                    event_type=event_type,
                    payload=payload
                )
                db_session.add(event)
                db_session.commit()
                db_session.refresh(event)

                try:
                    loop = asyncio.get_running_loop()
                    event_data = {
                        "session_id": str(session_id),
                        "event_type": event_type,
                        "sequence_number": seq,
                        "timestamp": event.timestamp.isoformat(),
                        "payload": payload
                    }
                    loop.create_task(broadcast_manager.broadcast(event_data))

                    from .sync import push_event_to_cloud
                    loop.create_task(push_event_to_cloud(event_data))
                except RuntimeError:
                    pass
                except Exception as e:
                    print(f"❌ Failed to broadcast event: {e}")
