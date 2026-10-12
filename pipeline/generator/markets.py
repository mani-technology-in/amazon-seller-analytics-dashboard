"""Six marketplaces on five fulfilment networks.

Each network (US, CA, MX, UK, EU) is simulated as its own business: its own stock, demand and
(where ads run) Sponsored Products campaigns, in its own currency. The US network is the v1.0
simulation, unchanged. Germany and France share the EU network's stock, so the EU simulation
carries both countries' demand and is then split into two marketplaces.
"""

import math
from dataclasses import dataclass, replace
from datetime import date

import numpy as np

from . import config
from .catalog import Campaign, Catalog, build_campaigns
from .simulate import AdCells, Simulation, simulate


@dataclass
class MarketSales:
    """One marketplace's daily sales and traffic: arrays shaped (products, days)."""

    marketplace: config.Marketplace
    catalog: Catalog  # the network's catalog: local prices and launch dates
    price_cents: np.ndarray
    orders: np.ndarray
    units: np.ndarray
    sales_cents: np.ndarray
    sessions: np.ndarray
    page_views: np.ndarray
    buy_box_pct: np.ndarray
    ads: list[AdCells]


@dataclass
class World:
    days: list[date]
    catalog: Catalog  # the US catalog (USD list prices)
    networks: dict[str, Simulation]
    markets: dict[str, MarketSales]
    fx: list[tuple[str, str, float]]  # (year-month, currency, USD per unit)


def local_price(usd: float, network: config.Network) -> float:
    """The US price converted to local currency, adjusted by the network's price index and
    rounded up to a price ending the way local listings do (.99, or 9 for pesos)."""
    if network.currency == "USD":
        return usd
    raw = usd * network.price_index / config.FX_REFERENCE[network.currency]
    if network.currency == "MXN":
        return float(10 * math.ceil(raw / 10) - 1)
    return math.ceil(raw) - 0.01


def localize(catalog: Catalog, network: config.Network, rng: np.random.Generator) -> Catalog:
    """The catalog as one network sells it: scaled demand, local prices, the network's start
    date, and Sponsored Products campaigns where ads run (copies of the US set, with their own
    IDs, fewer impressions and clicks priced in local currency)."""
    products = [
        replace(
            p,
            price=local_price(p.price, network),
            base_daily_units=p.base_daily_units * network.demand_scale,
            launch_date=max(p.launch_date, network.start) if network.start else p.launch_date,
        )
        for p in catalog.products
    ]
    campaigns: list[Campaign] = []
    if any(m.ads for m in config.MARKETPLACES if m.network == network.code):
        cpc_scale = 0.9 / config.FX_REFERENCE[network.currency]
        for c in build_campaigns(rng, products):
            if c.ad_product != "SPONSORED_PRODUCTS":
                continue
            for t in c.targets:
                t.impressions_per_day *= network.demand_scale
                t.cpc *= cpc_scale
            campaigns.append(c)
    return Catalog(products=products, campaigns=campaigns)


def fr_factor(days: list[date]) -> np.ndarray:
    """French demand on the EU network, per German unit: 0 before France opens, ramping up."""
    age = np.array([(d - config.FR_START).days for d in days], dtype=float)
    return config.FR_FULL_SHARE * np.clip(age / config.FR_RAMP_DAYS, 0, 1) * (age >= 0)


def _market(m: config.Marketplace, sim: Simulation, ads: list[AdCells]) -> MarketSales:
    return MarketSales(
        m,
        sim.catalog,
        sim.price_cents,
        sim.orders,
        sim.units,
        sim.sales_cents,
        sim.sessions,
        sim.page_views,
        sim.buy_box_pct,
        ads,
    )


def split_eu(sim: Simulation, rng: np.random.Generator) -> tuple[MarketSales, MarketSales]:
    """Split the EU network's sales into Germany and France. Ad orders are German (ads run
    only in Germany); organic orders go to France at France's share of the day's demand."""
    by_code = {m.code: m for m in config.MARKETPLACES}
    f = fr_factor(sim.days)
    share = np.broadcast_to(f / (1 + f), sim.units.shape)

    ad_orders = np.zeros_like(sim.orders)
    ad_units = np.zeros_like(sim.units)
    for a in sim.ads:
        np.add.at(ad_orders, a.product_idx, a.orders.sum(axis=0))
        np.add.at(ad_units, a.product_idx, a.units.sum(axis=0))
    organic_orders = sim.orders - ad_orders
    organic_extra = (sim.units - ad_units) - organic_orders  # second units in organic orders

    fr_orders = rng.binomial(organic_orders, share)
    fr_units = fr_orders + rng.binomial(organic_extra, share)
    fr_sessions = np.maximum(rng.binomial(sim.sessions, share), fr_orders)
    de_orders, de_units = sim.orders - fr_orders, sim.units - fr_units
    de_sessions = np.maximum(sim.sessions - fr_sessions, de_orders)
    views_per_session = np.divide(
        sim.page_views, sim.sessions, out=np.zeros(sim.units.shape), where=sim.sessions > 0
    )

    def part(code, orders, units, sessions, ads) -> MarketSales:
        return MarketSales(
            by_code[code],
            sim.catalog,
            sim.price_cents,
            orders,
            units,
            units * sim.price_cents,
            sessions,
            np.round(sessions * views_per_session).astype(np.int64),
            np.where(sessions > 0, sim.buy_box_pct, 0.0),
            ads,
        )

    return (
        part("DE", de_orders, de_units, de_sessions, sim.ads),
        part("FR", fr_orders, fr_units, fr_sessions, []),
    )


def fx_rates(rng: np.random.Generator, days: list[date]) -> list[tuple[str, str, float]]:
    """Monthly USD rates for each currency, wandering a little around FX_REFERENCE."""
    months = sorted({d.strftime("%Y-%m") for d in days})
    rows = []
    for currency, ref in config.FX_REFERENCE.items():
        walk = np.cumsum(rng.normal(0, config.FX_MONTHLY_DRIFT, size=len(months)))
        walk -= walk.mean()  # keep the year's average at the reference
        for month, w in zip(months, walk, strict=True):
            rows.append((month, currency, round(ref * math.exp(w), 6)))
    return rows


def build_world(
    seed: int, catalog: Catalog, us: Simulation, set_budgets
) -> tuple[dict[str, Simulation], dict[str, MarketSales], list[tuple[str, str, float]]]:
    """Simulate the four networks beyond the US and split them into marketplaces."""
    networks = {"US": us}
    for k, network in enumerate(config.NETWORKS[1:], start=1):
        rng = np.random.default_rng([seed, k])
        local = localize(catalog, network, rng)
        factor = 1 + fr_factor(us.days) if network.code == "EU" else None
        sim = simulate(rng, local, factor, network.stockout_ranks)
        set_budgets(sim)
        networks[network.code] = sim

    by_code = {m.code: m for m in config.MARKETPLACES}
    markets = {
        code: _market(by_code[code], networks[code], networks[code].ads)
        for code in ("US", "CA", "MX", "UK")
    }
    markets["DE"], markets["FR"] = split_eu(networks["EU"], np.random.default_rng([seed, 90]))
    fx = fx_rates(np.random.default_rng([seed, 99]), us.days)
    return networks, {m.code: markets[m.code] for m in config.MARKETPLACES}, fx
