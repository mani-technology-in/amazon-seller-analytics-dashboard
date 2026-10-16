"""Export the mart tables as compact JSON files for the static dashboard.

    python export.py [--out ../web/public/data]

Fact files are column-oriented: one array per field, all the same length. Amazon IDs are strings,
because JavaScript numbers can't hold every 64-bit integer. Money has 2 decimals.

Lookup files cover every marketplace; fact files are split into one file per marketplace
(mkt/<code>/) or fulfilment network (net/<code>/), so a page downloads only what it shows.
Fact files keep their marketplace (or network) column and money in the marketplace's own
currency; the dashboard converts to USD itself (web/src/metrics/currency.ts).
"""

import argparse
import json
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path

from db import connect

SCHEMA_VERSION = 3  # 3: fact files split per marketplace (mkt/<code>/) and network (net/<code>/)
DEFAULT_OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "data"

# Shared files: file name -> query; column order in the file follows the query.
FILES = {
    "products.json": """
        SELECT asin, sku, title, category, price, launch_date
        FROM marts.dim_product ORDER BY asin""",
    "campaigns.json": """
        SELECT campaign_id::text AS campaign_id, marketplace, campaign_name, ad_product,
               ad_product_name, campaign_status, budget
        FROM marts.dim_campaign ORDER BY marketplace, ad_product, campaign_name""",
    "targets.json": """
        SELECT campaign_id::text AS campaign_id, marketplace, target_id::text AS target_id,
               ad_product, target_text, match_type
        FROM marts.dim_target ORDER BY campaign_id, target_id""",
    "marketplaces.json": """
        SELECT marketplace, marketplace_id, name, currency, network, has_ads
        FROM marts.dim_marketplace ORDER BY marketplace_id = 'ATVPDKIKX0DER' DESC, name""",
    "fx_monthly.json": """
        SELECT year_month, currency, usd_rate
        FROM marts.dim_fx_monthly WHERE currency <> 'USD' ORDER BY year_month, currency""",
    # Daily totals per marketplace (sales and every ad type), for the Overview's tiles and
    # charts without downloading every product's rows.
    "overview_daily.json": """
        WITH s AS (
            SELECT date, marketplace, sum(sales) AS sales, sum(orders)::int AS orders,
                   sum(units)::int AS units, sum(sessions)::int AS sessions
            FROM marts.fct_sales_daily GROUP BY 1, 2
        ), a AS (
            SELECT date, marketplace, sum(cost) AS ad_spend, sum(sales) AS ad_sales
            FROM marts.fct_ads_campaign_daily GROUP BY 1, 2
        )
        SELECT date, marketplace, coalesce(s.sales, 0) AS sales, coalesce(s.orders, 0) AS orders,
               coalesce(s.units, 0) AS units, coalesce(s.sessions, 0) AS sessions,
               coalesce(a.ad_spend, 0) AS ad_spend,
               coalesce(a.ad_sales, 0) AS ad_sales
        FROM s FULL JOIN a USING (date, marketplace)
        ORDER BY date, marketplace""",
    # The Inventory page's first tiles: each network's stock, all products added together.
    "inventory_summary_daily.json": """
        SELECT date, network, sum(available)::int AS available, sum(inbound)::int AS inbound
        FROM marts.fct_inventory_daily GROUP BY 1, 2 ORDER BY 1, 2""",
    # The Profit page's tiles and chart: every marketplace's daily finances, all products
    # added together (product cost to 6 decimals: a year's total moves by under a cent).
    "profit_summary_daily.json": """
        SELECT date, marketplace, sum(units_shipped)::int AS units_shipped,
               sum(principal) AS principal, sum(refunds) AS refunds,
               sum(referral_fees) AS referral_fees, sum(fba_fees) AS fba_fees,
               round(sum(product_cost), 6) AS product_cost
        FROM marts.fct_profit_daily GROUP BY 1, 2 ORDER BY 1, 2""",
}

# Fact files written once per marketplace (mkt/<code>/) or fulfilment network (net/<code>/),
# so a page downloads only the marketplaces it shows. %(part)s is the marketplace or network.
SPLIT_FILES = {
    "sales_daily.json": (
        "mkt",
        """
        SELECT date, marketplace, asin, units, orders, sales, sessions
        FROM marts.fct_sales_daily WHERE marketplace = %(part)s ORDER BY date, asin""",
    ),
    "ads_campaign_daily.json": (
        "mkt",
        """
        SELECT date, marketplace, campaign_id::text AS campaign_id, impressions, clicks, cost,
               orders, sales, units
        FROM marts.fct_ads_campaign_daily WHERE marketplace = %(part)s
        ORDER BY date, campaign_id""",
    ),
    "ads_product_daily.json": (
        "mkt",
        """
        SELECT date, marketplace, asin, impressions, clicks, cost, orders, sales
        FROM marts.fct_ads_product_daily WHERE marketplace = %(part)s ORDER BY date, asin""",
    ),
    "ads_target_daily.json": (
        "mkt",
        """
        SELECT date, marketplace, campaign_id::text AS campaign_id, target_id::text AS target_id,
               impressions, clicks, cost, orders, sales
        FROM marts.fct_ads_target_daily
        WHERE impressions > 0 AND marketplace = %(part)s
        ORDER BY date, campaign_id, target_id""",
    ),
    "profit_daily.json": (
        "mkt",
        """
        SELECT date, marketplace, asin, units_shipped, principal, refunds, referral_fees,
               fba_fees, product_cost
        FROM marts.fct_profit_daily WHERE marketplace = %(part)s ORDER BY date, asin""",
    ),
    "inventory_daily.json": (
        "net",
        """
        SELECT date, network, asin, available, reserved, inbound
        FROM marts.fct_inventory_daily WHERE network = %(part)s ORDER BY date, asin""",
    ),
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


def _payload(cur, name: str):
    columns = [c.name for c in cur.description]
    rows = cur.fetchall()
    if name in ROW_FILES:
        return [dict(zip(columns, map(_value, r), strict=True)) for r in rows], len(rows)
    return {c: [_value(r[i]) for r in rows] for i, c in enumerate(columns)}, len(rows)


def export(out: Path = DEFAULT_OUT) -> dict[str, int]:
    """Write every file plus manifest.json into `out`; returns rows per file (by path)."""
    files: dict[str, object] = {}  # path -> payload, all read before anything is written
    counts = {}
    with connect() as conn, conn.cursor() as cur:
        for name, query in FILES.items():
            cur.execute(query)
            files[name], counts[name] = _payload(cur, name)

        cur.execute("SELECT marketplace FROM marts.dim_marketplace ORDER BY marketplace")
        parts = {"mkt": [r[0] for r in cur.fetchall()]}
        cur.execute("SELECT DISTINCT network FROM marts.dim_marketplace ORDER BY network")
        parts["net"] = [r[0] for r in cur.fetchall()]
        for name, (kind, query) in SPLIT_FILES.items():
            for part in parts[kind]:
                path = f"{kind}/{part}/{name}"
                # every marketplace gets every file, empty where it has no rows (no ads in CA)
                cur.execute(query, {"part": part})
                files[path], counts[path] = _payload(cur, name)

        cur.execute("SELECT min(date), max(date) FROM marts.dim_date")
        start, end = cur.fetchone()

    files["manifest.json"] = {
        "schemaVersion": SCHEMA_VERSION,
        "synthetic": True,
        "brand": "Demo Brand",
        "marketplace": "US",
        "currency": "USD",
        "dataStart": start.isoformat(),
        "dataEnd": end.isoformat(),
        "generatedAt": datetime.now(UTC).replace(microsecond=0).isoformat(),
        "files": {name: {"rows": n} for name, n in counts.items()},
    }

    # Only now clear the previous export (a failed query above leaves it as it was), so a file
    # that is no longer made, such as the single sales_daily.json of schema 2, is not deployed.
    out.mkdir(parents=True, exist_ok=True)
    for old in [*out.glob("*.json"), *out.glob("mkt/*/*.json"), *out.glob("net/*/*.json")]:
        old.unlink()
    for path, payload in files.items():
        (out / path).parent.mkdir(parents=True, exist_ok=True)
        _write(out / path, payload)
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
