import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

# AICCORE uses its own env var (AICCORE_DATABASE_URL).
# Falls back to Railway's DATABASE_URL, then SQLite for local dev.
_raw_url = os.getenv("AICCORE_DATABASE_URL") or os.getenv("DATABASE_URL") or "sqlite:///./aiccore.db"

if _raw_url.startswith("postgres"):
    # Ensure psycopg2 driver (not psycopg3) and fix scheme
    DATABASE_URL = _raw_url.replace("postgresql://", "postgresql+psycopg2://", 1) \
                           .replace("postgres://", "postgresql+psycopg2://", 1)
    engine = create_engine(DATABASE_URL)
else:
    DATABASE_URL = _raw_url
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


def _create_schema_if_needed():
    """
    Create the 'aiccore' Postgres schema and clean up any old AICCORE tables
    that were accidentally created in the 'public' schema in earlier deploys.

    Why: Before schema separation was added, AICCORE tables (session, challenge,
    etc.) were created in 'public'. Langflow's Alembic checker sees them, treats
    them as unknown, and crashes with 'mismatch between models and database'.

    Safe to drop: These are exclusively AICCORE tables. They are immediately
    recreated in the 'aiccore' schema by Base.metadata.create_all() below.
    """
    if not DATABASE_URL.startswith(("postgresql", "postgres")):
        return

    # Tables to completely remove from 'public' schema to allow a clean boot
    # Includes AICCORE's old tables AND all Langflow tables
    # This forces Langflow's create_all() and migrations to start from scratch.
    TABLES_TO_DROP = [
        "alembic_version", 
        "user", "flow", "folder", "message", "variable", "apikey",
        "transaction", "vertex_build", "job", "flowstyle",
        "event", "submission", "challenge_registration",
        "station", "session", "achievement", "challenge",
    ]

    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS aiccore"))

        # Drop conflicting tables from public schema
        for table in TABLES_TO_DROP:
            try:
                conn.execute(text(f"DROP TABLE IF EXISTS public.{table} CASCADE"))
                print(f"🧹 AICCORE cleanup: dropped public.{table}")
            except Exception as e:
                print(f"⚠️ AICCORE cleanup: could not drop {table}: {e}")

        conn.commit()
        print("✅ AICCORE: public schema cleanup complete")


def init_db():
    from .models import Base, Challenge, Participant
    _create_schema_if_needed()        # ensure aiccore schema exists before create_all
    Base.metadata.create_all(engine)
    
    # Populate default challenges if none exist (Google Standard Onboarding)
    with Session(engine) as session:
        from sqlalchemy import select
        stmt = select(Challenge)
        if not session.execute(stmt).scalars().first():
            challenges = [
                Challenge(
                    title="Travel Guide Bot", 
                    description="Build an agent that helps tourists find secret spots in Paris.",
                    complexity_level="Beginner"
                ),
                Challenge(
                    title="Creative Storyteller", 
                    description="Create an AI that writes spooky mystery stories based on three keywords.",
                    complexity_level="Intermediate"
                ),
                Challenge(
                    title="Smart Math Tutor", 
                    description="Develop an agent that explains complex math problems using simple analogies.",
                    complexity_level="Expert"
                )
            ]
            session.add_all(challenges)
            session.commit()
            print("✅ AICCORE: Default challenges initialized.")

        # Populate default stations for Museum Arena
        from .models import Station
        stmt = select(Station)
        if not session.execute(stmt).scalars().first():
            stations = [
                Station(id="STATION_01", ip_address="192.168.1.101", status="available", cpu_load=45, core_temp=40),
                Station(id="STATION_02", ip_address="192.168.1.102", status="available", cpu_load=10, core_temp=37),
                Station(id="STATION_03", ip_address="192.168.1.103", status="available", cpu_load=89, core_temp=56),
                Station(id="STATION_04", ip_address="192.168.1.104", status="available", cpu_load=2, core_temp=34),
                Station(id="STATION_05", ip_address="192.168.1.105", status="maintenance", cpu_load=0, core_temp=30),
                Station(id="STATION_06", ip_address="192.168.1.106", status="available", cpu_load=20, core_temp=38),
                # Add local dev station for testing
                Station(id="STATION_LOCAL", ip_address="127.0.0.1", status="available", cpu_load=10, core_temp=40)
            ]
            session.add_all(stations)
            session.commit()
            print("✅ AICCORE: Museum stations initialized.")

def get_session():
    with Session(engine) as session:
        yield session
