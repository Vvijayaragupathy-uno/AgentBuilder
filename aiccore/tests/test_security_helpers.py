from __future__ import annotations

import unittest
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from aiccore.backend.security import (
    PRACTICE_KIOSK_USERNAME,
    admin_cookie_settings_for_scheme,
    hash_participant_password,
    is_public_user,
    normalize_failed_attempt_state,
    public_profile_password_error,
    register_failed_attempt,
    release_station_assignments,
    safe_upload_filename,
)


@dataclass
class _Station:
    current_session_id: object | None
    status: str


class SecurityHelpersTest(unittest.TestCase):
    def test_admin_cookie_settings_use_cross_site_flags_for_https(self) -> None:
        self.assertEqual(
            admin_cookie_settings_for_scheme("https"),
            {"samesite": "none", "secure": True},
        )
        self.assertEqual(
            admin_cookie_settings_for_scheme("http"),
            {"samesite": "lax", "secure": False},
        )

    def test_safe_upload_filename_strips_directory_traversal(self) -> None:
        self.assertEqual(safe_upload_filename("../../arena.pdf"), "arena.pdf")
        self.assertEqual(safe_upload_filename(r"..\..\brief.png"), "brief.png")
        self.assertEqual(safe_upload_filename(""), "upload.bin")

    def test_is_public_user_excludes_practice_account(self) -> None:
        self.assertFalse(is_public_user(PRACTICE_KIOSK_USERNAME))
        self.assertTrue(is_public_user("builder-01"))

    def test_public_profile_password_error_requires_existing_password(self) -> None:
        self.assertEqual(
            public_profile_password_error(
                username="builder-01",
                supplied_password="1234",
                stored_password=None,
            ),
            "PASSWORD_RESET_REQUIRED",
        )

    def test_public_profile_password_error_validates_missing_and_wrong_passwords(self) -> None:
        stored = hash_participant_password("builder-pin", salt=b"0123456789abcdef", iterations=10_000)
        self.assertEqual(
            public_profile_password_error(
                username="builder-01",
                supplied_password=None,
                stored_password=stored,
            ),
            "PASSWORD_REQUIRED",
        )
        self.assertEqual(
            public_profile_password_error(
                username="builder-01",
                supplied_password="wrong-pin",
                stored_password=stored,
            ),
            "INCORRECT_PASSWORD",
        )
        self.assertIsNone(
            public_profile_password_error(
                username="builder-01",
                supplied_password="builder-pin",
                stored_password=stored,
            )
        )

    def test_release_station_assignments_clears_matching_sessions_only(self) -> None:
        stale_session_id = uuid4()
        other_session_id = uuid4()
        stations = [
            _Station(current_session_id=stale_session_id, status="occupied"),
            _Station(current_session_id=other_session_id, status="maintenance"),
        ]

        changed = release_station_assignments(stations, {stale_session_id})

        self.assertTrue(changed)
        self.assertIsNone(stations[0].current_session_id)
        self.assertEqual(stations[0].status, "available")
        self.assertEqual(stations[1].current_session_id, other_session_id)
        self.assertEqual(stations[1].status, "maintenance")

    def test_normalize_failed_attempt_state_clears_expired_lockout(self) -> None:
        now = datetime.now(timezone.utc)
        normalized = normalize_failed_attempt_state(
            {"attempts": 5, "locked_until": now - timedelta(seconds=1)},
            now=now,
        )

        self.assertEqual(normalized, {"attempts": 0, "locked_until": None})

    def test_register_failed_attempt_restarts_counter_after_lockout_expires(self) -> None:
        now = datetime.now(timezone.utc)
        updated = register_failed_attempt(
            {"attempts": 5, "locked_until": now - timedelta(seconds=1)},
            now=now,
            max_attempts=5,
            lockout_seconds=300,
        )

        self.assertEqual(updated["attempts"], 1)
        self.assertIsNone(updated["locked_until"])


if __name__ == "__main__":
    unittest.main()
