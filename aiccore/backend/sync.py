import asyncio
import httpx
import os
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from .database import engine
from .models import Session as AICSession, Submission, Event
from sqlalchemy import select, desc, func
import json

# Configuration for Centralized Dashboard Connection
CLOUD_API_URL = os.getenv("AICCORE_CLOUD_API_URL", "") # e.g., https://arena.aiccore.com/api/v1/sync
CLOUD_API_KEY = os.getenv("AICCORE_CLOUD_API_KEY", "")

async def get_arena_state():
    """
    Serializes the current local arena state for synchronization.
    """
    with Session(engine) as db_session:
        # 1. Get Leaderboard
        stmt = select(AICSession).where(AICSession.is_active == True).order_by(desc(AICSession.start_time))
        all_active = db_session.execute(stmt).scalars().all()
        
        # Deduplicate stations
        seen_stations = set()
        active_sessions = []
        for s in all_active:
            norm_station = str(s.station_id).strip().lower() if s.station_id else "0"
            if norm_station not in seen_stations:
                active_sessions.append(s)
                seen_stations.add(norm_station)
        
        active_ids = [s.id for s in active_sessions]
        
        event_counts = {}
        last_run_by_sess = {}
        subs_by_sess = {}
        
        if active_ids:
            counts_res = db_session.execute(
                select(Event.session_id, func.count(Event.id))
                .where(Event.session_id.in_(active_ids))
                .group_by(Event.session_id)
            ).all()
            event_counts = {row[0]: int(row[1]) for row in counts_res}

            runs_db = db_session.execute(
                select(Event)
                .where(Event.session_id.in_(active_ids), Event.event_type == "flow_run_completed")
                .order_by(Event.timestamp.desc())
            ).scalars().all()
            for r in runs_db:
                if r.session_id not in last_run_by_sess:
                    last_run_by_sess[r.session_id] = r

            subs_db = db_session.execute(
                select(Submission)
                .where(Submission.session_id.in_(active_ids))
                .order_by(Submission.submitted_at.desc())
            ).scalars().all()
            for sub in subs_db:
                if sub.session_id not in subs_by_sess:
                    subs_by_sess[sub.session_id] = sub

        leaderboard = []
        for s in active_sessions:
            event_count = event_counts.get(s.id, 0)
            last_run = last_run_by_sess.get(s.id)
            
            status = "BUILDING"
            if event_count > 10: status = "PROTOTYPING"
            if last_run:
                status = "TESTING"
                if last_run.payload.get("status") == "success": status = "READY"
            
            progress = min(event_count * 5, 99)
            if s.is_submitted: progress = 100
            
            submission = subs_by_sess.get(s.id)
            
            leaderboard.append({
                "id": str(s.id),
                "nickname": s.nickname,
                "station": s.station_id or "0",
                "progress": progress,
                "status": status,
                "score": (submission.score or 0) if submission else 0,
                "is_winner": (submission.is_winner or False) if submission else False
            })

        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "local_station_id": os.getenv("AICCORE_STATION_ID", "LOCAL_MUSEUM_01"),
            "leaderboard": leaderboard,
            "active_count": len(leaderboard)
        }

async def sync_to_cloud():
    """
    Background worker that pushes local state to the cloud.
    """
    if not CLOUD_API_URL:
        # print("☁️ Cloud Sync: No CLOUD_API_URL configured. Running in local-only mode.")
        return

    async with httpx.AsyncClient() as client:
        while True:
            try:
                state = await get_arena_state()
                response = await client.post(
                    CLOUD_API_URL,
                    json=state,
                    headers={"X-AICCORE-KEY": CLOUD_API_KEY},
                    timeout=5.0
                )
                if response.status_code == 200:
                    # print("✅ Cloud Sync: Success")
                    pass
                else:
                    print(f"❌ Cloud Sync: Failed ({response.status_code})")
            except Exception as e:
                print(f"⚠️ Cloud Sync Error: {e}")
            
            await asyncio.sleep(5) # Sync every 5 seconds

async def push_event_to_cloud(message: dict):
    """
    Pushes a single real-time event to the cloud hub.
    """
    if not CLOUD_API_URL:
        return

    # Map /sync to /events or similar if the cloud hub has a dedicated endpoint
    # For now, we'll assume the cloud hub handles a 'type': 'event' payload at the same URL
    # or we can derive a new URL. Let's use a sub-path /events.
    endpoint = CLOUD_API_URL.replace("/sync", "/events")
    
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                endpoint,
                json=message,
                headers={"X-AICCORE-KEY": CLOUD_API_KEY},
                timeout=2.0
            )
    except Exception as e:
        # Silently fail for real-time events to avoid flooding logs
        pass
