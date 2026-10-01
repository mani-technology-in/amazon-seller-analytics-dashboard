"""The database layers exist and setting them up can be repeated safely."""

from db import apply_schemas, connect


def test_schemas_created_and_idempotent() -> None:
    apply_schemas()
    apply_schemas()  # running twice must not fail

    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT schema_name FROM information_schema.schemata "
            "WHERE schema_name IN ('raw', 'staging', 'marts') ORDER BY schema_name"
        )
        found = [row[0] for row in cur.fetchall()]

    assert found == ["marts", "raw", "staging"]
