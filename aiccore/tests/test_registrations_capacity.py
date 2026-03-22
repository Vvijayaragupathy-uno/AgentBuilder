from uuid import uuid4
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from aiccore.backend.models import Base, Challenge, User, ChallengeRegistration
from aiccore.backend.registrations import ensure_requested_challenge_registration

def _test_engine():
    return create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        execution_options={"schema_translate_map": {"aiccore": None}},
    )

def test_ensure_requested_challenge_registration_handles_capacity():
    engine = _test_engine()
    Base.metadata.create_all(engine)
    
    challenge_id = uuid4()
    user_id = uuid4()
    
    with Session(engine) as db:
        # Create user
        db.add(User(id=user_id, username="testuser", nickname="Test User"))
        
        # Create full challenge
        db.add(Challenge(
            id=challenge_id, 
            title="Maxed Challenge", 
            description="Test",
            max_participants=1,
            is_active=False,
            is_registration_open=True
        ))
        
        # Add a registration to fill it up
        other_user = uuid4()
        db.add(User(id=other_user, username="otheruser", nickname="Other User"))
        db.add(ChallengeRegistration(user_id=other_user, challenge_id=challenge_id))
        
        db.commit()
        
    with Session(engine) as db:
        from fastapi import HTTPException
        try:
            ensure_requested_challenge_registration(
                db, 
                user_id=user_id, 
                challenge_id_raw=str(challenge_id)
            )
            assert False, "Should have raised HTTPException for full capacity"
        except HTTPException as e:
            assert e.status_code == 409
            assert "maximum participants reached" in e.detail
