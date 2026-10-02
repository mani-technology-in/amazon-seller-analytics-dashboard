"""Products, campaigns, ad groups and targets for the fictional Demo Brand."""

from dataclasses import dataclass, field
from datetime import date, timedelta

import numpy as np

from . import config

PRODUCT_NAMES = {
    "Kitchen": [
        "Bamboo Cutting Board Set",
        "Silicone Spatula Set",
        "Stainless Steel Mixing Bowls",
        "Glass Food Storage Containers",
        "Herb Keeper",
        "Measuring Cups and Spoons",
        "Garlic Press",
        "Oil Sprayer Bottle",
        "Knife Sharpener",
        "Dish Drying Rack",
    ],
    "Home Storage": [
        "Under-Bed Storage Bags",
        "Fabric Storage Cubes",
        "Drawer Organizers",
        "Over-Door Shoe Organizer",
        "Clear Pantry Bins",
        "Vacuum Storage Bags",
        "Hanging Closet Organizer",
        "Stackable Shelf Risers",
        "Cable Organizer Box",
        "Lazy Susan Turntable",
    ],
    "Bath": [
        "Bamboo Bath Mat",
        "Shower Caddy",
        "Microfiber Hair Towel",
        "Soap Dispenser Set",
        "Toothbrush Holder",
        "Bath Towel Set",
        "Shower Curtain Liner",
        "Toilet Brush Holder",
        "Bathroom Trash Can",
        "Non-Slip Tub Mat",
    ],
    "Cleaning": [
        "Microfiber Cleaning Cloths",
        "Spray Mop",
        "Scrub Brush Set",
        "Reusable Paper Towels",
        "Lint Roller Refills",
        "Grout Brush",
        "Window Squeegee",
        "Cleaning Caddy",
        "Duster Kit",
        "Sponge Holder",
    ],
}

KEYWORDS = {
    "Kitchen": [
        "cutting board",
        "silicone spatula",
        "mixing bowls",
        "food storage containers",
        "glass containers with lids",
        "measuring cups",
        "garlic press",
        "oil sprayer for cooking",
        "knife sharpener",
        "dish rack",
    ],
    "Home Storage": [
        "under bed storage",
        "storage cubes",
        "drawer organizer",
        "shoe organizer over door",
        "pantry organization",
        "vacuum storage bags",
        "closet organizer",
        "shelf riser",
        "cable organizer",
        "lazy susan",
    ],
    "Bath": [
        "bath mat",
        "shower caddy",
        "hair towel",
        "soap dispenser",
        "toothbrush holder",
        "bath towels",
        "shower curtain liner",
        "toilet brush",
        "bathroom trash can",
        "bathtub mat non slip",
    ],
    "Cleaning": [
        "microfiber cleaning cloth",
        "spray mop",
        "scrub brush",
        "reusable paper towels",
        "lint roller refills",
        "grout brush",
        "squeegee",
        "cleaning caddy",
        "duster",
        "sponge holder",
    ],
}

BRAND_KEYWORDS = [
    "demo brand",
    "demobrand",
    "demo brand kitchen",
    "demo brand storage",
    "demo brand bath",
    "demo brand cleaning",
]

AUTO_EXPRESSIONS = ["close-match", "loose-match", "substitutes", "complements"]

SD_CATEGORY_NODES = {
    "Kitchen": "Kitchen & Dining",
    "Home Storage": "Storage & Organization",
    "Bath": "Bath",
    "Cleaning": "Household Cleaning Supplies",
}

SD_AUDIENCES = {
    "views": [
        "views=(exact-product lookback=30)",
        "views=(similar-product lookback=30)",
        "views=(exact-product lookback=60)",
    ],
    "purchases": [
        "purchases=(exact-product lookback=90)",
        "purchases=(related-product lookback=90)",
        "purchases=(exact-product lookback=180)",
    ],
}


@dataclass
class Product:
    index: int
    asin: str
    sku: str
    title: str
    category: str
    price: float
    launch_date: date
    rank: int  # 1 = best seller by base demand
    base_daily_units: float


@dataclass
class Target:
    target_id: int
    text: str  # keyword text, targeting expression or audience
    match_type: str  # EXACT, PHRASE, BROAD, TARGETING_EXPRESSION_PREDEFINED, TARGETING_EXPRESSION
    impressions_per_day: float
    ctr: float
    cpc: float
    cvr: float


@dataclass
class Campaign:
    ad_product: str  # SPONSORED_PRODUCTS, SPONSORED_BRANDS, SPONSORED_DISPLAY
    campaign_id: int
    name: str
    budget: float
    ad_group_id: int
    ad_group_name: str
    asins: list[str]  # advertised (or attributed, for Sponsored Brands) products
    targets: list[Target] = field(default_factory=list)
    ad_ids: dict[str, int] = field(default_factory=dict)  # asin -> adId


@dataclass
class Catalog:
    products: list[Product]
    campaigns: list[Campaign]

    def product(self, asin: str) -> Product:
        return next(p for p in self.products if p.asin == asin)


def _asin(rng: np.random.Generator) -> str:
    letters = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789"
    return "B0" + "".join(rng.choice(list(letters), size=8))


def _amazon_id(rng: np.random.Generator) -> int:
    return int(rng.integers(100_000_000_000_000, 999_999_999_999_999))


def build_products(rng: np.random.Generator) -> list[Product]:
    launches = dict(config.LAUNCHES)
    entries = [(cat, name) for cat in config.CATEGORIES for name in PRODUCT_NAMES[cat]]
    ranks = rng.permutation(len(entries)) + 1
    asins: set[str] = set()
    products = []
    for i, (category, name) in enumerate(entries):
        asin = _asin(rng)
        while asin in asins:
            asin = _asin(rng)
        asins.add(asin)
        price = float(rng.choice([12, 15, 18, 20, 22, 25, 28, 30, 35, 40, 45])) - 0.01
        rank = int(ranks[i])
        products.append(
            Product(
                index=i,
                asin=asin,
                sku=f"DB-{category[:3].upper()}-{i + 1:03d}",
                title=f"{config.BRAND} {name}",
                category=category,
                price=round(price, 2),
                launch_date=launches.get(i, date(2024, 1, 15) + _days(rng, 0, 500)),
                rank=rank,
                base_daily_units=config.TOP_SELLER_DAILY_UNITS * rank ** (-config.RANK_DECAY),
            )
        )
    return products


def _days(rng: np.random.Generator, lo: int, hi: int) -> timedelta:
    return timedelta(days=int(rng.integers(lo, hi)))


def _target(rng, text, match_type, imp, ctr, cpc, cvr, wasted=False) -> Target:
    noise = rng.lognormal(0, 0.35)
    t = Target(
        target_id=_amazon_id(rng),
        text=text,
        match_type=match_type,
        impressions_per_day=float(imp * noise * (config.WASTED_TRAFFIC_FACTOR if wasted else 1)),
        ctr=float(ctr * rng.lognormal(0, 0.2)),
        cpc=float(cpc * rng.lognormal(0, 0.15)),
        cvr=0.0 if wasted else float(cvr * rng.lognormal(0, 0.2)),
    )
    if wasted:
        # keep a non-converting target to a believable size: at most ~$600 a year
        yearly = t.impressions_per_day * t.ctr * t.cpc * 365
        if yearly > config.WASTED_MAX_YEARLY_SPEND:
            t.impressions_per_day *= config.WASTED_MAX_YEARLY_SPEND / yearly
    return t


def build_campaigns(rng: np.random.Generator, products: list[Product]) -> list[Campaign]:
    by_cat = {c: [p for p in products if p.category == c] for c in config.CATEGORIES}
    top = sorted(products, key=lambda p: p.rank)
    campaigns: list[Campaign] = []

    def campaign(ad_product, name, budget, asins):
        c = Campaign(
            ad_product=ad_product,
            campaign_id=_amazon_id(rng),
            name=name,
            budget=budget,
            ad_group_id=_amazon_id(rng),
            ad_group_name=f"{name} - Ad group 1",
            asins=[p.asin for p in asins],
        )
        c.ad_ids = {p.asin: _amazon_id(rng) for p in asins}
        campaigns.append(c)
        return c

    def wasted() -> bool:
        return bool(rng.random() < config.WASTED_TARGET_SHARE)

    for cat in config.CATEGORIES:
        auto = campaign("SPONSORED_PRODUCTS", f"SP - {cat} - Auto", 60.0, by_cat[cat])
        for expr in AUTO_EXPRESSIONS:
            auto.targets.append(
                _target(rng, expr, "TARGETING_EXPRESSION_PREDEFINED", 900, 0.004, 0.85, 0.10)
            )

        manual = campaign("SPONSORED_PRODUCTS", f"SP - {cat} - Manual", 90.0, by_cat[cat])
        for kw in KEYWORDS[cat]:
            for match in ("EXACT", "PHRASE"):
                imp = 700 if match == "EXACT" else 1100
                waste = wasted() if match == "PHRASE" else False
                manual.targets.append(_target(rng, kw, match, imp, 0.005, 1.05, 0.11, waste))
        for kw in KEYWORDS[cat][:4]:
            manual.targets.append(_target(rng, kw, "BROAD", 1500, 0.003, 0.95, 0.08, wasted()))

    brand = campaign("SPONSORED_PRODUCTS", "SP - Brand Defense", 30.0, top[:8])
    for kw in BRAND_KEYWORDS:
        brand.targets.append(_target(rng, kw, "EXACT", 120, 0.06, 0.45, 0.22))

    top_sellers = campaign("SPONSORED_PRODUCTS", "SP - Top Sellers - Exact", 120.0, top[:6])
    generic = [kw for cat in config.CATEGORIES for kw in KEYWORDS[cat][:3]]
    for kw in generic:
        top_sellers.targets.append(_target(rng, kw, "EXACT", 900, 0.006, 1.25, 0.12))

    for cat in config.CATEGORIES:
        sb = campaign("SPONSORED_BRANDS", f"SB - {cat} - Headline", 50.0, by_cat[cat])
        for kw in KEYWORDS[cat][:8]:
            match = "BROAD" if rng.random() < 0.5 else "PHRASE"
            sb.targets.append(_target(rng, kw, match, 800, 0.004, 1.10, 0.12, wasted()))

    pairs = [("Kitchen", "Home Storage"), ("Bath", "Cleaning")]
    for a, b in pairs:
        sd = campaign(
            "SPONSORED_DISPLAY", f"SD - Product Targeting - {a} & {b}", 40.0, by_cat[a] + by_cat[b]
        )
        for cat in (a, b):
            sd.targets.append(
                _target(
                    rng,
                    f'category="{SD_CATEGORY_NODES[cat]}"',
                    "TARGETING_EXPRESSION",
                    2500,
                    0.0015,
                    0.70,
                    0.09,
                )
            )
            for _ in range(2):
                sd.targets.append(
                    _target(
                        rng,
                        f'asin="{_asin(rng)}"',
                        "TARGETING_EXPRESSION",
                        900,
                        0.002,
                        0.80,
                        0.10,
                        wasted(),
                    )
                )

    for kind in ("views", "purchases"):
        sd = campaign(
            "SPONSORED_DISPLAY", f"SD - Audience - {kind.title()} Remarketing", 35.0, top[:12]
        )
        for expr in SD_AUDIENCES[kind]:
            cvr = 0.09 if kind == "views" else 0.08
            sd.targets.append(_target(rng, expr, "TARGETING_EXPRESSION", 3000, 0.0012, 0.75, cvr))

    return campaigns


def build_catalog(rng: np.random.Generator) -> Catalog:
    products = build_products(rng)
    return Catalog(products=products, campaigns=build_campaigns(rng, products))
