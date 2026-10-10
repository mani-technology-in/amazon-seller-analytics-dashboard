"""Export the mart tables as compact JSON files for the static dashboard.

    python export.py [--out ../web/public/data]

Fact files are column-oriented: one array per field, all the same length. Amazon IDs are strings,
because JavaScript numbers can't hold every 64-bit integer. Money has 2 decimals.

The v1.0 dashboard reads US data only, so the v1.0 files stay US-only (in USD) until the pages
that show every marketplace replace them (CR-1). marketplaces.json and fx_monthly.json are new.
"""

import argparse
import json
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path

from db import connect

SCHEMA_VERSION = 1
DEFAULT_OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "data"

# file name -> query; column order in the file follows the query
FILES = {
    "products.json": """
        SELECT asin, sku, title, category, price, launch_date
        FROM marts.dim_product ORDER BY asin""",
    "campaigns.json": """
        SELECT campaign_id::text AS campaign_id, campaign_name, ad_product, ad_product_name,
               campaign_status, budget
        FROM marts.dim_campaign WHERE marketplace = 'US' ORDER BY ad_product, campaign_name""",
    "targets.json": """
        SELECT campaign_id::text AS campaign_id, target_id::text AS target_id, ad_product,
               target_text, match_type
        FROM marts.dim_target WHERE marketplace = 'US' ORDER BY campaign_id, target_id""",
    "sales_daily.json": """
        SELECT date, asin, units, orders, sales, sessions, page_views
        FROM marts.fct_sales_daily WHERE marketplace = 'US' ORDER BY date, asin""",
    "ads_campaign_daily.json": """
        SELECT date, campaign_id::text AS campaign_id, impressions, clicks, cost, orders, sales,
               units
        FROM marts.fct_ads_campaign_daily WHERE marketplace = 'US' ORDER BY date, campaign_id""",
    "ads_product_daily.json": """
        SELECT date, asin, impressions, clicks, cost, orders, sales
        FROM marts.fct_ads_product_daily WHERE marketplace = 'US' ORDER BY date, asin""",
    "inventory_daily.json": """
        SELECT date, asin, available, reserved, inbound
        FROM marts.fct_inventory_daily WHERE network = 'US' ORDER BY date, asin""",
    "ads_target_daily.json": """
        SELECT date, campaign_id::text AS campaign_id, target_id::text AS target_id,
               impressions, clicks, cost, orders, sales
        FROM marts.fct_ads_target_daily
        WHERE impressions > 0 AND marketplace = 'US'
        ORDER BY date, campaign_id, target_id""",
    "marketplaces.json": """
        SELECT marketplace, marketplace_id, name, currency, network, has_ads
        FROM marts.dim_marketplace ORDER BY marketplace_id = 'ATVPDKIKX0DER' DESC, name""",
    "fx_monthly.json": """
        SELECT year_month, currency, usd_rate
        FROM marts.dim_fx_monthly WHERE currency <> 'USD' ORDER BY year_month, currency""",
}

# Small lookup files are written as lists of objects; facts as one array per column.
ROW_FILES = {"products.json", "campaigns.json", "targets.json", "marketplaces.json"}


def _value(v):
    if isinstance(v, Decimal):
        return float(v)  # numeric columns already carry their scale (money 2, FX rates 6)
    if isinstance(v, date):
        return v.isoformat()
    return v


def _write(path: Path, payload) -> None:
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")


def export(out: Path = DEFAULT_OUT) -> dict[str, int]:
    """Write every file plus manifest.json into `out`; returns rows per file."""
    out.mkdir(parents=True, exist_ok=True)
    counts = {}
    with connect() as conn, conn.cursor() as cur:
        for name, query in FILES.items():
            cur.execute(query)
            columns = [c.name for c in cur.description]
            rows = cur.fetchall()
            if name in ROW_FILES:
                payload = [dict(zip(columns, map(_value, r), strict=True)) for r in rows]
            else:
                payload = {c: [_value(r[i]) for r in rows] for i, c in enumerate(columns)}
            _write(out / name, payload)
            counts[name] = len(rows)

        cur.execute("SELECT min(date), max(date) FROM marts.dim_date")
        start, end = cur.fetchone()

    _write(
        out / "manifest.json",
        {
            "schemaVersion": SCHEMA_VERSION,
            "synthetic": True,
            "brand": "Demo Brand",
            "marketplace": "US",
            "currency": "USD",
            "dataStart": start.isoformat(),
            "dataEnd": end.isoformat(),
            "generatedAt": datetime.now(UTC).replace(microsecond=0).isoformat(),
            "files": {name: {"rows": n} for name, n in counts.items()},
        },
    )
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Export marts as JSON for the dashboard.")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    for name, n in export(args.out).items():
        print(f"{name:<26} {n:>8,} rows")
    print(f"Written to {args.out}")


if __name__ == "__main__":
    main()
