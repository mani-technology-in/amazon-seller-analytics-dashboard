"""Build the staging views and mart tables from the raw schema.

python models.py
"""

from db import connect, run_sql_file

SCRIPTS = ["20_staging.sql", "30_marts.sql"]

MART_TABLES = [
    "dim_date",
    "dim_product",
    "dim_campaign",
    "dim_target",
    "fct_sales_daily",
    "fct_ads_campaign_daily",
    "fct_ads_target_daily",
    "fct_ads_product_daily",
    "fct_inventory_daily",
]


def build() -> dict[str, int]:
    """Run the staging and marts scripts in one transaction; returns rows per mart table."""
    with connect() as conn:
        for script in SCRIPTS:
            run_sql_file(conn, script)
        with conn.cursor() as cur:
            counts = {}
            for table in MART_TABLES:
                cur.execute(f"SELECT count(*) FROM marts.{table}")
                counts[table] = cur.fetchone()[0]
    return counts


def main() -> None:
    for table, n in build().items():
        print(f"marts.{table:<24} {n:>8,} rows")


if __name__ == "__main__":
    main()
