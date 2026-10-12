"""Fixed settings for the synthetic data. Changing any value changes the generated data."""

from dataclasses import dataclass
from datetime import date

SEED = 20261018

# 12 months of daily data, inclusive.
START_DATE = date(2025, 10, 1)
END_DATE = date(2026, 9, 30)

MARKETPLACE_ID = "ATVPDKIKX0DER"  # Amazon.com (US)
CURRENCY = "USD"
BRAND = "Demo Brand"


@dataclass(frozen=True)
class Marketplace:
    code: str
    marketplace_id: str  # Amazon's ID (SP-API "Marketplace IDs" page)
    name: str
    currency: str
    network: str  # the FBA fulfilment network whose stock it sells from
    ads: bool  # Sponsored ads run here (one Amazon Ads profile per marketplace)


MARKETPLACES = (
    Marketplace("US", "ATVPDKIKX0DER", "United States", "USD", "US", ads=True),
    Marketplace("CA", "A2EUQ1WTGCTBG2", "Canada", "CAD", "CA", ads=False),
    Marketplace("MX", "A1AM78C64UM0Y8", "Mexico", "MXN", "MX", ads=False),
    Marketplace("UK", "A1F83G8C2ARO7P", "United Kingdom", "GBP", "UK", ads=True),
    Marketplace("DE", "A1PA6795UKMFR9", "Germany", "EUR", "EU", ads=True),
    Marketplace("FR", "A13V1IB3VIYZZH", "France", "EUR", "EU", ads=False),
)


@dataclass(frozen=True)
class Network:
    """One FBA fulfilment network: its own stock, simulated as its own business."""

    code: str
    currency: str
    demand_scale: float  # units demanded, relative to the US
    price_index: float  # local list price = US price x index, converted at FX_REFERENCE
    start: date | None = None  # first day of selling; None = before the data starts
    stockout_ranks: tuple[int, ...] = ()  # products (by sales rank) that run out of stock once


# The US network is the v1.0 simulation, unchanged. DE and FR share the EU network.
NETWORKS = (
    Network("US", "USD", 1.0, 1.0),  # v1.0: stock-outs from STOCKOUT_ASIN_RANKS
    Network("CA", "CAD", 0.18, 1.05),
    Network("MX", "MXN", 0.072, 0.95, start=date(2026, 4, 15)),
    Network("UK", "GBP", 0.195, 1.10, stockout_ranks=(7,)),
    Network("EU", "EUR", 0.175, 1.12, stockout_ranks=(15,)),
)

# France opens on the EU network during the year; its share of EU demand ramps up.
FR_START = date(2026, 2, 2)
FR_RAMP_DAYS = 90
FR_FULL_SHARE = 0.55  # French units per German unit once ramped up

# USD per unit of each currency, around 2025-26 levels; monthly rates wander near these.
FX_REFERENCE = {"CAD": 0.73, "MXN": 0.054, "GBP": 1.34, "EUR": 1.16}
FX_MONTHLY_DRIFT = 0.012  # standard deviation of the month-to-month change

CATEGORIES = ("Kitchen", "Home Storage", "Bath", "Cleaning")

# Sales events. The brand is fictional; event dates are set for the demo, not taken from Amazon.
PRIME_DAY = (date(2026, 7, 14), date(2026, 7, 15))
BLACK_FRIDAY = date(2025, 11, 28)
CYBER_MONDAY = date(2025, 12, 1)
DEAL_DISCOUNT = 0.20  # deal price is 20% off for the top sellers on event days
DEAL_ASIN_COUNT = 10

# Weekly pattern, Monday first.
WEEKDAY_FACTOR = (1.00, 0.97, 0.96, 0.98, 1.02, 1.10, 1.14)

# Demand: units per day for the best seller; others fall off by rank.
TOP_SELLER_DAILY_UNITS = 45.0
RANK_DECAY = 0.9
ORGANIC_SHARE = 0.72  # share of demand that is not driven by ads
YEARLY_GROWTH = 0.15  # demand grows 15% over the year
UNITS_PER_ORDER_EXTRA = 0.07  # 7% of orders have a second unit

# Inventory.
INITIAL_COVER_DAYS = 75
REORDER_COVER_DAYS = 60
SAFETY_DAYS = 14
LEAD_TIME_DAYS = (25, 35)
INBOUND_WORKING_DAYS = 3
INBOUND_RECEIVING_DAYS = 3
STOCKOUT_ASIN_RANKS = (3, 11, 24)  # these products get one late shipment each
STOCKOUT_DELAY_DAYS = (24, 30)

# Products launched during the year (index in catalog order, launch date).
LAUNCHES = ((18, date(2026, 3, 16)), (37, date(2026, 6, 1)))
LAUNCH_RAMP_DAYS = 30

# Ads: some broad, phrase and display targets spend but never convert, so the "spend with no
# sales" flag has something to find. Exact-match keywords are never picked: a real exact match on
# the brand's own product would sell. These targets get little traffic, so each spends a few
# hundred dollars a year, the size a seller might overlook.
WASTED_TARGET_SHARE = 0.10
WASTED_TRAFFIC_FACTOR = 0.2
WASTED_MAX_YEARLY_SPEND = 550.0  # USD, before seasonality and Q4 CPC increases

# Ad budget pattern by month (1 = normal). Sellers push ads in Q4 and around Prime Day and cut
# back in January, and clicks cost more in busy months, so TACoS moves through the year.
AD_INTENSITY_BY_MONTH = {1: 0.70, 2: 0.85, 7: 1.20, 11: 1.30, 12: 1.35}
CPC_BY_MONTH = {7: 1.05, 11: 1.10, 12: 1.12}
