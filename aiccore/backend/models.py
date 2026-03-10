from datetime import datetime, timezone
from typing import Optional, Dict, Any
from uuid import UUID, uuid4
from sqlalchemy import Column, String, DateTime, Boolean, JSON, ForeignKey, Integer, Float
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

class Base(DeclarativeBase):
    pass

class Session(Base):
    __tablename__ = "session"
    
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("user.id"), nullable=True)
    nickname: Mapped[str] = mapped_column(String)
    station_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    challenge_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("challenge.id"), nullable=True)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    end_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_submitted: Mapped[bool] = mapped_column(Boolean, default=False)

class Event(Base):
    __tablename__ = "event"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[UUID] = mapped_column(ForeignKey("session.id"))
    sequence_number: Mapped[int] = mapped_column(Integer)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    event_type: Mapped[str] = mapped_column(String)
    payload: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict)

class Submission(Base):
    __tablename__ = "submission"
    
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    session_id: Mapped[UUID] = mapped_column(ForeignKey("session.id"))
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    flow_snapshot: Mapped[Dict[str, Any]] = mapped_column(JSON)
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_winner: Mapped[bool] = mapped_column(Boolean, default=False)

class User(Base):
    __tablename__ = "user"
    
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    username: Mapped[str] = mapped_column(String, unique=True)
    nickname: Mapped[str] = mapped_column(String)
    password: Mapped[Optional[str]] = mapped_column(String, nullable=True) # Simple password for returning users
    unlock_code: Mapped[str] = mapped_column(String, unique=True, index=True) # 4-digit code
    unlock_code_generated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    honors: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict) # To store earned achievements
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class Challenge(Base):
    __tablename__ = "challenge"
    
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(String)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    complexity_level: Mapped[str] = mapped_column(String, default="Beginner")
    max_participants: Mapped[int] = mapped_column(Integer, default=10)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60)
    start_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True) # Upcoming Event Date/Time
    location: Mapped[str] = mapped_column(String, default="Main Arena") # Physical or Virtual location
    is_registration_open: Mapped[bool] = mapped_column(Boolean, default=True)
    is_finalized: Mapped[bool] = mapped_column(Boolean, default=False) # Ceremony mode status
    starter_assets_url: Mapped[Optional[str]] = mapped_column(String, nullable=True) # PDF/Docs link
    banner_image_url: Mapped[Optional[str]] = mapped_column(String, nullable=True) # UI enhancement
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class ChallengeRegistration(Base):
    __tablename__ = "challenge_registration"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("user.id"))
    challenge_id: Mapped[UUID] = mapped_column(ForeignKey("challenge.id"))
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class Station(Base):
    __tablename__ = "station"
    
    id: Mapped[str] = mapped_column(String, primary_key=True) # e.g. "STATION_01"
    ip_address: Mapped[str] = mapped_column(String, unique=True)
    status: Mapped[str] = mapped_column(String, default="available") # available, occupied, maintenance, offline
    current_session_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("session.id"), nullable=True)
    last_heartbeat: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cpu_load: Mapped[int] = mapped_column(Integer, default=0)
    core_temp: Mapped[int] = mapped_column(Integer, default=0)

class Achievement(Base):
    __tablename__ = "achievement"
    
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(String)
    icon_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
