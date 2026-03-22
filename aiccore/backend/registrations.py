from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Challenge, ChallengeRegistration


def ensure_requested_challenge_registration(
    db_session: Session,
    *,
    user_id: UUID,
    challenge_id_raw: Optional[str],
) -> tuple[Optional[UUID], bool]:
    """
    Create a challenge registration when the caller explicitly requested one.

    Returns `(challenge_id, created)` when a challenge was requested, or `(None, False)` when
    the caller did not ask for registration at all.
    """
    if challenge_id_raw is None or not str(challenge_id_raw).strip():
        return None, False

    try:
        challenge_id = UUID(str(challenge_id_raw).strip())
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid challenge_id") from exc

    stmt = select(Challenge).where(Challenge.id == challenge_id)
    if getattr(db_session.bind, "dialect", None) and db_session.bind.dialect.name == "postgresql":
        stmt = stmt.with_for_update()
    challenge = db_session.execute(stmt).scalars().first()
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")
    if challenge.is_active or challenge.is_finalized or not challenge.is_registration_open:
        raise HTTPException(status_code=403, detail="Registration is closed for this challenge")

    existing = (
        db_session.execute(
            select(ChallengeRegistration).where(
                ChallengeRegistration.user_id == user_id,
                ChallengeRegistration.challenge_id == challenge_id,
            )
        )
        .scalars()
        .first()
    )
    if existing:
        return challenge_id, False

    cap = challenge.max_participants
    if cap is not None and cap <= 0:
        raise HTTPException(
            status_code=403,
            detail="Registration is closed for this challenge",
        )
    if cap is not None and cap > 0:
        current_count = (
            db_session.execute(
                select(func.count(ChallengeRegistration.id)).where(
                    ChallengeRegistration.challenge_id == challenge_id
                )
            ).scalar()
            or 0
        )
        if current_count >= cap:
            raise HTTPException(
                status_code=409,
                detail="Challenge is full - maximum participants reached",
            )

    db_session.add(ChallengeRegistration(user_id=user_id, challenge_id=challenge_id))
    db_session.flush()
    return challenge_id, True
