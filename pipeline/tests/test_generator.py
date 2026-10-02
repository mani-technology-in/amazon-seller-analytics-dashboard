"""The synthetic data is repeatable, shaped like Amazon's reports, consistent and realistic."""

import hashlib
import re
from datetime import date

import pandas as pd

from generator import config, generate
from generator.reports import AD_COLUMNS, FBA_COLUMNS


def _digest(folder) -> str:
    h = hashlib.sha256()
    for path in sorted(p for p in folder.rglob("*") if p.is_file()):
        h.update(path.relative_to(folder).as_posix().encode())
        h.update(path.read_bytes())
    return h.hexdigest()


# --- Repeatable -------------------------------------------------------------------------


def test_same_seed_gives_identical_files(output, tmp_path):
    generate(tmp_path)
    assert _digest(tmp_path) == _digest(output)


def test_different_seed_gives_different_data(output, tmp_path):
    generate(tmp_path, seed=config.SEED + 1)
    assert _digest(tmp_path) != _digest(output)


# --- Catalog ----------------------------------------------------------------------------


def test_catalog_shape(sim):
    products = sim.catalog.products
    assert len(products) == 40
    assert {p.category for p in products} == set(config.CATEGORIES)
    assert all(re.fullmatch(r"B0[A-Z0-9]{8}", p.asin) for p in products)
    assert len({p.asin for p in products}) == 40
    assert all(p.title.startswith(config.BRAND) for p in products)

    kinds = [c.ad_product for c in sim.catalog.campaigns]
    assert kinds.count("SPONSORED_PRODUCTS") == 10
    assert kinds.count("SPONSORED_BRANDS") == 4
    assert kinds.count("SPONSORED_DISPLAY") == 4
    assert 150 <= sum(len(c.targets) for c in sim.catalog.campaigns) <= 300


# --- Report formats ---------------------------------------------------------------------


def test_ads_reports_use_amazon_v3_columns(ads):
    assert set(ads) == set(AD_COLUMNS)
    for report_type, df in ads.items():
        assert list(df.columns) == AD_COLUMNS[report_type], report_type
        assert (df["impressions"] > 0).all(), "Amazon leaves out rows without impressions"


def test_fba_report_header(output):
    first = next(iter(sorted((output / "fba_inventory").glob("*.tsv"))))
    assert first.read_text(encoding="utf-8").splitlines()[0].split("\t") == FBA_COLUMNS


def test_sales_and_traffic_report_shape(output):
    import json

    report = json.loads((output / "sales_traffic" / "2026-01-15.json").read_text())
    spec = report["reportSpecification"]
    assert spec["reportType"] == "GET_SALES_AND_TRAFFIC_REPORT"
    assert spec["reportOptions"] == {"dateGranularity": "DAY", "asinGranularity": "CHILD"}
    record = report["salesAndTrafficByAsin"][0]
    assert set(record) == {"parentAsin", "childAsin", "sku", "salesByAsin", "trafficByAsin"}
    assert set(record["salesByAsin"]["orderedProductSales"]) == {"amount", "currencyCode"}


# --- Reports agree with each other ------------------------------------------------------


def _cents(s: pd.Series) -> pd.Series:
    return (s * 100).round().astype("int64")


def _by_campaign_day(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    out = df.assign(**{c: _cents(df[c]) for c in cols if c in ("cost", "sales", "sales7d")})
    return out.groupby(["campaignId", "date"])[cols].sum().sort_index()


def test_campaign_targeting_and_product_reports_agree(ads):
    for pre, sales_col in (("sp", "sales7d"), ("sd", "sales")):
        cols = ["impressions", "clicks", "cost", sales_col]
        campaign = _by_campaign_day(ads[f"{pre}Campaigns"], cols)
        targeting = _by_campaign_day(ads[f"{pre}Targeting"], cols)
        product = _by_campaign_day(ads[f"{pre}AdvertisedProduct"], cols)
        pd.testing.assert_frame_equal(campaign, targeting, check_dtype=False)
        pd.testing.assert_frame_equal(campaign, product, check_dtype=False)

    cols = ["impressions", "clicks", "cost", "sales"]
    pd.testing.assert_frame_equal(
        _by_campaign_day(ads["sbCampaigns"], cols),
        _by_campaign_day(ads["sbTargeting"], cols),
        check_dtype=False,
    )


def test_ad_orders_never_exceed_total_orders(ads, sales):
    sp = ads["spAdvertisedProduct"].rename(columns={"advertisedAsin": "asin"})
    sd = ads["sdAdvertisedProduct"].rename(columns={"promotedAsin": "asin"})
    ad_orders = (
        pd.concat(
            [
                sp.groupby(["asin", "date"])["purchases7d"].sum(),
                sd.groupby(["asin", "date"])["purchases"].sum(),
            ]
        )
        .groupby(level=[0, 1])
        .sum()
    )
    total = sales.set_index(["asin", "date"])["orders"]
    joined = pd.concat([ad_orders.rename("ad"), total.rename("total")], axis=1).fillna(0)
    assert (joined["ad"] <= joined["total"]).all()


def test_sales_match_units_times_price(sim):
    assert (sim.sales_cents == sim.units * sim.price_cents).all()
    assert (sim.units >= sim.orders).all()


# --- Realistic --------------------------------------------------------------------------


def _daily_sales(sales: pd.DataFrame) -> pd.Series:
    s = sales.groupby("date")["sales"].sum()
    s.index = pd.to_datetime(s.index)
    return s


def test_seasonality(sales):
    daily = _daily_sales(sales)
    avg = daily.mean()
    assert daily[daily.index.month == 12].mean() > 1.15 * avg, "Q4 peak"
    assert daily[daily.index.month == 1].mean() < avg, "January dip"

    july = daily[daily.index.month == 7]
    prime = july[july.index.isin(pd.to_datetime(list(config.PRIME_DAY)))]
    assert prime.min() > 1.8 * july.drop(prime.index).mean(), "Prime Day spike"

    weekend = daily[daily.index.dayofweek >= 5].mean()
    weekday = daily[daily.index.dayofweek < 5].mean()
    assert weekend > weekday, "weekly pattern"


def test_best_sellers_carry_most_sales(sales):
    by_asin = sales.groupby("asin")["sales"].sum().sort_values(ascending=False)
    assert by_asin.head(8).sum() > 0.5 * by_asin.sum()


def test_planned_stockouts_happen(sim, inventory, sales):
    by_rank = {p.rank: p for p in sim.catalog.products}
    stocked_out = set()
    for p in sim.catalog.products:
        inv = inventory[inventory["asin"] == p.asin]
        inv = inv[pd.to_datetime(inv["date"]).dt.date >= max(p.launch_date, config.START_DATE)]
        out_days = inv[inv["afn-fulfillable-quantity"] <= 0]["date"]
        if len(out_days) >= 7:
            stocked_out.add(p.asin)
    assert stocked_out == {by_rank[r].asin for r in config.STOCKOUT_ASIN_RANKS}


def test_no_sales_while_out_of_stock(sim):
    for p in sim.catalog.products:
        empty = sim.stock_end[p.index, :-1] <= 0  # out of stock at end of day d
        next_day_units = sim.units[p.index, 1:]
        next_day_arrivals = {s.arrives for s in sim.shipments[p.index]}
        for d in range(len(empty)):
            if empty[d] and (d + 1) not in next_day_arrivals:
                assert next_day_units[d] == 0, (p.title, sim.days[d + 1])


def test_stock_is_never_negative(sim, inventory):
    assert (sim.stock_end >= 0).all()
    assert (inventory["afn-fulfillable-quantity"] >= 0).all()


def test_no_sales_before_launch(sim, sales):
    launches = {p.asin: p.launch_date for p in sim.catalog.products}
    first_sale = pd.to_datetime(sales[sales["units"] > 0].groupby("asin")["date"].min())
    for asin, first in first_sale.items():
        assert first.date() >= launches[asin]
    launched_in_year = [p for p in sim.catalog.products if p.launch_date > config.START_DATE]
    assert len(launched_in_year) == len(config.LAUNCHES)


def _no_sale_targets(ads) -> pd.DataFrame:
    """Keywords and targets that spent over the year without a single sale."""
    frames = []
    for report, id_col, sales_col, type_col in (
        ("spTargeting", "keywordId", "sales7d", "matchType"),
        ("sbTargeting", "keywordId", "sales", "matchType"),
        ("sdTargeting", "targetingId", "sales", None),
    ):
        df = ads[report]
        cols = {"cost": "sum", sales_col: "sum"}
        if type_col:
            cols[type_col] = "first"
        g = df.groupby(id_col).agg(cols).rename(columns={sales_col: "sales", type_col: "match"})
        frames.append(g[(g["cost"] > 0) & (g["sales"] == 0)])
    return pd.concat(frames)


def test_some_targets_spend_without_sales(ads):
    assert len(_no_sale_targets(ads)) >= 5


def test_no_sale_targets_are_believable(ads):
    """Never an exact match (that would sell), and small enough for a seller to overlook."""
    wasted = _no_sale_targets(ads)
    assert "EXACT" not in set(wasted["match"].dropna())
    assert (wasted["cost"] <= 800).all(), wasted["cost"].max()


def test_tacos_moves_with_the_ad_budget_pattern(sales, ads):
    """More ad spend in Q4, less in January, so monthly TACoS spans at least 3 points."""
    spend = (
        pd.concat([ads[f"{p}Campaigns"][["date", "cost"]] for p in ("sp", "sb", "sd")])
        .groupby("date")["cost"]
        .sum()
    )
    daily = pd.DataFrame({"spend": spend, "sales": sales.groupby("date")["sales"].sum()})
    daily.index = pd.to_datetime(daily.index)
    monthly = daily.groupby(daily.index.to_period("M")).sum()
    tacos = monthly["spend"] / monthly["sales"]
    assert tacos.max() - tacos.min() >= 0.03
    assert tacos[pd.Period("2025-12")] > tacos[pd.Period("2026-01")]


def test_most_campaigns_run_between_15_and_45_percent_acos(ads):
    acos = []
    for pre, sales_col in (("sp", "sales7d"), ("sb", "sales"), ("sd", "sales")):
        df = ads[f"{pre}Campaigns"].groupby("campaignId")[["cost", sales_col]].sum()
        acos.extend(df["cost"] / df[sales_col])
    in_range = [a for a in acos if 0.15 <= a <= 0.45]
    assert len(acos) == 18
    assert len(in_range) >= 0.8 * len(acos)


def test_twelve_months_of_data(output):
    days = sorted(p.stem for p in (output / "sales_traffic").glob("*.json"))
    assert days[0] == config.START_DATE.isoformat()
    assert days[-1] == config.END_DATE.isoformat()
    assert len(days) == (config.END_DATE - config.START_DATE).days + 1 == 365
    assert date.fromisoformat(days[-1]) > date.fromisoformat(days[0])
