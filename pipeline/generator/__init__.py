"""Synthetic Amazon seller data for the fictional Demo Brand.

`generate(out)` builds the catalog, simulates a year of daily sales, ads and inventory in six
marketplaces, and writes files shaped like real Amazon SP-API and Ads v3 reports. The same seed
gives byte-identical files. The US marketplace is simulated first, exactly as in v1.0.
"""

import math
from pathlib import Path

import numpy as np

from . import config
from .catalog import build_catalog
from .markets import World, build_world
from .reports import write_all
from .simulate import Simulation, simulate


def run(seed: int = config.SEED) -> World:
    rng = np.random.default_rng(seed)
    catalog = build_catalog(rng)
    us = simulate(rng, catalog)
    _set_budgets(us)
    networks, markets, fx = build_world(seed, catalog, us, _set_budgets)
    return World(us.days, catalog, networks, markets, fx)


def generate(out: Path, seed: int = config.SEED) -> dict[str, int]:
    return write_all(run(seed), Path(out))


def _set_budgets(sim: Simulation) -> None:
    """Daily budget = 90th percentile of daily spend plus 25%, rounded up to 5."""
    for a in sim.ads:
        daily = a.cost_cents.sum(axis=(0, 1)) / 100
        a.campaign.budget = float(5 * math.ceil(np.percentile(daily, 90) * 1.25 / 5))
