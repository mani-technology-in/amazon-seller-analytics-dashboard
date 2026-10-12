"""Six marketplaces: US unchanged from v1.0, the others realistic, consistent and in local money.

Each planned pattern of the CR-1 data (Requirements, section 6) has a test here.
"""

import csv
import gzip
import hashlib
import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from generator import config
from generator.markets import fr_factor, local_price

MARKETS = {m.code: m for m in config.MARKETPLACES}

# SHA-256 of the US report folders as v1.0 wrote them (commit f2b4c3d). Any change to the US
# data would change every v1.0 page and the parity fixtures, so it must be deliberate.
V1_US_DIGESTS = {
    "sales_traffic": "4b63729b495b07d27fe03fe89aa24ad2242bb3b81ebb995542ac21e404563980",
    "fba_inventory": "909bd385d9b12b18ae02b040a7090d1822f97df6e13832ac46f5cbe1c41e4a35",
    "ads": "64183954e781d52d3628b7342ea22d7a9b0c0b09e01516168c1cebf9d0e0579b",
}


def _digest(folder: Path) -> str:
    h = hashlib.sha256()
    for path in sorted(p for p in folder.rglob("*") if p.is_file()):
        h.update(path.relative_to(folder).as_posix().encode())
        h.update(path.read_bytes())
    return h.hexdigest()


@pytest.fixture(scope="module")
def fx(output) -> dict[tuple[str, str], float]:
    with (output / "fx" / "rates.csv").open(encoding="utf-8") as f:
        return {(r["month"], r["currency"]): float(r["usd_rate"]) for r in csv.DictReader(f)}


@pytest.fixture(scope="module")
def all_sales(output, fx) -> pd.DataFrame:
    """Every marketplace's sales, with revenue converted to USD at the month's rate."""
    rows = []
    for code in MARKETS:
        for path in sorted((output / "sales_traffic" / code).glob("*.json")):
            report = json.loads(path.read_text(encoding="utf-8"))
            for r in report["salesAndTrafficByAsin"]:
                money = r["salesByAsin"]["orderedProductSales"]
                rate = (
                    1.0
                    if money["currencyCode"] == "USD"
                    else fx[(path.stem[:7], money["currencyCode"])]
                )
                rows.append(
                    {
                        "marketplace": code,
                        "date": date.fromisoformat(path.stem),
                        "asin": r["childAsin"],
                        "units": r["salesByAsin"]["unitsOrdered"],
                        "orders": r["salesByAsin"]["totalOrderItems"],
                        "sales_usd": money["amount"] * rate,
                        "currency": money["currencyCode"],
                    }
                )
    return pd.DataFrame(rows)


# --- US is v1.0, byte for byte ------------------------------------------------------------


@pytest.mark.parametrize("folder", list(V1_US_DIGESTS))
def test_us_reports_are_unchanged_from_v1(output, folder):
    assert _digest(output / folder / "US") == V1_US_DIGESTS[folder]


# --- Shape: Amazon's marketplace IDs and each marketplace's own currency ---------------------


def test_one_sales_report_per_marketplace_with_its_id_and_currency(output):
    for code, m in MARKETS.items():
        report = json.loads((output / "sales_traffic" / code / "2026-09-30.json").read_text())
        assert report["reportSpecification"]["marketplaceIds"] == [m.marketplace_id]
        money = report["salesAndTrafficByDate"][0]["salesByDate"]["orderedProductSales"]
        assert money["currencyCode"] == m.currency


def test_amazon_marketplace_ids():
    """From the SP-API "Marketplace IDs" page."""
    assert {m.code: m.marketplace_id for m in config.MARKETPLACES} == {
        "US": "ATVPDKIKX0DER",
        "CA": "A2EUQ1WTGCTBG2",
        "MX": "A1AM78C64UM0Y8",
        "UK": "A1F83G8C2ARO7P",
        "DE": "A1PA6795UKMFR9",
        "FR": "A13V1IB3VIYZZH",
    }


def test_inventory_per_network_and_ads_only_where_they_run(output):
    assert {p.name for p in (output / "fba_inventory").iterdir()} == {"US", "CA", "MX", "UK", "EU"}
    assert {p.name for p in (output / "ads").iterdir()} == {"US", "UK", "DE"}
    for code in ("UK", "DE"):
        with gzip.open(output / "ads" / code / "spCampaigns.json.gz", "rt") as f:
            rows = json.load(f)
        assert {r["campaignBudgetCurrencyCode"] for r in rows} == {MARKETS[code].currency}
        for report in ("sbCampaigns", "sdCampaigns"):  # Sponsored Products only here
            with gzip.open(output / "ads" / code / f"{report}.json.gz", "rt") as f:
                assert json.load(f) == [], (code, report)


def test_local_prices_end_like_local_listings():
    usd = 29.99
    prices = {n.code: local_price(usd, n) for n in config.NETWORKS}
    assert prices["US"] == 29.99
    for code in ("CA", "UK", "EU"):
        assert f"{prices[code]:.2f}".endswith(".99"), (code, prices[code])
    assert prices["MX"] % 10 == 9


# --- Realistic ----------------------------------------------------------------------------


def test_revenue_split_over_the_last_30_days(all_sales):
    """US about 60%, UK and DE about 12% each, CA, FR and MX the rest (within 1.5 points)."""
    recent = all_sales[all_sales["date"] > config.END_DATE - pd.Timedelta(days=30)]
    share = recent.groupby("marketplace")["sales_usd"].sum() / recent["sales_usd"].sum()
    target = {"US": 0.60, "UK": 0.125, "DE": 0.12, "CA": 0.075, "FR": 0.05, "MX": 0.03}
    for code, t in target.items():
        assert abs(share[code] - t) <= 0.015, (code, round(share[code], 3))


def test_mexico_and_france_open_during_the_year_and_ramp_up(all_sales):
    starts = {"MX": next(n.start for n in config.NETWORKS if n.code == "MX"), "FR": config.FR_START}
    for code, start in starts.items():
        s = all_sales[(all_sales["marketplace"] == code) & (all_sales["units"] > 0)]
        assert s["date"].min() >= start, code
        monthly = s.groupby(s["date"].map(lambda d: d.strftime("%Y-%m")))["sales_usd"].sum()
        assert monthly.iloc[0] < 0.6 * monthly.iloc[-1], (code, monthly.round().to_dict())


def test_germany_and_france_add_up_to_the_eu_network(world):
    eu = world.networks["EU"]
    de, fr = world.markets["DE"], world.markets["FR"]
    assert (de.units + fr.units == eu.units).all()
    assert (de.orders + fr.orders == eu.orders).all()
    assert (de.units >= de.orders).all() and (fr.units >= fr.orders).all()
    assert fr.units[:, : (config.FR_START - config.START_DATE).days].sum() == 0
    assert (fr_factor(eu.days) >= 0).all()


def _out_of_stock_products(sim) -> set[int]:
    """Products with at least 7 days of no stock after launch (not counting pre-launch)."""
    out = set()
    for p in sim.catalog.products:
        first = max((p.launch_date - sim.days[0]).days, 0)
        if (sim.stock_end[p.index, first:] <= 0).sum() >= 7:
            out.add(p.index)
    return out


def test_a_product_runs_out_in_one_network_but_not_the_others(world):
    out = {code: _out_of_stock_products(sim) for code, sim in world.networks.items()}
    only_one = [
        i for code in out for i in out[code] if all(i not in out[o] for o in out if o != code)
    ]
    assert out["UK"] and out["EU"], out
    assert len(only_one) >= 2, out


def test_ads_in_uk_and_germany_look_like_a_real_account(output, all_sales, fx):
    for code in ("UK", "DE"):
        with gzip.open(output / "ads" / code / "spCampaigns.json.gz", "rt") as f:
            ads = pd.DataFrame(json.load(f))
        by_campaign = ads.groupby("campaignId")[["cost", "sales7d"]].sum()
        acos = by_campaign["cost"] / by_campaign["sales7d"]
        assert len(acos) == 10, code
        assert ((acos >= 0.15) & (acos <= 0.45)).mean() >= 0.8, (code, acos.round(2).tolist())

        spend_usd = sum(r.cost * fx[(r.date[:7], MARKETS[code].currency)] for r in ads.itertuples())
        revenue = all_sales.loc[all_sales["marketplace"] == code, "sales_usd"].sum()
        assert 0.04 <= spend_usd / revenue <= 0.12, (code, spend_usd / revenue)  # TACoS


def test_exchange_rates_cover_every_month_near_real_levels(fx):
    months = {m for m, _ in fx}
    assert len(months) == 12 and len(fx) == 48
    for (_, currency), rate in fx.items():
        assert abs(rate / config.FX_REFERENCE[currency] - 1) < 0.06, (currency, rate)


def test_no_absurd_outliers(all_sales):
    """No day sells more than 6x a marketplace's median day (Prime Day is about 3x)."""
    daily = all_sales.groupby(["marketplace", "date"])["sales_usd"].sum()
    for code, s in daily.groupby(level=0):
        s = s[s > 0]
        assert s.max() <= 6 * np.median(s), (code, s.max(), np.median(s))


# --- The v1.0 consistency rules hold in every network -------------------------------------


def _ads(output: Path, code: str) -> dict[str, pd.DataFrame]:
    frames = {}
    for name in ("spCampaigns", "spTargeting", "spAdvertisedProduct"):
        with gzip.open(output / "ads" / code / f"{name}.json.gz", "rt", encoding="utf-8") as f:
            frames[name] = pd.DataFrame(json.load(f))
    return frames


def _by_campaign_day(df: pd.DataFrame) -> pd.DataFrame:
    cols = ["impressions", "clicks", "cost", "sales7d", "purchases7d"]
    cents = df.assign(cost=(df["cost"] * 100).round(), sales7d=(df["sales7d"] * 100).round())
    return cents.groupby(["campaignId", "date"])[cols].sum().sort_index()


@pytest.mark.parametrize("code", ["UK", "DE"])
def test_campaign_targeting_and_product_reports_agree(output, code):
    ads = _ads(output, code)
    campaign = _by_campaign_day(ads["spCampaigns"])
    pd.testing.assert_frame_equal(campaign, _by_campaign_day(ads["spTargeting"]), check_dtype=False)
    product = _by_campaign_day(ads["spAdvertisedProduct"])
    pd.testing.assert_frame_equal(campaign, product, check_dtype=False)


@pytest.mark.parametrize("code", ["UK", "DE"])
def test_ad_orders_never_exceed_total_orders(output, all_sales, code):
    product = _ads(output, code)["spAdvertisedProduct"]
    ad = product.groupby(["advertisedAsin", "date"])["purchases7d"].sum()
    sales = all_sales[all_sales["marketplace"] == code]
    total = sales.assign(date=sales["date"].map(date.isoformat)).set_index(["asin", "date"])
    joined = pd.concat([ad.rename("ad"), total["orders"].rename("total")], axis=1).fillna(0)
    assert (joined["ad"] <= joined["total"]).all(), code


def test_ad_ids_are_unique_across_marketplaces(output):
    """Staging and the marts key ads by Amazon's IDs, so no ID may repeat between accounts."""
    seen: dict[str, set[int]] = {}
    for code in ("US", "UK", "DE"):
        for path in (output / "ads" / code).glob("*.json.gz"):
            with gzip.open(path, "rt", encoding="utf-8") as f:
                rows = json.load(f)
            for key in ("campaignId", "adGroupId", "keywordId", "targetingId", "adId"):
                ids = {r[key] for r in rows if key in r}
                for other, other_ids in seen.items():
                    if other.split("/")[0] != code and other.endswith(key):
                        assert not ids & other_ids, (code, other, key)
                seen.setdefault(f"{code}/{key}", set()).update(ids)


@pytest.mark.parametrize("code", ["CA", "MX", "UK", "EU"])
def test_stock_and_sales_follow_the_v1_rules(world, code):
    sim = world.networks[code]
    assert (sim.stock_end >= 0).all()
    assert (sim.units >= sim.orders).all()
    for p in sim.catalog.products:
        empty = sim.stock_end[p.index, :-1] <= 0
        arrivals = {s.arrives for s in sim.shipments[p.index]}
        for d in np.flatnonzero(empty):
            if d + 1 not in arrivals:
                assert sim.units[p.index, d + 1] == 0, (code, p.title, sim.days[d + 1])
        launch = (p.launch_date - sim.days[0]).days
        if launch > 0:
            assert sim.units[p.index, :launch].sum() == 0, (code, p.title)


def test_only_the_planned_products_run_out_for_a_week(world):
    """A week or more out of stock happens only where it is planned; the slowest sellers may
    still have a short gap of a few days, as small real listings do."""
    for n in config.NETWORKS:
        sim = world.networks[n.code]
        ranks = config.STOCKOUT_ASIN_RANKS if n.code == "US" else n.stockout_ranks
        planned = {p.index for p in sim.catalog.products if p.rank in ranks}
        assert _out_of_stock_products(sim) == planned, n.code
