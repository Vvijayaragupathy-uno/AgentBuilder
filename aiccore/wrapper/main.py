import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# /app/aiccore/wrapper/main.py → parent×3 = /app (project root in container)
project_root = Path(__file__).resolve().parent.parent.parent

print(f"--- DEBUG: Starting AICCORE Wrapper ---")
print(f"Current File: {__file__}")
print(f"Project Root: {project_root}")
print(f"Python path: {sys.path[:3]}")


# Import Langflow's app creator
from langflow.main import setup_app
from fastapi import Request, HTTPException, WebSocket, WebSocketDisconnect, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import shutil
from uuid import UUID, uuid4
from typing import Optional, Dict, Any, List

# Import AICCORE backend
from aiccore.backend.database import init_db, get_session, engine
from aiccore.backend.models import Session as AICSession, Participant as User, Station, Submission, Event, Challenge, Achievement, ChallengeRegistration
from aiccore.backend.middleware import AICCoreEventMiddleware
from aiccore.backend.eraser import purge_langflow_workspace
from aiccore.backend.broadcast import broadcast_manager
from sqlalchemy.orm import Session
from sqlalchemy import select, func, update, delete
import random
import re

# In-memory storage for unlock rate limiting (Google standard protection)
# { ip: {"attempts": int, "locked_until": datetime} }
FAILED_ATTEMPTS = {}
LOCKOUT_DURATION_SECONDS = 300 # 5 minutes
MAX_ATTEMPTS = 5
ARENA_LOCKED = False # Global switch to block all station unlocks

def sanitize_string(s: str, length: int = 50) -> str:
    # Remove special chars, allow alphanumeric and underscores
    s = re.sub(r'[^\w\s-]', '', s)
    return s[:length].strip()

def generate_unlock_code():
    return f"{random.randint(0, 9999):04d}"

class UserCreateRequest(BaseModel):
    username: str
    nickname: Optional[str] = None
    password: Optional[str] = None

class AdminLoginRequest(BaseModel):
    password: str

class SessionStartRequest(BaseModel):
    nickname: str
    station_id: Optional[str] = None
    challenge_id: Optional[str] = None

class SubmissionRequest(BaseModel):
    session_id: UUID
    flow_snapshot: Dict[str, Any]
    flow_name: Optional[str] = None
    description: Optional[str] = None

class UnlockRequest(BaseModel):
    unlock_code: str
    station_id: Optional[str] = None

class ChallengeRequest(BaseModel):
    title: str
    description: str
    complexity_level: Optional[str] = "Beginner"
    max_participants: Optional[int] = 10
    duration_minutes: Optional[int] = 60
    start_time: Optional[datetime] = None
    location: Optional[str] = "Main Arena"
    is_registration_open: Optional[bool] = True
    starter_assets_url: Optional[str] = None
    banner_image_url: Optional[str] = None

class AchievementRequest(BaseModel):
    name: str
    description: str
    icon_url: Optional[str] = None

class StationRegisterRequest(BaseModel):
    id: str
    ip_address: str

def create_aiccore_app():
    """
    Creates the AICCORE application by wrapping the Langflow setup_app.
    This serves as the V1 implementation point for AICCORE logic.
    """
    # Initialize Langflow app
    # AICCORE_BACKEND_ONLY=True avoids errors when frontend files are missing/not built
    backend_only = os.getenv("AICCORE_BACKEND_ONLY", "false").lower() == "true"
    print(f"🚀 Starting Langflow with backend_only={backend_only}")
    app = setup_app(backend_only=backend_only)

    # Dynamic origins for CORS
    allowed_origins = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ]
    
    # Add Railway service URLs if they exist
    dashboard_url = os.getenv("RAILWAY_SERVICE_AICCORE_DASHBOARD_URL")
    if dashboard_url:
        allowed_origins.append(f"https://{dashboard_url}")
        
    langflow_url = os.getenv("RAILWAY_SERVICE_HAPPY_CAT_URL")
    if langflow_url:
        allowed_origins.append(f"https://{langflow_url}")

    # Allow the specific internal domain too if used by frontend
    allowed_origins.append("http://agentbuilder.railway.internal")
    allowed_origins.append("http://agentbuilder.railway.internal:8080")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True, # Required for cookies/auth with explicit origins
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Initialize AICCORE Database
    print("🔧 Initializing AICCORE Database...")
    init_db()

    # Start Cloud Sync Background Task
    @app.on_event("startup")
    async def startup_event():
        from aiccore.backend.sync import sync_to_cloud
        import asyncio
        asyncio.create_task(sync_to_cloud())
        print("☁️ Cloud Sync: Background worker active.")

    # Middleware to allow IFrame embedding for our dashboard
    @app.middleware("http")
    async def allow_iframe_middleware(request: Request, call_next):
        response = await call_next(request)
        # We need to remove these to allow embedding in the arena dashboard
        if "X-Frame-Options" in response.headers:
            del response.headers["X-Frame-Options"]
        # Build the list of allowed frame-ancestor origins dynamically
        frame_ancestors = [
            "'self'",
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:3001",
        ]
        # Include Railway service URLs when available
        dashboard_url = os.getenv("RAILWAY_SERVICE_AICCORE_DASHBOARD_URL")
        if dashboard_url:
            frame_ancestors.append(f"https://{dashboard_url}")
        happy_cat_url = os.getenv("RAILWAY_SERVICE_HAPPY_CAT_URL")
        if happy_cat_url:
            frame_ancestors.append(f"https://{happy_cat_url}")

        csp = response.headers.get("Content-Security-Policy", "")
        if csp:
            new_csp = csp + " frame-ancestors " + " ".join(frame_ancestors) + ";"
            response.headers["Content-Security-Policy"] = new_csp
        return response

    @app.get("/api/v1/aiccore/health")
    async def aiccore_health():
        return {"status": "ok", "engine": "aiccore", "wrapper": "v1.0"}

    # Uploads & Static Assets
    static_dir = project_root / "static"
    upload_dir = static_dir / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

    @app.post("/api/v1/aiccore/upload")
    async def upload_image(file: UploadFile = File(...)):
        file_path = upload_dir / f"{uuid4().hex}_{file.filename}"
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {"url": f"/static/uploads/{file_path.name}"}

    @app.websocket("/api/v1/aiccore/ws")
    async def websocket_endpoint(websocket: WebSocket):
        from aiccore.backend.broadcast import broadcast_manager
        await broadcast_manager.connect(websocket)
        try:
            while True:
                # Keep connection alive, though we mostly push data
                data = await websocket.receive_text()
                # We could handle commands from dashboard here if needed
        except WebSocketDisconnect:
            broadcast_manager.disconnect(websocket)

    @app.post("/api/v1/aiccore/auth/unlock")
    async def unlock_station(req: UnlockRequest, request: Request):
        
        client_ip = request.client.host
        now = datetime.now(timezone.utc)
        
        # 0. Rate Limiting Check
        if client_ip in FAILED_ATTEMPTS:
            failed = FAILED_ATTEMPTS[client_ip]
            if failed["locked_until"] and now < failed["locked_until"]:
                wait_time = int((failed["locked_until"] - now).total_seconds())
                raise HTTPException(status_code=429, detail=f"Too many failed attempts. Try again in {wait_time}s")
        
        # 0. Check if Arena is Globally Locked
        if ARENA_LOCKED:
            raise HTTPException(status_code=403, detail="The Arena is currently closed by the administrator.")

        print(f"🔑 Unlock attempt for code {req.unlock_code} from IP {client_ip}")
        
        with Session(engine) as db_session:
            # 1. Find User by unlock_code
            stmt = select(User).where(User.unlock_code == req.unlock_code)
            user = db_session.execute(stmt).scalars().first()
            
            if not user:
                # Handle failure tracking
                failed = FAILED_ATTEMPTS.get(client_ip, {"attempts": 0, "locked_until": None})
                failed["attempts"] += 1
                if failed["attempts"] >= MAX_ATTEMPTS:
                    from datetime import timedelta
                    failed["locked_until"] = now + timedelta(seconds=LOCKOUT_DURATION_SECONDS)
                    FAILED_ATTEMPTS[client_ip] = failed
                    raise HTTPException(status_code=429, detail="Maximum attempts reached. IP locked for 5 minutes.")
                
                FAILED_ATTEMPTS[client_ip] = failed
                
                # For Phase 1 testing, let's auto-create or reset a user if code is '0000'
                if req.unlock_code == "0000":
                    stmt = select(User).where(User.username == "testuser")
                    user = db_session.execute(stmt).scalars().first()
                    if user:
                        user.unlock_code = "0000"
                        user.unlock_code_generated_at = datetime.now(timezone.utc)
                    else:
                        user = User(username="testuser", nickname="Test Builder", unlock_code="0000", unlock_code_generated_at=datetime.now(timezone.utc))
                        db_session.add(user)
                    
                    db_session.commit()
                    db_session.refresh(user)
                else:
                    raise HTTPException(status_code=401, detail=f"Invalid unlock code. {MAX_ATTEMPTS - failed['attempts']} attempts remaining.")
            
            # Reset failures on success
            if client_ip in FAILED_ATTEMPTS:
                del FAILED_ATTEMPTS[client_ip]
            
            # Check for OTP expiration (15 minutes)
            if user.unlock_code_generated_at:
                # SQLite sometimes returns naive datetimes. Force awareness if needed.
                gen_at = user.unlock_code_generated_at
                if gen_at.tzinfo is None:
                    gen_at = gen_at.replace(tzinfo=timezone.utc)
                
                age_minutes = (datetime.now(timezone.utc) - gen_at).total_seconds() / 60
                if age_minutes > 15:
                    raise HTTPException(status_code=401, detail="Unlock code has expired")
            
            # 2. Identify Station
            station = None
            if req.station_id:
                station = db_session.get(Station, req.station_id)
            else:
                stmt = select(Station).where(Station.ip_address == client_ip)
                station = db_session.execute(stmt).scalars().first()
            
            # 3. Create Session
            station_id = station.id if station else (req.station_id or "STATION_LOCAL")
            
            # 3.5 Cleanup: Deactivate any other active sessions on THIS station
            db_session.execute(
                update(AICSession)
                .where(AICSession.station_id == station_id, AICSession.is_active == True)
                .values(is_active=False, end_time=datetime.now(timezone.utc))
            )

            # Find active registration for this user
            from aiccore.backend.models import ChallengeRegistration, Challenge
            reg_stmt = select(ChallengeRegistration).where(ChallengeRegistration.user_id == user.id).order_by(ChallengeRegistration.registered_at.desc()).limit(1)
            reg = db_session.execute(reg_stmt).scalars().first()
            active_challenge_id = reg.challenge_id if reg else None

            new_session = AICSession(
                user_id=user.id,
                nickname=user.nickname,
                station_id=station_id,
                challenge_id=active_challenge_id
            )
            db_session.add(new_session)
            db_session.flush() # Get session ID
            
            # Log Session Start Event (Triggers PARTICIPATING status)
            start_event = Event(
                session_id=new_session.id,
                sequence_number=0,
                event_type="session_started",
                payload={"station_id": station_id, "nickname": user.nickname}
            )
            db_session.add(start_event)
            
            # Stats helper
            sub_count_stmt = select(func.count(Submission.id)).join(AICSession).where(AICSession.user_id == user.id)
            flows_count = db_session.execute(sub_count_stmt).scalar() or 0
            ach_count = len(user.honors) if user.honors else 0
            
            db_session.commit()

            # Broadcast session start to dash (simulate initial save)
            await broadcast_manager.broadcast({
                "session_id": str(new_session.id),
                "event_type": "flow_saved",
                "payload": {
                    "nickname": user.nickname,
                    "station_id": station_id,
                    "snapshot": {"nodes": [], "edges": []}
                }
            })

            # 4. Update Station status if found
            if station:
                station.status = "occupied"
                station.current_session_id = new_session.id
                
            # 4.5 Security Hardening: Clear unlock code after use (One-Time Use)
            # user.unlock_code = "" # Removed because of UNIQUE constraint on empty strings
            
            db_session.commit()
            db_session.refresh(new_session)
            
            # 4.6 Broadcast Update: Tell dashboard to refresh leaderboard
            await broadcast_manager.broadcast({"type": "LEADERBOARD_UPDATE", "data": {"session_id": str(new_session.id)}})

            # 5. Purge Langflow Workspace (The Eraser)
            try:
                from aiccore.backend.eraser import restore_user_workspace
                await purge_langflow_workspace()
                
                # 5.5 Sync Persistence: Restore the FULL workspace from latest manifest
                if user.username and user.username != "testuser":
                    # Search for the latest 'workspace_snapshot'
                    event_stmt = select(Event).join(AICSession).where(
                        AICSession.user_id == user.id, 
                        Event.event_type == "workspace_snapshot"
                    ).order_by(Event.timestamp.desc())
                    latest_event = db_session.execute(event_stmt).scalars().first()
                    
                    if latest_event:
                        await restore_user_workspace(latest_event.payload)
                        print(f"🔄 Persistence: Re-manifested full workspace for {user.username}")
                    else:
                        # Legacy Fallback: Try for flow_saved or Submission if manifest doesn't exist yet
                        sub_stmt = select(Submission).join(AICSession).where(
                            AICSession.user_id == user.id
                        ).order_by(Submission.submitted_at.desc())
                        latest_sub = db_session.execute(sub_stmt).scalars().first()
                        if latest_sub:
                            # Wrap submission in a basic manifest structure
                            legacy_manifest = {
                                "folders": [],
                                "flows": [{
                                    "id": str(uuid4()),
                                    "name": "Restored Flow",
                                    "data": latest_sub.flow_snapshot,
                                    "folder_id": None
                                }]
                            }
                            await restore_user_workspace(legacy_manifest)
                            print(f"🔄 Persistence: Restored legacy submission for {user.username}")
            except Exception as e:
                print(f"❌ Failed to manage workspace on unlock: {e}")
                
            # 6. Return Session Info
            response = {
                "session_id": str(new_session.id),
                "nickname": user.nickname,
                "user_id": str(user.id),
                "station_id": new_session.station_id,
                "stats": {
                    "flows_count": flows_count,
                    "achievements_count": ach_count
                }
            }
            
            from fastapi.responses import JSONResponse
            res = JSONResponse(content=response)
            res.set_cookie(
                key="aiccore_session_id", 
                value=str(new_session.id), 
                httponly=True, 
                samesite="lax",
                max_age=3600 # 1 hour session
            )
            return res

    @app.get("/api/v1/aiccore/session/{session_id}/status")
    async def get_session_status(session_id: UUID):
        with Session(engine) as db_session:
            session = db_session.get(AICSession, session_id)
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")
            return {"is_submitted": session.is_submitted}

    @app.get("/api/v1/aiccore/sessions/active")
    async def list_active_sessions():
        with Session(engine) as db_session:
            # Get all active sessions
            stmt = select(AICSession).where(AICSession.is_active == True)
            active_sessions = db_session.execute(stmt).scalars().all()
            
            results = []
            for s in active_sessions:
                # Find the latest 'flow_saved' event for this session to get the snapshot
                event_stmt = (
                    select(Event)
                    .where(Event.session_id == s.id, Event.event_type == "flow_saved")
                    .order_by(Event.sequence_number.desc())
                    .limit(1)
                )
                latest_event = db_session.execute(event_stmt).scalars().first()
                
                snapshot = latest_event.payload.get("snapshot", {}) if latest_event else {}
                
                results.append({
                    "session_id": str(s.id),
                    "nickname": s.nickname,
                    "station_id": s.station_id,
                    "snapshot": snapshot,
                    "last_update": latest_event.timestamp.isoformat() if latest_event else s.start_time.isoformat()
                })
            return results

    @app.get("/api/v1/aiccore/session/{session_id}/events")
    async def get_session_events(session_id: UUID):
        with Session(engine) as db_session:
            stmt = select(Event).where(Event.session_id == session_id).order_by(Event.sequence_number.asc())
            events = db_session.execute(stmt).scalars().all()
            return events

    @app.post("/api/v1/aiccore/submit")
    async def submit_flow(req: SubmissionRequest):
        with Session(engine) as db_session:
            # Check if session exists
            session_obj = db_session.get(AICSession, req.session_id)
            if not session_obj:
                raise HTTPException(status_code=404, detail="Session not found")
            
            # Create submission
            new_submission = Submission(
                session_id=req.session_id,
                flow_snapshot=req.flow_snapshot
            )
            # We can also store flow_name and description in the snapshot or add fields to Submission model
            # For now, we follow the model we defined.
            
            db_session.add(new_submission)
            
            # Mark session as submitted
            session_obj.is_submitted = True
            
            # Log submission event
            stmt = select(Event).where(Event.session_id == req.session_id).order_by(Event.sequence_number.desc())
            last_event = db_session.execute(stmt).scalars().first()
            seq = (last_event.sequence_number + 1) if last_event else 0
            
            sub_event = Event(
                session_id=req.session_id,
                sequence_number=seq,
                event_type="submitted",
                payload={"submission_id": str(new_submission.id)}
            )
            db_session.add(sub_event)
            
            db_session.commit()
            db_session.refresh(new_submission)
            return {"submission_id": str(new_submission.id), "status": "submitted"}

    @app.post("/api/v1/aiccore/session/{session_id}/submit")
    async def trigger_workspace_submission(session_id: UUID):
        from aiccore.backend.eraser import submit_workspace_as_flow
        try:
            sub_id = await submit_workspace_as_flow(session_id)
            return {"status": "success", "submission_id": sub_id}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/api/v1/aiccore/submissions")
    async def list_submissions():
        with Session(engine) as db_session:
            # Join with Session and Challenge to get nicknames, user_id, and challenge title
            stmt = select(
                Submission, 
                AICSession.nickname, 
                AICSession.station_id, 
                AICSession.user_id,
                Challenge.title.label("challenge_title"),
                AICSession.id.label("session_id")
            ).join(AICSession, Submission.session_id == AICSession.id)\
             .join(Challenge, AICSession.challenge_id == Challenge.id, isouter=True)
            
            results = db_session.execute(stmt).all()
            
            output = []
            for row in results:
                sub = row.Submission
                output.append({
                    "id": str(sub.id),
                    "session_id": str(row.session_id),
                    "user_id": str(row.user_id) if row.user_id else None,
                    "nickname": row.nickname,
                    "station_id": row.station_id,
                    "challenge_name": row.challenge_title or "GENERAL_BUILD",
                    "submitted_at": sub.submitted_at.isoformat(),
                    "flow_snapshot": sub.flow_snapshot,
                    "score": sub.score,
                    "is_winner": sub.is_winner
                })
            return output

    @app.get("/api/v1/aiccore/submissions/{submission_id}/download")
    async def download_submission(submission_id: UUID):
        with Session(engine) as db_session:
            sub = db_session.get(Submission, submission_id)
            if not sub:
                raise HTTPException(status_code=404, detail="Submission not found")
            
            aic_session = db_session.get(AICSession, sub.session_id)
            filename = f"submission_{aic_session.nickname if aic_session else 'unknown'}_{submission_id}.json"
            
            return JSONResponse(
                content=sub.flow_snapshot,
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )

    @app.post("/api/v1/aiccore/submissions/{submission_id}/winner")
    async def mark_winner(submission_id: UUID):
        with Session(engine) as db_session:
            # First, unset any previous winner if we only want one (optional but usually clear)
            db_session.execute(update(Submission).values(is_winner=False))
            
            sub_obj = db_session.get(Submission, submission_id)
            if not sub_obj:
                raise HTTPException(status_code=404, detail="Submission not found")
            
            sub_obj.is_winner = True
            db_session.commit()
            return {"status": "winner_marked", "submission_id": str(sub_obj.id)}

    @app.get("/api/v1/aiccore/leaderboard")
    async def get_leaderboard():
        from aiccore.backend.models import ChallengeRegistration
        with Session(engine) as db_session:
            user_stmt = select(User).order_by(User.created_at.desc())
            all_users = db_session.execute(user_stmt).scalars().all()
            
            leaderboard = []
            for u in all_users:
                session_stmt = select(AICSession).where(AICSession.user_id == u.id, AICSession.is_active == True).limit(1)
                active_session = db_session.execute(session_stmt).scalars().first()
                
                status = "REGISTERED"
                station_id = "OFFLINE"
                score = 0
                is_winner = False
                active_mission = "UNASSIGNED"
                
                # Check for active session first
                if active_session:
                    station_id = active_session.station_id or "0"
                    
                    event_stmt = select(func.count(Event.id)).where(Event.session_id == active_session.id)
                    event_count = db_session.execute(event_stmt).scalar() or 0
                    
                    if event_count > 0:
                        status = "PARTICIPATING"
                    
                    if active_session.is_submitted:
                        status = "SUBMITTED"
                    
                    sub_stmt = select(Submission).where(Submission.session_id == active_session.id).order_by(Submission.submitted_at.desc())
                    submission = db_session.execute(sub_stmt).scalars().first()
                    if submission:
                        score = submission.score or 0
                        is_winner = submission.is_winner or False
                    
                    if active_session.challenge_id:
                        c = db_session.get(Challenge, active_session.challenge_id)
                        if c: active_mission = c.title
                
                # If no mission found in session, check registrations
                if active_mission == "UNASSIGNED":
                    reg_stmt = select(ChallengeRegistration).where(ChallengeRegistration.user_id == u.id).order_by(ChallengeRegistration.registered_at.desc()).limit(1)
                    reg = db_session.execute(reg_stmt).scalars().first()
                    if reg:
                        c = db_session.get(Challenge, reg.challenge_id)
                        if c: active_mission = c.title

                leaderboard.append({
                    "id": str(u.id),
                    "nickname": u.nickname,
                    "station": station_id,
                    "status": status,
                    "score": score,
                    "is_winner": is_winner,
                    "mission": active_mission
                })
            
            # Sort by winner (desc), then score (desc), then status (Submitted > Participating > Registered)
            status_rank = {"SUBMITTED": 3, "PARTICIPATING": 2, "REGISTERED": 1}
            leaderboard.sort(key=lambda x: (x["is_winner"], x["score"], status_rank.get(x["status"], 0)), reverse=True)
            return leaderboard

    @app.get("/api/v1/aiccore/challenges")
    async def list_challenges():
        from aiccore.backend.models import ChallengeRegistration
        with Session(engine) as db_session:
            stmt = select(Challenge).order_by(Challenge.created_at.desc())
            results = db_session.execute(stmt).scalars().all()
            
            output = []
            for c in results:
                reg_stmt = select(func.count(ChallengeRegistration.id)).where(ChallengeRegistration.challenge_id == c.id)
                reg_count = db_session.execute(reg_stmt).scalar() or 0
                
                # Convert to dict and add registration count
                c_data = {
                    "id": str(c.id),
                    "title": c.title,
                    "description": c.description,
                    "is_active": c.is_active,
                    "complexity_level": c.complexity_level,
                    "max_participants": c.max_participants,
                    "duration_minutes": c.duration_minutes,
                    "start_time": c.start_time.isoformat() if c.start_time else None,
                    "location": c.location,
                    "is_registration_open": c.is_registration_open,
                    "registration_count": reg_count,
                    "starter_assets_url": c.starter_assets_url,
                    "banner_image_url": c.banner_image_url
                }
                output.append(c_data)
            return output

    @app.post("/api/v1/aiccore/challenges/{challenge_id}/toggle")
    async def toggle_challenge(challenge_id: UUID):
        with Session(engine) as db_session:
            c = db_session.get(Challenge, challenge_id)
            if not c:
                raise HTTPException(status_code=404, detail="Challenge not found")
            c.is_active = not c.is_active
            db_session.commit()
            return {"status": "updated", "is_active": c.is_active}

    @app.post("/api/v1/aiccore/challenges")
    async def create_challenge(req: ChallengeRequest):
        with Session(engine) as db_session:
            new_challenge = Challenge(
                title=req.title,
                description=req.description,
                complexity_level=req.complexity_level,
                max_participants=req.max_participants,
                duration_minutes=req.duration_minutes,
                start_time=req.start_time,
                location=req.location,
                is_registration_open=req.is_registration_open,
                starter_assets_url=req.starter_assets_url,
                banner_image_url=req.banner_image_url
            )
            db_session.add(new_challenge)
            db_session.commit()
            db_session.refresh(new_challenge)
            return new_challenge

    @app.patch("/api/v1/aiccore/challenges/{challenge_id}")
    async def update_challenge(challenge_id: UUID, req: ChallengeRequest):
        with Session(engine) as db_session:
            c = db_session.get(Challenge, challenge_id)
            if not c:
                raise HTTPException(status_code=404, detail="Challenge not found")
            c.title = req.title
            c.description = req.description
            c.complexity_level = req.complexity_level
            c.max_participants = req.max_participants
            c.duration_minutes = req.duration_minutes
            c.start_time = req.start_time
            c.location = req.location
            c.is_registration_open = req.is_registration_open
            c.starter_assets_url = req.starter_assets_url
            c.banner_image_url = req.banner_image_url
            db_session.commit()
            db_session.refresh(c)
            return c

    @app.post("/api/v1/aiccore/broadcast")
    async def admin_broadcast(req: Dict[str, str]):
        message = req.get("message", "")
        if not message:
            raise HTTPException(status_code=400, detail="Message cannot be empty")
        await broadcast_manager.broadcast({
            "type": "ADMIN_BROADCAST",
            "message": message,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        return {"status": "broadcast_sent"}

    @app.post("/api/v1/aiccore/challenges/{challenge_id}/register")
    async def register_user_to_challenge(challenge_id: UUID, req: Dict[str, str]):
        from aiccore.backend.models import ChallengeRegistration
        from sqlalchemy import select
        
        user_id = req.get("user_id")
        if not user_id: raise HTTPException(status_code=400, detail="User ID required")
        
        with Session(engine) as db_session:
            # Check if user exists
            u = db_session.get(User, UUID(user_id))
            if not u: raise HTTPException(status_code=404, detail="User not found")
            
            # Check if challenge is open
            c = db_session.get(Challenge, challenge_id)
            if not c or not c.is_registration_open:
                raise HTTPException(status_code=403, detail="Registration is closed for this challenge")
            
            # Check if already registered
            stmt = select(ChallengeRegistration).where(ChallengeRegistration.user_id == u.id, ChallengeRegistration.challenge_id == challenge_id)
            existing = db_session.execute(stmt).scalars().first()
            if existing:
                return {"status": "already_registered"}
            
            reg = ChallengeRegistration(user_id=u.id, challenge_id=challenge_id)
            db_session.add(reg)
            db_session.commit()
            
            # Broadcast registry update
            await broadcast_manager.broadcast({"type": "REGISTRY_UPDATE", "data": {"challenge_id": str(challenge_id)}})
            return {"status": "success", "registration_id": reg.id}

    @app.post("/api/v1/aiccore/system/finalize")
    async def finalize_deployment():
        global ARENA_LOCKED
        ARENA_LOCKED = True
        # Broadcast Finalize command (Confetti + Lock)
        await broadcast_manager.broadcast({
            "type": "SYSTEM_FINALIZE",
            "locked": True
        })
        return {"status": "deployment_finalized"}

    @app.get("/api/v1/aiccore/system/export")
    async def export_deployment_data():
        import csv
        import io
        from fastapi.responses import StreamingResponse
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Nickname", "Station", "Score", "Winner", "Completed At"])
        
        with Session(engine) as db_session:
            stmt = select(AICSession, Submission).join(Submission, Submission.session_id == AICSession.id)
            results = db_session.execute(stmt).all()
            for s, sub in results:
                writer.writerow([s.nickname, s.station_id, sub.score, sub.is_winner, sub.submitted_at])
        
        output.seek(0)
        return StreamingResponse(
            output, 
            media_type="text/csv", 
            headers={"Content-Disposition": f"attachment; filename=arena_export_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M')}.csv"}
        )

    @app.post("/api/v1/aiccore/system/lock")
    async def toggle_system_lock():
        global ARENA_LOCKED
        ARENA_LOCKED = not ARENA_LOCKED
        return {"locked": ARENA_LOCKED}

    @app.get("/api/v1/aiccore/system/status")
    async def get_system_status():
        with Session(engine) as db_session:
            # Get the single active challenge to show on landing pages if needed
            stmt = select(Challenge).where(Challenge.is_active == True).limit(1)
            active_challenge = db_session.execute(stmt).scalars().first()
            
            return {
                "locked": ARENA_LOCKED,
                "active_challenge": active_challenge.title if active_challenge else None,
                "starter_assets_url": active_challenge.starter_assets_url if active_challenge else None,
                "duration_minutes": active_challenge.duration_minutes if active_challenge else None,
                "start_time": active_challenge.start_time.isoformat() if active_challenge and active_challenge.start_time else None
            }

    @app.get("/api/v1/aiccore/stations")
    async def list_all_stations():
        with Session(engine) as db_session:
            stmt = select(Station)
            stations = db_session.execute(stmt).scalars().all()
            
            # Auto-offline check: If no heartbeat in 60s, mark as offline unless maintenance
            now = datetime.now(timezone.utc)
            results = []
            for s in stations:
                status = s.status
                if s.status != "maintenance" and s.last_heartbeat:
                    lh = s.last_heartbeat
                    if lh.tzinfo is None: lh = lh.replace(tzinfo=timezone.utc)
                    if (now - lh).total_seconds() > 300: # 5 Minute Timeout
                        # If it was occupied due to connection, release it
                        if s.status == "occupied": 
                            status = "available"
                        elif s.status == "available":
                            status = "offline"
                
                results.append({
                    "id": s.id,
                    "ip": s.ip_address,
                    "status": status,
                    "load": s.cpu_load,
                    "temp": s.core_temp,
                    "last_active": s.last_heartbeat.isoformat() if s.last_heartbeat else None
                })
            return results

    @app.post("/api/v1/aiccore/stations/{station_id}/heartbeat")
    async def station_heartbeat(station_id: str, payload: Dict[str, Any]):
        with Session(engine) as db_session:
            s = db_session.get(Station, station_id)
            if not s:
                raise HTTPException(status_code=404, detail="Station not found")
            
            s.last_heartbeat = datetime.now(timezone.utc)
            s.cpu_load = payload.get("load", s.cpu_load)
            s.core_temp = payload.get("temp", s.core_temp)
            
            # If it was offline, bring it back
            if s.status == "offline":
                s.status = "available"
                
            db_session.commit()
            return {"status": "ok"}

    @app.get("/api/v1/aiccore/achievements")
    async def list_achievements():
        from sqlalchemy import select
        with Session(engine) as db_session:
            stmt = select(Achievement)
            return db_session.execute(stmt).scalars().all()

    @app.post("/api/v1/aiccore/achievements")
    async def create_achievement(req: AchievementRequest):
        with Session(engine) as db_session:
            new_a = Achievement(name=req.name, description=req.description, icon_url=req.icon_url)
            db_session.add(new_a)
            db_session.commit()
            db_session.refresh(new_a)
            return new_a

    @app.post("/api/v1/aiccore/users/{user_id}/award/{achievement_id}")
    async def award_honor(user_id: UUID, achievement_id: UUID):
        with Session(engine) as db_session:
            user = db_session.get(User, user_id)
            ach = db_session.get(Achievement, achievement_id)
            if not user or not ach:
                raise HTTPException(status_code=404, detail="User or Achievement not found")
            
            # Update honors dict
            curr_honors = dict(user.honors or {})
            curr_honors[str(ach.id)] = {
                "name": ach.name,
                "awarded_at": datetime.now(timezone.utc).isoformat()
            }
            user.honors = curr_honors
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(user, "honors")
            db_session.commit()
            
            # Broadcast update
            await broadcast_manager.broadcast({"type": "HONOR_AWARDED", "data": {"user_id": str(user_id), "achievement": ach.name}})
            
            return {"status": "awarded", "user": user.nickname, "honor": ach.name}

    @app.get("/api/v1/aiccore/users")
    async def get_all_users():
        from sqlalchemy import select, func
        with Session(engine) as db_session:
            stmt = select(User).order_by(User.created_at.desc())
            users = db_session.execute(stmt).scalars().all()
            
            user_list = []
            for u in users:
                # Count submissions
                sub_stmt = select(func.count(Submission.id)).join(AICSession, Submission.session_id == AICSession.id).where(AICSession.user_id == u.id)
                sub_count = db_session.execute(sub_stmt).scalar() or 0
                
                user_list.append({
                    "id": str(u.id),
                    "nickname": u.nickname,
                    "username": u.username,
                    "unlock_code": u.unlock_code,
                    "created_at": u.created_at.isoformat(),
                    "honors_count": len(u.honors or {}),
                    "submissions_count": sub_count
                })
            return user_list

    @app.post("/api/v1/aiccore/stations/register")
    async def register_station(req: StationRegisterRequest):
        with Session(engine) as db_session:
            station = db_session.get(Station, req.id)
            if station:
                station.ip_address = req.ip_address
            else:
                station = Station(id=req.id, ip_address=req.ip_address)
                db_session.add(station)
            db_session.commit()
            return {"status": "registered", "station_id": station.id, "ip": station.ip_address}

    @app.get("/api/v1/aiccore/users/{user_id}/history")
    async def get_user_history(user_id: UUID):
        with Session(engine) as db_session:
            # Get all submissions for this user across all their sessions
            stmt = select(Submission).join(AICSession, Submission.session_id == AICSession.id).where(AICSession.user_id == user_id)
            results = db_session.execute(stmt).scalars().all()
            
            return [{
                "id": str(s.id),
                "submitted_at": s.submitted_at,
                "score": s.score,
                "is_winner": s.is_winner,
                "flow_snapshot": s.flow_snapshot
            } for s in results]

    @app.post("/api/v1/aiccore/auth/admin-login")
    async def admin_login(req: AdminLoginRequest):
        # Professional standard: Simple admin pass for museum local LAN
        # In a real cloud app, we'd use proper hashes
        admin_pass = os.getenv("AICCORE_ADMIN_PASS", "aiccore2024")
        
        if req.password == admin_pass:
            from fastapi.responses import JSONResponse
            res = JSONResponse(content={"status": "authenticated", "role": "admin"})
            res.set_cookie(
                key="aiccore_admin", 
                value="true", 
                httponly=True, 
                samesite="lax",
                max_age=86400 # 1 day
            )
            return res
        
        print(f"❌ Admin login failed: Incorrect password attempt.")
        raise HTTPException(status_code=401, detail="Invalid admin password")

    # Removed duplicate @app.get("/api/v1/aiccore/users")
    # The first definition of get_all_users is kept as it provides more detailed user info.

    @app.post("/api/v1/aiccore/users")
    async def create_user(req: UserCreateRequest):
        if not req.username:
            raise HTTPException(status_code=400, detail="Unique handle (username) is required")
            
        clean_username = sanitize_string(req.username.lower().replace(" ", "_"), 30)
        clean_nickname = sanitize_string(req.nickname, 30) if req.nickname else None
        
        if not clean_username:
            raise HTTPException(status_code=400, detail="Invalid handle content")

        async def get_user_stats(db_session, user_id):
            # Count total submissions across all sessions for this user
            stmt = select(func.count(Submission.id)).join(AICSession).where(AICSession.user_id == user_id)
            flows_count = db_session.execute(stmt).scalar() or 0
            
            # Get user to check honors
            user = db_session.get(User, user_id)
            achievements_count = len(user.honors) if user and user.honors else 0
            
            return {
                "flows_count": flows_count,
                "achievements_count": achievements_count
            }

        with Session(engine) as db_session:
            # Check if username exists
            stmt = select(User).where(User.username == clean_username)
            existing = db_session.execute(stmt).scalars().first()
            
            if existing:
                # Password Check
                if existing.password and (not req.password or req.password != existing.password):
                    if not req.password:
                        raise HTTPException(status_code=401, detail="PASSWORD_REQUIRED")
                    else:
                        raise HTTPException(status_code=401, detail="INCORRECT_PASSWORD")

                # User matches or no password set yet - regenerate code
                existing.unlock_code = generate_unlock_code()
                existing.unlock_code_generated_at = datetime.now(timezone.utc)
                db_session.commit()
                db_session.refresh(existing)
                
                stats = await get_user_stats(db_session, existing.id)
                
                return {
                    "id": str(existing.id),
                    "username": existing.username,
                    "nickname": existing.nickname,
                    "unlock_code": existing.unlock_code,
                    "stats": stats
                }
            if not clean_nickname:
                raise HTTPException(status_code=400, detail="Display nickname is required for new profiles")

            new_user = User(
                username=clean_username,
                nickname=clean_nickname,
                password=req.password,
                unlock_code=generate_unlock_code(),
                unlock_code_generated_at=datetime.now(timezone.utc)
            )
            db_session.add(new_user)
            db_session.commit()
            db_session.refresh(new_user)
            
            # Broadcast registry update
            await broadcast_manager.broadcast({"type": "REGISTRY_UPDATE", "data": {"user_id": str(new_user.id)}})
            
            stats = await get_user_stats(db_session, new_user.id)
            return {
                "id": str(new_user.id),
                "username": new_user.username,
                "nickname": new_user.nickname,
                "unlock_code": new_user.unlock_code,
                "stats": stats
            }

    @app.post("/api/v1/aiccore/users/{user_id}/regenerate")
    async def regenerate_code(user_id: UUID):
        with Session(engine) as db_session:
            user = db_session.get(User, user_id)
            if not user:
                raise HTTPException(status_code=404, detail="User not found")
            
            # Generate a unique code
            new_code = generate_unlock_code()
            # Ensure uniqueness (simple loop for 4 digits)
            stmt = select(User).where(User.unlock_code == new_code)
            if not db_session.execute(stmt).scalars().first():
                pass # Already unique or fallback logic needed
            
            user.unlock_code = new_code
            user.unlock_code_generated_at = datetime.now(timezone.utc)
            db_session.commit()
            return {"unlock_code": user.unlock_code, "generated_at": user.unlock_code_generated_at.isoformat()}

    @app.delete("/api/v1/aiccore/users/{user_id}")
    async def delete_user(user_id: UUID):
        with Session(engine) as db_session:
            user = db_session.get(User, user_id)
            if not user:
                raise HTTPException(status_code=404, detail="User not found")
            
            # Cleanup active sessions first
            db_session.execute(delete(AICSession).where(AICSession.user_id == user_id))
            db_session.delete(user)
            db_session.commit()
            return {"status": "deleted", "user_id": str(user_id)}

    @app.post("/api/v1/aiccore/challenges/{challenge_id}/toggle-registration")
    async def toggle_registration(challenge_id: UUID):
        with Session(engine) as db_session:
            c = db_session.get(Challenge, challenge_id)
            if not c:
                raise HTTPException(status_code=404, detail="Challenge not found")
            c.is_registration_open = not c.is_registration_open
            db_session.commit()
            return {"status": "updated", "is_registration_open": c.is_registration_open}

    @app.post("/api/v1/aiccore/sync/push")
    async def push_to_cloud():
        """
        Simulates the Sync Gateway pushing winners and honors to the cloud.
        In a real deployment, this would be a background task calling an external API.
        """
        return {"status": "synced", "items_pushed": 5, "timestamp": datetime.now(timezone.utc).isoformat()}

    # Attach AICCORE Telemetry Middleware
    app.add_middleware(AICCoreEventMiddleware)
    
    return app

app = create_aiccore_app()

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting AICCORE Museum Agent Arena...")
    uvicorn.run(app, host="0.0.0.0", port=7860)
