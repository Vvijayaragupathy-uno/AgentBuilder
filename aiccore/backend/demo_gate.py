"""
Single entry points for opening the demo gate (try vs force) with structured reasons for logs and ops.
"""
from __future__ import annotations

import logging
from enum import Enum

from sqlalchemy.orm import Session

from .demo_ceremony import force_open_demo_gate, try_open_demo_gate

logger = logging.getLogger(__name__)


class DemoGateReason(str, Enum):
    """Why we attempted to open the demo gate (for logs / future metrics)."""

    DEMO_STATUS_POLL = "demo_status_poll"
    DEMO_QUEUE_JOIN = "demo_queue_join"
    SESSION_DEACTIVATE = "session_deactivate"
    LEGACY_SUBMIT = "legacy_submit"
    WORKSPACE_SUBMIT = "workspace_submit"
    MISSION_DEACTIVATED = "mission_deactivated"
    SYSTEM_FINALIZE = "system_finalize"


def open_demo_gate_try(db: Session, reason: DemoGateReason) -> bool:
    opened = try_open_demo_gate(db)
    if opened:
        logger.info("demo_gate opened (try) reason=%s", reason.value)
    return opened


def open_demo_gate_force(db: Session, reason: DemoGateReason) -> bool:
    opened = force_open_demo_gate(db)
    if opened:
        logger.info("demo_gate opened (force) reason=%s", reason.value)
    return opened
