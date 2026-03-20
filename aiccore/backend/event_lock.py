"""
Per-AICCORE-session lock for allocating Event.sequence_number.

Middleware flow_saved / granular events and eraser workspace_snapshot / submit
all append Event rows; sharing this lock avoids duplicate sequence_number under load.
"""

import threading
from typing import Dict
from uuid import UUID

_event_seq_locks: Dict[str, threading.Lock] = {}
_guard = threading.Lock()


def get_event_seq_lock(session_id: UUID) -> threading.Lock:
    key = str(session_id)
    with _guard:
        if key not in _event_seq_locks:
            _event_seq_locks[key] = threading.Lock()
        return _event_seq_locks[key]
