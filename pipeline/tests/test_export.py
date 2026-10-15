"""The JSON export matches the marts, keeps IDs safe for JavaScript and stays small."""

import gzip
import json
import math

import pytest

from db import connect
from export import FILES, ROW_FILES, export
from generator.reports import write_all
from load import load
from models import build

FIRST_LOAD = [
    "manifest.json",
    "products.json",
    "campaigns.json",
    "sales_daily.json",
    "ads_campaign_daily.json",
    "marketplaces.json",
]


@pytest.fixture(scope="module")
def exported(world, tmp_path_factory):
    src = tmp_path_factory.mktemp("export-src")
    write_all(world, src)
    load(src)
    build()
    out = tmp_path_factory.mktemp("export-out")
    counts = export(out)
    return out, counts


def _read(out, name):
    return json.loads((out / name).read_text(encoding="utf-8"))


def _gzip_kb(path) -> float:
    return len(gzip.compress(path.read_bytes(), compresslevel=6)) / 1024


def test_all_files_written(exported):
    out, counts = exported
    assert {p.name for p in out.glob("*.json")} == {*FILES, "manifest.json"}
    assert set(counts) == set(FILES)


def test_fact_files_are_columns_of_equal_length(exported):
    out, counts = exported
    for name in set(FILES) - ROW_FILES:
        data = _read(out, name)
        lengths = {len(col) for col in data.values()}
        assert lengths == {counts[name]}, name


def test_manifest(exported):
    out, counts = exported
    m = _read(out, "manifest.json")
    assert m["synthetic"] is True
    assert (m["dataStart"], m["dataEnd"]) == ("2025-10-01", "2026-09-30")
    assert m["currency"] == "USD"
    assert {k: v["rows"] for k, v in m["files"].items()} == counts


def test_ids_are_strings(exported):
    out, _ = exported
    assert all(isinstance(c["campaign_id"], str) for c in _read(out, "campaigns.json"))
    ads = _read(out, "ads_target_daily.json")
    assert all(isinstance(v, str) for v in ads["campaign_id"][:100] + ads["target_id"][:100])


@pytest.mark.parametrize(
    ("name", "mart", "column"),
    [
        ("sales_daily.json", "fct_sales_daily", "sales"),
        ("ads_campaign_daily.json", "fct_ads_campaign_daily", "cost"),
        ("ads_campaign_daily.json", "fct_ads_campaign_daily", "sales"),
        ("ads_product_daily.json", "fct_ads_product_daily", "cost"),
        ("ads_target_daily.json", "fct_ads_target_daily", "cost"),
        ("inventory_daily.json", "fct_inventory_daily", "available"),
        ("profit_daily.json", "fct_profit_daily", "principal"),
        ("profit_daily.json", "fct_profit_daily", "product_cost"),
    ],
)
def test_fact_files_match_the_marts_for_every_marketplace(exported, name, mart, column):
    """Every marketplace (inventory: network) is exported, each with its own totals."""
    out, _ = exported
    data = _read(out, name)
    key = "network" if mart == "fct_inventory_daily" else "marketplace"
    exported_totals: dict[str, list[float]] = {}
    for k, v in zip(data[key], data[column], strict=True):
        exported_totals.setdefault(k, []).append(v)
    with connect() as conn, conn.cursor() as cur:
        # identifiers come from the fixed list above, never from input
        cur.execute(f"SELECT {key}, sum({column}) FROM marts.{mart} GROUP BY 1")  # nosemgrep
        mart_totals = dict(cur.fetchall())
    assert set(exported_totals) == set(mart_totals)
    if key == "network":
        expected = {"US", "CA", "MX", "UK", "EU"}
    elif name.startswith("ads_"):
        expected = {"US", "UK", "DE"}  # ads run only in these marketplaces
    else:
        expected = {"US", "CA", "MX", "UK", "DE", "FR"}
    assert set(mart_totals) == expected, name
    for k, total in mart_totals.items():
        assert math.fsum(exported_totals[k]) == pytest.approx(float(total), abs=0.01), (name, k)


def test_size_budget(exported):
    """CR-1 design budget: first load under about 300 KB of data compressed; the keyword file,
    loaded in the background on the Advertising page, under about 1.5 MB."""
    out, _ = exported
    first = sum(_gzip_kb(out / name) for name in FIRST_LOAD)
    assert first < 300, f"first load {first:.0f} KB"
    assert _gzip_kb(out / "ads_target_daily.json") < 1536


def test_marketplaces_and_exchange_rates(exported):
    out, _ = exported
    markets = _read(out, "marketplaces.json")
    assert [m["marketplace"] for m in markets][0] == "US"
    assert {m["marketplace"]: m["currency"] for m in markets} == {
        "US": "USD",
        "CA": "CAD",
        "MX": "MXN",
        "UK": "GBP",
        "DE": "EUR",
        "FR": "EUR",
    }
    fx = _read(out, "fx_monthly.json")
    assert len(fx["year_month"]) == 48
    mxn = [r for c, r in zip(fx["currency"], fx["usd_rate"], strict=True) if c == "MXN"]
    assert all(0.04 < r < 0.07 for r in mxn), "FX rates keep their 6 decimals"
