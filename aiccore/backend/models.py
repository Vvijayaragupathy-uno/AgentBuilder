from datetime import datetime, timezone
from typing import Optional, Dict, Any
from uuid import UUID, uuid4
from sqlalchemy import Column, String, DateTime, Boolean, JSON, ForeignKey, Integer, Float
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

# All AICCORE tables are created in the 'aiccore' Postgres schema.
# This keeps them completely separate from Langflow's tables in 'public',
# preventing Langflow's Alembic migration checker from seeing them.
AICCORE_SCHEMA = "aiccore"


class Base(DeclarativeBase):
    pass


class Participant(Base):
    """AICCORE player profile — separate from Langflow's internal 'user' table."""
    __tablename__ = "participant"
    __table_args__ = {"schema": AICCORE_SCHEMA}

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    username: Mapped[str] = mapped_column(String, unique=True)
    nickname: Mapped[str] = mapped_column(String)
    password: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    unlock_code: Mapped[str] = mapped_column(String, unique=True, index=True)
    unlock_code_generated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    honors: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Challenge(Base):
    __tablename__ = "challenge"
    __table_args__ = {"schema": AICCORE_SCHEMA}

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(String)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    complexity_level: Mapped[str] = mapped_column(String, default="Beginner")
    max_participants: Mapped[int] = mapped_column(Integer, default=10)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60)
    start_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    location: Mapped[str] = mapped_column(String, default="Main Arena")
    is_registration_open: Mapped[bool] = mapped_column(Boolean, default=True)
    is_finalized: Mapped[bool] = mapped_column(Boolean, default=False)
    starter_assets_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    banner_image_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Session(Base):
    __tablename__ = "session"
    __table_args__ = {"schema": AICCORE_SCHEMA}

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey(f"{AICCORE_SCHEMA}.participant.id"), nullable=True
    )
    nickname: Mapped[str] = mapped_column(String)
    station_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    challenge_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey(f"{AICCORE_SCHEMA}.challenge.id"), nullable=True
    )
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    end_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_submitted: Mapped[bool] = mapped_column(Boolean, default=False)


class Event(Base):
    __tablename__ = "event"
    __table_args__ = {"schema": AICCORE_SCHEMA}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[UUID] = mapped_column(ForeignKey(f"{AICCORE_SCHEMA}.session.id"))
    sequence_number: Mapped[int] = mapped_column(Integer)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    event_type: Mapped[str] = mapped_column(String)
    payload: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict)


class Submission(Base):
    __tablename__ = "submission"
    __table_args__ = {"schema": AICCORE_SCHEMA}

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    session_id: Mapped[UUID] = mapped_column(ForeignKey(f"{AICCORE_SCHEMA}.session.id"))
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    flow_snapshot: Mapped[Dict[str, Any]] = mapped_column(JSON)
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_winner: Mapped[bool] = mapped_column(Boolean, default=False)


class ChallengeRegistration(Base):
    __tablename__ = "challenge_registration"
    __table_args__ = {"schema": AICCORE_SCHEMA}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey(f"{AICCORE_SCHEMA}.participant.id"))
    challenge_id: Mapped[UUID] = mapped_column(ForeignKey(f"{AICCORE_SCHEMA}.challenge.id"))
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Station(Base):
    __tablename__ = "station"
    __table_args__ = {"schema": AICCORE_SCHEMA}

    id: Mapped[str] = mapped_column(String, primary_key=True)
    ip_address: Mapped[str] = mapped_column(String, unique=True)
    status: Mapped[str] = mapped_column(String, default="available")
    current_session_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey(f"{AICCORE_SCHEMA}.session.id"), nullable=True
    )
    last_heartbeat: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cpu_load: Mapped[int] = mapped_column(Integer, default=0)
    core_temp: Mapped[int] = mapped_column(Integer, default=0)


class Achievement(Base):
    __tablename__ = "achievement"
    __table_args__ = {"schema": AICCORE_SCHEMA}

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(String)
    icon_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
