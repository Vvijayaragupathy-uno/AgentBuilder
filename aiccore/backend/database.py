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
    Nuclear Reset with Race-Condition Protection.
    
    Why: Multi-worker uvicorn (e.g. workers=5) triggers this concurrently.
    We use a 'deployment_lock' table in the 'aiccore' schema as a sentinel.
    If the table exists, we assume cleanup already happened and skip it.
    """
    if not DATABASE_URL.startswith(("postgresql", "postgres")):
        return

    with engine.connect() as conn:
        # 1. Force Reset if requested (fixes stale constraints/indexes)
        if os.getenv("AICCORE_RESET_DB") == "true":
            print("☢️  AICCORE Force Reset: Dropping 'aiccore' schema...")
            conn.execute(text("DROP SCHEMA IF EXISTS aiccore CASCADE"))
            conn.commit()

        # 2. Ensure aiccore schema exists
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS aiccore"))
        conn.commit()

        # 2. Check if we already cleaned up this deployment
        # We look for a sentinel table in our isolated schema
        result = conn.execute(text(
            "SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname = 'aiccore' AND tablename = 'deployment_lock'"
        ))
        if result.first():
            print("🚀 AICCORE: Cleanup already performed, skipping nuclear reset.")
            return

        # 3. Discover all tables in the 'public' schema
        result = conn.execute(text(
            "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'"
        ))
        public_tables = [row[0] for row in result]

        if public_tables:
            print(f"☢️  AICCORE Nuclear Reset: Found {len(public_tables)} tables in public. Resetting...")
            for table in public_tables:
                try:
                    # Use a separate transaction for each drop to handle 'current transaction is aborted' errors
                    conn.execute(text(f"DROP TABLE public.\"{table}\" CASCADE"))
                    conn.commit()
                    print(f"  🧹 Dropped public.{table}")
                except Exception as e:
                    # Rollback if it failed so the NEXT drop can proceed
                    conn.rollback()
                    print(f"  ⚠️ Skipping public.{table} (maybe already dropped?): {e}")

        # 4. Create the sentinel so other workers skip this next time
        conn.execute(text("CREATE TABLE aiccore.deployment_lock (id SERIAL PRIMARY KEY, cleaned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"))
        conn.commit()
        print("✅ AICCORE: Public schema cleanup complete. Lock created.")


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
