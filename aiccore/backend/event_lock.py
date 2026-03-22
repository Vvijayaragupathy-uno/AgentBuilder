"""
Per-AICCORE-session serialization for Event.sequence_number allocation.

- **SQLite / single process:** threading.Lock per session (legacy dev).
- **Postgres:** `pg_advisory_xact_lock` inside the same ORM transaction as the insert —
  safe across Uvicorn workers (thread locks are not).
"""

import threading
from contextlib import contextmanager
from typing import Dict
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session as OrmSession

_event_seq_locks: Dict[str, threading.Lock] = {}
_guard = threading.Lock()


def _db_url_is_postgres() -> bool:
    from .database import DATABASE_URL

    return DATABASE_URL.startswith(("postgresql", "postgres"))


def get_event_seq_lock(session_id: UUID) -> threading.Lock:
    """Process-local lock — used only when not on Postgres."""
    key = str(session_id)
    with _guard:
        if key not in _event_seq_locks:
            _event_seq_locks[key] = threading.Lock()
        return _event_seq_locks[key]


def ensure_pg_advisory_xact_lock(db_session: OrmSession, session_id: UUID) -> None:
    """
    Must be the first statement on this Session's transaction before max(sequence) + insert.
    Released on commit/rollback. No-op off Postgres.
    """
    if not _db_url_is_postgres():
        return
    k = int(session_id.int % (2**62))
    db_session.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": k})


@contextmanager
def event_sequence_write_lock(session_id: UUID):
    """
    Wrap Event row inserts that allocate sequence_number.
    On Postgres, pair with ensure_pg_advisory_xact_lock(db, session_id) inside the Session.
    """
    if _db_url_is_postgres():
        yield
    else:
        with get_event_seq_lock(session_id):
            yield
