"""Fees, refunds and product cost: Amazon's Finances API shapes and a believable P&L.

Each pattern planned for the CR-1 profit data (Requirements, section 6) has a test here.
"""

import csv
import json
from collections import defaultdict
from datetime import date

import pytest

from generator import config

MARKETS = {m.code: m for m in config.MARKETPLACES}


@pytest.fixture(scope="module")
def fx(output) -> dict[tuple[str, str], float]:
    with (output / "fx" / "rates.csv").open(encoding="utf-8") as f:
        rates = {(r["month"], r["currency"]): float(r["usd_rate"]) for r in csv.DictReader(f)}
    return defaultdict(lambda: 1.0, rates)


@pytest.fixture(scope="module")
def events(output) -> dict[str, list[tuple[str, str, dict]]]:
    """Every finance event: {"shipment": [(code, day, event)], "refund": [...]}."""
    out = {"shipment": [], "refund": []}
    for code in MARKETS:
        for path in sorted((output / "finances" / code).glob("*.json")):
            body = json.loads(path.read_text(encoding="utf-8"))["payload"]["FinancialEvents"]
            out["shipment"] += [(code, path.stem, e) for e in body["ShipmentEventList"]]
            out["refund"] += [(code, path.stem, e) for e in body["RefundEventList"]]
    assert len(out["shipment"]) > 10_000 and len(out["refund"]) > 1_000  # no test passes on nothing
    return out


def _money(entries, kind_key, kind, amount_key) -> float:
    return sum(e[amount_key]["CurrencyAmount"] for e in entries if e[kind_key] == kind)


@pytest.fixture(scope="module")
def pnl(output, events, fx, world) -> dict[str, dict[str, float]]:
    """Year totals per SKU in USD: revenue, refunds, referral, fba, ads, cost, units."""
    products = {p.sku: p for p in world.catalog.products}
    t = defaultdict(lambda: defaultdict(float))
    for _code, day, e in events["shipment"]:
        for item in e["ShipmentItemList"]:
            cur = item["ItemChargeList"][0]["ChargeAmount"]["CurrencyCode"]
            rate = fx[(day[:7], cur)]
            s = t[item["SellerSKU"]]
            s["revenue"] += (
                _money(item["ItemChargeList"], "ChargeType", "Principal", "ChargeAmount") * rate
            )
            s["referral"] -= (
                _money(item["ItemFeeList"], "FeeType", "Commission", "FeeAmount") * rate
            )
            s["fba"] -= (
                _money(item["ItemFeeList"], "FeeType", "FBAPerUnitFulfillmentFee", "FeeAmount")
                * rate
            )
            s["units"] += item["QuantityShipped"]
            s["cost"] += item["QuantityShipped"] * _unit_cost(output, item["SellerSKU"], day)
    for _code, day, e in events["refund"]:
        for item in e["ShipmentItemAdjustmentList"]:
            cur = item["ItemChargeAdjustmentList"][0]["ChargeAmount"]["CurrencyCode"]
            rate = fx[(day[:7], cur)]
            s = t[item["SellerSKU"]]
            s["refunds"] -= (
                _money(item["ItemChargeAdjustmentList"], "ChargeType", "Principal", "ChargeAmount")
                * rate
            )
            s["referral"] -= (
                _money(item["ItemFeeAdjustmentList"], "FeeType", "Commission", "FeeAmount") * rate
            )
    for _code, m in world.markets.items():
        for a in m.ads:
            if a.campaign.ad_product == "SPONSORED_BRANDS":
                continue  # Amazon reports Sponsored Brands spend per campaign, not per product
            spend = a.cost_cents.sum(axis=0)  # (products, days)
            for k, idx in enumerate(a.product_idx):
                for d, cents in enumerate(spend[k]):
                    if cents:
                        month = world.days[d].strftime("%Y-%m")
                        t[world.catalog.products[idx].sku]["ads"] += (
                            cents / 100 * fx[(month, m.marketplace.currency)]
                        )
    assert set(t) <= set(products)
    return {sku: dict(v) for sku, v in t.items()}


_COSTS: dict = {}


def _unit_cost(output, sku: str, day: str) -> float:
    if not _COSTS:
        with (output / "product_costs.csv").open(encoding="utf-8") as f:
            for r in csv.DictReader(f):
                _COSTS.setdefault(r["sku"], []).append((r["valid_from"], float(r["unit_cost"])))
        for rows in _COSTS.values():
            rows.sort()
    return [c for start, c in _COSTS[sku] if start <= day][-1]


def _net(s: dict[str, float]) -> float:
    return s["revenue"] - s["refunds"] - s["referral"] - s["fba"] - s.get("ads", 0) - s["cost"]


# --- Shape ---------------------------------------------------------------------------------


def test_finance_events_use_amazons_field_names(events):
    code, day, e = events["shipment"][0]
    assert {"MarketplaceName", "PostedDate", "ShipmentItemList"} <= e.keys()
    item = e["ShipmentItemList"][0]
    assert {"SellerSKU", "QuantityShipped", "ItemChargeList", "ItemFeeList"} <= item.keys()
    assert {c["ChargeType"] for c in item["ItemChargeList"]} == {"Principal"}
    assert {f["FeeType"] for f in item["ItemFeeList"]} == {"Commission", "FBAPerUnitFulfillmentFee"}
    assert set(item["ItemFeeList"][0]["FeeAmount"]) == {"CurrencyCode", "CurrencyAmount"}
    code, day, r = events["refund"][0]
    adj = r["ShipmentItemAdjustmentList"][0]
    assert {
        "SellerSKU",
        "QuantityShipped",
        "ItemChargeAdjustmentList",
        "ItemFeeAdjustmentList",
    } <= adj.keys()


def test_each_marketplace_uses_its_own_name_and_currency(events):
    seen = {}
    for code, _day, e in events["shipment"]:
        cur = e["ShipmentItemList"][0]["ItemFeeList"][0]["FeeAmount"]["CurrencyCode"]
        seen[code] = (e["MarketplaceName"], cur)
    assert seen == {c: (config.MARKETPLACE_NAMES[c], m.currency) for c, m in MARKETS.items()}


def test_fees_are_negative_and_refunds_return_the_referral_fee(events):
    for _code, _day, e in events["shipment"][:500]:
        for item in e["ShipmentItemList"]:
            assert item["ItemChargeList"][0]["ChargeAmount"]["CurrencyAmount"] > 0
            assert all(f["FeeAmount"]["CurrencyAmount"] < 0 for f in item["ItemFeeList"])
    for _code, _day, e in events["refund"][:500]:
        for item in e["ShipmentItemAdjustmentList"]:
            assert item["ItemChargeAdjustmentList"][0]["ChargeAmount"]["CurrencyAmount"] < 0
            assert item["ItemFeeAdjustmentList"][0]["FeeAmount"]["CurrencyAmount"] > 0


def test_shipments_match_the_sales_report(output, events):
    """Units shipped and principal equal units ordered and ordered product sales, per day."""
    for code in ("US", "DE"):
        report = json.loads((output / "sales_traffic" / code / "2026-07-14.json").read_text())
        sales = {r["sku"]: r["salesByAsin"] for r in report["salesAndTrafficByAsin"]}
        shipped = {
            item["SellerSKU"]: item
            for c, day, e in events["shipment"]
            if c == code and day == "2026-07-14"
            for item in e["ShipmentItemList"]
        }
        for sku, item in shipped.items():
            assert item["QuantityShipped"] == sales[sku]["unitsOrdered"]
            principal = item["ItemChargeList"][0]["ChargeAmount"]["CurrencyAmount"]
            assert principal == pytest.approx(sales[sku]["orderedProductSales"]["amount"])


# --- Realistic ------------------------------------------------------------------------------


def test_referral_fee_is_about_15_percent(pnl):
    revenue = sum(s["revenue"] - s["refunds"] for s in pnl.values())
    referral = sum(s["referral"] for s in pnl.values())
    assert referral / revenue == pytest.approx(config.REFERRAL_RATE, abs=0.002)


def test_refunds_are_2_to_6_percent_and_highest_in_home_storage(pnl, world):
    by_cat = defaultdict(lambda: [0.0, 0.0])
    for p in world.catalog.products:
        s = pnl.get(p.sku)
        if s:
            by_cat[p.category][0] += s["refunds"]
            by_cat[p.category][1] += s["revenue"]
    rate = {c: r / v for c, (r, v) in by_cat.items()}
    for c, r in rate.items():
        assert 0.02 <= r <= 0.06, (c, round(r, 4))
    assert max(rate, key=rate.get) == "Home Storage", rate


def test_fba_fees_are_fixed_per_unit_for_each_product(events):
    per_unit = defaultdict(set)
    for code, _day, e in events["shipment"]:
        for item in e["ShipmentItemList"]:
            fee = -_money(item["ItemFeeList"], "FeeType", "FBAPerUnitFulfillmentFee", "FeeAmount")
            per_unit[(code, item["SellerSKU"])].add(round(fee / item["QuantityShipped"], 2))
    assert all(len(v) == 1 for v in per_unit.values())


def test_about_three_products_lose_money_after_ad_spend(pnl):
    losing = sorted(sku for sku, s in pnl.items() if _net(s) < 0)
    assert len(losing) == config.LOSS_PRODUCT_COUNT, losing
    margins = sorted(_net(s) / s["revenue"] for s in pnl.values())
    assert margins[0] > -0.15, margins[:5]  # losses are believable, not absurd
    assert (
        0.05 <= sum(_net(s) for s in pnl.values()) / sum(s["revenue"] for s in pnl.values()) <= 0.25
    )


def test_a_few_products_change_cost_once_mid_year(output):
    rows = defaultdict(list)
    with (output / "product_costs.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows[r["sku"]].append(r)
            assert r["currency"] == "USD"
    changed = {sku: v for sku, v in rows.items() if len(v) > 1}
    assert len(changed) == config.COST_CHANGE_COUNT
    for v in changed.values():
        assert [r["valid_from"] for r in v] == [
            config.COSTS_VALID_FROM.isoformat(),
            config.COST_CHANGE_DATE.isoformat(),
        ]
        assert float(v[1]["unit_cost"]) > float(v[0]["unit_cost"])


def test_refunds_come_after_sales_and_never_exceed_them(events):
    sold = defaultdict(int)
    refunded = defaultdict(int)
    first_sale = {}
    for code, day, e in events["shipment"]:
        for item in e["ShipmentItemList"]:
            sold[(code, item["SellerSKU"])] += item["QuantityShipped"]
            first_sale.setdefault((code, item["SellerSKU"]), day)
            first_sale[(code, item["SellerSKU"])] = min(first_sale[(code, item["SellerSKU"])], day)
    for code, day, e in events["refund"]:
        for item in e["ShipmentItemAdjustmentList"]:
            key = (code, item["SellerSKU"])
            refunded[key] += item["QuantityShipped"]
            lag = (date.fromisoformat(day) - date.fromisoformat(first_sale[key])).days
            assert lag >= config.REFUND_LAG_DAYS[0]
    assert all(refunded[k] <= sold[k] for k in refunded)
