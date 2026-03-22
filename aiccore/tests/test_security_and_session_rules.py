import os
import unittest

# Deterministic secret so HMAC round-trips are stable in tests.
os.environ.setdefault("AICCORE_AUTH_SECRET", "test-secret-for-unit-tests")

from aiccore.backend.security import (
    admin_cookie_max_age_seconds,
    hash_participant_password,
    issue_admin_cookie_value,
    is_valid_admin_cookie,
    participant_password_needs_upgrade,
    verify_participant_password,
)
from aiccore.backend.session_rules import can_join_demo_queue, can_submit_session


class SecurityHelpersTest(unittest.TestCase):
    def test_admin_cookie_round_trip(self):
        cookie = issue_admin_cookie_value(issued_at=1_000)
        ttl = admin_cookie_max_age_seconds()

        self.assertTrue(is_valid_admin_cookie(cookie, now=1_000 + ttl - 1))

    def test_admin_cookie_rejects_tampering(self):
        cookie = issue_admin_cookie_value(issued_at=1_000)
        tampered = cookie[:-1] + ("0" if cookie[-1] != "0" else "1")

        self.assertFalse(is_valid_admin_cookie(tampered, now=1_100))

    def test_admin_cookie_rejects_expired_value(self):
        cookie = issue_admin_cookie_value(issued_at=1_000)
        ttl = admin_cookie_max_age_seconds()

        self.assertFalse(is_valid_admin_cookie(cookie, now=1_000 + ttl + 1))

    def test_password_hash_round_trip(self):
        stored = hash_participant_password("builder-pin", salt=b"0123456789abcdef", iterations=10_000)

        self.assertTrue(verify_participant_password("builder-pin", stored))
        self.assertFalse(verify_participant_password("wrong-pin", stored))
        self.assertFalse(participant_password_needs_upgrade(stored))

    def test_legacy_plaintext_password_is_supported_for_upgrade(self):
        self.assertTrue(verify_participant_password("1234", "1234"))
        self.assertFalse(verify_participant_password("9999", "1234"))
        self.assertTrue(participant_password_needs_upgrade("1234"))


class SessionRulesTest(unittest.TestCase):
    def test_can_submit_requires_active_unsubmitted_session(self):
        self.assertTrue(can_submit_session(is_active=True, is_submitted=False))
        self.assertFalse(can_submit_session(is_active=False, is_submitted=False))
        self.assertFalse(can_submit_session(is_active=True, is_submitted=True))

    def test_can_join_demo_queue_requires_active_submitted_session(self):
        self.assertTrue(can_join_demo_queue(is_active=True, is_submitted=True))
        self.assertFalse(can_join_demo_queue(is_active=False, is_submitted=True))
        self.assertFalse(can_join_demo_queue(is_active=True, is_submitted=False))


if __name__ == "__main__":
    unittest.main()
