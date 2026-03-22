import os
import sys
import asyncio
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
import anyio

# /app/aiccore/wrapper/main.py → parent×3 = /app (project root in container)
project_root = Path(__file__).resolve().parent.parent.parent

print(f"🚀 AICCORE Wrapper starting — root: {project_root}")

# Single Postgres: Langflow uses `public`; AICCORE uses `aiccore`. Langflow reads LANGFLOW_DATABASE_URL only.
_pg = (os.getenv("DATABASE_URL") or "").strip()
if _pg.startswith(("postgres://", "postgresql://")) and not (os.getenv("LANGFLOW_DATABASE_URL") or "").strip():
    os.environ["LANGFLOW_DATABASE_URL"] = _pg

# Import Langflow's app creator
from langflow.main import setup_app
from fastapi import Request, Query, HTTPException, File, UploadFile
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.routing import Match, Mount
from starlette.types import Scope
from pydantic import BaseModel
import shutil
from uuid import UUID, uuid4
from typing import Optional, Dict, Any, List
from urllib.parse import urlparse

# Import AICCORE backend
from aiccore.backend.database import init_db, get_session, engine
from aiccore.backend.models import (
    Session as AICSession,
    Participant as User,
    Station,
    Submission,
    Event,
    Challenge,
    Achievement,
    ChallengeRegistration,
    ArenaState,
    DemoQueueEntry,
)
from aiccore.backend.demo_ceremony import (
    reset_demo_state,
    try_open_demo_gate,
    force_open_demo_gate,
    get_demo_status,
    get_mosaic_snapshot_for_session,
    join_demo_queue,
    admin_advance_demo,
    remove_session_from_demo_queue,
    ensure_demo_playback_if_gate_open_idle,
)
from aiccore.backend.middleware import AICCoreEventMiddleware
from aiccore.backend.eraser import (
    purge_langflow_workspace,
    ensure_langflow_workspace_folder,
    purge_langflow_workspace_scoped,
    restore_user_workspace,
)
from aiccore.backend.broadcast import broadcast_manager
from aiccore.backend.event_lock import event_sequence_write_lock, ensure_pg_advisory_xact_lock
from aiccore.backend.session_presence import expire_stale_sessions, touch_session_presence
from aiccore.backend.registrations import ensure_requested_challenge_registration
from aiccore.backend.security import (
    AICCORE_STATION_ID,
    settings_for_scheme,
    admin_cookie_max_age_seconds,
    hash_participant_password,
    normalize_failed_attempt_state,
    public_profile_password_error,
    register_failed_attempt,
    release_station_assignments,
    safe_upload_filename,
    is_valid_admin_cookie,
    is_valid_session_token,
    issue_admin_cookie_value,
    issue_session_token,
    session_token_max_age_seconds,
    participant_password_needs_upgrade,
)
from aiccore.backend.session_rules import can_submit_session
from sqlalchemy.orm import Session
from sqlalchemy import select, func, update, delete, or_, text
import random
import re
import threading


class HTTPOnlyMount(Mount):
    """``Mount`` matches both HTTP and WebSocket; ``StaticFiles`` only supports HTTP.

    Stray WebSocket connections (e.g. ``wss://host/``) must not be routed into
    ``StaticFiles`` or Starlette raises ``AssertionError``.
    """

    def matches(self, scope: Scope) -> tuple[Match, Scope]:
        if scope.get("type") == "websocket":
            return Match.NONE, {}
        return super().matches(scope)


# In-memory storage for unlock rate limiting (Google standard protection)
# { ip: {"attempts": int, "locked_until": datetime} }
FAILED_ATTEMPTS = {}
LOCKOUT_DURATION_SECONDS = 300 # 5 minutes
MAX_ATTEMPTS = 5



def _browser_origins_from_env_blob(blob: Optional[str]) -> List[str]:
    """
    Parse browser origins for CORS / CSP frame-ancestors from env strings.
    Each entry may be a hostname (foo.up.railway.app) or a full URL (https://foo.../path).
    Prevents double https:// when the value already includes a scheme (common with Railway
    templates or copy-pasted public URLs).
    """
    if not blob:
        return []
    out: List[str] = []
    for part in blob.split(","):
        raw = part.strip()
        if not raw:
            continue
        if "://" in raw:
            parsed = urlparse(raw)
            if parsed.scheme in ("http", "https") and parsed.netloc:
                out.append(f"{parsed.scheme}://{parsed.netloc}")
            continue
        host = raw.split("/")[0].strip()
        if host:
            out.append(f"https://{host}")
    return out


def _origins_from_railway_service_ref_env() -> List[str]:
    """
    Railway injects one variable per linked service, e.g. RAILWAY_SERVICE_DASHBOARD_URL,
    RAILWAY_SERVICE_AGENTBUILDER_URL — names depend on service titles. Collect every
    RAILWAY_SERVICE_*_URL that looks like a public browser host (not *.railway.internal).
    """
    out: List[str] = []
    prefix, suffix = "RAILWAY_SERVICE_", "_URL"
    for key, val in os.environ.items():
        if not key.startswith(prefix) or not key.endswith(suffix):
            continue
        if not val or not str(val).strip():
            continue
        blob = str(val).strip()
        low = blob.lower()
        if "://" in low and "railway.internal" in low and "up.railway.app" not in low:
            continue
        if "railway.internal" in low and "://" not in low:
            continue
        out.extend(_browser_origins_from_env_blob(blob))
    return out


def _collect_aiccore_browser_origins() -> List[str]:
    """Dashboard / extra hosts that must call the API and embed Langflow (Railway multi-service)."""
    merged: List[str] = []
    merged.extend(_browser_origins_from_env_blob(os.getenv("AICCORE_ALLOWED_ORIGINS")))
    # Every linked Railway service URL (name varies with service title)
    merged.extend(_origins_from_railway_service_ref_env())
    seen: set[str] = set()
    deduped: List[str] = []
    for o in merged:
        if o not in seen:
            seen.add(o)
            deduped.append(o)
    return deduped


def _aiccore_session_auth_ok(request: Request, session_id: UUID) -> bool:
    """Session routes require the signed token issued at unlock/sign-in time."""
    token = (request.headers.get("x-aiccore-session-token") or "").strip()
    if not token:
        token = request.cookies.get("aiccore_session_token") or ""
    return is_valid_session_token(session_id, token)


def _admin_authenticated(request: Request) -> bool:
    return is_valid_admin_cookie(request.cookies.get("aiccore_admin"))


def _require_admin_request(request: Request) -> None:
    if not _admin_authenticated(request):
        raise HTTPException(status_code=403, detail="Admin only")


def _get_or_create_arena_row(db: Session) -> ArenaState:
    """Persisted lock — shared across workers and survives process restarts."""
    row = db.get(ArenaState, 1)
    if row is None:
        row = ArenaState(id=1, arena_locked=False)
        db.add(row)
        db.flush()
    return row


def is_arena_locked_db(db: Session) -> bool:
    return bool(_get_or_create_arena_row(db).arena_locked)


def expire_stale_builder_sessions_db(db_session: Session) -> list[str]:
    expired = [str(sid) for sid in expire_stale_sessions(db_session)]
    if expired:
        db_session.commit()
    return expired


def challenge_start_time_utc(c: Challenge) -> Optional[datetime]:
    """Challenge.start_time normalized to UTC for comparisons, or None."""
    if c.start_time is None:
        return None
    st = c.start_time
    if st.tzinfo is None:
        return st.replace(tzinfo=timezone.utc)
    return st.astimezone(timezone.utc)


def challenge_is_live_build_window(c: Challenge, now: datetime) -> bool:
    """
    True when this mission counts as "live build" for leaderboard status:
    challenge must be active AND (no start_time OR now >= start_time in UTC).
    Matches builder page: before start_time → waiting, not "building" in the arena sense.
    """
    if not c.is_active:
        return False
    st_utc = challenge_start_time_utc(c)
    if st_utc is None:
        return True
    return now >= st_utc


_AUTO_ACTIVATE_LOCK = threading.Lock()


def maybe_auto_activate_due_challenges(db_session: Session) -> Optional[dict]:
    """
    Scheduled go-live (no admin toggle required):
    If **no** challenge is currently active, activate the earliest due mission
    (not finalized, start_time set, start_time <= now UTC). Returns MISSION_LIVE
    payload dict or None.

    If something is already active, does nothing — handoff stays manual.
    Reduces double-activation under multi-worker with a short process lock (best-effort).
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
            st_utc = challenge_start_time_utc(c)
            if st_utc is not None and st_utc <= now_utc:
                c.is_active = True
                c.is_registration_open = False
                db_session.commit()
                return {
                    "challenge_id": str(c.id),
                    "title": c.title,
                    "start_time": c.start_time.isoformat() if c.start_time else None,
                }
    return None


    return None


def heal_duplicate_active_challenges(db_session: Session) -> int:
    """
    If a race or legacy data left >1 row with is_active=True, keep the oldest by
    created_at and deactivate the rest. Prefer calling after admin mutations
    (toggle) — not on GET /system/status (read-only there).
    """
    rows = list(
        db_session.execute(
            select(Challenge)
            .where(Challenge.is_active == True)
            .order_by(Challenge.created_at.asc())
        ).scalars().all()
    )
    if len(rows) <= 1:
        return 0
    for stale in rows[1:]:
        stale.is_active = False
    db_session.commit()
    return len(rows) - 1


def sanitize_string(s: str, length: int = 50) -> str:
    # Remove special chars, allow alphanumeric and underscores
    s = re.sub(r'[^\w\s-]', '', s)
    return s[:length].strip()


def _admin_cookie_kwargs(request: Request) -> dict:
    """
    Cross-origin dashboard (Next on host A, API on host B) sends credentialed POSTs
    (e.g. unlock). SameSite=Lax cookies are not included on those requests;
    SameSite=None + Secure on HTTPS fixes it. Local HTTP keeps Lax (Secure=False).
    """
    proto = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip().lower()
    if not proto:
        proto = (request.url.scheme or "http").lower()
    return admin_cookie_settings_for_scheme(proto)


def _clear_admin_cookie(response: JSONResponse, request: Request) -> None:
    response.delete_cookie(
        key="aiccore_admin",
        path="/",
        httponly=True,
        **_admin_cookie_kwargs(request),
    )


def _session_cookie_kwargs(request: Request) -> dict:
    return {
        "httponly": True,
        "path": "/",
        "max_age": session_token_max_age_seconds(),
        **_admin_cookie_kwargs(request),
    }


def _clear_session_cookies(response: JSONResponse, request: Request) -> None:
    response.delete_cookie(
        key="aiccore_session_id",
        path="/",
        httponly=True,
        **_admin_cookie_kwargs(request),
    )
    response.delete_cookie(
        key="aiccore_session_token",
        path="/",
        httponly=True,
        **_admin_cookie_kwargs(request),
    )


def _set_session_cookies(
    response: JSONResponse,
    request: Request,
    *,
    session_id: str,
    session_token: str,
) -> None:
    kwargs = _session_cookie_kwargs(request)
    response.set_cookie(key="aiccore_session_id", value=session_id, **kwargs)
    response.set_cookie(key="aiccore_session_token", value=session_token, **kwargs)


def _set_session_id_cookie(
    response: JSONResponse,
    request: Request,
    *,
    session_id: str,
) -> None:
    response.set_cookie(key="aiccore_session_id", value=session_id, **_session_cookie_kwargs(request))


def _store_failed_attempt_state(client_ip: str, state: dict[str, Any]) -> None:
    if state.get("attempts", 0) <= 0 and state.get("locked_until") is None:
        FAILED_ATTEMPTS.pop(client_ip, None)
    else:
        FAILED_ATTEMPTS[client_ip] = state


def generate_unlock_code():
    return f"{random.randint(0, 9999):04d}"

class UserCreateRequest(BaseModel):
    username: str
    nickname: Optional[str] = None
    password: Optional[str] = None
    challenge_id: Optional[str] = None

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
    # Optional: bind session to this challenge if user is registered (avoids "latest registration wins")
    challenge_id: Optional[str] = None

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
    instructions_text: Optional[str] = None
    instructions_document_url: Optional[str] = None

class AchievementRequest(BaseModel):
    name: str
    description: str
    icon_url: Optional[str] = None


class SubmissionScoreBody(BaseModel):
    score: float

class StationRegisterRequest(BaseModel):
    id: str
    ip_address: str

def _patch_langflow_auth():
    """
    Monkey-patch the installed langflow-base auth service so that
    LANGFLOW_AUTO_LOGIN=true + LANGFLOW_SKIP_AUTH_AUTO_LOGIN=true also bypasses
    JWT/cookie authentication (not only API-key auth as upstream ships it).

    Without this patch, Langflow's React frontend fires authenticated requests
    (whoami, variables/, projects/) concurrently with auto_login.  Those
    requests arrive before the browser has stored the access_token_lf cookie
    and receive 403 — leaving the UI stuck on initialisation.

    The patch is applied here, at import time, so it covers all FastAPI routes
    regardless of when they were registered.
    """
    try:
        from langflow.services.auth.service import AuthService
        from langflow.services.auth.constants import AUTO_LOGIN_WARNING
        from langflow.services.auth.exceptions import MissingCredentialsError
        from langflow.services.database.models.user.model import UserRead
        from langflow.services.database.models.user.crud import get_user_by_username
        from lfx.log.logger import logger

        _original = AuthService.authenticate_with_credentials

        async def _patched(self, token, api_key, db):
            try:
                return await _original(self, token, api_key, db)
            except MissingCredentialsError:
                # When no credentials are present, honour skip_auth_auto_login
                # for ALL auth paths (not just the API-key path as shipped).
                s = self.settings.auth_settings
                if s.AUTO_LOGIN and s.skip_auth_auto_login and s.SUPERUSER:
                    result = await get_user_by_username(db, s.SUPERUSER)
                    if result:
                        logger.warning(AUTO_LOGIN_WARNING)
                        return UserRead.model_validate(result, from_attributes=True)
                raise

        AuthService.authenticate_with_credentials = _patched
        print("✅ AICCORE Auth Patch: skip_auth_auto_login extended to JWT path.")
    except Exception as e:
        print(f"⚠️ AICCORE Auth Patch failed (non-fatal): {e}")


_patch_langflow_auth()


class _HttpOnlyMount(Mount):
    """
    Standard Starlette Mount crashes if it receives a 'websocket' scope and 
    delegates to StaticFiles (which only supports 'http').
    
    This guarded version only handles 'http' scopes, letting 'websocket'
    calls fall through to Langflow's own WS handlers.
    """
    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            # Fall through to next routes
            return await self.app(scope, receive, send)
        await super().__call__(scope, receive, send)


def create_aiccore_app():
    """
    Creates the AICCORE application by wrapping the Langflow setup_app.
    This serves as the V1 implementation point for AICCORE logic.
    """
    # Initialize Langflow app. When frontend assets are bundled into the same
    # image, point Langflow at that build directory so one service can serve
    # both the UI and the API.
    backend_only = os.getenv("AICCORE_BACKEND_ONLY", "false").lower() == "true"
    frontend_dir_env = os.getenv("AICCORE_LANGFLOW_FRONTEND_DIR", "").strip()
    static_files_dir = Path(frontend_dir_env) if frontend_dir_env else None
    if static_files_dir and not static_files_dir.exists():
        print(f"⚠️ Langflow frontend dir not found at {static_files_dir}; falling back to backend_only={backend_only}")
        static_files_dir = None

    # When serving bundled frontend assets from this wrapper, build Langflow in
    # backend-only mode first so its catch-all "/" static mount does not shadow
    # the AICCORE routes we add below. We mount the SPA ourselves at the end.
    serve_bundled_frontend = (not backend_only) and (static_files_dir is not None)
    langflow_backend_only = backend_only or serve_bundled_frontend

    print(
        "🚀 Starting Langflow with "
        f"backend_only={langflow_backend_only}, static_files_dir={static_files_dir}"
    )
    app = setup_app(backend_only=langflow_backend_only)

    # CORS allow-list built once; middleware registered at the very end so it stays
    # outermost (Starlette runs last-added middleware first on the request).
    _cors_allow_origins = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ]
    _cors_allow_origins.extend(_collect_aiccore_browser_origins())

    # Initialize AICCORE Database
    print("🔧 Initializing AICCORE Database...")
    init_db()

    # Start Cloud Sync Background Task
    @app.on_event("startup")
    async def startup_event():
        from aiccore.backend.sync import sync_to_cloud
        from aiccore.backend.broadcast import broadcast_manager
        import asyncio

        await broadcast_manager.start()
        asyncio.create_task(sync_to_cloud())
        print("☁️ Cloud Sync: Background worker active.")

    @app.on_event("shutdown")
    async def shutdown_broadcast():
        from aiccore.backend.broadcast import broadcast_manager

        await broadcast_manager.shutdown()

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
        frame_ancestors.extend(_collect_aiccore_browser_origins())

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
    async def upload_image(request: Request, file: UploadFile = File(...)):
        _require_admin_request(request)
        file_path = upload_dir / f"{uuid4().hex}_{safe_upload_filename(file.filename)}"
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {"url": f"/static/uploads/{file_path.name}"}


    @app.get("/api/v1/aiccore/events/poll")
    async def poll_events(last_id: int = 0, timeout: int = 15):
        """
        HTTPS Polling/Pooling replacement for WebSockets.
        Returns new events since last_id. If no events, waits up to 'timeout' seconds.
        """
        from aiccore.backend.broadcast import broadcast_manager
        
        # Long-polling implementation
        start_time = time.time()
        while time.time() - start_time < min(timeout, 30):
            events = broadcast_manager.get_pooled_messages(since_id=last_id)
            if events:
                return {"events": events}
            await asyncio.sleep(0.5)
            
        return {"events": []}

    @app.post("/api/v1/aiccore/auth/unlock")
    async def unlock_station(req: UnlockRequest, request: Request):
        
        client_ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if not client_ip:
            client_ip = request.client.host if request.client else "unknown"
        now = datetime.now(timezone.utc)
        
        # 0. Rate Limiting Check
        failed = normalize_failed_attempt_state(FAILED_ATTEMPTS.get(client_ip), now=now)
        _store_failed_attempt_state(client_ip, failed)
        if failed["locked_until"] and now < failed["locked_until"]:
            wait_time = int((failed["locked_until"] - now).total_seconds())
            raise HTTPException(status_code=429, detail=f"Too many failed attempts. Try again in {wait_time}s")
        
        code = (req.unlock_code or "").strip()
        if not code or len(code) < 4:
            raise HTTPException(status_code=400, detail="Valid unlock code required")

        print(f"🔑 Unlock attempt for code {code} from IP {client_ip}")
        
        with Session(engine) as db_session:
            # 0. Check if Arena is locked (persisted — all workers see the same value)
            if is_arena_locked_db(db_session):
                raise HTTPException(status_code=403, detail="The Arena is currently closed by the administrator.")

            # 1. Find User by unlock_code (NULL = already consumed / must regenerate).
            # Row lock on Postgres so two concurrent unlocks cannot consume the same OTP twice.
            stmt = select(User).where(User.unlock_code == code)
            if engine.dialect.name == "postgresql":
                stmt = stmt.with_for_update()
            user = db_session.execute(stmt).scalars().first()
            
            if not user:
                # Handle failure tracking
                failed = register_failed_attempt(
                    FAILED_ATTEMPTS.get(client_ip),
                    now=now,
                    max_attempts=MAX_ATTEMPTS,
                    lockout_seconds=LOCKOUT_DURATION_SECONDS,
                )
                _store_failed_attempt_state(client_ip, failed)
                if failed["locked_until"] and failed["attempts"] >= MAX_ATTEMPTS:
                    raise HTTPException(status_code=429, detail="Maximum attempts reached. IP locked for 5 minutes.")

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
            # Prefer registered Station row; else use client station_id (per-laptop ws-* UUID from dashboard).
            # Without a unique station_id per device, every browser fell back to STATION_LOCAL and only
            # one builder could be active — bad for 2–4 laptops on one TV mosaic.
            station_id = station.id if station else (req.station_id or "STATION_LOCAL")

            # 3.5 One physical seat: end prior session on THIS station_id only (not other laptops).
            db_session.execute(
                update(AICSession)
                .where(AICSession.station_id == station_id, AICSession.is_active == True)
                .values(is_active=False, end_time=datetime.now(timezone.utc))
            )

            # Challenge for this session: explicit challenge_id (must be registered) OR latest registration
            from aiccore.backend.models import ChallengeRegistration, Challenge

            active_challenge_id = None
            unlock_explicit_challenge = False
            if req.challenge_id:
                try:
                    cid = UUID(req.challenge_id.strip())
                except (ValueError, TypeError):
                    raise HTTPException(status_code=400, detail="Invalid challenge_id")
                reg_chk = db_session.execute(
                    select(ChallengeRegistration).where(
                        ChallengeRegistration.user_id == user.id,
                        ChallengeRegistration.challenge_id == cid,
                    )
                ).scalars().first()
                if not reg_chk:
                    raise HTTPException(
                        status_code=403,
                        detail="You are not registered for this challenge. Open the correct challenge link or register first.",
                    )
                active_challenge_id = cid
                unlock_explicit_challenge = True
            else:
                reg_stmt = (
                    select(ChallengeRegistration)
                    .where(ChallengeRegistration.user_id == user.id)
                    .order_by(ChallengeRegistration.registered_at.desc())
                    .limit(1)
                )
                reg = db_session.execute(reg_stmt).scalars().first()
                active_challenge_id = reg.challenge_id if reg else None

            # Stale registration: "latest reg" may point at a mission that already ended (inactive or finalized).
            # Without this, the seat stays CHECKED_IN off the live mission until manual DB fix.
            if active_challenge_id is not None:
                ch_row = db_session.get(Challenge, active_challenge_id)
                # Hard block if finalized OR inactive
                if ch_row is None or not ch_row.is_active or ch_row.is_finalized:
                    if unlock_explicit_challenge:
                        reason = "finalized" if (ch_row and ch_row.is_finalized) else "not live"
                        raise HTTPException(
                            status_code=403,
                            detail=f"That mission is {reason}. Use the link for the current challenge or open /builder without challenge_id.",
                        )
                    active_challenge_id = None

            # Museum default: no live-bound row yet — attach to the currently active mission.
            if active_challenge_id is None:
                live_ch = db_session.execute(
                    select(Challenge)
                    .where(Challenge.is_active == True)
                    .order_by(Challenge.created_at.asc())
                    .limit(1)
                ).scalars().first()
                if live_ch is not None:
                    active_challenge_id = live_ch.id

            new_session = AICSession(
                user_id=user.id,
                nickname=user.nickname,
                station_id=station_id,
                challenge_id=active_challenge_id
            )
            db_session.add(new_session)
            db_session.flush() # Get session ID
            session_token = issue_session_token(new_session.id)
            
            # Log session start (leaderboard uses challenge live window, not raw event count)
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
            
            # MANDATORY: Clear old folder ID to ensure fresh start with the new random naming
            new_session.langflow_workspace_folder_id = None
            db_session.flush()

            # 4. Update Station status if found
            if station:
                station.status = "occupied"
                station.current_session_id = new_session.id

            # 4.5 One-time OTP: clear code after successful unlock (NULL allowed — unique per Postgres/SQLite)
            user.unlock_code = None
            user.unlock_code_generated_at = None

            # Single commit: session + event + station + consumed OTP stay consistent if the process crashes mid-request.
            db_session.commit()
            db_session.refresh(new_session)

            await broadcast_manager.broadcast({
                "session_id": str(new_session.id),
                "event_type": "flow_saved",
                "payload": {
                    "nickname": user.nickname,
                    "station_id": station_id,
                    "snapshot": {"nodes": [], "edges": []}
                }
            })
            await broadcast_manager.broadcast({"type": "LEADERBOARD_UPDATE", "data": {"session_id": str(new_session.id)}})

            # 5. Langflow workspace: one folder per AICCORE session so concurrent seats do not share flows.
            try:
                with Session(engine) as cnt_sess:
                    active_n = (
                        cnt_sess.execute(
                            select(func.count(AICSession.id)).where(AICSession.is_active == True)
                        ).scalar()
                        or 0
                    )
                seat_folder_id = await ensure_langflow_workspace_folder(new_session.id)
                if seat_folder_id:
                    await purge_langflow_workspace_scoped(seat_folder_id)
                    print(
                        f"ℹ️ AICCORE: Scoped Langflow purge for session folder {seat_folder_id} "
                        f"(active_aiccore_sessions={active_n})."
                    )
                else:
                    if active_n > 1:
                        print(
                            f"ℹ️ AICCORE: active_aiccore_sessions={active_n} — no arena folder; "
                            "skipping global Langflow purge (merge-restore only)."
                        )
                    else:
                        print(f"ℹ️ AICCORE: active_aiccore_sessions={active_n} — global Langflow purge (legacy).")
                        await purge_langflow_workspace()

                # 5.5 Sync Persistence: Restore workspace from latest manifest into this seat's folder when needed
                if user.username and user.username != "testuser":
                    event_stmt = select(Event).join(AICSession).where(
                        AICSession.user_id == user.id,
                        AICSession.challenge_id == active_challenge_id,
                        Event.event_type == "workspace_snapshot"
                    ).order_by(Event.timestamp.desc())
                    latest_event = db_session.execute(event_stmt).scalars().first()

                    if latest_event:
                        await restore_user_workspace(latest_event.payload, default_flow_folder_id=seat_folder_id)
                        print(f"🔄 Persistence: Re-manifested full workspace for {user.username}")
                    else:
                        sub_stmt = select(Submission).join(AICSession).where(
                            AICSession.user_id == user.id,
                            AICSession.challenge_id == active_challenge_id
                        ).order_by(Submission.submitted_at.desc())
                        latest_sub = db_session.execute(sub_stmt).scalars().first()
                        if latest_sub:
                            legacy_manifest = {
                                "folders": [],
                                "flows": [{
                                    "id": str(uuid4()),
                                    "name": "Restored Flow",
                                    "data": latest_sub.flow_snapshot,
                                    "folder_id": None
                                }]
                            }
                            await restore_user_workspace(legacy_manifest, default_flow_folder_id=seat_folder_id)
                            print(f"🔄 Persistence: Restored legacy submission for {user.username}")
            except Exception as e:
                print(f"❌ Failed to manage workspace on unlock: {e}")
                
            # 6. Return Session Info
            response = {
                "session_id": str(new_session.id),
                "session_token": session_token,
                "nickname": user.nickname,
                "user_id": str(user.id),
                "station_id": new_session.station_id,
                "stats": {
                    "flows_count": flows_count,
                    "achievements_count": ach_count
                }
            }
            
            res = JSONResponse(content=response)
            _set_session_cookies(
                res,
                request,
                session_id=str(new_session.id),
                session_token=session_token,
            )
            return res

    @app.get("/api/v1/aiccore/session/{session_id}/status")
    async def get_session_status(session_id: UUID, request: Request):
        if not _aiccore_session_auth_ok(request, session_id):
            raise HTTPException(status_code=403, detail="Signed session token required")
        with Session(engine) as db_session:
            session = db_session.get(AICSession, session_id)
            if session and session.is_active and not session.is_submitted:
                touch_session_presence(db_session, session_id, now=datetime.now(timezone.utc))
            expire_stale_builder_sessions_db(db_session)
            session = db_session.get(AICSession, session_id)
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")
            if not session.is_active and not session.is_submitted:
                raise HTTPException(status_code=404, detail="Session expired")
            db_session.commit()
            return {"is_submitted": session.is_submitted}

    @app.post("/api/v1/aiccore/session/{session_id}/attach-to-live-mission")
    async def attach_session_to_live_mission(session_id: UUID, request: Request):
        """If this seat has no challenge_id but a mission is live, bind it (fixes CHECKED_IN + disabled Submit)."""
        if not _aiccore_session_auth_ok(request, session_id):
            raise HTTPException(
                status_code=403,
                detail="Signed session token required",
            )
        attached_cid: Optional[str] = None
        cleared_stale = False
        broadcast_lb = False
        with Session(engine) as db_session:
            sess = db_session.get(AICSession, session_id)
            if not sess:
                raise HTTPException(status_code=404, detail="Session not found")
            live_ch = db_session.execute(
                select(Challenge)
                .where(Challenge.is_active == True)
                .order_by(Challenge.created_at.asc())
                .limit(1)
            ).scalars().first()
            bound = (
                db_session.get(Challenge, sess.challenge_id)
                if sess.challenge_id is not None
                else None
            )
            if bound is not None and bound.is_active:
                return {
                    "status": "unchanged",
                    "challenge_id": str(sess.challenge_id),
                }
            if live_ch is None:
                if sess.challenge_id is not None:
                    sess.challenge_id = None
                    cleared_stale = True
                    broadcast_lb = True
                    db_session.commit()
                if broadcast_lb:
                    await broadcast_manager.broadcast(
                        {
                            "type": "LEADERBOARD_UPDATE",
                            "data": {"session_attached": str(session_id)},
                        }
                    )
                return {
                    "status": "no_active_mission",
                    "cleared_stale_binding": cleared_stale,
                }
            sess.challenge_id = live_ch.id
            attached_cid = str(live_ch.id)
            db_session.commit()
        await broadcast_manager.broadcast(
            {"type": "LEADERBOARD_UPDATE", "data": {"session_attached": str(session_id)}}
        )
        return {"status": "attached", "challenge_id": attached_cid}

    @app.get("/api/v1/aiccore/demo/status")
    async def demo_status_endpoint(
        session_id: Optional[str] = Query(
            None, description="Session UUID — returns my_position (1-based) when in queue"
        ),
    ):
        """TV + builder poll. Optional session_id adds my_position in queue (1-based)."""
        with Session(engine) as db_session:
            expire_stale_builder_sessions_db(db_session)
            demo_opened = try_open_demo_gate(db_session)
            st = get_demo_status(db_session)
        if demo_opened:
            await broadcast_manager.broadcast({"type": "DEMO_GATE_OPEN"})
        if session_id:
            for i, q in enumerate(st.get("queue") or []):
                if q.get("session_id") == session_id:
                    st["my_position"] = i + 1
                    break
        return st

    @app.post("/api/v1/aiccore/session/{session_id}/demo-queue")
    async def api_join_demo_queue(session_id: UUID, request: Request):
        if not _aiccore_session_auth_ok(request, session_id):
            raise HTTPException(
                status_code=403,
                detail="Signed session token missing or stale - exit and unlock again with your PIN, or retry after a refresh.",
            )
        try:
            with Session(engine) as db_session:
                out = join_demo_queue(db_session, session_id)
        except ValueError as e:
            err = str(e)
            if err == "session_inactive":
                raise HTTPException(status_code=409, detail="Session is no longer active")
            if err == "must_submit_first":
                raise HTTPException(
                    status_code=400, detail="Submit your build before joining the demo queue"
                )
            raise HTTPException(status_code=404, detail="Session not found")
        demo_opened = False
        playback_started = False
        with Session(engine) as db2:
            expire_stale_builder_sessions_db(db2)
            demo_opened = try_open_demo_gate(db2)
        with Session(engine) as db3:
            playback_started = ensure_demo_playback_if_gate_open_idle(db3)
        await broadcast_manager.broadcast({"type": "DEMO_QUEUE_UPDATE", "data": out})
        if demo_opened or playback_started:
            await broadcast_manager.broadcast({"type": "DEMO_GATE_OPEN"})
        return out

    @app.post("/api/v1/aiccore/demo/next")
    async def demo_next_endpoint(request: Request):
        _require_admin_request(request)
        with Session(engine) as db_session:
            result = admin_advance_demo(db_session)
        await broadcast_manager.broadcast(
            {"type": "DEMO_QUEUE_UPDATE", "data": {"event": "admin_advance"}}
        )
        return result

    @app.post("/api/v1/aiccore/session/{session_id}/deactivate")
    async def deactivate_session(session_id: UUID, request: Request):
        """Called by the builder page when the user exits (logs out / starts over).

        Successful unlock consumes the one-time PIN; without issuing a new code, users could not
        unlock again after Start Over. We regenerate a fresh PIN for the same participant (except
        registered participant profiles.
        """
        if not _aiccore_session_auth_ok(request, session_id):
            raise HTTPException(
                status_code=403,
                detail="Signed session token required",
            )
        user_id_for_regen: Optional[UUID] = None
        with Session(engine) as db_session:
            session_obj = db_session.get(AICSession, session_id)
            if not session_obj:
                res = JSONResponse(content={"status": "not_found"})
                _clear_session_cookies(res, request)
                return res
            if session_obj.user_id:
                u = db_session.get(User, session_obj.user_id)
                if u:
                    user_id_for_regen = session_obj.user_id
            session_obj.is_active = False
            session_obj.end_time = datetime.now(timezone.utc)
            # Free the station so the next user can unlock it
            if session_obj.station_id:
                station = db_session.get(Station, session_obj.station_id)
                if station and station.status == "occupied":
                    station.status = "available"
                if station and station.current_session_id == session_id:
                    station.current_session_id = None
            db_session.commit()

        new_unlock_code: Optional[str] = None
        if user_id_for_regen:
            with Session(engine) as db_session:
                user = db_session.get(User, user_id_for_regen)
                if user:
                    cand = None
                    for _ in range(40):
                        trial = generate_unlock_code()
                        collision = db_session.execute(
                            select(User).where(User.unlock_code == trial, User.id != user.id)
                        ).scalars().first()
                        if not collision:
                            cand = trial
                            break
                    if cand:
                        user.unlock_code = cand
                        user.unlock_code_generated_at = datetime.now(timezone.utc)
                        db_session.commit()
                        new_unlock_code = cand

        with Session(engine) as dq_session:
            remove_session_from_demo_queue(dq_session, session_id)
        demo_opened = False
        with Session(engine) as gate_session:
            expire_stale_builder_sessions_db(gate_session)
            demo_opened = try_open_demo_gate(gate_session)
        if demo_opened:
            await broadcast_manager.broadcast({"type": "DEMO_GATE_OPEN"})
        await broadcast_manager.broadcast({"type": "DEMO_QUEUE_UPDATE", "data": {"event": "deactivated", "session_id": str(session_id)}})
        await broadcast_manager.broadcast({
            "type": "LEADERBOARD_UPDATE",
            "data": {"session_id": str(session_id), "event": "deactivated"}
        })
        body: Dict[str, Any] = {"status": "deactivated"}
        if new_unlock_code:
            body["new_unlock_code"] = new_unlock_code
        res = JSONResponse(content=body)
        _clear_session_cookies(res, request)
        return res

    @app.get("/api/v1/aiccore/sessions/active")
    async def list_active_sessions():
        with Session(engine) as db_session:
            expire_stale_builder_sessions_db(db_session)
            active_challenge = db_session.execute(
                select(Challenge)
                .where(Challenge.is_active == True)
                .order_by(Challenge.created_at.asc())
                .limit(1)
            ).scalars().first()

            # Get all active sessions
            stmt = select(AICSession).where(
                AICSession.is_active == True,
                AICSession.is_submitted == False,
            )
            if active_challenge is not None:
                stmt = stmt.where(AICSession.challenge_id == active_challenge.id)
            active_sessions = db_session.execute(stmt).scalars().all()
            
            results = []
            for s in active_sessions:
                snapshot = get_mosaic_snapshot_for_session(db_session, s.id)
                event_stmt = (
                    select(Event)
                    .where(Event.session_id == s.id)
                    .order_by(Event.sequence_number.desc())
                    .limit(1)
                )
                latest_any = db_session.execute(event_stmt).scalars().first()
                results.append({
                    "session_id": str(s.id),
                    "nickname": s.nickname,
                    "station_id": s.station_id,
                    "snapshot": snapshot,
                    "is_submitted": s.is_submitted,
                    "last_update": latest_any.timestamp.isoformat()
                    if latest_any
                    else s.start_time.isoformat(),
                })
            return results

    @app.get("/api/v1/aiccore/session/{session_id}/events")
    async def get_session_events(session_id: UUID, request: Request):
        _require_admin_request(request)
        with Session(engine) as db_session:
            stmt = select(Event).where(Event.session_id == session_id).order_by(Event.sequence_number.asc())
            events = db_session.execute(stmt).scalars().all()
            return [
                {
                    "id": e.id,
                    "session_id": str(e.session_id),
                    "sequence_number": e.sequence_number,
                    "timestamp": e.timestamp.isoformat(),
                    "event_type": e.event_type,
                    "payload": e.payload,
                }
                for e in events
            ]

    @app.post("/api/v1/aiccore/submit")
    async def submit_flow(req: SubmissionRequest, request: Request):
        if not _aiccore_session_auth_ok(request, req.session_id):
            raise HTTPException(
                status_code=403,
                detail="Matching signed session token required",
            )
        with event_sequence_write_lock(req.session_id):
            with Session(engine) as db_session:
                ensure_pg_advisory_xact_lock(db_session, req.session_id)
                session_obj = db_session.get(AICSession, req.session_id)
                if not session_obj:
                    raise HTTPException(status_code=404, detail="Session not found")

                if session_obj.is_submitted:
                    existing = db_session.execute(
                        select(Submission).where(Submission.session_id == req.session_id)
                        .order_by(Submission.submitted_at.desc())
                    ).scalars().first()
                    return {
                        "status": "already_submitted",
                        "submission_id": str(existing.id) if existing else None,
                    }
                if not can_submit_session(
                    is_active=session_obj.is_active,
                    is_submitted=session_obj.is_submitted,
                ):
                    raise HTTPException(status_code=409, detail="Session is no longer active")

                new_submission = Submission(
                    session_id=req.session_id,
                    flow_snapshot=req.flow_snapshot
                )
                db_session.add(new_submission)
                session_obj.is_submitted = True
                db_session.flush()  # ensure new_submission.id before Event payload

                stmt = select(Event).where(Event.session_id == req.session_id).order_by(Event.sequence_number.desc())
                last_event = db_session.execute(stmt).scalars().first()
                seq = (last_event.sequence_number + 1) if last_event else 0

                sub_event = Event(
                    session_id=req.session_id,
                    sequence_number=seq,
                    event_type="submitted",
                    payload={
                        "submission_id": str(new_submission.id),
                        "snapshot": req.flow_snapshot,
                    }
                )
                db_session.add(sub_event)

                db_session.commit()
                db_session.refresh(new_submission)

                session_nickname = session_obj.nickname if session_obj else "A builder"
                await broadcast_manager.broadcast({
                    "session_id": str(req.session_id),
                    "event_type": "submitted",
                    "payload": {
                        "submission_id": str(new_submission.id),
                        "nickname": session_nickname,
                        "station_id": session_obj.station_id if session_obj else None,
                    }
                })
                await broadcast_manager.broadcast({
                    "type": "SUBMISSION_UPDATE",
                    "data": {"session_id": str(req.session_id)}
                })
                demo_opened = False
                with Session(engine) as db2:
                    expire_stale_builder_sessions_db(db2)
                    demo_opened = try_open_demo_gate(db2)
                if demo_opened:
                    await broadcast_manager.broadcast({"type": "DEMO_GATE_OPEN"})
                return {"submission_id": str(new_submission.id), "status": "submitted"}

    @app.post("/api/v1/aiccore/session/{session_id}/submit")
    async def trigger_workspace_submission(session_id: UUID, request: Request):
        if not _aiccore_session_auth_ok(request, session_id):
            raise HTTPException(
                status_code=403,
                detail="Signed session token required",
            )
        # Guard against double-submission (timer fire + manual click race)
        with Session(engine) as db_session:
            session_obj = db_session.get(AICSession, session_id)
            if not session_obj:
                raise HTTPException(status_code=404, detail="Session not found")
            if session_obj.is_submitted:
                existing = db_session.execute(
                    select(Submission).where(Submission.session_id == session_id)
                    .order_by(Submission.submitted_at.desc())
                ).scalars().first()
                return {"status": "already_submitted", "submission_id": str(existing.id) if existing else None}
            if not can_submit_session(
                is_active=session_obj.is_active,
                is_submitted=session_obj.is_submitted,
            ):
                raise HTTPException(status_code=409, detail="Session is no longer active")

        from aiccore.backend.eraser import submit_workspace_as_flow
        try:
            sub_id = await submit_workspace_as_flow(session_id)
            demo_opened = False
            with Session(engine) as db2:
                expire_stale_builder_sessions_db(db2)
                demo_opened = try_open_demo_gate(db2)
            if demo_opened:
                await broadcast_manager.broadcast({"type": "DEMO_GATE_OPEN"})
            res = JSONResponse(content={"status": "success", "submission_id": sub_id})
            _set_session_id_cookie(res, request, session_id=str(session_id))
            return res
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/api/v1/aiccore/submissions")
    async def list_submissions(request: Request):
        _require_admin_request(request)
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
                    "is_winner": sub.is_winner,
                    "is_approved": sub.is_approved,
                })
            return output

    @app.get("/api/v1/aiccore/submissions/{submission_id}/download")
    async def download_submission(submission_id: UUID, request: Request):
        _require_admin_request(request)
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
    async def mark_winner(submission_id: UUID, request: Request):
        _require_admin_request(request)
        with Session(engine) as db_session:
            sub_obj = db_session.get(Submission, submission_id)
            if not sub_obj:
                raise HTTPException(status_code=404, detail="Submission not found")

            # Unmark only previous winners in the same challenge to avoid
            # wiping winners from other challenges
            sub_session = db_session.get(AICSession, sub_obj.session_id)
            if sub_session and sub_session.challenge_id:
                same_challenge_session_ids = select(AICSession.id).where(
                    AICSession.challenge_id == sub_session.challenge_id
                )
                db_session.execute(
                    update(Submission)
                    .where(Submission.session_id.in_(same_challenge_session_ids))
                    .values(is_winner=False)
                )
            else:
                # No challenge context — only unmark this single submission if re-marking
                db_session.execute(
                    update(Submission).where(Submission.id == submission_id).values(is_winner=False)
                )

            sub_obj.is_winner = True
            db_session.commit()

            await broadcast_manager.broadcast({
                "type": "LEADERBOARD_UPDATE",
                "data": {"winner_submission_id": str(submission_id)}
            })
            return {"status": "winner_marked", "submission_id": str(sub_obj.id)}

    @app.post("/api/v1/aiccore/submissions/{submission_id}/approve")
    async def approve_submission(submission_id: UUID, request: Request):
        """Mark a submission as reviewed/approved (persists; separate from winner)."""
        _require_admin_request(request)
        with Session(engine) as db_session:
            sub_obj = db_session.get(Submission, submission_id)
            if not sub_obj:
                raise HTTPException(status_code=404, detail="Submission not found")
            sub_obj.is_approved = True
            db_session.commit()
        await broadcast_manager.broadcast({
            "type": "SUBMISSION_UPDATE",
            "data": {"submission_id": str(submission_id), "approved": True},
        })
        return {"status": "approved", "submission_id": str(submission_id)}

    @app.patch("/api/v1/aiccore/submissions/{submission_id}/score")
    async def set_submission_score(submission_id: UUID, body: SubmissionScoreBody, request: Request):
        _require_admin_request(request)
        with Session(engine) as db_session:
            sub_obj = db_session.get(Submission, submission_id)
            if not sub_obj:
                raise HTTPException(status_code=404, detail="Submission not found")
            sub_obj.score = body.score
            db_session.commit()
        await broadcast_manager.broadcast({"type": "LEADERBOARD_UPDATE", "data": {"submission_id": str(submission_id)}})
        return {"status": "updated", "submission_id": str(submission_id), "score": body.score}

    @app.get("/api/v1/aiccore/leaderboard")
    async def get_leaderboard():
        from aiccore.backend.models import ChallengeRegistration
        mission_live_payload = None
        leaderboard = []
        with Session(engine) as db_session:
            from ..backend.demo_ceremony import maybe_auto_finalize_challenge
            expire_stale_builder_sessions_db(db_session)
            maybe_auto_finalize_challenge(db_session)
            mission_live_payload = maybe_auto_activate_due_challenges(db_session)
            user_stmt = (
                select(User)
                .where(User.username != PRACTICE_KIOSK_USERNAME)
                .order_by(User.created_at.desc())
            )
            all_users = db_session.execute(user_stmt).scalars().all()
            
            if not all_users:
                return []
                
            user_ids = [u.id for u in all_users]
            
            # 1. Bulk active sessions
            active_sessions = db_session.execute(
                select(AICSession).where(AICSession.user_id.in_(user_ids), AICSession.is_active == True)
            ).scalars().all()
            active_sess_by_user = {}
            for s in active_sessions:
                if s.user_id not in active_sess_by_user:
                    active_sess_by_user[s.user_id] = s
            
            # 2. Bulk submissions for active sessions
            active_sess_ids = [s.id for s in active_sessions]
            subs_by_sess = {}
            if active_sess_ids:
                subs = db_session.execute(
                    select(Submission).where(Submission.session_id.in_(active_sess_ids)).order_by(Submission.submitted_at.desc())
                ).scalars().all()
                for sub in subs:
                    if sub.session_id not in subs_by_sess:
                        subs_by_sess[sub.session_id] = sub
                        
            # 3. Bulk challenges mapping
            challenges_db = db_session.execute(select(Challenge)).scalars().all()
            challenge_map = {c.id: c.title for c in challenges_db}
            challenges_obj_map = {c.id: c for c in challenges_db}
            
            # 4. Bulk latest registration for users
            regs_stmt = select(ChallengeRegistration).where(ChallengeRegistration.user_id.in_(user_ids)).order_by(ChallengeRegistration.registered_at.desc())
            regs_by_user = {}
            for r in db_session.execute(regs_stmt).scalars().all():
                if r.user_id not in regs_by_user:
                    regs_by_user[r.user_id] = r
                    
            # 5. Bulk last submission for entirely inactive users (fallback)
            inactive_user_ids = [uid for uid in user_ids if uid not in active_sess_by_user]
            last_sub_fallback = {}
            if inactive_user_ids:
                last_subs = db_session.execute(
                    select(Submission, AICSession)
                    .join(AICSession, Submission.session_id == AICSession.id)
                    .where(AICSession.user_id.in_(inactive_user_ids))
                    .order_by(Submission.submitted_at.desc())
                ).all()
                for sub, past_sess in last_subs:
                    if past_sess.user_id not in last_sub_fallback:
                        last_sub_fallback[past_sess.user_id] = (sub, past_sess)

            now_utc = datetime.now(timezone.utc)
            for u in all_users:
                active_session = active_sess_by_user.get(u.id)
                
                status = "REGISTERED"
                station_id = "OFFLINE"
                score = 0
                is_winner = False
                active_mission = "UNASSIGNED"
                
                if active_session:
                    station_id = active_session.station_id or "0"
                    
                    if active_session.is_submitted:
                        status = "SUBMITTED"
                    else:
                        sess_challenge = challenges_obj_map.get(active_session.challenge_id) if active_session.challenge_id else None
                        if sess_challenge is not None:
                            if challenge_is_live_build_window(sess_challenge, now_utc):
                                status = "PARTICIPATING"
                            else:
                                status = "CHECKED_IN"
                        else:
                            status = "CHECKED_IN"
                    
                    submission = subs_by_sess.get(active_session.id)
                    if submission:
                        score = submission.score or 0
                        is_winner = submission.is_winner or False
                    
                    if active_session.challenge_id:
                        title = challenge_map.get(active_session.challenge_id)
                        if title: active_mission = title
                
                if active_mission == "UNASSIGNED":
                    reg = regs_by_user.get(u.id)
                    if reg:
                        title = challenge_map.get(reg.challenge_id)
                        if title: active_mission = title

                if not active_session:
                    fallback = last_sub_fallback.get(u.id)
                    if fallback:
                        sub, past_sess = fallback
                        status = "SUBMITTED"
                        station_id = past_sess.station_id or "OFFLINE"
                        score = sub.score or 0
                        is_winner = bool(sub.is_winner)
                        if past_sess.challenge_id:
                            title = challenge_map.get(past_sess.challenge_id)
                            if title: active_mission = title

                leaderboard.append({
                    "id": str(u.id),
                    "nickname": u.nickname,
                    "station": station_id,
                    "status": status,
                    "score": score,
                    "is_winner": is_winner,
                    "mission": active_mission
                })
            
            # Sort by winner (desc), then score (desc), then status tier
            status_rank = {"SUBMITTED": 4, "PARTICIPATING": 3, "CHECKED_IN": 2, "REGISTERED": 1}
            leaderboard.sort(key=lambda x: (x["is_winner"], x["score"], status_rank.get(x["status"], 0)), reverse=True)

        if mission_live_payload:
            await broadcast_manager.broadcast({
                "type": "MISSION_LIVE",
                "data": mission_live_payload,
            })
            await broadcast_manager.broadcast({"type": "LEADERBOARD_UPDATE", "data": {}})

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
                    "is_finalized": bool(c.is_finalized),
                    "complexity_level": c.complexity_level,
                    "max_participants": c.max_participants,
                    "duration_minutes": c.duration_minutes,
                    "start_time": c.start_time.isoformat() if c.start_time else None,
                    "location": c.location,
                    # Never treat registration as open while the mission is live or after finalize.
                    "is_registration_open": bool(c.is_registration_open)
                    and not bool(c.is_active)
                    and not bool(c.is_finalized),
                    "registration_count": reg_count,
                    "starter_assets_url": c.starter_assets_url,
                    "banner_image_url": c.banner_image_url,
                    "instructions_text": c.instructions_text,
                    "instructions_document_url": c.instructions_document_url,
                    "created_at": c.created_at.isoformat() if c.created_at else None,
                }
                output.append(c_data)
            return output

    @app.post("/api/v1/aiccore/challenges/{challenge_id}/toggle")
    async def toggle_challenge(challenge_id: UUID, request: Request):
        _require_admin_request(request)
        was_active = False
        now_active = False
        mission_title = ""
        mission_start_iso = None
        mission_cid = ""
        with Session(engine) as db_session:
            c = db_session.get(Challenge, challenge_id)
            if not c:
                raise HTTPException(status_code=404, detail="Challenge not found")
            was_active = c.is_active
            c.is_active = not c.is_active
            now_active = c.is_active
            if now_active and not was_active:
                # Exactly one live mission — prevents two is_active rows (TV / binding ambiguity).
                db_session.execute(
                    update(Challenge)
                    .where(Challenge.id != challenge_id, Challenge.is_active == True)
                    .values(is_active=False)
                )
                c.is_registration_open = False
            mission_title = c.title
            mission_cid = str(c.id)
            mission_start_iso = c.start_time.isoformat() if c.start_time else None
            if now_active and not was_active:
                reset_demo_state(db_session)
            else:
                db_session.commit()

        demo_opened = False
        if was_active and not now_active:
            with Session(engine) as db2:
                demo_opened = force_open_demo_gate(db2)

        if now_active and not was_active:
            await broadcast_manager.broadcast({
                "type": "MISSION_LIVE",
                "data": {
                    "challenge_id": mission_cid,
                    "title": mission_title,
                    "start_time": mission_start_iso,
                },
            })
        if was_active and not now_active:
            await broadcast_manager.broadcast({
                "type": "MISSION_ENDED",
                "data": {
                    "challenge_id": mission_cid,
                    "title": mission_title,
                },
            })
        if demo_opened:
            await broadcast_manager.broadcast({"type": "DEMO_GATE_OPEN"})
        with Session(engine) as heal_db:
            heal_duplicate_active_challenges(heal_db)
        return {"status": "updated", "is_active": now_active}

    @app.post("/api/v1/aiccore/challenges")
    async def create_challenge(req: ChallengeRequest, request: Request):
        _require_admin_request(request)
        with Session(engine) as db_session:
            new_challenge = Challenge(
                title=req.title,
                description=req.description,
                is_active=False,
                complexity_level=req.complexity_level,
                max_participants=req.max_participants,
                duration_minutes=req.duration_minutes,
                start_time=req.start_time,
                location=req.location,
                is_registration_open=req.is_registration_open,
                starter_assets_url=req.starter_assets_url,
                banner_image_url=req.banner_image_url,
                instructions_text=req.instructions_text or None,
                instructions_document_url=req.instructions_document_url or None,
            )
            db_session.add(new_challenge)
            db_session.commit()
            db_session.refresh(new_challenge)
            return new_challenge

    @app.patch("/api/v1/aiccore/challenges/{challenge_id}")
    async def update_challenge(challenge_id: UUID, req: ChallengeRequest, request: Request):
        _require_admin_request(request)
        with Session(engine) as db_session:
            c = db_session.get(Challenge, challenge_id)
            if not c:
                raise HTTPException(status_code=404, detail="Challenge not found")
            c.title = req.title
            c.description = req.description
            if req.complexity_level is not None:
                c.complexity_level = req.complexity_level
            if req.max_participants is not None:
                c.max_participants = req.max_participants
            if req.duration_minutes is not None:
                c.duration_minutes = req.duration_minutes
            c.start_time = req.start_time
            if req.location is not None:
                c.location = req.location
            if req.is_registration_open is not None:
                c.is_registration_open = req.is_registration_open
            c.starter_assets_url = req.starter_assets_url
            c.banner_image_url = req.banner_image_url
            c.instructions_text = req.instructions_text or None
            c.instructions_document_url = req.instructions_document_url or None
            db_session.commit()
            db_session.refresh(c)
            return c

    @app.post("/api/v1/aiccore/broadcast")
    async def admin_broadcast(req: Dict[str, str], request: Request):
        _require_admin_request(request)
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
    async def register_user_to_challenge(challenge_id: UUID, req: Dict[str, str], request: Request):
        _require_admin_request(request)
        user_id = req.get("user_id")
        if not user_id: raise HTTPException(status_code=400, detail="User ID required")
        
        with Session(engine) as db_session:
            # Check if user exists
            u = db_session.get(User, UUID(user_id))
            if not u: raise HTTPException(status_code=404, detail="User not found")
            _, created = ensure_requested_challenge_registration(
                db_session,
                user_id=u.id,
                challenge_id_raw=str(challenge_id),
            )
            db_session.commit()
            if not created:
                return {"status": "already_registered"}

            # Broadcast registry update
            await broadcast_manager.broadcast({"type": "REGISTRY_UPDATE", "data": {"challenge_id": str(challenge_id)}})
            return {"status": "success", "challenge_id": str(challenge_id)}

    @app.post("/api/v1/aiccore/sessions/clear")
    async def clear_all_sessions(request: Request):
        """Deactivates all active sessions — use before a new challenge to wipe stale Langflow workflows."""
        _require_admin_request(request)
        with Session(engine) as db_session:
            active_ids = list(
                db_session.execute(
                    select(AICSession.id).where(AICSession.is_active == True)
                ).scalars().all()
            )
            result = db_session.execute(
                update(AICSession)
                .where(AICSession.is_active == True)
                .values(is_active=False, end_time=datetime.now(timezone.utc))
            )
            cleared = result.rowcount
            if active_ids:
                db_session.execute(
                    update(Station)
                    .where(Station.current_session_id.in_(active_ids))
                    .values(current_session_id=None, status="available")
                )
            db_session.commit()

        # Demo queue rows still FK to session rows — keep TV/demo state aligned with "new challenge" wipe
        with Session(engine) as dq_session:
            reset_demo_state(dq_session)

        # Broadcast so MosaicDisplay clears itself instantly on all clients
        await broadcast_manager.broadcast({
            "type": "SESSIONS_CLEARED",
            "cleared_count": cleared,
        })
        await broadcast_manager.broadcast({"type": "DEMO_QUEUE_UPDATE", "data": {"reason": "sessions_cleared"}})
        return {"status": "cleared", "sessions_cleared": cleared}

    @app.post("/api/v1/aiccore/system/finalize")
    async def finalize_deployment(request: Request):
        _require_admin_request(request)
        with Session(engine) as db_session:
            row = _get_or_create_arena_row(db_session)
            row.arena_locked = True
            active_challenges = db_session.execute(
                select(Challenge).where(Challenge.is_active == True)
            ).scalars().all()
            for c in active_challenges:
                c.is_active = False
                c.is_finalized = True
            db_session.commit()
        demo_opened = False
        with Session(engine) as db2:
            demo_opened = force_open_demo_gate(db2)
        await broadcast_manager.broadcast({
            "type": "SYSTEM_FINALIZE",
            "locked": True,
        })
        if demo_opened:
            await broadcast_manager.broadcast({"type": "DEMO_GATE_OPEN"})
        return {"status": "deployment_finalized"}

    @app.get("/api/v1/aiccore/system/export")
    async def export_deployment_data(request: Request):
        _require_admin_request(request)
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
    async def toggle_system_lock(request: Request):
        _require_admin_request(request)
        with Session(engine) as db_session:
            row = _get_or_create_arena_row(db_session)
            row.arena_locked = not row.arena_locked
            locked = row.arena_locked
            db_session.commit()
        return {"locked": locked}

    @app.get("/api/v1/aiccore/system/status")
    async def get_system_status():
        mission_live_payload = None
        with Session(engine) as db_session:
            from ..backend.demo_ceremony import maybe_auto_finalize_challenge
            expire_stale_builder_sessions_db(db_session)
            maybe_auto_finalize_challenge(db_session)
            mission_live_payload = maybe_auto_activate_due_challenges(db_session)
            locked = is_arena_locked_db(db_session)
            # Read-only: if >1 active (race), report the canonical mission (oldest by created_at).
            # DB heal runs on challenge toggle, not on this GET.
            stmt = (
                select(Challenge)
                .where(Challenge.is_active == True)
                .order_by(Challenge.created_at.asc())
                .limit(1)
            )
            active_challenge = db_session.execute(stmt).scalars().first()
            now_utc = datetime.now(timezone.utc)
            mission_build_window_open = bool(
                active_challenge
                and challenge_is_live_build_window(active_challenge, now_utc)
            )
            mission_build_ends_at: Optional[str] = None
            if (
                active_challenge
                and active_challenge.start_time is not None
                and active_challenge.duration_minutes is not None
            ):
                st_utc = challenge_start_time_utc(active_challenge)
                if st_utc is not None:
                    end_utc = st_utc + timedelta(minutes=int(active_challenge.duration_minutes))
                    mission_build_ends_at = end_utc.isoformat()

            result = {
                "locked": locked,
                "active_challenge": active_challenge.title if active_challenge else None,
                "active_challenge_id": str(active_challenge.id) if active_challenge else None,
                "is_finalized": bool(active_challenge.is_finalized) if active_challenge else False,
                "starter_assets_url": active_challenge.starter_assets_url if active_challenge else None,
                "instructions_text": active_challenge.instructions_text if active_challenge else None,
                "instructions_document_url": active_challenge.instructions_document_url
                if active_challenge
                else None,
                "duration_minutes": active_challenge.duration_minutes if active_challenge else None,
                "start_time": active_challenge.start_time.isoformat() if active_challenge and active_challenge.start_time else None,
                "mission_build_window_open": mission_build_window_open,
                "mission_build_ends_at": mission_build_ends_at,
                "server_time": now_utc.isoformat(),
            }

        if mission_live_payload:
            await broadcast_manager.broadcast({
                "type": "MISSION_LIVE",
                "data": mission_live_payload,
            })
            await broadcast_manager.broadcast({"type": "LEADERBOARD_UPDATE", "data": {}})

        return result

    @app.get("/api/v1/aiccore/stations")
    async def list_all_stations(request: Request):
        _require_admin_request(request)
        with Session(engine) as db_session:
            stmt = select(Station)
            stations = db_session.execute(stmt).scalars().all()
            
            # Stale heartbeat: persist status + free ghost "occupied" stations (matches API reality to DB)
            now = datetime.now(timezone.utc)
            results = []
            dirty = False
            for s in stations:
                status = s.status
                if s.status != "maintenance" and s.last_heartbeat:
                    lh = s.last_heartbeat
                    if lh.tzinfo is None:
                        lh = lh.replace(tzinfo=timezone.utc)
                    if (now - lh).total_seconds() > 300:  # 5 minute timeout
                        if s.status == "occupied":
                            status = "available"
                            if s.current_session_id:
                                sess = db_session.get(AICSession, s.current_session_id)
                                if sess and sess.is_active:
                                    sess.is_active = False
                                    sess.end_time = now
                            s.status = "available"
                            s.current_session_id = None
                            dirty = True
                        elif s.status == "available":
                            status = "offline"
                            s.status = "offline"
                            dirty = True
                
                results.append({
                    "id": s.id,
                    "ip": s.ip_address,
                    "status": status,
                    "load": s.cpu_load,
                    "temp": s.core_temp,
                    "last_active": s.last_heartbeat.isoformat() if s.last_heartbeat else None
                })
            if dirty:
                db_session.commit()
            return results

    @app.post("/api/v1/aiccore/stations/{station_id}/heartbeat")
    async def station_heartbeat(station_id: str, payload: Dict[str, Any]):
        with Session(engine) as db_session:
            s = db_session.get(Station, station_id)
            if not s:
                raise HTTPException(status_code=404, detail="Station not found")
            
            came_back_online = s.status == "offline"
            s.last_heartbeat = datetime.now(timezone.utc)
            s.cpu_load = payload.get("load", s.cpu_load)
            s.core_temp = payload.get("temp", s.core_temp)
            
            if came_back_online:
                s.status = "available"
                
            db_session.commit()

            # Broadcast on first heartbeat after going offline (station came back)
            # and on every heartbeat so the dashboard stays live
            await broadcast_manager.broadcast({
                "type": "STATION_UPDATE",
                "station_id": station_id,
                "event": "online" if came_back_online else "heartbeat",
                "load": s.cpu_load,
                "temp": s.core_temp,
                "status": s.status
            })
            return {"status": "ok"}

    @app.get("/api/v1/aiccore/achievements")
    async def list_achievements(request: Request):
        _require_admin_request(request)
        from sqlalchemy import select
        with Session(engine) as db_session:
            stmt = select(Achievement)
            rows = db_session.execute(stmt).scalars().all()
            return [
                {
                    "id": str(a.id),
                    "name": a.name,
                    "description": a.description,
                    "icon_url": a.icon_url,
                }
                for a in rows
            ]

    @app.post("/api/v1/aiccore/achievements")
    async def create_achievement(req: AchievementRequest, request: Request):
        _require_admin_request(request)
        with Session(engine) as db_session:
            new_a = Achievement(name=req.name, description=req.description, icon_url=req.icon_url)
            db_session.add(new_a)
            db_session.commit()
            db_session.refresh(new_a)
            return new_a

    @app.post("/api/v1/aiccore/users/{user_id}/award/{achievement_id}")
    async def award_honor(user_id: UUID, achievement_id: UUID, request: Request):
        _require_admin_request(request)
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
    async def get_all_users(request: Request):
        _require_admin_request(request)
        from sqlalchemy import select, func
        with Session(engine) as db_session:
            stmt = (
                select(User)
                .where(User.username != PRACTICE_KIOSK_USERNAME)
                .order_by(User.created_at.desc())
            )
            users = db_session.execute(stmt).scalars().all()
            
            if not users:
                return []
                
            user_ids = [u.id for u in users]
            # Bulk count submissions
            sub_stmt = select(AICSession.user_id, func.count(Submission.id)).join(
                AICSession, Submission.session_id == AICSession.id
            ).where(AICSession.user_id.in_(user_ids)).group_by(AICSession.user_id)
            rows = db_session.execute(sub_stmt).all()
            sub_counts = {row[0]: int(row[1]) for row in rows}
            
            user_list = []
            for u in users:
                sub_count = sub_counts.get(u.id, 0)
                
                user_list.append({
                    "id": str(u.id),
                    "nickname": u.nickname,
                    "username": u.username,
                    "unlock_code": u.unlock_code,
                    "unlock_code_generated_at": (
                        u.unlock_code_generated_at.isoformat()
                        if u.unlock_code_generated_at
                        else None
                    ),
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
            await broadcast_manager.broadcast({
                "type": "STATION_UPDATE",
                "station_id": req.id,
                "event": "registered"
            })
            return {"status": "registered", "station_id": station.id, "ip": station.ip_address}

    @app.get("/api/v1/aiccore/users/{user_id}/history")
    async def get_user_history(user_id: UUID, request: Request):
        _require_admin_request(request)
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
    async def admin_login(body: AdminLoginRequest, request: Request):
        admin_pass = os.getenv("AICCORE_ADMIN_PASS")
        if not admin_pass:
            raise HTTPException(status_code=503, detail="Admin authentication not configured. Set AICCORE_ADMIN_PASS.")

        if body.password == admin_pass:
            res = JSONResponse(content={"status": "authenticated", "role": "admin"})
            res.set_cookie(
                key="aiccore_admin",
                value=issue_admin_cookie_value(),
                httponly=True,
                path="/",
                max_age=admin_cookie_max_age_seconds(),
                **_admin_cookie_kwargs(request),
            )
            return res
        
        print(f"❌ Admin login failed: Incorrect password attempt.")
        raise HTTPException(status_code=401, detail="Invalid admin password")

    @app.get("/api/v1/aiccore/auth/admin-status")
    async def admin_status(request: Request):
        return {"authenticated": _admin_authenticated(request)}

    @app.post("/api/v1/aiccore/auth/admin-logout")
    async def admin_logout(request: Request):
        res = JSONResponse(content={"status": "logged_out"})
        _clear_admin_cookie(res, request)
        return res

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
        if clean_username == "":
            raise HTTPException(status_code=400, detail="Reserved handle")

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
            participant_password = req.password or None
            
            if existing:
                password_error = public_profile_password_error(
                    username=existing.username,
                    supplied_password=participant_password,
                    stored_password=existing.password,
                )
                if password_error:
                    status_code = 409 if password_error == "PASSWORD_RESET_REQUIRED" else 401
                    raise HTTPException(status_code=status_code, detail=password_error)
                if existing.password and participant_password and participant_password_needs_upgrade(existing.password):
                    existing.password = hash_participant_password(participant_password)

                # Regenerate OTP (exclude this user when checking uniqueness — code may still be NULL)
                new_code = None
                for _ in range(40):
                    cand = generate_unlock_code()
                    collision = db_session.execute(
                        select(User).where(User.unlock_code == cand, User.id != existing.id)
                    ).scalars().first()
                    if not collision:
                        new_code = cand
                        break
                if not new_code:
                    raise HTTPException(status_code=500, detail="Could not generate a unique unlock code")
                existing.unlock_code = new_code
                existing.unlock_code_generated_at = datetime.now(timezone.utc)

                _, created_registration = ensure_requested_challenge_registration(
                    db_session,
                    user_id=existing.id,
                    challenge_id_raw=req.challenge_id,
                )

                db_session.commit()
                db_session.refresh(existing)

                if created_registration:
                    await broadcast_manager.broadcast(
                        {"type": "REGISTRY_UPDATE", "data": {"user_id": str(existing.id)}}
                    )

                stats = await get_user_stats(db_session, existing.id)

                return {
                    "id": str(existing.id),
                    "username": existing.username,
                    "nickname": existing.nickname,
                    "unlock_code": existing.unlock_code,
                    "stats": stats,
                }
            if not clean_nickname:
                raise HTTPException(status_code=400, detail="Display nickname is required for new profiles")
            if not participant_password:
                raise HTTPException(status_code=400, detail="PASSWORD_REQUIRED")

            new_code = None
            for _ in range(40):
                cand = generate_unlock_code()
                if not db_session.execute(select(User).where(User.unlock_code == cand)).scalars().first():
                    new_code = cand
                    break
            if not new_code:
                raise HTTPException(status_code=500, detail="Could not generate a unique unlock code")

            new_user = User(
                username=clean_username,
                nickname=clean_nickname,
                password=hash_participant_password(participant_password),
                unlock_code=new_code,
                unlock_code_generated_at=datetime.now(timezone.utc)
            )
            db_session.add(new_user)
            db_session.flush()  # get new_user.id before committing

            _, created_registration = ensure_requested_challenge_registration(
                db_session,
                user_id=new_user.id,
                challenge_id_raw=req.challenge_id,
            )

            db_session.commit()
            db_session.refresh(new_user)

            # Broadcast registry update
            if created_registration:
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
    async def regenerate_code(user_id: UUID, request: Request):
        _require_admin_request(request)
        with Session(engine) as db_session:
            user = db_session.get(User, user_id)
            if not user:
                raise HTTPException(status_code=404, detail="User not found")
            
            new_code = None
            for _ in range(40):
                cand = generate_unlock_code()
                collision = db_session.execute(
                    select(User).where(User.unlock_code == cand, User.id != user_id)
                ).scalars().first()
                if not collision:
                    new_code = cand
                    break
            if not new_code:
                raise HTTPException(status_code=500, detail="Could not generate a unique unlock code")

            generated_at = datetime.now(timezone.utc)
            user.unlock_code = new_code
            user.unlock_code_generated_at = generated_at
            db_session.commit()
            return {"unlock_code": user.unlock_code, "generated_at": generated_at.isoformat()}

    @app.delete("/api/v1/aiccore/users/{user_id}")
    async def delete_user(user_id: UUID, request: Request):
        _require_admin_request(request)
        with Session(engine) as db_session:
            user = db_session.get(User, user_id)
            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            # Collect session IDs before deletion so we can cascade to child rows
            session_ids_stmt = select(AICSession.id).where(AICSession.user_id == user_id)
            session_ids = [row[0] for row in db_session.execute(session_ids_stmt).all()]

            if session_ids:
                stations = (
                    db_session.execute(
                        select(Station).where(Station.current_session_id.in_(session_ids))
                    )
                    .scalars()
                    .all()
                )
                release_station_assignments(stations, set(session_ids))
                # Demo queue FKs session rows — remove before sessions
                db_session.execute(delete(DemoQueueEntry).where(DemoQueueEntry.session_id.in_(session_ids)))
                # Delete child rows in dependency order: Events → Submissions → Sessions
                db_session.execute(delete(Event).where(Event.session_id.in_(session_ids)))
                db_session.execute(delete(Submission).where(Submission.session_id.in_(session_ids)))
                db_session.execute(delete(AICSession).where(AICSession.id.in_(session_ids)))

            # Delete challenge registrations
            db_session.execute(delete(ChallengeRegistration).where(ChallengeRegistration.user_id == user_id))

            db_session.delete(user)
            db_session.commit()
            return {"status": "deleted", "user_id": str(user_id)}

    @app.post("/api/v1/aiccore/challenges/{challenge_id}/toggle-registration")
    async def toggle_registration(challenge_id: UUID, request: Request):
        _require_admin_request(request)
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
        Returns the current arena state. Background sync to an external cloud hub
        is handled automatically by the sync_to_cloud() worker when
        AICCORE_CLOUD_API_URL is configured.
        """
        from aiccore.backend.sync import get_arena_state
        state = await get_arena_state()
        return {"status": "ok", "data": state}

    # Attach AICCORE Telemetry Middleware (inner); CORS added last = outermost.
    app.add_middleware(AICCoreEventMiddleware)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    if serve_bundled_frontend and static_files_dir is not None:
        app.router.routes.append(
            HTTPOnlyMount(
                "/",
                StaticFiles(directory=str(static_files_dir), html=True),
                name="langflow-static",
            )
        )

        @app.exception_handler(404)
        async def bundled_frontend_404_handler(request: Request, exc):
            if request.url.path.startswith("/api"):
                detail = exc.detail if isinstance(exc, HTTPException) else "Not Found"
                return JSONResponse(
                    status_code=404,
                    content=detail if isinstance(detail, dict) else {"detail": detail},
                )

            index_path = anyio.Path(static_files_dir) / "index.html"
            if not await index_path.exists():
                raise RuntimeError(f"File at path {index_path} does not exist.")
            return FileResponse(index_path)

    return app

app = create_aiccore_app()

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting AICCORE Museum Agent Arena...")
    uvicorn.run(app, host="0.0.0.0", port=7860)
