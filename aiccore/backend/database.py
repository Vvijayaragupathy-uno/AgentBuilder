from __future__ import annotations

import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

# AICCORE uses its own env var (AICCORE_DATABASE_URL).
# Falls back to Railway's DATABASE_URL, then SQLite for local dev.
# Production: one Postgres URL for both stacks (schema `aiccore` vs `public`); see aiccore/README.md.
_aiccore_explicit = os.getenv("AICCORE_DATABASE_URL")
_raw_url = _aiccore_explicit or os.getenv("DATABASE_URL") or "sqlite:///./aiccore.db"

if _raw_url.startswith("postgres"):
    # Ensure psycopg2 driver (not psycopg3) and fix scheme
    DATABASE_URL = _raw_url.replace("postgresql://", "postgresql+psycopg2://", 1) \
                           .replace("postgres://", "postgresql+psycopg2://", 1)

    def _pool_int(name: str, default: int) -> int:
        try:
            return int(os.getenv(name, str(default)))
        except ValueError:
            return default

    _pool_size = _pool_int("AICCORE_DB_POOL_SIZE", 12)
    _max_overflow = _pool_int("AICCORE_DB_MAX_OVERFLOW", 24)
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=max(2, min(_pool_size, 50)),
        max_overflow=max(0, min(_max_overflow, 100)),
    )
else:
    # SQLite has no real schemas; `CREATE TABLE aiccore.participant` is parsed as database
    # "aiccore" + table "participant" → OperationalError: unknown database aiccore.
    # Map ORM schema "aiccore" to None so DDL uses unqualified names in the single .db file.
    DATABASE_URL = _raw_url
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        execution_options={"schema_translate_map": {"aiccore": None}},
    )


def _create_schema_if_needed():
    """
    Ensure `aiccore` schema exists and a one-time deployment sentinel for multi-worker startups.

    **Public schema wipe is opt-in** (`AICCORE_NUCLEAR_RESET_PUBLIC=true`). Without it, we never
    DROP tables in `public`, so Langflow can safely share the same Postgres host when it uses
    `public` and AICCORE uses schema `aiccore`. Optional: set `AICCORE_DATABASE_URL` to the same URL explicitly.

    When `AICCORE_NUCLEAR_RESET_PUBLIC` is set, we also drop schema `aiccore` (same as
    `AICCORE_RESET_DB=true`). Otherwise Langflow is wiped while participants/sessions in `aiccore`
    survive — a common source of confusion.
    """
    if not DATABASE_URL.startswith(("postgresql", "postgres")):
        return

    if _aiccore_explicit is None and os.getenv("DATABASE_URL"):
        print(
            "ℹ️  AICCORE: Using DATABASE_URL (AICCORE_DATABASE_URL unset). "
            "Single Postgres is OK: Langflow → `public`, AICCORE → `aiccore`. "
            "Optionally set AICCORE_DATABASE_URL to the same URL. See aiccore/README.md."
        )

    # 0. Check Environment Variables (Case-Insensitive)
    do_nuclear_reset = str(os.getenv("AICCORE_NUCLEAR_RESET_PUBLIC", "false")).lower() == "true"
    do_aiccore_reset = str(os.getenv("AICCORE_RESET_DB", "false")).lower() == "true"
    if do_nuclear_reset:
        # Single-DB "nuclear" must clear both stacks; arena data is not in `public`.
        do_aiccore_reset = True

    if do_aiccore_reset or do_nuclear_reset:
        print(
            f"🔧 AICCORE Reset Debug: AICCORE_RESET_DB={do_aiccore_reset}, "
            f"AICCORE_NUCLEAR_RESET_PUBLIC={do_nuclear_reset}"
        )

    with engine.connect() as conn:
        # 1. Force Reset if requested (fixes stale constraints/indexes)
        if do_aiccore_reset:
            print("☢️  AICCORE Force Reset: Dropping 'aiccore' schema...")
            conn.execute(text("DROP SCHEMA IF EXISTS aiccore CASCADE"))
            conn.commit()
            print("  ✨ 'aiccore' schema dropped and committed.")

        # 2. Ensure aiccore schema exists
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS aiccore"))
        conn.commit()

        # 3. Optional: legacy one-time wipe of public.* (DANGEROUS if Langflow lives in public)
        if do_nuclear_reset:
            print("☢️  AICCORE: AICCORE_NUCLEAR_RESET_PUBLIC — dropping and recreating public schema...")
            # Dropping everything in public (tables, types, sequences) ensures a clean slate.
            conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
            conn.execute(text("CREATE SCHEMA public"))
            # Standard Postgres permissions for public
            conn.execute(text("GRANT ALL ON SCHEMA public TO public"))
            try:
                # Grant to current user if possible (some environments need this explicitly)
                conn.execute(text("GRANT ALL ON SCHEMA public TO CURRENT_USER"))
            except Exception:
                pass
            conn.commit()
            print("  ✨ Public schema is now fresh.")

            # Langflow runs `alembic upgrade head` on boot; `alembic check` compares autogenerate
            # to SQLModel metadata. This repo's Langflow fork may omit ORM models that migrations
            # still create — skip that check after a full public wipe (see DatabaseService).
            os.environ["LANGFLOW_SKIP_AUTOGENERATE_CHECK"] = "true"
            print("  🔧 Auto-enabled LANGFLOW_SKIP_AUTOGENERATE_CHECK for this boot.")
            print(
                "  ⚠️  Turn off AICCORE_NUCLEAR_RESET_PUBLIC after this deploy — "
                "it wipes `public` and `aiccore` on every boot."
            )
        else:
            print(
                "🚀 AICCORE: Skipping public schema DROP (default). "
                "Set AICCORE_NUCLEAR_RESET_PUBLIC=true only for legacy single-DB cleanup."
            )

        # 4. Sentinel: if present, skip first-boot work (multi-worker safe)
        result = conn.execute(text(
            "SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname = 'aiccore' AND tablename = 'deployment_lock'"
        ))
        if result.first():
            print(
                "🚀 AICCORE: deployment_lock present — skipping duplicate sentinel creation "
                "(multi-worker safe)."
            )
            return

        conn.execute(text(
            "CREATE TABLE aiccore.deployment_lock (id SERIAL PRIMARY KEY, cleaned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
        ))
        conn.commit()
        print("✅ AICCORE: deployment_lock created (first boot).")


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
            "ALTER TABLE aiccore.challenge ADD COLUMN IF NOT EXISTS instructions_text TEXT",
            "ALTER TABLE aiccore.challenge ADD COLUMN IF NOT EXISTS instructions_document_url VARCHAR",
            "ALTER TABLE aiccore.session ADD COLUMN IF NOT EXISTS langflow_workspace_folder_id UUID",
            "ALTER TABLE aiccore.session ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ",
            "UPDATE aiccore.session SET last_seen_at = COALESCE(last_seen_at, start_time) WHERE last_seen_at IS NULL",
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
        ch_cols = _col_names("challenge")
        if ch_cols:
            for col, ddl in (
                ("instructions_text", "ALTER TABLE challenge ADD COLUMN instructions_text TEXT"),
                (
                    "instructions_document_url",
                    "ALTER TABLE challenge ADD COLUMN instructions_document_url VARCHAR",
                ),
            ):
                if col not in ch_cols:
                    try:
                        with engine.connect() as conn:
                            conn.execute(text(ddl))
                            conn.commit()
                    except Exception:
                        pass
        sess_cols = _col_names("session")
        if sess_cols and "langflow_workspace_folder_id" not in sess_cols:
            try:
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE session ADD COLUMN langflow_workspace_folder_id TEXT"))
                    conn.commit()
            except Exception:
                pass
        if sess_cols and "last_seen_at" not in sess_cols:
            try:
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE session ADD COLUMN last_seen_at TEXT"))
                    conn.execute(text("UPDATE session SET last_seen_at = COALESCE(last_seen_at, start_time)"))
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
