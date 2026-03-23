"""Tests for unified mission build window (start + optional duration end)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from aiccore.backend.challenge_time import challenge_in_scheduled_build_window
from aiccore.backend.models import Challenge


def _ch(**kwargs) -> Challenge:
    c = Challenge(
        id=uuid4(),
        title="T",
        description="D",
        is_active=kwargs.get("is_active", True),
        is_finalized=kwargs.get("is_finalized", False),
        start_time=kwargs.get("start_time"),
        duration_minutes=kwargs.get("duration_minutes", 60),
    )
    return c


def test_open_ended_no_start_always_in_window_when_active():
    c = _ch(start_time=None, duration_minutes=60)
    now = datetime.now(timezone.utc)
    assert challenge_in_scheduled_build_window(c, now) is True


def test_before_start_not_in_window():
    start = datetime.now(timezone.utc) + timedelta(hours=1)
    c = _ch(start_time=start, duration_minutes=30)
    now = datetime.now(timezone.utc)
    assert challenge_in_scheduled_build_window(c, now) is False


def test_after_duration_end_not_in_window():
    start = datetime(2025, 1, 1, 12, 0, tzinfo=timezone.utc)
    c = _ch(start_time=start, duration_minutes=30)
    inside = start + timedelta(minutes=15)
    assert challenge_in_scheduled_build_window(c, inside) is True
    at_end = start + timedelta(minutes=30)
    assert challenge_in_scheduled_build_window(c, at_end) is False
    after = start + timedelta(minutes=31)
    assert challenge_in_scheduled_build_window(c, after) is False


def test_zero_duration_means_no_scheduled_end_instant():
    start = datetime(2025, 6, 1, 10, 0, tzinfo=timezone.utc)
    c = _ch(start_time=start, duration_minutes=0)
    later = start + timedelta(days=1)
    assert challenge_in_scheduled_build_window(c, later) is True


def test_finalized_never_in_window():
    start = datetime(2020, 1, 1, 12, 0, tzinfo=timezone.utc)
    c = _ch(start_time=start, duration_minutes=60, is_finalized=True)
    assert challenge_in_scheduled_build_window(c, datetime(2020, 1, 1, 12, 30, tzinfo=timezone.utc)) is False
