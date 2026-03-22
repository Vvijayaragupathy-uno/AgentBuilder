import hashlib
import hmac
import os
import secrets
import time
from pathlib import PurePath
from typing import Any, Iterable, Optional
from uuid import UUID


DEFAULT_AUTH_TTL_SECONDS = 86400
PARTICIPANT_PASSWORD_SCHEME = "pbkdf2_sha256"
PARTICIPANT_PASSWORD_ITERATIONS = 600_000
PARTICIPANT_PASSWORD_SALT_BYTES = 16
PRACTICE_KIOSK_USERNAME = "__aiccore_practice_kiosk__"
_RUNTIME_FALLBACK_SECRET = secrets.token_hex(32)


def _auth_secret() -> str:
    for name in (
        "AICCORE_AUTH_SECRET",
        "AICCORE_COOKIE_SECRET",
        "AICCORE_ADMIN_PASS",
        "LANGFLOW_SECRET_KEY",
        "SECRET_KEY",
    ):
        value = (os.getenv(name) or "").strip()
        if value:
            return value
    return _RUNTIME_FALLBACK_SECRET


def _token_ttl_seconds(name: str, default: int = DEFAULT_AUTH_TTL_SECONDS) -> int:
    raw = os.getenv(name, str(default))
    try:
        value = int(raw)
        return max(60, min(value, 7 * 24 * 3600))
    except ValueError:
        return default


def _subject_text(subject: UUID | str) -> str:
    return str(subject)


def _sign_token(purpose: str, subject: str, issued_at: int) -> str:
    payload = f"{purpose}:{subject}:{issued_at}".encode("utf-8")
    return hmac.new(_auth_secret().encode("utf-8"), payload, hashlib.sha256).hexdigest()


def issue_signed_token(
    purpose: str,
    subject: UUID | str,
    *,
    issued_at: Optional[int] = None,
) -> str:
    ts = int(time.time() if issued_at is None else issued_at)
    subject_text = _subject_text(subject)
    return f"{ts}.{_sign_token(purpose, subject_text, ts)}"


def verify_signed_token(
    purpose: str,
    subject: UUID | str,
    token: Optional[str],
    *,
    max_age_seconds: int = DEFAULT_AUTH_TTL_SECONDS,
    now: Optional[int] = None,
) -> bool:
    if not token:
        return False
    try:
        issued_raw, signature = token.strip().split(".", 1)
        issued_at = int(issued_raw)
    except (AttributeError, TypeError, ValueError):
        return False

    current = int(time.time() if now is None else now)
    age = current - issued_at
    if age < 0 or age > max_age_seconds:
        return False

    subject_text = _subject_text(subject)
    expected = _sign_token(purpose, subject_text, issued_at)
    return hmac.compare_digest(signature, expected)


def admin_cookie_max_age_seconds() -> int:
    return _token_ttl_seconds("AICCORE_ADMIN_COOKIE_TTL_SECONDS")


def issue_admin_cookie_value(*, issued_at: Optional[int] = None) -> str:
    return issue_signed_token("admin", "admin", issued_at=issued_at)


def is_valid_admin_cookie(value: Optional[str], *, now: Optional[int] = None) -> bool:
    return verify_signed_token(
        "admin",
        "admin",
        value,
        max_age_seconds=admin_cookie_max_age_seconds(),
        now=now,
    )


def session_token_max_age_seconds() -> int:
    return _token_ttl_seconds("AICCORE_SESSION_TOKEN_TTL_SECONDS")


def issue_session_token(session_id: UUID | str, *, issued_at: Optional[int] = None) -> str:
    return issue_signed_token("session", session_id, issued_at=issued_at)


def is_valid_session_token(
    session_id: UUID | str,
    token: Optional[str],
    *,
    now: Optional[int] = None,
) -> bool:
    return verify_signed_token(
        "session",
        session_id,
        token,
        max_age_seconds=session_token_max_age_seconds(),
        now=now,
    )


def admin_cookie_settings_for_scheme(scheme: str | None) -> dict[str, Any]:
    if (scheme or "").strip().lower() == "https":
        return {"samesite": "none", "secure": True}
    return {"samesite": "lax", "secure": False}


def safe_upload_filename(filename: str | None, *, fallback: str = "upload.bin") -> str:
    raw = (filename or "").strip().replace("\\", "/")
    name = PurePath(raw).name.strip()
    if not name or name in {".", ".."}:
        return fallback
    return name


def is_public_user(username: str | None) -> bool:
    return (username or "").strip() != PRACTICE_KIOSK_USERNAME


def release_station_assignments(stations: Iterable[Any], session_ids: set[Any]) -> bool:
    changed = False
    for station in stations:
        if getattr(station, "current_session_id", None) not in session_ids:
            continue
        station.current_session_id = None
        if getattr(station, "status", None) == "occupied":
            station.status = "available"
        changed = True
    return changed


def _b64url_encode(raw: bytes) -> str:
    from base64 import urlsafe_b64encode

    return urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(raw: str) -> bytes:
    from base64 import urlsafe_b64decode

    return urlsafe_b64decode(raw + ("=" * (-len(raw) % 4)))


def hash_participant_password(
    password: str,
    *,
    salt: bytes | None = None,
    iterations: int = PARTICIPANT_PASSWORD_ITERATIONS,
) -> str:
    if not password:
        raise ValueError("password required")

    salt_bytes = salt or secrets.token_bytes(PARTICIPANT_PASSWORD_SALT_BYTES)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt_bytes,
        int(iterations),
    )
    return (
        f"{PARTICIPANT_PASSWORD_SCHEME}"
        f"${int(iterations)}"
        f"${_b64url_encode(salt_bytes)}"
        f"${_b64url_encode(digest)}"
    )


def verify_participant_password(password: str, stored_password: Optional[str]) -> bool:
    if not stored_password or not password:
        return False

    if not stored_password.startswith(f"{PARTICIPANT_PASSWORD_SCHEME}$"):
        return hmac.compare_digest(stored_password, password)

    try:
        scheme, iterations_raw, salt_raw, digest_raw = stored_password.split("$", 3)
        if scheme != PARTICIPANT_PASSWORD_SCHEME:
            return False
        iterations = int(iterations_raw)
        salt = _b64url_decode(salt_raw)
        expected = _b64url_decode(digest_raw)
    except (TypeError, ValueError):
        return False

    actual = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations,
    )
    return hmac.compare_digest(actual, expected)


def participant_password_needs_upgrade(stored_password: Optional[str]) -> bool:
    if not stored_password:
        return False
    return not stored_password.startswith(f"{PARTICIPANT_PASSWORD_SCHEME}$")
