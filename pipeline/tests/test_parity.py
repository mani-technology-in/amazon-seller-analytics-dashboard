"""The SQL side of the parity check: covers every campaign, keyword, product and range."""

import pytest

from generator.reports import write_all
from load import load
from models import build
from parity import RANGES, compute


@pytest.fixture(scope="module")
def fixture(sim, tmp_path_factory):
    out = tmp_path_factory.mktemp("parity")
    write_all(sim, out)
    load(out)
    build()
    return compute()


def test_every_range_covers_every_entity(fixture):
    assert [r["name"] for r in fixture["ranges"]] == list(RANGES)
    for r in fixture["ranges"]:
        assert len(r["campaigns"]) == 18
        assert len(r["targets"]) == 180
        assert len(r["products"]) == 40


def test_previous_period_only_inside_the_data(fixture):
    by_name = {r["name"]: r for r in fixture["ranges"]}
    assert by_name["full_year"]["previous"] is None
    prev = by_name["last_30_days"]["previous"]
    assert (prev["start"], prev["end"]) == ("2026-08-02", "2026-08-31")


def test_ratios_follow_definitions(fixture):
    a = next(r for r in fixture["ranges"] if r["name"] == "full_year")["account"]
    assert a["acos"] == pytest.approx(a["ad_spend"] / a["ad_sales"])
    assert a["tacos"] == pytest.approx(a["ad_spend"] / a["sales"])
    assert a["roas"] == pytest.approx(a["ad_sales"] / a["ad_spend"])


def test_flags_have_something_to_find(fixture):
    full = next(r for r in fixture["ranges"] if r["name"] == "full_year")
    assert sum(t["no_sales"] for t in full["targets"].values()) >= 5
    assert any(t["acos_above_target"] for t in full["targets"].values())
    inv = fixture["inventory"]["rows"]
    assert len(inv) == 40
    assert any(r["low_stock"] for r in inv.values())
