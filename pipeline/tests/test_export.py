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
]


@pytest.fixture(scope="module")
def exported(sim, tmp_path_factory):
    src = tmp_path_factory.mktemp("export-src")
    write_all(sim, src)
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
    ],
)
def test_totals_match_marts(exported, name, mart, column):
    out, _ = exported
    exported_total = math.fsum(_read(out, name)[column])
    with connect() as conn, conn.cursor() as cur:
        cur.execute(f"SELECT sum({column}) FROM marts.{mart}")
        (mart_total,) = cur.fetchone()
    assert exported_total == pytest.approx(float(mart_total), abs=0.01)


def test_size_budget(exported):
    """Design budget: first load about 250 KB compressed; keyword file about 1 MB."""
    out, _ = exported
    first = sum(_gzip_kb(out / name) for name in FIRST_LOAD)
    assert first < 250, f"first load {first:.0f} KB"
    assert _gzip_kb(out / "ads_target_daily.json") < 1024
