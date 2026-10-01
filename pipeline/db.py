"""Database connection and SQL script runner shared by the pipeline steps."""

import os
from pathlib import Path

import psycopg

SQL_DIR = Path(__file__).parent / "sql"


def database_url() -> str:
    """Connection string from DATABASE_URL, defaulting to the local Docker database."""
    return os.environ.get("DATABASE_URL", "postgresql://asad:asad@localhost:5432/asad")


def connect() -> psycopg.Connection:
    return psycopg.connect(database_url())


def run_sql_file(conn: psycopg.Connection, name: str) -> None:
    """Run one script from pipeline/sql inside the caller's transaction."""
    sql = (SQL_DIR / name).read_text(encoding="utf-8")
    with conn.cursor() as cur:
        cur.execute(sql)


def apply_schemas() -> None:
    """Create the raw, staging and marts schemas (idempotent)."""
    with connect() as conn:
        run_sql_file(conn, "00_schemas.sql")


if __name__ == "__main__":
    apply_schemas()
    print("Schemas raw, staging and marts are in place.")
