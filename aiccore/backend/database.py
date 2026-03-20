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


def _ensure_schema_migrations():
    """Lightweight ALTERs for existing deployments (create_all does not add columns)."""
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    url = str(engine.url)
    is_pg = "postgresql" in url or url.startswith("postgres")

    def _col_names(table: str, schema: str | None = None):
        try:
            return {c["name"] for c in insp.get_columns(table, schema=schema)}
        except Exception:
            return set()

    if is_pg:
        for stmt in (
            "ALTER TABLE aiccore.participant ALTER COLUMN unlock_code DROP NOT NULL",
            "ALTER TABLE aiccore.submission ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false NOT NULL",
            "ALTER TABLE aiccore.arena_state ADD COLUMN IF NOT EXISTS demo_gate_open BOOLEAN DEFAULT false NOT NULL",
            "ALTER TABLE aiccore.arena_state ADD COLUMN IF NOT EXISTS demo_cursor INTEGER DEFAULT -1 NOT NULL",
            "ALTER TABLE aiccore.arena_state ADD COLUMN IF NOT EXISTS demo_segment_ends_at TIMESTAMPTZ",
        ):
            try:
                with engine.begin() as conn:
                    conn.execute(text(stmt))
            except Exception:
                pass
    else:
        # SQLite (no schema in table names for typical SQLAlchemy sqlite URLs)
        cols = _col_names("submission")
        if cols and "is_approved" not in cols:
            try:
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE submission ADD COLUMN is_approved BOOLEAN DEFAULT 0"))
                    conn.commit()
            except Exception:
                pass
        arena_cols = _col_names("arena_state")
        if arena_cols:
            for col, ddl in (
                ("demo_gate_open", "ALTER TABLE arena_state ADD COLUMN demo_gate_open BOOLEAN DEFAULT 0 NOT NULL"),
                ("demo_cursor", "ALTER TABLE arena_state ADD COLUMN demo_cursor INTEGER DEFAULT -1 NOT NULL"),
                ("demo_segment_ends_at", "ALTER TABLE arena_state ADD COLUMN demo_segment_ends_at TEXT"),
            ):
                if col not in arena_cols:
                    try:
                        with engine.connect() as conn:
                            conn.execute(text(ddl))
                            conn.commit()
                    except Exception:
                        pass
        # Optional: rebuild participant so unlock_code can be NULL (one-time OTP consume).
        _sqlite_migrate_participant_unlock_nullable()


def _sqlite_migrate_participant_unlock_nullable():
    """
    Older SQLite DBs had participant.unlock_code NOT NULL. Consuming OTP sets NULL → insert fails.
    Rebuilds `participant` with nullable unlock_code when PRAGMA says unlock_code is NOT NULL.
    Safe to run repeatedly: no-op once unlock_code is already nullable.
    """
    url = str(engine.url)
    if not url.startswith("sqlite"):
        return
    with engine.connect() as conn:
        try:
            rows = conn.execute(text("PRAGMA table_info(participant)")).fetchall()
        except Exception:
            return
        if not rows:
            return
        unlock = next((r for r in rows if r[1] == "unlock_code"), None)
        if not unlock or unlock[3] == 0:
            return  # 0 = nullable
        print("🔧 AICCORE SQLite: migrating participant.unlock_code to nullable (one-time OTP)...")
        conn.execute(text("BEGIN"))
        try:
            conn.execute(
                text("""
                CREATE TABLE participant__aiccore_new (
                    id TEXT NOT NULL PRIMARY KEY,
                    username TEXT NOT NULL UNIQUE,
                    nickname TEXT NOT NULL,
                    password TEXT,
                    unlock_code TEXT UNIQUE,
                    unlock_code_generated_at TEXT,
                    honors TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """)
            )
            conn.execute(
                text("""
                INSERT INTO participant__aiccore_new
                    (id, username, nickname, password, unlock_code, unlock_code_generated_at, honors, created_at)
                SELECT id, username, nickname, password, unlock_code, unlock_code_generated_at, honors, created_at
                FROM participant
                """)
            )
            conn.execute(text("DROP TABLE participant"))
            conn.execute(text("ALTER TABLE participant__aiccore_new RENAME TO participant"))
            conn.commit()
            print("✅ AICCORE SQLite: participant.unlock_code is now nullable.")
        except Exception as e:
            conn.rollback()
            print(f"⚠️ AICCORE SQLite participant migration skipped: {e}")


def _seed_arena_state():
    from sqlalchemy.orm import Session
    from .models import ArenaState

    with Session(engine) as s:
        if s.get(ArenaState, 1) is None:
            s.add(ArenaState(id=1, arena_locked=False))
            s.commit()


def init_db():
    from .models import Base, Challenge, Participant
    _create_schema_if_needed()        # ensure aiccore schema exists before create_all
    Base.metadata.create_all(engine)
    _ensure_schema_migrations()
    _seed_arena_state()

    # No seed data — challenges are created by admins via the Settings panel.
    # Stations self-register by calling POST /api/v1/aiccore/stations/register.

def get_session():
    with Session(engine) as session:
        yield session
