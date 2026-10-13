import gzip
import json
from pathlib import Path

import pandas as pd
import pytest

from generator import run
from generator.reports import write_all


@pytest.fixture(scope="session")
def world():
    return run()


@pytest.fixture(scope="session")
def sim(world):
    """The US network: the v1.0 simulation. The v1.0 tests check it unchanged."""
    return world.networks["US"]


@pytest.fixture(scope="session")
def output(world, tmp_path_factory) -> Path:
    out = tmp_path_factory.mktemp("generated")
    write_all(world, out)
    return out


@pytest.fixture(scope="session")
def ads(output) -> dict[str, pd.DataFrame]:
    """US ads reports."""
    frames = {}
    for path in sorted((output / "ads" / "US").glob("*.json.gz")):
        with gzip.open(path, "rt", encoding="utf-8") as f:
            frames[path.name.removesuffix(".json.gz")] = pd.DataFrame(json.load(f))
    return frames


@pytest.fixture(scope="session")
def sales(output) -> pd.DataFrame:
    """US sales and traffic."""
    rows = []
    for path in sorted((output / "sales_traffic" / "US").glob("*.json")):
        report = json.loads(path.read_text(encoding="utf-8"))
        for r in report["salesAndTrafficByAsin"]:
            rows.append(
                {
                    "date": path.stem,
                    "asin": r["childAsin"],
                    "units": r["salesByAsin"]["unitsOrdered"],
                    "orders": r["salesByAsin"]["totalOrderItems"],
                    "sales": r["salesByAsin"]["orderedProductSales"]["amount"],
                    "sessions": r["trafficByAsin"]["sessions"],
                }
            )
    return pd.DataFrame(rows)


@pytest.fixture(scope="session")
def inventory(output) -> pd.DataFrame:
    """US fulfilment network inventory."""
    frames = []
    for path in sorted((output / "fba_inventory" / "US").glob("*.tsv")):
        df = pd.read_csv(path, sep="\t")
        df["date"] = path.stem
        frames.append(df)
    return pd.concat(frames, ignore_index=True)
