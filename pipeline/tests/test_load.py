"""Loading the report files into the raw schema keeps every record, and can be repeated."""

from db import connect
from generator.reports import write_all
from load import RAW_TABLES, load


def _counts() -> dict[str, int]:
    with connect() as conn, conn.cursor() as cur:
        out = {}
        for table in RAW_TABLES:
            cur.execute(f"SELECT count(*) FROM raw.{table}")
            out[table] = cur.fetchone()[0]
        return out


def test_load_keeps_every_record_and_is_repeatable(sim, tmp_path):
    written = write_all(sim, tmp_path)
    loaded = load(tmp_path)
    load(tmp_path)  # second run replaces, not appends

    expected = {
        "products": written["products"],
        "sales_traffic_by_asin": written["sales_traffic"],
        "fba_inventory_snapshot": written["fba_inventory"],
        "sp_campaigns": written["spCampaigns"],
        "sp_targeting": written["spTargeting"],
        "sp_advertised_product": written["spAdvertisedProduct"],
        "sb_campaigns": written["sbCampaigns"],
        "sb_targeting": written["sbTargeting"],
        "sd_campaigns": written["sdCampaigns"],
        "sd_targeting": written["sdTargeting"],
        "sd_advertised_product": written["sdAdvertisedProduct"],
    }
    assert loaded == expected
    assert _counts() == expected


def test_raw_records_keep_amazon_field_names(sim, tmp_path):
    write_all(sim, tmp_path)
    load(tmp_path)
    with connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT record FROM raw.sp_targeting LIMIT 1")
        record = cur.fetchone()[0]
        assert {"campaignId", "keywordId", "matchType", "cost", "sales7d"} <= record.keys()
        cur.execute("SELECT record FROM raw.fba_inventory_snapshot LIMIT 1")
        assert "afn-fulfillable-quantity" in cur.fetchone()[0]
        cur.execute(
            "SELECT record #>> '{salesByAsin,orderedProductSales,currencyCode}' "
            "FROM raw.sales_traffic_by_asin LIMIT 1"
        )
        assert cur.fetchone()[0] == "USD"
