"""Load generator output (Amazon-shaped report files) into the raw schema.

    python load.py [--src output]

Each run replaces the raw tables' contents, so it can be repeated safely.
"""

import argparse
import csv
import gzip
import json
from collections.abc import Iterator
from datetime import date
from pathlib import Path

from psycopg import Connection, sql

from db import apply_schemas, connect, run_sql_file

ADS_TABLES = {
    "spCampaigns": "sp_campaigns",
    "spTargeting": "sp_targeting",
    "spAdvertisedProduct": "sp_advertised_product",
    "sbCampaigns": "sb_campaigns",
    "sbTargeting": "sb_targeting",
    "sdCampaigns": "sd_campaigns",
    "sdTargeting": "sd_targeting",
    "sdAdvertisedProduct": "sd_advertised_product",
}

RAW_TABLES = ["products", "sales_traffic_by_asin", "fba_inventory_snapshot", *ADS_TABLES.values()]

Row = tuple[date | None, str, str]


def products(src: Path) -> Iterator[Row]:
    for record in json.loads((src / "products.json").read_text(encoding="utf-8")):
        yield None, "products.json", json.dumps(record)


def sales_traffic(src: Path) -> Iterator[Row]:
    for path in sorted((src / "sales_traffic").glob("*.json")):
        report = json.loads(path.read_text(encoding="utf-8"))
        day = date.fromisoformat(report["reportSpecification"]["dataStartTime"][:10])
        rel = path.relative_to(src).as_posix()
        for record in report["salesAndTrafficByAsin"]:
            yield day, rel, json.dumps(record)


def fba_inventory(src: Path) -> Iterator[Row]:
    for path in sorted((src / "fba_inventory").glob("*.tsv")):
        day = date.fromisoformat(path.stem)
        rel = path.relative_to(src).as_posix()
        with path.open(encoding="utf-8", newline="") as f:
            for record in csv.DictReader(f, delimiter="\t"):
                yield day, rel, json.dumps(record)


def ads_report(src: Path, report_type: str) -> Iterator[Row]:
    path = src / "ads" / f"{report_type}.json.gz"
    rel = path.relative_to(src).as_posix()
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for record in json.load(f):
            yield date.fromisoformat(record["date"]), rel, json.dumps(record)


def copy_rows(conn: Connection, table: str, rows: Iterator[Row]) -> int:
    n = 0
    with conn.cursor() as cur:
        target = sql.Identifier("raw", table)  # a quoted identifier, never string-formatted SQL
        truncate = sql.SQL("TRUNCATE {}").format(target)
        # Semgrep rule sqlalchemy-execute-raw-query misfires: psycopg sql.Identifier, not SQLAlchemy
        # nosemgrep
        cur.execute(truncate)
        copy_sql = sql.SQL("COPY {} (report_date, source_file, record) FROM STDIN").format(target)
        with cur.copy(copy_sql) as copy:
            for row in rows:
                copy.write_row(row)
                n += 1
    return n


def load(src: Path) -> dict[str, int]:
    """Replace the raw tables with the files in `src`; returns rows loaded per table."""
    apply_schemas()
    sources = {
        "products": products(src),
        "sales_traffic_by_asin": sales_traffic(src),
        "fba_inventory_snapshot": fba_inventory(src),
        **{table: ads_report(src, rt) for rt, table in ADS_TABLES.items()},
    }
    counts = {}
    with connect() as conn:
        run_sql_file(conn, "10_raw.sql")
        for table, rows in sources.items():
            counts[table] = copy_rows(conn, table, rows)
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Load generator output into the raw schema.")
    parser.add_argument("--src", type=Path, default=Path("output"))
    args = parser.parse_args()
    for table, n in load(args.src).items():
        print(f"raw.{table:<24} {n:>8,} rows")


if __name__ == "__main__":
    main()
