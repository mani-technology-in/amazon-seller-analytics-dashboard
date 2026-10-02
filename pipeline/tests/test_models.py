"""Staging and marts keep every record and every dollar from raw, and handle reloads."""

from decimal import Decimal

import pytest

from db import connect
from generator.reports import write_all
from load import load
from models import build

AD_REPORTS = {
    # raw table -> (order field, sales field)
    "sp_campaigns": ("purchases7d", "sales7d"),
    "sb_campaigns": ("purchases", "sales"),
    "sd_campaigns": ("purchases", "sales"),
}


@pytest.fixture(scope="module")
def warehouse(sim, tmp_path_factory):
    out = tmp_path_factory.mktemp("models")
    write_all(sim, out)
    load(out)
    return build()


def _one(sql: str, params=None):
    with connect() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()


def test_dimensions(warehouse):
    assert warehouse["dim_date"] == 365
    assert warehouse["dim_product"] == 40
    assert warehouse["dim_campaign"] == 18
    assert warehouse["dim_target"] == 180
    counts = dict(_all("SELECT ad_product, count(*) FROM marts.dim_campaign GROUP BY ad_product"))
    assert counts == {"SP": 10, "SB": 4, "SD": 4}


def _all(sql: str):
    with connect() as conn, conn.cursor() as cur:
        cur.execute(sql)
        return cur.fetchall()


@pytest.mark.parametrize(
    ("raw", "staging"),
    [
        ("sales_traffic_by_asin", "stg_sales_traffic"),
        ("fba_inventory_snapshot", "stg_fba_inventory"),
        ("sp_campaigns", "stg_sp_campaigns"),
        ("sp_targeting", "stg_sp_targeting"),
        ("sp_advertised_product", "stg_sp_advertised_product"),
        ("sb_campaigns", "stg_sb_campaigns"),
        ("sb_targeting", "stg_sb_targeting"),
        ("sd_campaigns", "stg_sd_campaigns"),
        ("sd_targeting", "stg_sd_targeting"),
        ("sd_advertised_product", "stg_sd_advertised_product"),
    ],
)
def test_staging_keeps_every_record(warehouse, raw, staging):
    (n_raw,) = _one(f"SELECT count(*) FROM raw.{raw}")
    (n_stg,) = _one(f"SELECT count(*) FROM staging.{staging}")
    assert n_stg == n_raw > 0


def test_sales_reconcile_raw_to_marts(warehouse):
    raw = _one(
        "SELECT sum((record #>> '{salesByAsin,orderedProductSales,amount}')::numeric), "
        "sum((record #>> '{salesByAsin,unitsOrdered}')::int) FROM raw.sales_traffic_by_asin"
    )
    mart = _one("SELECT sum(sales), sum(units) FROM marts.fct_sales_daily")
    assert mart == raw


@pytest.mark.parametrize("raw_table", list(AD_REPORTS))
def test_ad_spend_and_sales_reconcile_raw_to_marts(warehouse, raw_table):
    orders_field, sales_field = AD_REPORTS[raw_table]
    ad_product = raw_table[:2].upper()
    raw = _one(
        f"SELECT sum((record->>'cost')::numeric), sum((record->>'{sales_field}')::numeric), "
        f"sum((record->>'{orders_field}')::int) FROM raw.{raw_table}"
    )
    campaign = _one(
        "SELECT sum(cost), sum(sales), sum(orders) FROM marts.fct_ads_campaign_daily "
        "WHERE ad_product = %s",
        (ad_product,),
    )
    target = _one(
        "SELECT sum(cost), sum(sales), sum(orders) FROM marts.fct_ads_target_daily "
        "WHERE ad_product = %s",
        (ad_product,),
    )
    assert campaign == raw
    assert target == raw


def test_product_level_ads_cover_sp_and_sd_only(warehouse):
    product = _one("SELECT sum(cost), sum(sales) FROM marts.fct_ads_product_daily")
    campaign = _one(
        "SELECT sum(cost), sum(sales) FROM marts.fct_ads_campaign_daily "
        "WHERE ad_product IN ('SP', 'SD')"
    )
    assert product == campaign


def test_inventory_matches_fba_report(warehouse):
    raw = _one(
        "SELECT sum((record->>'afn-fulfillable-quantity')::int), "
        "sum((record->>'afn-inbound-working-quantity')::int "
        "  + (record->>'afn-inbound-shipped-quantity')::int "
        "  + (record->>'afn-inbound-receiving-quantity')::int) "
        "FROM raw.fba_inventory_snapshot"
    )
    mart = _one("SELECT sum(available), sum(inbound) FROM marts.fct_inventory_daily")
    assert mart == raw


def test_every_fact_row_has_a_dimension(warehouse):
    orphans = _one(
        "SELECT "
        "(SELECT count(*) FROM marts.fct_sales_daily f "
        "   LEFT JOIN marts.dim_product p USING (asin) WHERE p.asin IS NULL), "
        "(SELECT count(*) FROM marts.fct_ads_campaign_daily f "
        "   LEFT JOIN marts.dim_campaign c USING (campaign_id) WHERE c.campaign_id IS NULL), "
        "(SELECT count(*) FROM marts.fct_ads_target_daily f "
        "   LEFT JOIN marts.dim_target t USING (campaign_id, target_id) "
        "   WHERE t.target_id IS NULL), "
        "(SELECT count(*) FROM marts.fct_sales_daily f "
        "   LEFT JOIN marts.dim_date d USING (date) WHERE d.date IS NULL)"
    )
    assert orphans == (0, 0, 0, 0)


def test_reloaded_record_replaces_the_old_one(warehouse):
    """A record loaded twice counts once, using the newest copy."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO raw.sp_campaigns (report_date, source_file, record, loaded_at) "
            "SELECT report_date, 'reload.json', jsonb_set(record, '{cost}', '999.99'), "
            "       loaded_at + interval '1 hour' "
            "FROM raw.sp_campaigns ORDER BY report_date, record->>'campaignId' LIMIT 1 "
            "RETURNING report_date, (record->>'campaignId')::bigint"
        )
        day, campaign_id = cur.fetchone()
        cur.execute(
            "SELECT count(*), max(cost) FROM staging.stg_sp_campaigns "
            "WHERE date = %s AND campaign_id = %s",
            (day, campaign_id),
        )
        assert cur.fetchone() == (1, Decimal("999.99"))
        conn.rollback()


def test_build_can_be_repeated(warehouse):
    assert build() == warehouse
