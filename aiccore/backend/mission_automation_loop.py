"""
Background mission automation: session expiry, auto-finalize, auto-activate, and related
broadcasts — so GET /system/status and GET /demo/status stay read-only for mission timing.
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Dict, Optional, Tuple

from sqlalchemy.orm import Session

from .broadcast import broadcast_manager
from .database import engine
from .mission_automation import run_mission_automation
from .session_presence import expire_stale_sessions

logger = logging.getLogger(__name__)


def mission_automation_tick_sync() -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Run stale-session expiry + mission automation in one DB session."""
    with Session(engine) as db:
        expired = expire_stale_sessions(db)
        if expired:
            db.commit()
        return run_mission_automation(db)


async def broadcast_mission_automation_results(
    mission_end_payload: Optional[Dict[str, Any]],
    mission_live_payload: Optional[Dict[str, Any]],
) -> None:
    if mission_end_payload:
        await broadcast_manager.broadcast(
            {
                "type": "MISSION_ENDED",
                "data": {
                    "challenge_id": mission_end_payload["challenge_id"],
                    "title": mission_end_payload.get("title", ""),
                },
            }
        )
    if mission_live_payload:
        await broadcast_manager.broadcast(
            {
                "type": "MISSION_LIVE",
                "data": mission_live_payload,
            }
        )
        await broadcast_manager.broadcast({"type": "LEADERBOARD_UPDATE", "data": {}})
    elif mission_end_payload:
        await broadcast_manager.broadcast({"type": "LEADERBOARD_UPDATE", "data": {}})


async def mission_automation_background_loop() -> None:
    """Periodic tick (default 15s). Set AICCORE_MISSION_AUTOMATION_INTERVAL_SEC to override."""
    try:
        interval = float(os.getenv("AICCORE_MISSION_AUTOMATION_INTERVAL_SEC", "15"))
    except ValueError:
        interval = 15.0
    interval = max(5.0, interval)
    logger.info(
        "mission_automation background loop started (interval=%ss)",
        interval,
    )
    await asyncio.sleep(2.0)
    while True:
        try:
            end, live = await asyncio.to_thread(mission_automation_tick_sync)
            await broadcast_mission_automation_results(end, live)
        except Exception:
            logger.exception("mission_automation tick failed")
        await asyncio.sleep(interval)
