from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
import json
import asyncio
from datetime import datetime, timezone
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import select
from .database import engine
from .models import Event
from .broadcast import broadcast_manager

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
                from .eraser import capture_full_workspace_snapshot
                # Run in background to not block the UI
                asyncio.create_task(capture_full_workspace_snapshot(session_id))
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
        
        try:
            body = json.loads(body_bytes)
            flow_data = body.get("data", {})
        except:
            flow_data = {}
        
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
        
        # Log and Broadcast with snapshot
        payload = {
            "nickname": nickname,
            "station_id": station_id,
            "snapshot": {
                "nodes": flow_data.get("nodes", []),
                "edges": flow_data.get("edges", [])
            }
        }
        
        self._log_event(session_id, "flow_saved", payload)

        # Also trigger a background snapshot for persistence
        try:
            from .eraser import capture_full_workspace_snapshot
            asyncio.create_task(capture_full_workspace_snapshot(session_id))
        except:
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
                from .models import User, Achievement, Session as AICSession
                # Get the user for this session
                stmt = select(User).join(AICSession).where(AICSession.id == session_id)
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
        if any(h.get("name") == badge_name for h in user.honors.values()):
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
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(broadcast_manager.broadcast({
                    "type": "HONOR_AWARDED", 
                    "data": {"user_id": str(user.id), "achievement": badge_name, "is_auto": True}
                }))
        except:
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
        with Session(engine) as db_session:
            # Get next sequence number
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
            
            # Broadcast the event for live dashboard
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    event_data = {
                        "session_id": str(session_id),
                        "event_type": event_type,
                        "sequence_number": seq,
                        "timestamp": event.timestamp,
                        "payload": payload
                    }
                    # Local Broadcast
                    loop.create_task(broadcast_manager.broadcast(event_data))
                    
                    # Cloud Broadcast (If configured)
                    from .sync import push_event_to_cloud
                    loop.create_task(push_event_to_cloud(event_data))
            except Exception as e:
                print(f"❌ Failed to broadcast event: {e}")
