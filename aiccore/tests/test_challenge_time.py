"""Tests for unified mission build window (start + optional duration end)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from aiccore.backend.challenge_time import (
    challenge_in_scheduled_build_window,
    challenge_would_be_in_build_window_if_activated,
    mission_build_window_phase,
)
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


def test_mission_build_window_phase_none_and_before_after():
    assert mission_build_window_phase(None, datetime.now(timezone.utc)) == "no_active_mission"

    start = datetime(2025, 1, 1, 12, 0, tzinfo=timezone.utc)
    c = _ch(start_time=start, duration_minutes=30)
    assert mission_build_window_phase(c, start - timedelta(minutes=1)) == "before_start"
    assert mission_build_window_phase(c, start + timedelta(minutes=15)) == "open"
    assert mission_build_window_phase(c, start + timedelta(minutes=30)) == "after_end"


def test_mission_build_window_phase_open_ended_no_start():
    c = _ch(start_time=None, duration_minutes=60)
    assert mission_build_window_phase(c, datetime.now(timezone.utc)) == "open"


def test_would_be_in_window_if_activated_for_inactive_row():
    start = datetime(2025, 8, 1, 15, 0, tzinfo=timezone.utc)
    c = _ch(start_time=start, duration_minutes=20, is_active=False)
    assert challenge_would_be_in_build_window_if_activated(c, start + timedelta(minutes=5)) is True
    assert challenge_would_be_in_build_window_if_activated(c, start - timedelta(seconds=1)) is False
    assert challenge_would_be_in_build_window_if_activated(c, start + timedelta(minutes=20)) is False


def test_phase_open_matches_scheduled_build_window():
    """UI phase `"open"` must agree with `challenge_in_scheduled_build_window` for the same clock."""
    start = datetime(2025, 3, 1, 14, 0, tzinfo=timezone.utc)
    c = _ch(start_time=start, duration_minutes=20)
    samples = [
        start - timedelta(seconds=1),
        start + timedelta(minutes=10),
        start + timedelta(minutes=20),
        start + timedelta(minutes=21),
    ]
    for now in samples:
        win = challenge_in_scheduled_build_window(c, now)
        phase = mission_build_window_phase(c, now)
        assert (phase == "open") == win
