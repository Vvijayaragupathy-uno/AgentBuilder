from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import ForeignKey, String, Uuid, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

from aiccore.backend.demo_ceremony import _latest_snapshot_for_session
from aiccore.backend.eraser import (
    _prepare_manifest_for_restore,
    _submission_lookup_requires_folder_scope,
    purge_langflow_workspace_scoped,
)
from aiccore.backend.middleware import _inject_flow_folder_id
from aiccore.backend.registrations import ensure_requested_challenge_registration
from aiccore.backend.security import (
    is_valid_admin_cookie,
    is_valid_session_token,
    issue_admin_cookie_value,
    issue_session_token,
    session_token_max_age_seconds,
)
from aiccore.backend.session_presence import expire_stale_sessions
from aiccore.backend.models import Base, Challenge, Event, Participant, Session as AICSession


class _LFBase(DeclarativeBase):
    pass


class _Folder(_LFBase):
    __tablename__ = "folder"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    parent_id: Mapped[Optional[UUID]] = mapped_column(Uuid, ForeignKey("folder.id"), nullable=True)


class _Flow(_LFBase):
    __tablename__ = "flow"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    folder_id: Mapped[Optional[UUID]] = mapped_column(Uuid, ForeignKey("folder.id"), nullable=True)


def _test_engine():
    return create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        execution_options={"schema_translate_map": {"aiccore": None}},
    )


def test_inject_flow_folder_id_sets_missing_post_folder():
    payload = {"name": "Flow A"}

    updated = _inject_flow_folder_id(payload, "POST", "seat-folder")

    assert updated["folder_id"] == "seat-folder"
    assert payload.get("folder_id") is None


def test_inject_flow_folder_id_overrides_patch_folder():
    payload = {"name": "Flow A", "folder_id": "starter-folder"}

    updated = _inject_flow_folder_id(payload, "PATCH", "seat-folder")

    assert updated["folder_id"] == "seat-folder"


def test_latest_snapshot_falls_back_to_workspace_snapshot_when_flow_save_is_empty():
    engine = _test_engine()
    Base.metadata.create_all(engine)

    session_id = uuid4()
    with Session(engine) as db:
        db.add(AICSession(id=session_id, nickname="Builder"))
        db.add(
            Event(
                session_id=session_id,
                sequence_number=0,
                event_type="flow_saved",
                payload={"snapshot": {"nodes": [], "edges": []}},
            )
        )
        db.add(
            Event(
                session_id=session_id,
                sequence_number=1,
                event_type="workspace_snapshot",
                payload={
                    "folders": [],
                    "flows": [
                        {
                            "id": str(uuid4()),
                            "name": "Recovered Flow",
                            "folder_id": str(uuid4()),
                            "is_component": False,
                            "data": {"nodes": [{"id": "node-1"}], "edges": []},
                        }
                    ],
                },
            )
        )
        db.commit()

        snapshot = _latest_snapshot_for_session(db, session_id)

    assert snapshot == {"nodes": [{"id": "node-1"}], "edges": []}


def test_prepare_manifest_for_restore_rehomes_old_root_into_current_seat_folder():
    old_root = uuid4()
    old_child = uuid4()
    old_flow = uuid4()
    current_root = uuid4()

    prepared = _prepare_manifest_for_restore(
        {
            "folders": [
                {
                    "id": str(old_root),
                    "name": "Arena-old-session",
                    "description": "old seat root",
                    "parent_id": None,
                },
                {
                    "id": str(old_child),
                    "name": "Nested",
                    "description": "child folder",
                    "parent_id": str(old_root),
                },
            ],
            "flows": [
                {
                    "id": str(old_flow),
                    "name": "Recovered Flow",
                    "description": "restored",
                    "folder_id": str(old_root),
                    "data": {"nodes": [{"id": "node-1"}], "edges": []},
                    "is_component": False,
                }
            ],
            "variables": [],
        },
        default_flow_folder_id=current_root,
    )

    assert len(prepared["folders"]) == 1
    assert prepared["folders"][0]["name"] == "Nested"
    assert prepared["folders"][0]["parent_id"] == current_root
    assert prepared["flows"][0]["folder_id"] == current_root
    assert prepared["flows"][0]["id"] != old_flow


def test_submission_lookup_requires_folder_scope_only_when_seat_folder_exists():
    assert _submission_lookup_requires_folder_scope(uuid4()) is True
    assert _submission_lookup_requires_folder_scope(None) is False


def test_scoped_purge_keeps_other_arena_slot_folders(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    _LFBase.metadata.create_all(engine)

    root_id = uuid4()
    child_id = uuid4()
    other_root_id = uuid4()
    scoped_flow_id = uuid4()
    other_flow_id = uuid4()

    with Session(engine) as db:
        db.add(_Folder(id=root_id, name="ArenaSlot-root", parent_id=None))
        db.add(_Folder(id=child_id, name="Child", parent_id=root_id))
        db.add(_Folder(id=other_root_id, name="ArenaSlot-other", parent_id=None))
        db.add(_Flow(id=scoped_flow_id, folder_id=child_id))
        db.add(_Flow(id=other_flow_id, folder_id=other_root_id))
        db.commit()

    class _AsyncSessionAdapter:
        def __init__(self, db: Session) -> None:
            self._db = db

        async def execute(self, stmt):
            return self._db.execute(stmt)

        async def commit(self) -> None:
            self._db.commit()

        async def flush(self) -> None:
            self._db.flush()

        def add(self, obj) -> None:
            self._db.add(obj)

    @asynccontextmanager
    async def _fake_session_scope():
        with Session(engine) as db:
            yield _AsyncSessionAdapter(db)

    monkeypatch.setattr(
        "aiccore.backend.eraser._import_langflow_workspace_models",
        lambda: (_Flow, _Folder, None, None, None, None, _fake_session_scope),
    )

    import asyncio

    asyncio.run(purge_langflow_workspace_scoped(root_id))

    with Session(engine) as db:
        assert db.get(_Folder, root_id) is not None
        assert db.get(_Folder, child_id) is None
        assert db.get(_Folder, other_root_id) is not None
        assert db.get(_Flow, scoped_flow_id) is None
        assert db.get(_Flow, other_flow_id) is not None


def test_expire_stale_sessions_deactivates_old_unsubmitted_browser_session():
    engine = _test_engine()
    Base.metadata.create_all(engine)

    session_id = uuid4()
    old_seen = datetime.now(timezone.utc) - timedelta(hours=1)
    with Session(engine) as db:
        db.add(
            AICSession(
                id=session_id,
                nickname="Builder",
                station_id="ws-seat-1",
                is_active=True,
                is_submitted=False,
                start_time=old_seen,
                last_seen_at=old_seen,
            )
        )
        db.commit()

        expired = expire_stale_sessions(db, now=datetime.now(timezone.utc))
        db.commit()
        refreshed = db.get(AICSession, session_id)

    assert expired == [session_id]
    assert refreshed is not None
    assert refreshed.is_active is False
    assert refreshed.end_time is not None


def test_session_token_is_bound_to_session_id_and_expires():
    session_id = uuid4()
    issued = 1_700_000_000
    token = issue_session_token(session_id, issued_at=issued)

    assert is_valid_session_token(session_id, token, now=issued + 60) is True
    assert is_valid_session_token(uuid4(), token, now=issued + 60) is False
    assert is_valid_session_token(
        session_id,
        token,
        now=issued + session_token_max_age_seconds() + 1,
    ) is False


def test_admin_cookie_value_is_signed_and_rejects_tampering():
    issued = 1_700_000_000
    value = issue_admin_cookie_value(issued_at=issued)

    assert is_valid_admin_cookie(value, now=issued + 60) is True
    assert is_valid_admin_cookie(f"{value}tampered", now=issued + 60) is False


def test_requested_challenge_registration_creates_row_once():
    engine = _test_engine()
    Base.metadata.create_all(engine)

    challenge_id = uuid4()
    user_id = uuid4()
    with Session(engine) as db:
        db.add(
            Participant(
                id=user_id,
                username="builder_1",
                nickname="Builder",
                honors={},
            )
        )
        db.add(
            Challenge(
                id=challenge_id,
                title="Mission",
                description="Build something",
                is_registration_open=True,
                is_active=False,
                is_finalized=False,
                max_participants=5,
            )
        )
        db.commit()

        resolved_id, created = ensure_requested_challenge_registration(
            db,
            user_id=user_id,
            challenge_id_raw=str(challenge_id),
        )
        _, created_again = ensure_requested_challenge_registration(
            db,
            user_id=user_id,
            challenge_id_raw=str(challenge_id),
        )
        db.commit()

    assert resolved_id == challenge_id
    assert created is True
    assert created_again is False


def test_requested_challenge_registration_rejects_closed_or_full_challenge():
    engine = _test_engine()
    Base.metadata.create_all(engine)

    closed_challenge_id = uuid4()
    full_challenge_id = uuid4()
    user_id = uuid4()
    other_user_id = uuid4()
    with Session(engine) as db:
        db.add(
            Participant(
                id=user_id,
                username="builder_2",
                nickname="Builder Two",
                honors={},
            )
        )
        db.add(
            Participant(
                id=other_user_id,
                username="builder_3",
                nickname="Builder Three",
                honors={},
            )
        )
        db.add(
            Challenge(
                id=closed_challenge_id,
                title="Closed Mission",
                description="Nope",
                is_registration_open=False,
                is_active=False,
                is_finalized=False,
                max_participants=5,
            )
        )
        db.add(
            Challenge(
                id=full_challenge_id,
                title="Full Mission",
                description="Packed",
                is_registration_open=True,
                is_active=False,
                is_finalized=False,
                max_participants=1,
            )
        )
        db.commit()
        ensure_requested_challenge_registration(
            db,
            user_id=other_user_id,
            challenge_id_raw=str(full_challenge_id),
        )
        db.commit()

        with pytest.raises(HTTPException) as closed_exc:
            ensure_requested_challenge_registration(
                db,
                user_id=user_id,
                challenge_id_raw=str(closed_challenge_id),
            )
        with pytest.raises(HTTPException) as full_exc:
            ensure_requested_challenge_registration(
                db,
                user_id=user_id,
                challenge_id_raw=str(full_challenge_id),
            )

    assert closed_exc.value.detail == "Registration is closed for this challenge"
    assert full_exc.value.detail == "Challenge is full - maximum participants reached"
