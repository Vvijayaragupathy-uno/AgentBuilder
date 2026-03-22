import unittest
from dataclasses import dataclass
from uuid import uuid4

from aiccore.backend.security import (
    PRACTICE_KIOSK_USERNAME,
    admin_cookie_settings_for_scheme,
    is_public_user,
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


if __name__ == "__main__":
    unittest.main()
