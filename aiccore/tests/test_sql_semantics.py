"""
Pure SQLAlchemy checks — no Langflow imports (runs on CI/Python versions below Langflow's floor).
Guards against subtle ``column != bound_value`` NULL semantics in bulk deletes.
"""

import uuid

from sqlalchemy import Column, MetaData, Table, delete, or_
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.dialects import postgresql


def _pg():
    return postgresql.dialect()


def test_delete_flow_where_folder_neq_none_compiles_to_is_not_null_not_delete_all():
    """Documents the bug fixed in purge_langflow_workspace when starter folder is missing."""
    md = MetaData()
    flow = Table(
        "flow",
        md,
        Column("folder_id", PG_UUID(as_uuid=True), nullable=True),
    )
    starter_id = None
    stmt_wrong = delete(flow).where(flow.c.folder_id != starter_id)
    compiled = str(stmt_wrong.compile(dialect=_pg()))
    assert "IS NOT NULL" in compiled.upper()
    assert "DELETE FROM" in compiled.upper()


def test_purge_pattern_deletes_all_rows_when_no_starter_folder():
    md = MetaData()
    flow = Table(
        "flow",
        md,
        Column("folder_id", PG_UUID(as_uuid=True), nullable=True),
    )
    stmt = delete(flow)
    sql = str(stmt.compile(dialect=_pg()))
    assert "DELETE FROM flow" in sql.replace("\n", " ")


def test_purge_pattern_with_starter_includes_null_folder_rows():
    starter = uuid.uuid4()
    md = MetaData()
    flow = Table(
        "flow",
        md,
        Column("folder_id", PG_UUID(as_uuid=True), nullable=True),
    )
    stmt = delete(flow).where(or_(flow.c.folder_id.is_(None), flow.c.folder_id != starter))
    sql = str(stmt.compile(dialect=_pg()))
    assert "IS NULL" in sql.upper()
