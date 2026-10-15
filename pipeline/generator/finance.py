"""Amazon fees, refunds and the seller's product costs (CR-1 PR 4).

Shipments equal the sales report: each day's units and ordered product sales ship that day
(a simplification; real orders ship a day or two later). Amazon charges a referral fee
(FeeType "Commission") on the principal and an FBA fee per unit by product size. A share of
units is refunded 3 to 30 days later; the refund returns the principal and the referral fee.

Product costs are the seller's own table in USD. Most products keep a healthy margin; a few
lose money once ad spend is counted, and a few get one cost increase during the year.
"""

from dataclasses import dataclass
from datetime import date

import numpy as np

from . import config
from .markets import MarketSales


@dataclass
class MarketFinance:
    """One marketplace's fees and refunds: arrays shaped (products, days), local cents."""

    fba_fee_cents: np.ndarray  # per unit, by product (products,)
    commission_cents: np.ndarray  # referral fee charged on each day's shipments
    fba_cents: np.ndarray
    refund_units: np.ndarray  # by the day the refund posts
    refund_cents: np.ndarray
    commission_returned_cents: np.ndarray


@dataclass
class ProductCost:
    sku: str
    unit_cost: float  # USD
    valid_from: date


def referral_fee(principal_cents: np.ndarray) -> np.ndarray:
    return np.rint(principal_cents * config.REFERRAL_RATE).astype(np.int64)


def market_finance(market: MarketSales, fee_tiers: np.ndarray, rng) -> MarketFinance:
    network = next(n for n in config.NETWORKS if n.code == market.marketplace.network)
    usd_fee = np.asarray(config.FBA_FEE_TIERS_USD)[fee_tiers] * config.FBA_FEE_INDEX[network.code]
    fx = 1.0 if network.currency == "USD" else config.FX_REFERENCE[network.currency]
    fee_cents = np.rint(usd_fee / fx * 100).astype(np.int64)

    rate = np.array([config.REFUND_RATE[p.category] for p in market.catalog.products])[:, None]
    refunded = rng.binomial(market.units, np.broadcast_to(rate, market.units.shape))
    lag = rng.integers(config.REFUND_LAG_DAYS[0], config.REFUND_LAG_DAYS[1] + 1, refunded.shape)
    n_days = market.units.shape[1]
    refund_units = np.zeros_like(market.units)
    refund_cents = np.zeros_like(market.sales_cents)
    p_idx, d_idx = np.nonzero(refunded)
    posted = d_idx + lag[p_idx, d_idx]
    keep = posted < n_days  # refunds after the last day have not happened yet
    p_idx, d_idx, posted = p_idx[keep], d_idx[keep], posted[keep]
    units = refunded[p_idx, d_idx]
    np.add.at(refund_units, (p_idx, posted), units)
    np.add.at(refund_cents, (p_idx, posted), units * market.price_cents[p_idx, d_idx])

    return MarketFinance(
        fba_fee_cents=fee_cents,
        commission_cents=referral_fee(market.sales_cents),
        fba_cents=market.units * fee_cents[:, None],
        refund_units=refund_units,
        refund_cents=refund_cents,
        commission_returned_cents=referral_fee(refund_cents),
    )


def _product_ad_spend_cents(market: MarketSales, n_products: int) -> np.ndarray:
    """Year ad spend per product, local cents; Sponsored Brands is reported per campaign only."""
    spend = np.zeros(n_products, dtype=np.int64)
    for a in market.ads:
        if a.campaign.ad_product != "SPONSORED_BRANDS":
            np.add.at(spend, a.product_idx, a.cost_cents.sum(axis=(0, 2)))
    return spend


def product_costs(
    markets: dict[str, MarketSales], finance: dict[str, MarketFinance], catalog, rng
) -> list[ProductCost]:
    """Unit costs that give most products a normal margin and LOSS_PRODUCT_COUNT a small loss.

    The year's profit before product cost is worked out per product in USD (at the reference
    exchange rates); unit costs are then chosen against it."""
    n = len(catalog.products)
    units = np.zeros(n)
    before_cost = np.zeros(n)  # revenue - refunds - fees - ad spend, USD
    revenue = np.zeros(n)
    for code, m in markets.items():
        f = finance[code]
        fx = 1.0 if m.marketplace.currency == "USD" else config.FX_REFERENCE[m.marketplace.currency]
        net = (
            m.sales_cents.sum(axis=1)
            - f.refund_cents.sum(axis=1)
            - f.commission_cents.sum(axis=1)
            + f.commission_returned_cents.sum(axis=1)
            - f.fba_cents.sum(axis=1)
            - _product_ad_spend_cents(m, n)
        )
        before_cost += net * fx / 100
        revenue += m.sales_cents.sum(axis=1) * fx / 100
        units += m.units.sum(axis=1)

    price = np.array([p.price for p in catalog.products])
    ratio = rng.uniform(*config.UNIT_COST_RATIO, n)
    cost = price * ratio
    # The thinnest products after ads lose money, but never a top-5 seller.
    thin = [int(i) for i in np.argsort(before_cost / revenue) if catalog.products[i].rank > 5]
    losers = set(thin[: config.LOSS_PRODUCT_COUNT])
    for i in range(n):
        if i in losers:
            cost[i] = (before_cost[i] - config.LOSS_MARGIN * revenue[i]) / units[i]
        else:  # keep at least the minimum margin
            cost[i] = min(
                cost[i], (before_cost[i] - config.MIN_PROFIT_MARGIN * revenue[i]) / units[i]
            )
    cost = np.clip(cost, 0.15 * price, 0.9 * price)  # still a believable unit cost

    rows = [
        ProductCost(p.sku, round(float(cost[p.index]), 2), config.COSTS_VALID_FROM)
        for p in catalog.products
    ]
    # One cost increase for a few healthy products (their margin stays well above zero).
    healthy = [i for i in np.argsort(-(before_cost - units * cost) / revenue) if i not in losers]
    for i in sorted(
        int(i) for i in rng.choice(healthy[:15], config.COST_CHANGE_COUNT, replace=False)
    ):
        new = round(float(cost[i]) * (1 + config.COST_CHANGE_RATE), 2)
        rows.append(ProductCost(catalog.products[i].sku, new, config.COST_CHANGE_DATE))
    return sorted(rows, key=lambda r: (r.sku, r.valid_from))


def build_finance(seed: int, markets: dict[str, MarketSales], catalog):
    tiers = np.random.default_rng([seed, 300]).integers(
        0, len(config.FBA_FEE_TIERS_USD), len(catalog.products)
    )
    finance = {
        code: market_finance(m, tiers, np.random.default_rng([seed, 310 + k]))
        for k, (code, m) in enumerate(markets.items())
    }
    costs = product_costs(markets, finance, catalog, np.random.default_rng([seed, 320]))
    return finance, costs
