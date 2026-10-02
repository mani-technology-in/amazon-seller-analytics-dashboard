"""Simulate a year of daily sales, advertising and inventory for the catalog.

Everything is computed at the finest grain first (target x product x day for ads, product x day
for sales and stock). Money is held in integer cents. Every report total is a sum of these cells,
so the reports agree with each other exactly.
"""

from dataclasses import dataclass, field
from datetime import date, timedelta

import numpy as np

from . import config
from .catalog import Campaign, Catalog


@dataclass
class AdCells:
    """One campaign's ad results: arrays shaped (targets, products, days)."""

    campaign: Campaign
    product_idx: np.ndarray  # catalog index of each advertised product
    impressions: np.ndarray
    clicks: np.ndarray
    cost_cents: np.ndarray
    orders: np.ndarray
    units: np.ndarray
    sales_cents: np.ndarray


@dataclass
class Shipment:
    created: int  # day index
    arrives: int
    quantity: int


@dataclass
class Simulation:
    days: list[date]
    catalog: Catalog
    price_cents: np.ndarray  # (products, days), deal prices applied
    orders: np.ndarray  # (products, days) total orders, organic + ads
    units: np.ndarray
    sales_cents: np.ndarray
    sessions: np.ndarray
    page_views: np.ndarray
    buy_box_pct: np.ndarray
    stock_end: np.ndarray  # (products, days) units on hand at end of day
    reserved: np.ndarray
    unsellable: np.ndarray
    shipments: list[list[Shipment]]
    ads: list[AdCells] = field(default_factory=list)


def day_list() -> list[date]:
    n = (config.END_DATE - config.START_DATE).days + 1
    return [config.START_DATE + timedelta(days=i) for i in range(n)]


def seasonality(days: list[date]) -> np.ndarray:
    """Demand multiplier per day: weekly pattern, Q4 peak, January dip and sales events."""
    s = np.array([config.WEEKDAY_FACTOR[d.weekday()] for d in days], dtype=float)
    for i, d in enumerate(days):
        if date(d.year, 11, 1) <= d <= date(d.year, 12, 15):
            s[i] *= 1.0 + 0.7 * (d - date(d.year, 11, 1)).days / 44
        elif date(d.year, 12, 16) <= d <= date(d.year, 12, 22):
            s[i] *= 1.7
        elif date(d.year, 12, 23) <= d <= date(d.year, 12, 31):
            s[i] *= 0.95
        elif d.month == 1:
            s[i] *= 0.88
        if d in config.PRIME_DAY:
            s[i] *= 2.6
        elif d in (
            config.PRIME_DAY[0] - timedelta(days=1),
            config.PRIME_DAY[1] + timedelta(days=1),
        ):
            s[i] *= 1.25
        elif d == config.BLACK_FRIDAY:
            s[i] *= 2.1
        elif d == config.CYBER_MONDAY:
            s[i] *= 1.9
        elif config.BLACK_FRIDAY < d < config.CYBER_MONDAY:
            s[i] *= 1.5
    return s


def event_days(days: list[date]) -> np.ndarray:
    events = {*config.PRIME_DAY, config.BLACK_FRIDAY, config.CYBER_MONDAY}
    return np.array([d in events for d in days])


def launch_factor(catalog: Catalog, days: list[date]) -> np.ndarray:
    """0 before launch, ramping to 1 over the first weeks after launch."""
    f = np.ones((len(catalog.products), len(days)))
    for p in catalog.products:
        for i, d in enumerate(days):
            age = (d - p.launch_date).days
            if age < 0:
                f[p.index, i] = 0.0
            elif age < config.LAUNCH_RAMP_DAYS:
                f[p.index, i] = 0.3 + 0.7 * age / config.LAUNCH_RAMP_DAYS
    return f


def simulate(rng: np.random.Generator, catalog: Catalog) -> Simulation:
    days = day_list()
    n_days, n_products = len(days), len(catalog.products)
    season = seasonality(days)
    events = event_days(days)
    launch = launch_factor(catalog, days)
    trend = 1.0 + config.YEARLY_GROWTH * np.arange(n_days) / n_days

    base = np.array([p.base_daily_units for p in catalog.products])
    deal = np.array([p.rank <= config.DEAL_ASIN_COUNT for p in catalog.products])
    price = np.array([round(p.price * 100) for p in catalog.products])
    price_cents = np.repeat(price[:, None], n_days, axis=1)
    deal_cells = deal[:, None] & events[None, :]
    price_cents = np.where(
        deal_cells, np.round(price_cents * (1 - config.DEAL_DISCOUNT)), price_cents
    ).astype(np.int64)
    deal_boost = np.where(deal_cells, 1.4, 1.0)

    # --- Advertising, before stock limits -------------------------------------------------
    months = np.array([d.month for d in days])
    intensity = np.array([config.AD_INTENSITY_BY_MONTH.get(m, 1.0) for m in months])
    cpc_factor = np.array([config.CPC_BY_MONTH.get(m, 1.0) for m in months])
    ads = [
        _simulate_campaign(rng, c, catalog, season * intensity, cpc_factor, launch, price_cents)
        for c in catalog.campaigns
    ]

    ad_orders = np.zeros((n_products, n_days), dtype=np.int64)
    ad_units = np.zeros((n_products, n_days), dtype=np.int64)
    for a in ads:
        np.add.at(ad_orders, a.product_idx, a.orders.sum(axis=0))
        np.add.at(ad_units, a.product_idx, a.units.sum(axis=0))

    # --- Organic demand -------------------------------------------------------------------
    organic_mean = (
        base[:, None]
        * config.ORGANIC_SHARE
        * season[None, :]
        * trend[None, :]
        * launch
        * deal_boost
    )
    organic_orders = rng.poisson(organic_mean)
    organic_units = organic_orders + rng.binomial(organic_orders, config.UNITS_PER_ORDER_EXTRA)
    planned_units = organic_units + ad_units

    # --- Inventory: decide how much of each day's demand can ship --------------------------
    fill, stock_end, shipments, organic_orders, organic_units = _plan_inventory(
        rng, catalog, days, organic_orders, organic_units, ads
    )
    for a in ads:
        _apply_fill(a, fill, price_cents)

    ad_orders[:] = 0
    ad_units[:] = 0
    for a in ads:
        np.add.at(ad_orders, a.product_idx, a.orders.sum(axis=0))
        np.add.at(ad_units, a.product_idx, a.units.sum(axis=0))

    orders = organic_orders + ad_orders
    units = organic_units + ad_units
    sales_cents = units * price_cents

    reserved = np.floor(stock_end * rng.uniform(0.02, 0.06, size=stock_end.shape)).astype(np.int64)
    unsellable = np.where(stock_end > 0, rng.binomial(3, 0.3, size=stock_end.shape), 0)

    # --- Traffic --------------------------------------------------------------------------
    conversion = rng.uniform(0.09, 0.15, size=(n_products, 1))
    in_stock = fill > 0
    expected_sessions = planned_units / conversion
    sessions = rng.poisson(np.where(in_stock, expected_sessions, 0.5 * expected_sessions))
    sessions = np.maximum(sessions, orders)
    page_views = np.round(sessions * rng.uniform(1.15, 1.4, size=sessions.shape)).astype(np.int64)
    buy_box = np.where(in_stock, np.round(rng.uniform(95, 100, size=sessions.shape), 2), 0.0)
    buy_box = np.where(launch > 0, buy_box, 0.0)

    return Simulation(
        days=days,
        catalog=catalog,
        price_cents=price_cents,
        orders=orders,
        units=units,
        sales_cents=sales_cents,
        sessions=sessions,
        page_views=page_views,
        buy_box_pct=buy_box,
        stock_end=stock_end,
        reserved=reserved,
        unsellable=unsellable,
        shipments=shipments,
        ads=ads,
    )


def _simulate_campaign(rng, campaign, catalog, season, cpc_factor, launch, price_cents) -> AdCells:
    """`season` here already includes the monthly ad budget pattern."""
    idx = np.array([catalog.product(asin).index for asin in campaign.asins])
    n_targets, n_products, n_days = len(campaign.targets), len(idx), season.shape[0]
    base = np.array([catalog.products[i].base_daily_units for i in idx])
    weights = base[:, None] * launch[idx]  # (products, days)
    active = weights.sum(axis=0) > 0

    t_imp = np.array([t.impressions_per_day for t in campaign.targets])
    t_ctr = np.array([t.ctr for t in campaign.targets])
    t_cpc = np.array([t.cpc for t in campaign.targets])
    t_cvr = np.array([t.cvr for t in campaign.targets])

    day_noise = rng.lognormal(0, 0.25, size=(n_targets, n_days))
    imp_total = rng.poisson(t_imp[:, None] * season[None, :] ** 0.9 * day_noise) * active[None, :]

    impressions = np.zeros((n_targets, n_products, n_days), dtype=np.int64)
    for d in range(n_days):
        if not active[d]:
            continue
        p = weights[:, d] / weights[:, d].sum()
        impressions[:, :, d] = rng.multinomial(imp_total[:, d], p)

    clicks = rng.binomial(impressions, np.clip(t_ctr, 0, 1)[:, None, None])
    cpc_noise = rng.lognormal(0, 0.08, size=clicks.shape)
    cpc = t_cpc[:, None, None] * cpc_factor[None, None, :] * cpc_noise
    cost_cents = np.round(clicks * cpc * 100).astype(np.int64)
    orders = rng.binomial(clicks, np.clip(t_cvr, 0, 1)[:, None, None])
    units = orders + rng.binomial(orders, config.UNITS_PER_ORDER_EXTRA)
    sales_cents = units * price_cents[idx][None, :, :]

    return AdCells(campaign, idx, impressions, clicks, cost_cents, orders, units, sales_cents)


def _filled(orders: np.ndarray, units: np.ndarray, f) -> tuple[np.ndarray, np.ndarray]:
    """Orders and units that ship when only a share f of demand can be filled."""
    o = np.floor(orders * f).astype(np.int64)
    u = np.maximum(np.floor(units * f).astype(np.int64), o)
    return o, u


def _apply_fill(a: AdCells, fill: np.ndarray, price_cents: np.ndarray) -> None:
    """Ads stop serving for out-of-stock products; partial-stock days convert fewer orders."""
    f = fill[a.product_idx][None, :, :]
    stopped = np.broadcast_to(f == 0, a.impressions.shape)
    for arr in (a.impressions, a.clicks, a.cost_cents):
        arr[stopped] = 0
    a.orders[:], a.units[:] = _filled(a.orders, a.units, f)
    a.sales_cents[:] = a.units * price_cents[a.product_idx][None, :, :]


def _plan_inventory(rng, catalog, days, organic_orders, organic_units, ads):
    """Reorder with a perfect forecast, except for a few late shipments that cause stockouts.

    Returns the share of each day's demand that ships (1 = all, 0 = out of stock), end-of-day
    stock, the shipments per product, and the organic orders and units that ship. Stock is
    reduced by exactly the units that ship. On a day with too little stock, ad orders are scaled
    down first and organic orders take whatever stock is left, so stock really reaches zero.
    """
    n_products, n_days = organic_units.shape
    org_orders = organic_orders.copy()
    org_units = organic_units.copy()
    fill = np.ones((n_products, n_days))
    stock_end = np.zeros((n_products, n_days), dtype=np.int64)
    shipments: list[list[Shipment]] = [[] for _ in range(n_products)]
    late = dict(zip(config.STOCKOUT_ASIN_RANKS, (120, 200, 260), strict=True))

    # Ad cells per product: (orders, units) arrays shaped (targets, days).
    ad_cells: list[list[tuple[np.ndarray, np.ndarray]]] = [[] for _ in range(n_products)]
    for a in ads:
        for j, pi in enumerate(a.product_idx):
            ad_cells[pi].append((a.orders[:, j, :], a.units[:, j, :]))

    for p in catalog.products:
        i = p.index
        demand = organic_units[i].astype(np.int64).copy()
        for _, u in ad_cells[i]:
            demand += u.sum(axis=0)
        launch_day = (p.launch_date - days[0]).days
        inbound: list[Shipment] = []
        delay_from = late.get(p.rank)

        recent_avg = float(demand[-28:].mean())

        def future(start: int, length: int, demand=demand, recent_avg=recent_avg) -> int:
            """Units needed in [start, start + length); after the last day, the recent average."""
            known = int(demand[max(start, 0) : max(start + length, 0)].sum())
            beyond = max(start + length - max(start, n_days), 0)
            return known + round(beyond * recent_avg)

        stock = 0
        if launch_day <= 0:
            stock = future(0, config.INITIAL_COVER_DAYS)
        else:
            qty = max(future(launch_day, config.INITIAL_COVER_DAYS), 50)
            s = Shipment(created=max(launch_day - 30, 0), arrives=launch_day, quantity=qty)
            inbound.append(s)
            shipments[i].append(s)

        for d in range(n_days):
            for s in [s for s in inbound if s.arrives == d]:
                stock += s.quantity
                inbound.remove(s)

            if d >= max(launch_day, 0):
                lead = int(rng.integers(*config.LEAD_TIME_DAYS))
                horizon = lead + config.SAFETY_DAYS
                position = stock + sum(s.quantity for s in inbound)
                if position < future(d, horizon):
                    qty = max(future(d + horizon, config.REORDER_COVER_DAYS), 30)
                    if delay_from is not None and d >= delay_from:
                        lead += int(rng.integers(*config.STOCKOUT_DELAY_DAYS))
                        delay_from = None
                    s = Shipment(created=d, arrives=d + lead, quantity=qty)
                    inbound.append(s)
                    shipments[i].append(s)

            want = int(demand[d])
            if want > 0:
                if stock <= 0:
                    fill[i, d] = 0.0
                    org_orders[i, d] = org_units[i, d] = 0
                elif want > stock:
                    f = stock / want
                    fill[i, d] = f
                    ad_shipped = 0
                    for o, u in ad_cells[i]:
                        ad_shipped += int(_filled(o[:, d], u[:, d], f)[1].sum())
                    units_left = min(int(organic_units[i, d]), stock - ad_shipped)
                    org_units[i, d] = units_left
                    org_orders[i, d] = min(int(organic_orders[i, d]), units_left)
                    stock -= ad_shipped + units_left
                else:
                    stock -= want
            elif stock <= 0 and d >= max(launch_day, 0):
                fill[i, d] = 0.0
            stock_end[i, d] = stock
    return fill, stock_end, shipments, org_orders, org_units
