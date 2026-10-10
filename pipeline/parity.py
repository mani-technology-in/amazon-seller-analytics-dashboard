"""Compute the dashboard's metrics in SQL for fixed date ranges (the parity fixture).

    python parity.py --out output/parity.json

The web app computes the same metrics in TypeScript from the exported JSON files. The parity
test (web/src/metrics/parity.test.ts) checks both give the same numbers, so every figure on the
dashboard traces back to the database. Definitions: docs/metric-definitions.md.

Until the dashboard shows every marketplace (CR-1), it reads the US marketplace only, so the
parity queries do too.
"""

import argparse
import json
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

from db import connect

# Fixed ranges that cover the interesting parts of the data.
RANGES = {
    "last_30_days": ("2026-09-01", "2026-09-30"),
    "q4_2025": ("2025-11-01", "2025-12-31"),
    "prime_day_week": ("2026-07-11", "2026-07-17"),
    "april_stockout": ("2026-04-01", "2026-04-30"),
    "launch_window": ("2026-03-10", "2026-03-20"),
    "full_year": ("2025-10-01", "2026-09-30"),
}
TARGET_ACOS = 0.30
LOW_STOCK_DAYS = 21
AVG_WINDOW_DAYS = 30

ACCOUNT_SQL = """
WITH s AS (
    SELECT coalesce(sum(sales), 0) AS sales, coalesce(sum(orders), 0) AS orders,
           coalesce(sum(units), 0) AS units
    FROM marts.fct_sales_daily
    WHERE marketplace = 'US' AND date BETWEEN %(start)s AND %(end)s
), a AS (
    SELECT coalesce(sum(cost), 0) AS ad_spend, coalesce(sum(sales), 0) AS ad_sales,
           coalesce(sum(orders), 0) AS ad_orders, coalesce(sum(impressions), 0) AS impressions,
           coalesce(sum(clicks), 0) AS clicks
    FROM marts.fct_ads_campaign_daily
    WHERE marketplace = 'US' AND date BETWEEN %(start)s AND %(end)s
)
SELECT s.sales, s.orders, s.units, a.ad_spend, a.ad_sales, a.ad_orders, a.impressions, a.clicks,
       a.ad_spend / nullif(a.ad_sales, 0) AS acos,
       a.ad_spend / nullif(s.sales, 0) AS tacos,
       a.ad_sales / nullif(a.ad_spend, 0) AS roas
FROM s, a
"""

AD_RATIOS = """
       clicks::numeric / nullif(impressions, 0) AS ctr,
       cost / nullif(clicks, 0) AS cpc,
       orders::numeric / nullif(clicks, 0) AS cvr,
       cost / nullif(sales, 0) AS acos,
       sales / nullif(cost, 0) AS roas"""

CAMPAIGNS_SQL = f"""
WITH t AS (
    SELECT c.campaign_id,
           coalesce(sum(f.impressions), 0) AS impressions, coalesce(sum(f.clicks), 0) AS clicks,
           coalesce(sum(f.cost), 0) AS cost, coalesce(sum(f.orders), 0) AS orders,
           coalesce(sum(f.sales), 0) AS sales
    FROM marts.dim_campaign c
    LEFT JOIN marts.fct_ads_campaign_daily f
        ON f.campaign_id = c.campaign_id AND f.date BETWEEN %(start)s AND %(end)s
    WHERE c.marketplace = 'US'
    GROUP BY c.campaign_id
)
SELECT campaign_id::text AS key, impressions, clicks, cost, orders, sales, {AD_RATIOS}
FROM t
"""

TARGETS_SQL = f"""
WITH t AS (
    SELECT d.campaign_id, d.target_id,
           coalesce(sum(f.impressions), 0) AS impressions, coalesce(sum(f.clicks), 0) AS clicks,
           coalesce(sum(f.cost), 0) AS cost, coalesce(sum(f.orders), 0) AS orders,
           coalesce(sum(f.sales), 0) AS sales
    FROM marts.dim_target d
    LEFT JOIN marts.fct_ads_target_daily f
        ON f.campaign_id = d.campaign_id AND f.target_id = d.target_id
       AND f.date BETWEEN %(start)s AND %(end)s
    WHERE d.marketplace = 'US'
    GROUP BY d.campaign_id, d.target_id
)
SELECT campaign_id::text || ':' || target_id::text AS key,
       impressions, clicks, cost, orders, sales, {AD_RATIOS},
       cost > 0 AND sales = 0 AS no_sales,
       coalesce(cost / nullif(sales, 0) > %(target_acos)s, false) AS acos_above_target
FROM t
"""

PRODUCTS_SQL = """
WITH s AS (
    SELECT asin, sum(sales) AS sales, sum(units) AS units, sum(orders) AS orders,
           sum(sessions) AS sessions
    FROM marts.fct_sales_daily
    WHERE marketplace = 'US' AND date BETWEEN %(start)s AND %(end)s GROUP BY asin
), a AS (
    SELECT asin, sum(cost) AS ad_spend, sum(sales) AS ad_sales
    FROM marts.fct_ads_product_daily
    WHERE marketplace = 'US' AND date BETWEEN %(start)s AND %(end)s GROUP BY asin
)
SELECT p.asin AS key,
       coalesce(s.sales, 0) AS sales, coalesce(s.units, 0) AS units,
       coalesce(s.orders, 0) AS orders, coalesce(s.sessions, 0) AS sessions,
       coalesce(s.units, 0)::numeric / nullif(coalesce(s.sessions, 0), 0) AS unit_session_pct,
       coalesce(a.ad_spend, 0) AS ad_spend, coalesce(a.ad_sales, 0) AS ad_sales,
       coalesce(a.ad_spend, 0) / nullif(coalesce(s.sales, 0), 0) AS tacos
FROM marts.dim_product p
LEFT JOIN s USING (asin)
LEFT JOIN a USING (asin)
"""

INVENTORY_SQL = """
WITH u AS (
    SELECT asin, sum(units)::numeric / %(window)s AS avg_daily_units
    FROM marts.fct_sales_daily
    WHERE marketplace = 'US' AND date BETWEEN %(as_of)s::date - (%(window)s - 1) AND %(as_of)s
    GROUP BY asin
)
SELECT i.asin AS key, i.available, i.reserved, i.inbound,
       coalesce(u.avg_daily_units, 0) AS avg_daily_units,
       i.available / nullif(coalesce(u.avg_daily_units, 0), 0) AS days_of_cover,
       i.available <= 0 AS out_of_stock,
       i.available > 0 AND coalesce(
           i.available / nullif(coalesce(u.avg_daily_units, 0), 0) < %(low)s, false
       ) AS low_stock
FROM marts.fct_inventory_daily i
LEFT JOIN u USING (asin)
WHERE i.network = 'US' AND i.date = %(as_of)s
"""


def _json(v):
    if isinstance(v, Decimal):
        return float(v)
    return v


def _rows(cur, sql: str, params: dict) -> dict:
    cur.execute(sql, params)
    cols = [c.name for c in cur.description]
    out = {}
    for row in cur.fetchall():
        rec = {c: _json(v) for c, v in zip(cols, row, strict=True)}
        out[rec.pop("key")] = rec
    return out


def _one(cur, sql: str, params: dict) -> dict:
    cur.execute(sql, params)
    cols = [c.name for c in cur.description]
    return {c: _json(v) for c, v in zip(cols, cur.fetchone(), strict=True)}


def compute() -> dict:
    with connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT min(date), max(date) FROM marts.dim_date")
        data_start, data_end = cur.fetchone()
        ranges = []
        for name, (start, end) in RANGES.items():
            s, e = date.fromisoformat(start), date.fromisoformat(end)
            length = (e - s).days + 1
            prev = (s - timedelta(days=length), s - timedelta(days=1))
            p = {"start": start, "end": end, "target_acos": TARGET_ACOS}
            ranges.append(
                {
                    "name": name,
                    "start": start,
                    "end": end,
                    "account": _one(cur, ACCOUNT_SQL, p),
                    "previous": None
                    if prev[0] < data_start
                    else {
                        "start": prev[0].isoformat(),
                        "end": prev[1].isoformat(),
                        "account": _one(cur, ACCOUNT_SQL, {"start": prev[0], "end": prev[1]}),
                    },
                    "campaigns": _rows(cur, CAMPAIGNS_SQL, p),
                    "targets": _rows(cur, TARGETS_SQL, p),
                    "products": _rows(cur, PRODUCTS_SQL, p),
                }
            )
        inventory = _rows(
            cur,
            INVENTORY_SQL,
            {"as_of": data_end, "window": AVG_WINDOW_DAYS, "low": LOW_STOCK_DAYS},
        )
    return {
        "dataStart": data_start.isoformat(),
        "dataEnd": data_end.isoformat(),
        "targetAcos": TARGET_ACOS,
        "lowStockDays": LOW_STOCK_DAYS,
        "ranges": ranges,
        "inventory": {"asOf": data_end.isoformat(), "rows": inventory},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Compute dashboard metrics in SQL.")
    parser.add_argument("--out", type=Path, default=Path("output/parity.json"))
    args = parser.parse_args()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    fixture = compute()
    args.out.write_text(json.dumps(fixture, indent=1), encoding="utf-8")
    print(f"{len(fixture['ranges'])} ranges written to {args.out}")


if __name__ == "__main__":
    main()
