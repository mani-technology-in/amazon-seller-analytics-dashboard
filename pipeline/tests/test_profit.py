"""The profit mart keeps every cent of Amazon's fees and refunds, and the SQL profit query
reproduces the planned P&L (three loss-making products, a normal overall margin)."""

import numpy as np
import pytest

from db import connect
from generator import config
from generator.reports import write_all
from load import load
from models import build
from profit import product_profit_usd


@pytest.fixture(scope="module")
def warehouse(world, tmp_path_factory):
    out = tmp_path_factory.mktemp("profit")
    write_all(world, out)
    load(out)
    return build()


def _all(sql: str, params=None):
    with connect() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def test_profit_mart_keeps_every_cent(warehouse, world):
    rows = _all(
        "SELECT marketplace, sum(units_shipped), sum(principal) * 100, sum(refunds) * 100,"
        " sum(refund_units), sum(referral_fees) * 100, sum(fba_fees) * 100"
        " FROM marts.fct_profit_daily GROUP BY marketplace"
    )
    assert {r[0] for r in rows} == {m.code for m in config.MARKETPLACES}
    for code, units, principal, refunds, refund_units, referral, fba in rows:
        m, f = world.markets[code], world.finance[code]
        assert int(units) == int(m.units.sum())
        assert int(principal) == int(m.sales_cents.sum())
        assert int(refunds) == int(f.refund_cents.sum())
        assert int(refund_units) == int(f.refund_units.sum())
        assert int(referral) == int(f.commission_cents.sum() - f.commission_returned_cents.sum())
        assert int(fba) == int(f.fba_cents.sum())


def test_shipments_equal_the_sales_mart(warehouse):
    (mismatches,) = _all(
        "SELECT count(*) FROM marts.fct_sales_daily s"
        " FULL JOIN (SELECT * FROM marts.fct_profit_daily WHERE units_shipped > 0) p"
        "   USING (date, marketplace, asin)"
        " WHERE s.units > 0 AND (p.asin IS NULL OR p.units_shipped <> s.units"
        "   OR p.principal <> s.sales) OR (s.asin IS NULL AND p.asin IS NOT NULL)"
    )[0]
    assert mismatches == 0


def test_product_cost_uses_the_cost_in_force_and_the_months_rate(warehouse, world):
    changed = {c.sku for c in world.costs if c.valid_from == config.COST_CHANGE_DATE}
    sku = sorted(changed)[0]
    costs = {c.valid_from: c.unit_cost for c in world.costs if c.sku == sku}
    rows = _all(
        "SELECT f.date, f.units_shipped, f.product_cost, fx.usd_rate"
        " FROM marts.fct_profit_daily f JOIN marts.dim_product p USING (asin)"
        " JOIN marts.dim_fx_monthly fx"
        "   ON fx.year_month = to_char(f.date, 'YYYY-MM') AND fx.currency = f.currency"
        " WHERE p.sku = %s AND f.marketplace = 'UK' AND f.units_shipped > 0",
        (sku,),
    )
    assert rows
    for day, units, cost, rate in rows:
        unit = costs[
            config.COST_CHANGE_DATE if day >= config.COST_CHANGE_DATE else config.COSTS_VALID_FROM
        ]
        assert float(cost) == pytest.approx(units * unit / float(rate), abs=0.006)


def test_sql_profit_shows_three_losing_products_and_a_normal_margin(warehouse):
    p = product_profit_usd(config.START_DATE.isoformat(), config.END_DATE.isoformat())
    assert len(p) == 40
    losing = [asin for asin, r in p.items() if r["net_profit"] < 0]
    assert len(losing) == config.LOSS_PRODUCT_COUNT, losing
    revenue = sum(r["revenue"] for r in p.values())
    net = sum(r["net_profit"] for r in p.values())
    assert 0.15 <= net / revenue <= 0.25
    fees = sum(r["referral_fees"] for r in p.values()) / (
        revenue - sum(r["refunds"] for r in p.values())
    )
    assert float(fees) == pytest.approx(config.REFERRAL_RATE, abs=0.002)
    assert np.isclose(float(sum(r["revenue"] for r in p.values())), float(revenue))
