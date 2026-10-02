"""Fixed settings for the synthetic data. Changing any value changes the generated data."""

from datetime import date

SEED = 20261018

# 12 months of daily data, inclusive.
START_DATE = date(2025, 10, 1)
END_DATE = date(2026, 9, 30)

MARKETPLACE_ID = "ATVPDKIKX0DER"  # Amazon.com (US)
CURRENCY = "USD"
BRAND = "Demo Brand"

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
