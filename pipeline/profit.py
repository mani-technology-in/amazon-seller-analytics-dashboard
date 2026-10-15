"""Product profit in SQL, the reference the dashboard's profit metrics are checked against.

Definitions (Requirements, CR-1 metrics table): net profit = revenue - refunds - Amazon fees
(referral + FBA) - ad spend - product cost, every amount converted to USD at its month's rate.
Ad spend per product is Sponsored Products and Sponsored Display (Amazon reports Sponsored
Brands spend per campaign, not per product). The parity check gains these queries with the
profit metrics (CR-1 PR 5).
"""

from decimal import Decimal

from db import connect

PRODUCT_PROFIT_USD = """
WITH fx AS (SELECT year_month, currency, usd_rate FROM marts.dim_fx_monthly),
money AS (
    SELECT
        f.asin,
        sum(f.units_shipped) AS units,
        sum(f.principal * fx.usd_rate) AS revenue,
        sum(f.refunds * fx.usd_rate) AS refunds,
        sum(f.referral_fees * fx.usd_rate) AS referral_fees,
        sum(f.fba_fees * fx.usd_rate) AS fba_fees,
        sum(f.product_cost * fx.usd_rate) AS product_cost
    FROM marts.fct_profit_daily f
    JOIN fx ON fx.year_month = to_char(f.date, 'YYYY-MM') AND fx.currency = f.currency
    WHERE f.date BETWEEN %(start)s AND %(end)s
    GROUP BY f.asin
),
ads AS (
    SELECT a.asin, sum(a.cost * fx.usd_rate) AS ad_spend
    FROM marts.fct_ads_product_daily a
    JOIN marts.dim_marketplace m USING (marketplace)
    JOIN fx ON fx.year_month = to_char(a.date, 'YYYY-MM') AND fx.currency = m.currency
    WHERE a.date BETWEEN %(start)s AND %(end)s
    GROUP BY a.asin
)
SELECT
    money.*,
    coalesce(ads.ad_spend, 0) AS ad_spend,
    money.revenue - money.refunds - money.referral_fees - money.fba_fees
        - coalesce(ads.ad_spend, 0) - money.product_cost AS net_profit
FROM money LEFT JOIN ads USING (asin)
ORDER BY money.asin
"""


def product_profit_usd(start: str, end: str) -> dict[str, dict[str, Decimal]]:
    """Profit lines per ASIN in USD for an inclusive date range."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute(PRODUCT_PROFIT_USD, {"start": start, "end": end})
        cols = [c.name for c in cur.description]
        return {r[0]: dict(zip(cols[1:], r[1:], strict=True)) for r in cur.fetchall()}
